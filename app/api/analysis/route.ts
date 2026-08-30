import { env } from "cloudflare:workers";
import { buildAnalysisCoverage, collectComprehensiveAnalysisContext } from "@/lib/analysis-context";
import { requireAuthenticatedOwner, withDeviceCookie } from "@/lib/device-owner";
import { listHoldings } from "@/lib/holdings-store";
import { listTransactions } from "@/lib/transactions-store";
import { buildEvidencePackage } from "@/lib/evidence-data";
import type { PortfolioAnalysis } from "@/lib/types";

const runtimeEnv = env as unknown as Record<string, string | undefined>;
const OFFICIAL_DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";

function safeText(value: unknown, fallback: string, max = 500) {
  const result = typeof value === "string" ? value.trim() : "";
  return (result || fallback).slice(0, max);
}

function safeList(value: unknown, maxItems: number, maxLength: number) {
  return (Array.isArray(value) ? value : []).map((item) => safeText(item, "", maxLength)).filter(Boolean).slice(0, maxItems);
}

function roundMetric(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizedConfidence(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? Math.max(0, Math.min(100, Math.round(result))) : null;
}

function normalizedTomorrowProbabilities(input: Record<string, unknown>) {
  const probability = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const result = Number(value);
    return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : null;
  };
  const values = [probability(input.upProbability), probability(input.flatProbability), probability(input.downProbability)];
  if (values.some((value) => value === null)) return { upProbability: null, flatProbability: null, downProbability: null };
  const [rawUp, rawFlat, rawDown] = values as number[];
  const total = rawUp + rawFlat + rawDown;
  if (total <= 0) return { upProbability: null, flatProbability: null, downProbability: null };
  const upProbability = Math.round(rawUp / total * 100);
  const flatProbability = Math.round(rawFlat / total * 100);
  return { upProbability, flatProbability, downProbability: 100 - upProbability - flatProbability };
}

