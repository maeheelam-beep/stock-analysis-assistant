import { fetchFundHistorySimilarity } from "@/lib/fund-history-data";
import { fetchFundResearch } from "@/lib/fund-data";
import { fetchFundamentalSnapshot } from "@/lib/fundamentals-data";
import { fetchHistorySimilarity } from "@/lib/history-data";
import { defaultIndices, fetchMarketSnapshot } from "@/lib/market-data";
import { fetchMarketNews, fetchNotices } from "@/lib/news-data";
import { fetchRiskMetrics } from "@/lib/risk-data";
import type { HoldingRecord } from "@/lib/types";
import type { AnalysisEvidenceCoverage } from "@/lib/types";

function resultValue<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : null;
}

function resultError(result: PromiseSettledResult<unknown>) {
  return result.status === "rejected" ? result.reason instanceof Error ? result.reason.message : "公开数据请求失败" : null;
}

async function fetchHoldingResearch(holding: HoldingRecord) {
  const [fundamentals, marketHistory, riskMetrics, fundHistory] = await Promise.allSettled([
    holding.type === "股票" ? fetchFundamentalSnapshot(holding.code) : Promise.resolve(null),
    holding.type === "股票" || holding.type === "ETF" ? fetchHistorySimilarity(holding.code) : Promise.resolve(null),
    holding.type === "股票" || holding.type === "ETF" ? fetchRiskMetrics(holding.code) : Promise.resolve(null),
    holding.type === "ETF" || holding.type === "场外基金" ? fetchFundHistorySimilarity(holding.code, holding.name) : Promise.resolve(null),
  ]);
  return {
    holdingId: holding.id,
    code: holding.code,
    type: holding.type,
    fundamentals: resultValue(fundamentals),
    marketHistory: resultValue(marketHistory),
    riskMetrics: resultValue(riskMetrics),
    fundHistory: resultValue(fundHistory),
    errors: [fundamentals, marketHistory, riskMetrics, fundHistory].map(resultError).filter((value): value is string => Boolean(value)),
  };
}