function formatMetricPercent(value: number | null, signed = false) {
  if (value === null) return "—";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function restoreAliases(value: string, aliases: Map<string, string>) {
  let restored = value;
  for (const [alias, name] of [...aliases].sort((a, b) => b[0].length - a[0].length)) restored = restored.replaceAll(alias, name);
  return restored;
}

function normalizeAnalysis(value: unknown, aliases: Map<string, string>, model: string, evidenceAsOf: string, evidence: PortfolioAnalysis["evidence"], dataPoints: PortfolioAnalysis["dataPoints"]): PortfolioAnalysis {
  const input = (value ?? {}) as Record<string, unknown>;
  const riskLevel = ["低", "中", "高", "未知"].includes(String(input.riskLevel)) ? String(input.riskLevel) as PortfolioAnalysis["riskLevel"] : "未知";
  const stance = ["强烈偏多", "谨慎偏多", "中性等待", "谨慎偏空", "强烈偏空", "证据不足"].includes(String(input.stance)) ? String(input.stance) : "证据不足";
  const rawScore = Number(input.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
  const panelRoles = new Set<PortfolioAnalysis["expertPanel"][number]["role"]>(["盘面观察员", "持仓研究员", "风险把关员"]);
  const expertPanel = (Array.isArray(input.expertPanel) ? input.expertPanel : []).flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const role = String(row.role) as PortfolioAnalysis["expertPanel"][number]["role"];
    if (!panelRoles.has(role)) return [];
    return [{
      role,
      conclusion: restoreAliases(safeText(row.conclusion, "这部分证据还不够清楚。", 150), aliases),
      evidence: restoreAliases(safeText(row.evidence, "本轮可用证据有限。", 180), aliases),
    }];
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.role === item.role) === index).slice(0, 3);
  const watchItems = (Array.isArray(input.watchItems) ? input.watchItems : []).slice(0, 5).map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      title: restoreAliases(safeText(row.title, "观察项", 80), aliases),
      reason: restoreAliases(safeText(row.reason, "证据不足", 240), aliases),
      evidence: restoreAliases(safeText(row.evidence, "未提供来源", 240), aliases),
    };
  });
  const similar = (input.similarPattern ?? {}) as Record<string, unknown>;
  const tomorrowInput = (input.tomorrow ?? {}) as Record<string, unknown>;
  const tomorrowDirection = ["偏涨", "震荡", "偏跌", "看不清"].includes(String(tomorrowInput.direction))
    ? String(tomorrowInput.direction) as PortfolioAnalysis["tomorrow"]["direction"]
    : "看不清";
  const tomorrowProbabilities = normalizedTomorrowProbabilities(tomorrowInput);
  const forecastInput = (input.forecast ?? {}) as Record<string, unknown>;
  const direction = ["偏强", "震荡", "偏弱", "证据不足"].includes(String(forecastInput.direction))
    ? String(forecastInput.direction) as PortfolioAnalysis["forecast"]["direction"]
    : "证据不足";
  const allowedAliases = [...aliases.keys()];
  const matchAlias = (requestedTarget: string) => allowedAliases.find((alias) => requestedTarget === alias)
    ?? [...allowedAliases].sort((left, right) => right.length - left.length).find((alias) => requestedTarget.includes(alias));
  const normalizedActions = (Array.isArray(input.actions) ? input.actions : []).slice(0, 12).map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const priority = ["高", "中", "低"].includes(String(row.priority)) ? String(row.priority) as "高" | "中" | "低" : "中";
    const requestedTarget = safeText(row.target, "整个组合", 80);
    const targetAlias = requestedTarget === "整个组合" ? "整个组合" : matchAlias(requestedTarget) ?? "整个组合";
    return {
      targetAlias,
      priority,
      action: restoreAliases(safeText(row.action, "先别急着动", 100), aliases),
      trigger: restoreAliases(safeText(row.trigger, "等实际走势更清楚", 180), aliases),
      reason: restoreAliases(safeText(row.reason, "现在的数据还不够", 240), aliases),
    };
  });
  const seenTargets = new Set<string>();
  const specificActions = normalizedActions.filter((item) => item.targetAlias !== "整个组合" && !seenTargets.has(item.targetAlias) && Boolean(seenTargets.add(item.targetAlias)));
  const missingActions = allowedAliases.filter((alias) => !seenTargets.has(alias)).map((targetAlias) => ({
    targetAlias,
    priority: "中" as const,
    action: "先拿着观察",
    trigger: "开盘后方向更清楚，或出现新的公告",
    reason: "模型没有给这只持仓单独建议，先避免冲动操作。",
  }));
  const overallActions = normalizedActions.filter((item) => item.targetAlias === "整个组合");
  const actionRows = [...specificActions, ...missingActions, ...overallActions].slice(0, 12);
  const actions = (actionRows.length ? actionRows : [{ targetAlias: "整个组合", priority: "中" as const, action: "先别急着动", trigger: "开盘后的实际走势更清楚", reason: "现在的数据还不够，先避免冲动操作。" }]).map(({ targetAlias, ...item }) => ({ target: restoreAliases(targetAlias, aliases), ...item }));
  const requestedFocus = safeText(tomorrowInput.focusAsset, "", 80);
  const focusAlias = matchAlias(requestedFocus) ?? allowedAliases[0] ?? "整个组合";
  return {
    summary: restoreAliases(safeText(input.summary, "当前证据不足，暂不生成组合结论。", 900), aliases),
    stance,
    score,
    riskLevel,
    expertPanel,
    dataPoints,
    tomorrow: {
      focusAsset: restoreAliases(focusAlias, aliases),
      direction: tomorrowDirection,
      confidence: normalizedConfidence(tomorrowInput.confidence),
      ...tomorrowProbabilities,
      reason: restoreAliases(safeText(tomorrowInput.reason, "现有数据还不够，明天先看开盘后的实际强弱。", 260), aliases),
      openingCheck: restoreAliases(safeText(tomorrowInput.openingCheck, "先看主要持仓开盘后能否稳住，再决定是否动作。", 220), aliases),
      suggestedAction: restoreAliases(safeText(tomorrowInput.suggestedAction, "先别急着动，等走势更清楚。", 160), aliases),
      actionCondition: restoreAliases(safeText(tomorrowInput.actionCondition, "开盘后的实际走势与当前判断一致时再考虑。", 220), aliases),
    },
    forecast: {
      horizon: safeText(forecastInput.horizon, "接下来 5—20 个交易日", 60),
      direction,
      confidence: normalizedConfidence(forecastInput.confidence),
      baseCase: restoreAliases(safeText(forecastInput.baseCase, "现在还看不清，先等更多真实数据。", 400), aliases),
      bullCase: restoreAliases(safeText(forecastInput.bullCase, "暂时没有足够数据支持走强。", 320), aliases),
      bearCase: restoreAliases(safeText(forecastInput.bearCase, "暂时没有足够数据判断走弱。", 320), aliases),
      invalidation: restoreAliases(safeText(forecastInput.invalidation, "如果明天实际走势与判断明显相反，就要重新分析。", 260), aliases),
    },
    actions,
    risks: safeList(input.risks, 6, 180).map((item) => restoreAliases(item, aliases)),
    watchItems,
    similarPattern: {
      status: similar.status === "available" ? "available" : "unavailable",
      note: restoreAliases(safeText(similar.note, "没有足够的历史相似样本。", 300), aliases),
    },
    disclaimer: "仅供个人研究参考，不构成投资建议或交易指令。请核对公告原文并独立决策。",
    generatedAt: new Date().toISOString(),
    model,
    evidenceAsOf,
    evidence,
  };
}

function parseJsonContent(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}

export async function POST(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  const body = await request.json().catch(() => ({})) as { consent?: unknown; mode?: unknown };
  if (body.mode === "evidence") {
    try {
      return withDeviceCookie(Response.json(await buildEvidencePackage(owner.ownerKey), { headers: { "Cache-Control": "no-store" } }), owner.setCookie);
    } catch {
      return withDeviceCookie(Response.json({ error: "证据包生成失败，请稍后重试。" }, { status: 503 }), owner.setCookie);
    }
  }
  if (body.consent !== true) {
    return withDeviceCookie(Response.json({ error: "需要先确认匿名分析数据发送范围。", code: "CONSENT_REQUIRED" }, { status: 428 }), owner.setCookie);
  }

  const apiKey = runtimeEnv.DEEPSEEK_API_KEY?.trim();
  const model = runtimeEnv.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  const relayUrl = runtimeEnv.DEEPSEEK_RELAY_URL?.trim();
  const relayToken = runtimeEnv.DEEPSEEK_RELAY_TOKEN?.trim();
  let deepSeekEndpoint = OFFICIAL_DEEPSEEK_ENDPOINT;
  let deepSeekHeaders: Record<string, string>;

  if (relayUrl) {
    if (!relayToken) {
      return withDeviceCookie(Response.json({ error: "AI 分析服务的安全口令尚未配置。", code: "DEEPSEEK_RELAY_NOT_CONFIGURED" }, { status: 503 }), owner.setCookie);
    }
    try {
      const parsedRelayUrl = new URL(relayUrl);
      if (parsedRelayUrl.protocol !== "https:" || parsedRelayUrl.username || parsedRelayUrl.password) throw new Error("invalid relay URL");
      deepSeekEndpoint = parsedRelayUrl.toString();
    } catch {
      return withDeviceCookie(Response.json({ error: "AI 分析服务地址无效，必须使用 HTTPS。", code: "DEEPSEEK_RELAY_INVALID" }, { status: 503 }), owner.setCookie);
    }
    deepSeekHeaders = { "X-Relay-Token": relayToken };
  } else if (apiKey) {
    deepSeekHeaders = { Authorization: `Bearer ${apiKey}` };
  } else {
    return withDeviceCookie(Response.json({ error: "AI 分析服务尚未配置。", code: "DEEPSEEK_NOT_CONFIGURED" }, { status: 503 }), owner.setCookie);
  }

  try {
    const holdings = await listHoldings(owner.ownerKey);
    if (holdings.length === 0) return withDeviceCookie(Response.json({ error: "请先添加至少一项持仓。" }, { status: 400 }), owner.setCookie);

    const context = await collectComprehensiveAnalysisContext(holdings);
    const market = context.market;
    const usableQuotes = market.quotes.filter((quote) => quote.status === "ok" && quote.price !== null);
    if (usableQuotes.length === 0) return withDeviceCookie(Response.json({ error: "真实行情暂不可用，已暂停 AI 分析。" }, { status: 503 }), owner.setCookie);

    const notices = context.notices;
    const transactions = await listTransactions(owner.ownerKey);
    const researchById = new Map(context.holdingResearch.map((item) => [item.holdingId, item]));
    const fundProducts = new Map((context.fundResearch?.products ?? []).map((item) => [item.code, item]));
    const internal = holdings.map((holding, index) => {
      const quote = market.quotes.find((item) => item.key === `${holding.type}:${holding.code}`);
      const fundAmount = Number(holding.holdingAmount ?? 0);
      const fundProfit = Number(holding.holdingProfit ?? 0);
      const fundPrincipal = fundAmount - fundProfit;
      return {
        holding,
        alias: `持仓${index + 1}`,
        quote,
        research: researchById.get(holding.id),
        fundProduct: fundProducts.get(holding.code),
        marketValue: holding.type === "场外基金" ? (fundAmount > 0 ? fundAmount : null) : quote?.price ? quote.price * Number(holding.quantity) : null,
        profitPercent: holding.type === "场外基金" ? (fundPrincipal > 0 ? (fundProfit / fundPrincipal) * 100 : null) : quote?.price ? ((quote.price / Number(holding.cost)) - 1) * 100 : null,
      };
    });
    const totalMarketValue = internal.reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
    const aliases = new Map(internal.map((item) => [item.alias, item.holding.name]));
    const redactText = (value: string) => internal.reduce(
      (text, candidate) => text.replaceAll(candidate.holding.code, candidate.alias).replaceAll(candidate.holding.name, candidate.alias),
      value,
    ).replace(/(?<!\d)\d{6}(?!\d)/g, "某证券");
    const normalizeSectorName = (value: string) => value.replace(/[ⅠⅡⅢⅣⅤⅥIVX]/gi, "").replace(/行业|板块|概念|\s/g, "");
    const sectorRows = market.aMarket?.sectors ?? [];
    const anonymized = internal.map((item) => {
      const related = notices.items.filter((notice) => notice.code === item.holding.code).slice(0, 5);
      const redactedTitles = related.map((notice) => redactText(notice.title));
      const fundamentals = item.research?.fundamentals;
      const normalizedIndustry = fundamentals?.industry ? normalizeSectorName(fundamentals.industry) : "";
      const relatedSector = normalizedIndustry ? sectorRows.find((sector) => {
        const normalizedName = normalizeSectorName(sector.name);
        return normalizedName === normalizedIndustry || normalizedName.includes(normalizedIndustry) || normalizedIndustry.includes(normalizedName);
      }) : null;
      const marketHistory = item.research?.marketHistory;
      const fundHistory = item.research?.fundHistory;
      const listedRisk = item.research?.riskMetrics;
      const fundRisk = fundHistory?.riskMetrics;
      const fundProduct = item.fundProduct;
      const disclosedWeight = fundProduct?.holdings.reduce((sum, holding) => sum + holding.weightPercent, 0) ?? null;
      const overlapCount = context.fundResearch?.overlaps.filter((overlap) => overlap.funds.some((fund) => fund.code === item.holding.code)).length ?? 0;
      return {
        asset: item.alias,
        type: item.holding.type,
        portfolioWeightPercent: item.marketValue && totalMarketValue ? Math.round((item.marketValue / totalMarketValue) * 1000) / 10 : null,
        dailyChangePercent: item.quote?.changePercent === null || item.quote?.changePercent === undefined ? null : Math.round(item.quote.changePercent * 10) / 10,
        holdingReturnPercent: item.profitPercent === null ? null : Math.round(item.profitPercent * 10) / 10,
        quoteAsOf: item.quote?.asOf ?? null,
        quoteVerification: item.quote?.verification ?? "single",
        redactedNoticeTitles: redactedTitles,
        fundamentals: fundamentals ? {
          asOf: fundamentals.asOf,
          reportAsOf: fundamentals.reportAsOf,
          peTtm: roundMetric(fundamentals.metrics.peTtm),
          pb: roundMetric(fundamentals.metrics.pb),
          psTtm: roundMetric(fundamentals.metrics.psTtm),
          roePercent: roundMetric(fundamentals.metrics.roe),
          revenueGrowthPercent: roundMetric(fundamentals.metrics.revenueGrowth),
          profitGrowthPercent: roundMetric(fundamentals.metrics.profitGrowth),
          verification: fundamentals.verification,
          relatedSectorChangePercent: roundMetric(relatedSector?.changePercent),
        } : null,
        marketHistory: marketHistory ? {
          asOf: marketHistory.asOf,
          status: marketHistory.status,
          sampleSize: marketHistory.sampleSize,
          upRatio5dPercent: marketHistory.stats.upRatio5d === null ? null : roundMetric(marketHistory.stats.upRatio5d * 100),
          averageReturn5dPercent: roundMetric(marketHistory.stats.averageReturn5d),
          upRatio20dPercent: marketHistory.stats.upRatio20d === null ? null : roundMetric(marketHistory.stats.upRatio20d * 100),
          averageReturn20dPercent: roundMetric(marketHistory.stats.averageReturn20d),
          worstDrawdown20dPercent: roundMetric(marketHistory.stats.worstDrawdown20d),
          verification: marketHistory.verification,
        } : null,
        fundNavHistory: fundHistory ? {
          asOf: fundHistory.asOf,
          status: fundHistory.status,
          sampleSize: fundHistory.sampleSize,
          upRatio5dPercent: fundHistory.stats.upRatio5d === null ? null : roundMetric(fundHistory.stats.upRatio5d * 100),
          averageReturn5dPercent: roundMetric(fundHistory.stats.averageReturn5d),
          upRatio20dPercent: fundHistory.stats.upRatio20d === null ? null : roundMetric(fundHistory.stats.upRatio20d * 100),
          averageReturn20dPercent: roundMetric(fundHistory.stats.averageReturn20d),
          worstDrawdown20dPercent: roundMetric(fundHistory.stats.worstDrawdown20d),
        } : null,
        risk: listedRisk ? {
          riskLevel: listedRisk.riskLevel,
          annualizedVolatilityPercent: roundMetric(listedRisk.annualizedVolatility),
          maxDrawdownPercent: roundMetric(listedRisk.maxDrawdown),
          valueAtRisk95Percent: roundMetric(listedRisk.valueAtRisk95),
          winRatePercent: listedRisk.winRate === null ? null : roundMetric(listedRisk.winRate * 100),
          observationCount: listedRisk.observationCount,
        } : fundRisk ? {
          riskLevel: fundRisk.riskLevel,
          annualizedVolatilityPercent: roundMetric(fundRisk.annualizedVolatility),
          maxDrawdownPercent: roundMetric(fundRisk.maxDrawdown),
          valueAtRisk95Percent: roundMetric(fundRisk.valueAtRisk95),
          winRatePercent: fundRisk.winRate === null ? null : roundMetric(fundRisk.winRate * 100),
          observationCount: fundRisk.observationCount,
        } : null,
        fundResearch: fundProduct ? {
          fundType: fundProduct.fundType,
          managerTenure: fundProduct.manager?.tenure ?? null,
          managerTenureReturnPercent: roundMetric(fundProduct.manager?.returnPercent),
          reportDate: fundProduct.reportDate,
          disclosedTopHoldingCount: fundProduct.holdings.length,
          disclosedTopHoldingsWeightPercent: roundMetric(disclosedWeight),
          overlapSignalCount: overlapCount,
          verification: fundProduct.verification,
        } : null,
        missingResearch: item.research?.errors.slice(0, 4) ?? [],
      };
    });
    const weightedAverage = (select: (item: typeof anonymized[number]) => number | null) => {
      const rows = anonymized.filter((item) => item.portfolioWeightPercent !== null && select(item) !== null);
      const totalWeight = rows.reduce((sum, item) => sum + (item.portfolioWeightPercent ?? 0), 0);
      if (!totalWeight) return null;
      return rows.reduce((sum, item) => sum + (item.portfolioWeightPercent ?? 0) * (select(item) ?? 0), 0) / totalWeight;
    };
    const weights = anonymized.map((item) => item.portfolioWeightPercent).filter((value): value is number => value !== null).sort((a, b) => b - a);
    const dailyChanges = anonymized.map((item) => item.dailyChangePercent).filter((value): value is number => value !== null);
    const assetMix = [...new Set(anonymized.map((item) => item.type))].map((type) => ({
      type,
      weightPercent: roundMetric(anonymized.filter((item) => item.type === type).reduce((sum, item) => sum + (item.portfolioWeightPercent ?? 0), 0)),
    }));
    const portfolioStats = {
      holdingCount: anonymized.length,
      quotedHoldingCount: anonymized.filter((item) => item.dailyChangePercent !== null).length,
      top1WeightPercent: roundMetric(weights[0]),
      top2WeightPercent: roundMetric(weights.slice(0, 2).reduce((sum, value) => sum + value, 0)),
      concentrationIndex0To100: weights.length ? roundMetric(weights.reduce((sum, value) => sum + (value / 100) ** 2, 0) * 100) : null,
      weightedDailyChangePercent: roundMetric(weightedAverage((item) => item.dailyChangePercent)),
      weightedHoldingReturnPercent: roundMetric(weightedAverage((item) => item.holdingReturnPercent)),
      advanceCount: dailyChanges.filter((value) => value > 0.05).length,
      declineCount: dailyChanges.filter((value) => value < -0.05).length,
      flatCount: dailyChanges.filter((value) => Math.abs(value) <= 0.05).length,
      assetMix,
    };
    const marketSources = [...new Set(usableQuotes.map((quote) => quote.source))].slice(0, 3).join("、") || "真实行情";
    const indexQuotes = context.indices.quotes.filter((quote) => quote.status === "ok" && quote.changePercent !== null);
    const overview = market.aMarket;
    const strongestSector = overview ? [...overview.sectors].sort((left, right) => right.changePercent - left.changePercent)[0] : undefined;
    const weakestSector = overview ? [...overview.sectors].sort((left, right) => left.changePercent - right.changePercent)[0] : undefined;
    const largestRiskItem = internal
      .filter((item) => item.research?.riskMetrics || item.research?.fundHistory?.riskMetrics)
      .sort((left, right) => (right.marketValue ?? 0) - (left.marketValue ?? 0))[0];
    const largestRisk = largestRiskItem?.research?.riskMetrics ?? largestRiskItem?.research?.fundHistory?.riskMetrics ?? null;
    const dataPoints: PortfolioAnalysis["dataPoints"] = [];
    if (portfolioStats.top1WeightPercent !== null) dataPoints.push({
      label: "第一大持仓权重",
      value: formatMetricPercent(portfolioStats.top1WeightPercent),
      interpretation: portfolioStats.top1WeightPercent >= 50 ? "大部分钱压在这一项上，它一涨一跌都会明显影响整个组合。" : portfolioStats.top1WeightPercent >= 30 ? "最大的一项占得有点多，整个组合很容易被它带着走。" : "最大持仓占比不算太高，组合相对分散。",
      source: "账号持仓与真实行情计算",
    });
    if (portfolioStats.weightedDailyChangePercent !== null) dataPoints.push({
      label: "组合当日加权涨跌",
      value: formatMetricPercent(portfolioStats.weightedDailyChangePercent, true),
      interpretation: `可用行情中 ${portfolioStats.advanceCount} 项上涨、${portfolioStats.declineCount} 项下跌、${portfolioStats.flatCount} 项平盘。`,
      source: marketSources,
    });
    if (portfolioStats.weightedHoldingReturnPercent !== null) dataPoints.push({
      label: "组合加权持有收益",
      value: formatMetricPercent(portfolioStats.weightedHoldingReturnPercent, true),
      interpretation: portfolioStats.weightedHoldingReturnPercent >= 0 ? "目前还有一些盈利垫，短期波动时不用太慌。" : "目前整体还在亏，下一步要先控制继续下跌的风险。",
      source: "账号持仓与真实行情计算",
    });
    if (indexQuotes.length) dataPoints.push({
      label: "A 股主要指数",
      value: `${indexQuotes.filter((quote) => (quote.changePercent ?? 0) > 0).length} 涨 / ${indexQuotes.filter((quote) => (quote.changePercent ?? 0) < 0).length} 跌`,
      interpretation: indexQuotes.map((quote) => `${quote.name}${formatMetricPercent(roundMetric(quote.changePercent), true)}`).join("，"),
      source: [...new Set(indexQuotes.map((quote) => quote.source))].join("、"),
    });
    if (overview?.breadthAvailable) dataPoints.push({
      label: "市场宽度样本",
      value: `${overview.upCount} 涨 / ${overview.downCount} 跌`,
      interpretation: `动态样本 ${overview.breadthSampleSize} 只；涨停约 ${overview.limitUpCount}，跌停约 ${overview.limitDownCount}。`,
      source: overview.source,
    });
    if (strongestSector && weakestSector) dataPoints.push({
      label: "行业冷热差",
      value: `${formatMetricPercent(roundMetric(strongestSector.changePercent), true)} / ${formatMetricPercent(roundMetric(weakestSector.changePercent), true)}`,
      interpretation: `较强的是${strongestSector.name}，较弱的是${weakestSector.name}；这是当前行业样本，不代表持仓必然同涨同跌。`,
      source: [...new Set([strongestSector.source, weakestSector.source])].join("、"),
    });
    if (largestRisk && largestRiskItem) dataPoints.push({
      label: `${largestRiskItem.holding.name}历史风险`,
      value: largestRisk.riskLevel,
      interpretation: `按最近 ${largestRisk.observationCount} 个有效交易日或净值日计算；最大历史回撤 ${formatMetricPercent(roundMetric(largestRisk.maxDrawdown))}。`,
      source: largestRiskItem.research?.riskMetrics?.source ?? largestRiskItem.research?.fundHistory?.source ?? "公开历史数据",
    });
    const { coverage, missingCategories, sources } = buildAnalysisCoverage(context, holdings);
    const similarHistorySampleSize = anonymized.reduce((sum, item) => sum + Math.max(item.marketHistory?.sampleSize ?? 0, item.fundNavHistory?.sampleSize ?? 0), 0) || null;
    const newsItems = context.marketNews?.items ?? [];
    const relatedNews = newsItems.filter((news) => internal.some((item) => `${news.title}${news.summary}`.includes(item.holding.name) || `${news.title}${news.summary}`.includes(item.holding.code)));
    const selectedNews = [...new Map([
      ...relatedNews,
      ...newsItems.filter((item) => item.category === "政策"),
      ...newsItems,
    ].map((item) => [item.id, item])).values()].slice(0, 18).map((item) => ({
      title: redactText(item.title),
      summary: redactText(item.summary).slice(0, 220),
      category: item.category,
      publishedAt: item.publishedAt,
      sourceCount: item.sourceCount,
      source: item.source,
    }));
    const rankedSectors = [...(overview?.sectors ?? [])].sort((left, right) => right.changePercent - left.changePercent);
    const evidenceAsOf = market.retrievedAt;
    const evidence = {
      quoteCount: usableQuotes.length,
      noticeCount: notices.items.length,
      similarHistorySampleSize,
      transactionCount: transactions.length,
      riskMetrics: largestRiskItem?.research?.riskMetrics ?? null,
      evidencePackageVersion: "2.0",
      coverage,
      missingCategories,
      sources: [...sources, ...(transactions.length ? ["D1 交易流水计数"] : [])].slice(0, 30),
      asOf: evidenceAsOf,
    } satisfies PortfolioAnalysis["evidence"];
    const prompt = {
      holdings: anonymized,
      portfolioStats,
      marketContext: {
        indices: indexQuotes.map((quote) => ({ name: quote.name, changePercent: roundMetric(quote.changePercent), asOf: quote.asOf, verification: quote.verification })),
        breadth: overview ? {
          available: overview.breadthAvailable,
          sampleSize: overview.breadthSampleSize,
          upCount: overview.upCount,
          flatCount: overview.flatCount,
          downCount: overview.downCount,
          limitUpCount: overview.limitUpCount,
          limitDownCount: overview.limitDownCount,
          totalAmount: overview.totalAmount,
        } : null,
        strongestSectors: rankedSectors.slice(0, 8).map((sector) => ({ name: sector.name, changePercent: roundMetric(sector.changePercent) })),
        weakestSectors: rankedSectors.slice(-8).reverse().map((sector) => ({ name: sector.name, changePercent: roundMetric(sector.changePercent) })),
        latestNews: selectedNews,
      },
      evidence: {
        quoteCount: evidence.quoteCount,
        noticeCount: evidence.noticeCount,
        similarHistorySampleSize: evidence.similarHistorySampleSize,
        transactionCount: evidence.transactionCount,
        coverage: evidence.coverage,
        missingCategories: evidence.missingCategories,
        sources: evidence.sources,
        asOf: evidence.asOf,
      },
      evidenceAsOf,
    };

    const response = await fetch(deepSeekEndpoint, {
      method: "POST",
      headers: { ...deepSeekHeaders, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        thinking: { type: "disabled" },
        temperature: 0.35,
        max_tokens: 3600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是一个 AI 联合研判小组，不是真人专家。先在内部依次完成四个角色的工作：盘面观察员只看指数、市场宽度、行业冷热和政策资讯；持仓研究员逐只看行情、仓位、估值/财报或基金档案、公告与历史；风险把关员专门寻找判断可能出错的地方、数据缺口和下跌风险；白话整理员负责把共识翻译成普通人能马上听懂的话。不要输出内部推理过程，只输出统一结论和可核对证据。全篇像给不懂金融术语的朋友解释，句子要短；尽量不用风险暴露、基准情景、失效条件、VaR、分位数、动量、估值扩张等词，无法避免时必须立刻用一句日常话解释。你必须综合使用证据中的全部类别：每只匿名持仓的最新行情、组合结构、估值与最新公开财报、相关行业强弱、基金公开档案与定期报告摘要、逐只历史相似和波动风险、持仓公告；同时结合 A 股主要指数、市场宽度、行业冷热和最新多源快讯/政策。不能只盯持仓当天涨跌，也不能因为某一条新闻就下结论。资讯仅为标题摘要：官方或多源信息权重更高，单源快讯只作线索。coverage 或 missingCategories 显示缺失时必须主动降低 confidence 并说清缺什么。先说结论，再说原因。stance 必须从强烈偏多、谨慎偏多、中性等待、谨慎偏空、强烈偏空、证据不足中选择。expertPanel 必须恰好包含三项，role 分别且只能是盘面观察员、持仓研究员、风险把关员；每项包含 conclusion 和 evidence，各用一句白话，不得重复。summary 由白话整理员统一写成 120—300 个中文字符：先说更偏向什么，再说市场环境、最重要的两个数据、最担心或最看好的地方，不得把三个角色的话机械拼接。必须输出 tomorrow，预测明天或下一交易日：focusAsset 必须是证据中某个完整资产别名，例如持仓1，指出明天最需要盯哪一只；direction 只能是偏涨、震荡、偏跌、看不清；confidence 为 0—100；upProbability、flatProbability、downProbability 为主观概率且合计 100；reason 用白话同时解释大盘环境和这只持仓自身证据；openingCheck 说明开盘后先看什么；suggestedAction 必须同时说清 focusAsset 应该继续拿着、先别动、冲高时收一点、回落后再看或降低风险；actionCondition 说明什么情况下才这样做。概率是基于现有证据的主观估计，不能写成保证。不得编造真实证券名称、代码、具体价格、涨跌幅区间、财务指标或新闻，不得把历史相似当成必然。forecast 保留 horizon、direction、confidence、baseCase、bullCase、bearCase、invalidation，但所有内容必须用白话短句；invalidation 页面会显示为“什么情况说明刚才看错了”，所以内容也要直接。actions 必须逐只持仓给建议；持仓不超过 12 只时每只恰好一项，超过 12 只时优先覆盖权重最高的 12 只。每项字段为 target、priority、action、trigger、reason；target 必须原样使用证据里的完整资产别名，例如持仓1，不得写某基金、某持仓或省略对象；priority 只能是高、中、低。每只的 reason 至少结合市场环境和该持仓自身证据中的两类，不能复制同一句话。每只的 action 必须明确说继续拿着、先观察、冲高时收一点、回落后再看或降低风险，不能保证收益、要求自动交易或给出精确买卖数量。watchItems 每项包含 title、reason、evidence，并优先列出真正改变判断的指数/宽度、行业、财报、资讯或历史数据；similarPattern 包含 status 和 note，并概括逐只历史证据是否一致。数据不够时可以选择看不清，但仍要告诉用户明天先观察什么。输出必须是 JSON 对象，字段为 summary、stance、score、riskLevel、expertPanel、tomorrow、forecast、actions、risks、watchItems、similarPattern。",
          },
          { role: "user", content: `请让 AI 分析小组完整看完下面证据，不要漏掉大盘、市场宽度、行业、资讯、基本面、基金档案、逐只历史和风险。先分别给出盘面、持仓、风险三句意见，再形成一个统一答案：明天更可能涨、跌还是震荡，各自概率是多少，最该盯哪一只，开盘看什么；然后逐只写清楚应该继续拿着、观察、降低风险还是等待机会，不能只给整个组合的笼统建议。最后补充接下来一段时间的三种可能。请把所有专业话翻成日常话，让第一次看股票的人也能一次读懂：${JSON.stringify(prompt)}` },
        ],
      }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
      const detail = safeText(errorBody?.error?.message, "", 240);
      throw new Error(`AI 分析服务响应 ${response.status}${detail ? `：${detail}` : ""}`);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 分析服务未返回内容。");
    const analysis = normalizeAnalysis(parseJsonContent(content), aliases, model, evidenceAsOf, evidence, dataPoints);
    return withDeviceCookie(Response.json({ analysis, privacy: "已发送匿名化持仓摘要及公开市场、行业、资讯、估值、财报、基金档案、历史和风险统计；未发送持仓代码、名称、成本、数量、金额、流水明细或设备标识。" }), owner.setCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析失败。";
    return withDeviceCookie(Response.json({ error: message }, { status: 502 }), owner.setCookie);
  }
}