export async function collectComprehensiveAnalysisContext(holdings: HoldingRecord[]) {
  const listedCodes = holdings.filter((holding) => holding.type !== "场外基金").map((holding) => holding.code);
  const fundInputs = holdings
    .filter((holding) => holding.type === "ETF" || holding.type === "场外基金")
    .map((holding) => ({ code: holding.code, name: holding.name, type: holding.type }));

  const [market, indices, notices, marketNews, fundResearch, holdingResearch] = await Promise.all([
    fetchMarketSnapshot(holdings.map(({ code, type }) => ({ code, type })), [], false, true),
    fetchMarketSnapshot(defaultIndices),
    fetchNotices(listedCodes),
    fetchMarketNews().catch(() => null),
    fundInputs.length ? fetchFundResearch(fundInputs).catch(() => null) : Promise.resolve(null),
    Promise.all(holdings.map(fetchHoldingResearch)),
  ]);

  return {
    market,
    indices,
    notices,
    marketNews,
    fundResearch,
    holdingResearch,
    retrievedAt: new Date().toISOString(),
  };
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function latestDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

export function buildAnalysisCoverage(context: ComprehensiveAnalysisContext, holdings: HoldingRecord[]) {
  const quoteRows = context.market.quotes.filter((quote) => quote.status === "ok" && quote.price !== null);
  const indexRows = context.indices.quotes.filter((quote) => quote.status === "ok" && quote.price !== null);
  const overview = context.market.aMarket;
  const fundamentalRows = context.holdingResearch.flatMap((item) => item.fundamentals ? [item.fundamentals] : []);
  const fundProducts = context.fundResearch?.products.filter((product) => product.profileStatus === "ok" || product.holdingsStatus === "ok") ?? [];
  const historyRows = context.holdingResearch.filter((item) => item.marketHistory || item.fundHistory);
  const riskRows = context.holdingResearch.filter((item) => item.riskMetrics || (item.fundHistory?.riskMetrics.observationCount ?? 0) >= 30);
  const stockCount = holdings.filter((holding) => holding.type === "股票").length;
  const fundCount = holdings.filter((holding) => holding.type === "ETF" || holding.type === "场外基金").length;
  const newsSources = context.marketNews?.sources.filter((source) => source.status === "ok").map((source) => source.name) ?? [];
  const coverage: AnalysisEvidenceCoverage[] = [
    { key: "quotes", label: "持仓最新行情", available: quoteRows.length, expected: holdings.length, asOf: context.market.retrievedAt, sources: unique(quoteRows.flatMap((quote) => quote.sources?.length ? quote.sources : [quote.source])), note: "股票与 ETF 为最新行情；场外基金为最新可用估值或已确认净值。" },
    { key: "indices", label: "A 股主要指数", available: indexRows.length, expected: defaultIndices.length, asOf: context.indices.retrievedAt, sources: unique(indexRows.flatMap((quote) => quote.sources?.length ? quote.sources : [quote.source])), note: "上证、深证、创业板与科创 50。" },
    { key: "breadth", label: "市场宽度样本", available: overview?.breadthSampleSize ?? 0, expected: 500, asOf: context.market.retrievedAt, sources: overview?.source ? [overview.source] : [], note: overview?.breadthAvailable ? "按成交活跃的动态沪深京样本统计涨跌家数。" : "宽度样本不可用时不把排行样本冒充全市场。" },
    { key: "sectors", label: "行业强弱", available: overview?.sectors.length ?? 0, expected: overview?.sectorTotal ?? 48, asOf: context.market.retrievedAt, sources: unique(overview?.sectors.map((item) => item.source) ?? []), note: "实时行业涨幅前 24 与跌幅前 24。" },
    { key: "news", label: "市场快讯与政策", available: context.marketNews?.items.length ?? 0, expected: null, asOf: context.marketNews?.retrievedAt ?? null, sources: newsSources, note: "多源独立容错；AI 只取最新且与持仓相关度较高的标题摘要。" },
    { key: "notices", label: "持仓公告", available: context.notices.items.length, expected: null, asOf: context.notices.retrievedAt, sources: unique(context.notices.items.map((item) => item.source)), note: "按持仓代码读取并脱敏后发送。" },
    { key: "fundamentals", label: "逐只股票估值与财报", available: fundamentalRows.length, expected: stockCount, asOf: latestDate(fundamentalRows.flatMap((item) => [item.asOf, item.reportAsOf])), sources: unique(fundamentalRows.flatMap((item) => item.sources)), note: "PE、PB、PS、总市值、ROE、营收增速与利润增速；缺失字段保留为空。" },
    { key: "fundResearch", label: "逐只基金公开档案", available: fundProducts.length, expected: fundCount, asOf: context.fundResearch?.retrievedAt ?? null, sources: unique(fundProducts.flatMap((item) => item.sources)), note: "基金类型、经理任职摘要与最新定期报告前十大集中度。" },
    { key: "history", label: "逐只持仓历史形态", available: historyRows.length, expected: holdings.length, asOf: latestDate(historyRows.flatMap((item) => [item.marketHistory?.asOf, item.fundHistory?.asOf])), sources: unique(historyRows.flatMap((item) => [item.marketHistory?.source, item.fundHistory?.source])), note: "股票/ETF 使用复权价格；ETF/场外基金同时使用公开净值。" },
    { key: "risk", label: "逐只持仓波动风险", available: riskRows.length, expected: holdings.length, asOf: latestDate(riskRows.flatMap((item) => [item.riskMetrics?.asOf, item.fundHistory?.asOf])), sources: unique(riskRows.flatMap((item) => [item.riskMetrics?.source, item.fundHistory?.source])), note: "按各自历史价格或净值计算，不跨持仓混用样本。" },
  ];
  const missingCategories = coverage
    .filter((item) => item.available === 0 || (item.expected !== null && item.available < item.expected))
    .map((item) => `${item.label} ${item.available}/${item.expected ?? "本轮"}`);
  return { coverage, missingCategories, sources: unique(coverage.flatMap((item) => item.sources)) };
}

export type ComprehensiveAnalysisContext = Awaited<ReturnType<typeof collectComprehensiveAnalysisContext>>;
