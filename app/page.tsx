"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type Section = "home" | "market" | "stocks" | "funds" | "news" | "us";
type ThemeMode = "auto" | "light" | "dark";
type HoldingKind = "股票" | "ETF" | "场外基金";
type UtilityView = "help" | "settings" | "account" | null;
type AuthUser = { id: number; email: string; createdAt: number };
type AuthState = { authenticated: boolean; user: AuthUser | null; sync: "account" | "device" };
type IconName =
  | "search"
  | "refresh"
  | "theme"
  | "help"
  | "settings"
  | "account"
  | "plus"
  | "close"
  | "arrow"
  | "info"
  | "clock"
  | "check";

type Holding = {
  id?: number;
  code: string;
  name: string;
  type: HoldingKind;
  cost?: string;
  quantity?: string;
  holdingAmount?: string | null;
  holdingProfit?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

type PortfolioTransaction = {
  id: number;
  code: string;
  name: string;
  type: HoldingKind;
  side: "买入" | "卖出" | "分红" | "费用" | "期初";
  quantity: string | null;
  price: string | null;
  amount: string;
  fee: string;
  occurredAt: number;
  note: string | null;
};
type TransactionAssetSummary = {
  code: string;
  name: string;
  type: HoldingKind;
  quantity: number;
  investedAmount: number;
  costBasis: number;
  realizedAmount: number;
  realizedProfit: number;
  dividends: number;
  fees: number;
  transactionCount: number;
  lotCount: number;
  remainingLots: Array<{ sourceTransactionId: number; occurredAt: number; quantity: number; unitCost: number }>;
};

type VerificationStatus = "verified" | "single" | "conflict";
type SecuritySearchResult = { code: string; name: string; type: HoldingKind | "美股"; source: string; sources?: string[]; sourceCount?: number; verification?: VerificationStatus };
type UsSearchResult = { code: string; name: string; type: "美股"; source: string };
type UsWatchlistItem = { id: number; symbol: string; name: string; createdAt: number; updatedAt: number };
type StockWatchlistItem = { id: number; code: string; name: string; createdAt: number; updatedAt: number };

type Quote = {
  key: string;
  code: string;
  name: string;
  type: HoldingKind | "指数" | "美股" | "美股指数";
  price: number | null;
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  currency: "CNY" | "USD";
  asOf: string | null;
  source: string;
  sources?: string[];
  sourceCount?: number;
  verification?: VerificationStatus;
  deviationPercent?: number | null;
  status: "ok" | "unavailable";
  error?: string;
};

type MarketSourceStatus = { source: string; status: "ok" | "stale" | "unavailable"; retrievedAt: string; coverage: string; sourceCount?: number; verification?: VerificationStatus; error?: string };
type HealthCheck = { key: string; label: string; state: "ready" | "not_configured" | "unknown"; detail: string };

type NoticeItem = { id: string; code: string; title: string; publishedAt: string; source: string; url: string; category: "公告" };
type MarketNewsItem = { id: string; title: string; summary: string; publishedAt: string; source: string; url: string; category: "快讯" | "政策"; sources: Array<{ name: string; url: string }>; sourceCount: number };
type UsRankItem = { code: string; name: string; price: number; changePercent: number; previousClose: number | null; open: number | null; high: number | null; low: number | null; volume: number | null; amount: number | null; source: string };
type AStockRankItem = { code: string; name: string; price: number; changePercent: number; previousClose: number | null; open: number | null; high: number | null; low: number | null; volume: number | null; amount: number | null; source: string };
type ASectorItem = { code: string; name: string; changePercent: number; amount: number | null; source: string };
type AMarketOverview = { coverage: "全市场" | "实时排行" | "不可用"; breadthAvailable: boolean; breadthSampleSize: number; upCount: number; flatCount: number; downCount: number; limitUpCount: number; limitDownCount: number; totalAmount: number | null; active: AStockRankItem[]; gainers: AStockRankItem[]; losers: AStockRankItem[]; sectors: ASectorItem[]; sectorTotal: number | null; source: string };
type AnalysisEvidenceCoverage = { key: string; label: string; available: number; expected: number | null; asOf: string | null; sources: string[]; note: string };
type Analysis = {
  summary: string;
  stance: string;
  score: number | null;
  riskLevel: "低" | "中" | "高" | "未知";
  expertPanel: Array<{ role: "盘面观察员" | "持仓研究员" | "风险把关员"; conclusion: string; evidence: string }>;
  dataPoints: Array<{ label: string; value: string; interpretation: string; source: string }>;
  tomorrow: {
    focusAsset: string;
    direction: "偏涨" | "震荡" | "偏跌" | "看不清";
    confidence: number | null;
    upProbability: number | null;
    flatProbability: number | null;
    downProbability: number | null;
    reason: string;
    openingCheck: string;
    suggestedAction: string;
    actionCondition: string;
  };
  forecast: {
    horizon: string;
    direction: "偏强" | "震荡" | "偏弱" | "证据不足";
    confidence: number | null;
    baseCase: string;
    bullCase: string;
    bearCase: string;
    invalidation: string;
  };
  actions: Array<{ target: string; priority: "高" | "中" | "低"; action: string; trigger: string; reason: string }>;
  risks: string[];
  watchItems: Array<{ title: string; reason: string; evidence: string }>;
  similarPattern: { status: "available" | "unavailable"; note: string };
  disclaimer: string;
  generatedAt: string;
  model: string;
  evidenceAsOf: string;
  evidence?: { quoteCount: number; noticeCount: number; similarHistorySampleSize: number | null; transactionCount?: number; riskMetrics?: RiskMetrics | null; evidencePackageVersion?: string; coverage?: AnalysisEvidenceCoverage[]; missingCategories?: string[]; sources: string[]; asOf: string };
};

type DataStatus = "idle" | "loading" | "ready" | "error";
type HistoryResult = {
  code: string;
  name: string;
  source: string;
  sources?: string[];
  sourceCount?: number;
  verification?: VerificationStatus;
  deviationPercent?: number | null;
  asOf: string | null;
  windowDays: number;
  sampleSize: number;
  status: "available" | "insufficient";
  stats: { upRatio5d: number | null; averageReturn5d: number | null; upRatio20d: number | null; averageReturn20d: number | null; worstDrawdown20d: number | null };
  recent?: Array<{ date: string; close: number; high: number; low: number; changePercent: number }>;
  note: string;
};
type RiskMetrics = {
  code: string;
  name: string;
  asOf: string | null;
  observationCount: number;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  valueAtRisk95: number | null;
  downsideDeviation: number | null;
  winRate: number | null;
  lossStreak: number;
  riskScore: number | null;
  riskLevel: "低" | "中" | "高" | "未知";
  source: string;
  note: string;
};
type FundamentalSnapshot = {
  code: string;
  name: string;
  asOf: string | null;
  reportAsOf: string | null;
  industry: string | null;
  source: string;
  sources: string[];
  sourceCount: number;
  verification: VerificationStatus;
  conflicts: string[];
  sourceUrl: string;
  status: "available" | "partial" | "unavailable";
  metrics: { peTtm: number | null; pb: number | null; psTtm: number | null; roe: number | null; revenueGrowth: number | null; profitGrowth: number | null; marketCap: number | null };
  note: string;
};
type FundManagerProfile = { names: string[]; startDate: string | null; tenure: string | null; returnPercent: number | null };
type FundResearchProduct = { code: string; name: string; type: "ETF" | "场外基金"; fundType: string | null; company: string | null; manager: FundManagerProfile | null; reportDate: string | null; holdings: Array<{ code: string; name: string; weightPercent: number }>; profileStatus: "ok" | "unavailable"; holdingsStatus: "ok" | "unavailable"; source: string; sources?: string[]; sourceCount?: number; verification?: VerificationStatus; profileUrl: string; holdingsUrl: string; error?: string };
type FundOverlapItem = { code: string; name: string; fundCount: number; combinedWeightPercent: number; funds: Array<{ code: string; name: string; weightPercent: number; reportDate: string | null }> };
type FundResearchSnapshot = { products: FundResearchProduct[]; overlaps: FundOverlapItem[]; disclosureCount: number; retrievedAt: string; source: string };
type FundHistoryResult = { code: string; name: string; source: string; sourceUrl: string; asOf: string | null; windowDays: number; sampleSize: number; observationCount: number; status: "available" | "insufficient"; stats: { upRatio5d: number | null; averageReturn5d: number | null; upRatio20d: number | null; averageReturn20d: number | null; worstDrawdown20d: number | null }; riskMetrics?: { observationCount: number; annualizedVolatility: number | null; maxDrawdown: number | null; valueAtRisk95: number | null; downsideDeviation: number | null; winRate: number | null; riskLevel: "低" | "中" | "高" | "未知" }; matches: Array<{ endDate: string; similarity: number; return5d: number | null; return20d: number | null; maxDrawdown20d: number | null }>; note: string };

const LIVE_MARKET_REFRESH_MS = 30 * 1000;
const IDLE_MARKET_REFRESH_MS = 5 * 60 * 1000;
const MANUAL_REFRESH_COOLDOWN_MS = 30 * 1000;

function zonedTradingParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: values.weekday ?? "", minutes: Number(values.hour ?? 0) * 60 + Number(values.minute ?? 0) };
}

function marketRefreshInterval(market: "a" | "us", date = new Date()) {
  const { weekday, minutes } = zonedTradingParts(date, market === "a" ? "Asia/Shanghai" : "America/New_York");
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) return IDLE_MARKET_REFRESH_MS;
  const trading = market === "a"
    ? (minutes >= 9 * 60 + 15 && minutes <= 9 * 60 + 25) || (minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30) || (minutes >= 13 * 60 && minutes <= 15 * 60)
    : minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
  return trading ? LIVE_MARKET_REFRESH_MS : IDLE_MARKET_REFRESH_MS;
}

function formatNumber(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? "—" : value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatProbability(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`;
}

function verificationLabel(status?: VerificationStatus, sourceCount = 1) {
  if (status === "verified") return `${Math.max(2, sourceCount)} 源验证`;
  if (status === "conflict") return "来源冲突";
  return "单源";
}

function plainStance(stance: string) {
  return ({ 强烈偏多: "比较看好", 谨慎偏多: "有点看好", 中性等待: "先看看", 谨慎偏空: "有点担心", 强烈偏空: "比较担心", 证据不足: "还看不清" } as Record<string, string>)[stance] || stance;
}

function verificationClass(status?: VerificationStatus) {
  return status === "verified" ? "ready" : status === "conflict" ? "error" : "pending";
}

function quoteVerificationTitle(quote?: Quote) {
  if (!quote) return "行情尚未返回";
  const sources = quote.sources?.join("、") || quote.source;
  const deviation = quote.deviationPercent === null || quote.deviationPercent === undefined ? "" : `；价格偏差 ${quote.deviationPercent.toFixed(3)}%`;
  return `${sources}${deviation}${quote.error ? `；${quote.error}` : ""}`;
}

function formatChangeAmount(price: number | null, previousClose: number | null) {
  if (price === null || previousClose === null || !Number.isFinite(price) || !Number.isFinite(previousClose)) return "—";
  const changeAmount = price - previousClose;
  return `${changeAmount >= 0 ? "+" : ""}${changeAmount.toFixed(2)}`;
}

function quoteFor(quotes: Quote[], holding: Holding) {
  return quotes.find((quote) => quote.key === `${holding.type}:${holding.code}`);
}

function holdingMarketValue(holding: Holding, quote?: Quote) {
  if (holding.type === "场外基金") {
    const value = Number(holding.holdingAmount ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const value = quote?.price ? quote.price * Number(holding.quantity ?? 0) : null;
  return value !== null && Number.isFinite(value) ? value : null;
}

function holdingReturnPercent(holding: Holding, quote?: Quote) {
  if (holding.type === "场外基金") {
    const amount = Number(holding.holdingAmount ?? 0);
    const profit = Number(holding.holdingProfit ?? 0);
    const principal = amount - profit;
    return Number.isFinite(profit) && principal > 0 ? (profit / principal) * 100 : null;
  }
  return quote?.price && holding.cost ? ((quote.price / Number(holding.cost)) - 1) * 100 : null;
}

function formatSignedMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}¥${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calculateAssetSummary(holdings: Holding[], quotes: Quote[]) {
  let totalAssets = 0;
  let dayProfit = 0;
  let totalProfit = 0;
  let returnProfit = 0;
  let returnCost = 0;
  let valuedCount = 0;
  let dayCount = 0;
  let profitCount = 0;

  holdings.forEach((holding) => {
    const quote = quoteFor(quotes, holding);
    const marketValue = holdingMarketValue(holding, quote);
    if (marketValue !== null) {
      totalAssets += marketValue;
      valuedCount += 1;
    }

    if (holding.type === "场外基金") {
      const amount = Number(holding.holdingAmount ?? 0);
      const profit = Number(holding.holdingProfit ?? Number.NaN);
      const principal = amount - profit;
      if (Number.isFinite(profit)) {
        totalProfit += profit;
        profitCount += 1;
      }
      if (Number.isFinite(profit) && Number.isFinite(principal) && principal > 0) {
        returnProfit += profit;
        returnCost += principal;
      }
      return;
    }

    const price = quote?.status === "ok" ? quote.price : null;
    const previousClose = quote?.status === "ok" ? quote.previousClose : null;
    const quantity = Number(holding.quantity ?? 0);
    const cost = Number(holding.cost ?? 0);
    const hasQuantity = Number.isFinite(quantity) && quantity > 0;
    const hasCost = Number.isFinite(cost) && cost > 0;
    if (price !== null && previousClose !== null && hasQuantity) {
      dayProfit += (price - previousClose) * quantity;
      dayCount += 1;
    }
    if (price !== null && hasQuantity && hasCost) {
      const profit = (price - cost) * quantity;
      totalProfit += profit;
      returnProfit += profit;
      returnCost += cost * quantity;
      profitCount += 1;
    }
  });

  return {
    totalAssets: valuedCount ? totalAssets : null,
    dayProfit: dayCount ? dayProfit : null,
    totalProfit: profitCount ? totalProfit : null,
    totalReturn: returnCost > 0 ? (returnProfit / returnCost) * 100 : null,
    valuedCount,
    dayCount,
    profitCount,
    holdingCount: holdings.length,
    hasOffMarketFunds: holdings.some((holding) => holding.type === "场外基金"),
  };
}

function formatCompactMarketValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatQuoteTime(value: string | null) {
  if (!value) return "时间待核验";
  if (/^\d{14}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  const timestamp = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false }) : value;
}

function newsTimeValue(value: string) {
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNewsTime(value: string, compact = false) {
  const timestamp = newsTimeValue(value);
  if (!timestamp) return "时间待核验";
  return new Date(timestamp).toLocaleString("zh-CN", compact
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const navItems: Array<{ id: Section; label: string; short: string; ariaLabel?: string }> = [
  { id: "home", label: "首页", short: "首" },
  { id: "market", label: "行情", short: "行", ariaLabel: "A股行情" },
  { id: "stocks", label: "股票", short: "股" },
  { id: "funds", label: "基金", short: "基" },
  { id: "news", label: "资讯", short: "讯" },
  { id: "us", label: "美股", short: "美", ariaLabel: "美股观察" },
];

const initialHoldings: Holding[] = [];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M18.5 15a7 7 0 1 1-.7-7.8L20 9" /></>,
    theme: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.3 2.1c-.8.4-1.1.9-1.1 1.9M12 17h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5-.7-2h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9-.5 1.2-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2 2-.7Z" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</g>
    </svg>
  );
}

function CompassMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`compass-mark ${compact ? "compact" : ""}`} aria-hidden="true">
      <span className="compass-needle" />
    </span>
  );
}

function Pending({ compact = false }: { compact?: boolean }) {
  return <span className={`pending-value ${compact ? "compact" : ""}`}>添加持仓后可用</span>;
}

function SectionHeading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function SourceState({ title, description, status = "pending", pendingLabel = "同步中" }: { title: string; description: string; status?: "pending" | "ready" | "error"; pendingLabel?: string }) {
  return (
    <div className="source-state">
      <span className="source-state-icon"><Icon name="clock" size={16} /></span>
      <div><strong>{title}</strong><p>{description}</p></div>
      <span className={`source-chip ${status}`}>{status === "ready" ? "已接入" : status === "error" ? "异常" : pendingLabel}</span>
    </div>
  );
}

function PortfolioCompass({ analysis }: { analysis: Analysis | null }) {
  return (
    <figure className="strategy-compass" aria-label={analysis ? `组合综合评分 ${analysis.score ?? "未知"}，风险${analysis.riskLevel}` : "组合罗盘等待 AI 分析"}>
      <figcaption>组合罗盘</figcaption>
      <span className="compass-axis axis-trend"><b>趋势</b><strong>—</strong></span>
      <span className="compass-axis axis-risk"><b>风险</b><strong>{analysis?.riskLevel ?? "—"}</strong></span>
      <span className="compass-axis axis-value"><b>估值</b><strong>—</strong></span>
      <span className="compass-axis axis-balance"><b>分散</b><strong>—</strong></span>
      <span className="strategy-needle" aria-hidden="true" />
      <span className="strategy-center"><strong>{analysis?.score ?? "—"}</strong><small>{analysis ? plainStance(analysis.stance) : "待分析"}</small></span>
    </figure>
  );
}

function AssetOverview({ scope, holdings, quotes }: { scope: "全部持仓" | "股票持仓" | "基金持仓"; holdings: Holding[]; quotes: Quote[] }) {
  const summary = calculateAssetSummary(holdings, quotes);
  const dayClass = summary.dayProfit === null ? "" : summary.dayProfit >= 0 ? "up-text" : "down-text";
  const totalClass = summary.totalProfit === null ? "" : summary.totalProfit >= 0 ? "up-text" : "down-text";
  const returnClass = summary.totalReturn === null ? "" : summary.totalReturn >= 0 ? "up-text" : "down-text";
  const dayNote = summary.hasOffMarketFunds
    ? summary.dayCount ? `已核算 ${summary.dayCount} 项，场外基金待净值` : "场外基金待净值结算"
    : summary.dayCount ? `已核算 ${summary.dayCount} 项持仓` : "等待昨收与最新行情";

  return (
    <section className="asset-overview" aria-label={`${scope}资产总览`}>
      <div className="asset-overview-total">
        <span>{scope}</span>
        <h2>总资产</h2>
        <strong>{formatMoney(summary.totalAssets)}</strong>
        <p>{summary.holdingCount ? `已核算 ${summary.valuedCount}/${summary.holdingCount} 项持仓` : "添加持仓后自动汇总"}</p>
      </div>
      <dl>
        <div><dt>今日盈亏</dt><dd className={dayClass}>{formatSignedMoney(summary.dayProfit)}</dd><small>{dayNote}</small></div>
        <div><dt>累计盈亏</dt><dd className={totalClass}>{formatSignedMoney(summary.totalProfit)}</dd><small>{summary.holdingCount ? `已核算 ${summary.profitCount}/${summary.holdingCount} 项成本` : "等待持仓数据"}</small></div>
        <div><dt>累计收益率</dt><dd className={returnClass}>{formatPercent(summary.totalReturn)}</dd><small>按已核算成本加权</small></div>
      </dl>
      <p className="asset-overview-note">总资产仅统计网站已录入持仓，不含未录入现金；“—”表示计算所需数据不完整。</p>
    </section>
  );
}

function HoldingTable({ holdings, quotes = [], query = "", onRemove }: { holdings: Holding[]; quotes?: Quote[]; query?: string; onRemove?: (holding: Holding) => void }) {
  const filtered = holdings.filter((item) => `${item.name}${item.code}`.toLowerCase().includes(query.toLowerCase()));
  const totalValue = holdings.reduce((sum, holding) => {
    const quote = quoteFor(quotes, holding);
    return sum + (holdingMarketValue(holding, quote) ?? 0);
  }, 0);

  return (
    <div className="table-scroll" role="region" aria-label="持仓表格，可横向滚动">
      <table className="data-table holdings-table">
        <thead>
          <tr><th>标的</th><th>最新价</th><th>持仓收益</th><th>组合占比</th><th>综合评分</th><th>分析状态</th>{onRemove ? <th>管理</th> : null}</tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const quote = quoteFor(quotes, item);
            const profit = holdingReturnPercent(item, quote);
            const fundProfitAmount = item.holdingProfit === null || item.holdingProfit === undefined || item.holdingProfit === "" ? null : Number(item.holdingProfit);
            const value = holdingMarketValue(item, quote);
            const weight = value !== null && totalValue > 0 ? (value / totalValue) * 100 : null;
            return <tr key={`${item.type}-${item.code}-${item.name}`}>
              <td>
                <div className="asset-name">
                  <span className="asset-icon">{item.type === "股票" ? "股" : "基"}</span>
                  <div><strong>{item.name}</strong><span>{item.code} · {item.type}</span></div>
                </div>
              </td>
              <td><strong className="data-value">{formatNumber(quote?.price ?? null, item.type === "场外基金" ? 4 : 2)}</strong><span className={`quote-change ${(quote?.changePercent ?? 0) >= 0 ? "up-text" : "down-text"}`}>{formatPercent(quote?.changePercent ?? null)}</span></td>
              <td><strong className={`data-value ${(profit ?? 0) >= 0 ? "up-text" : "down-text"}`}>{item.type === "场外基金" ? formatSignedMoney(fundProfitAmount) : formatPercent(profit)}</strong>{item.type === "场外基金" ? <span className={`quote-change ${(profit ?? 0) >= 0 ? "up-text" : "down-text"}`}>{formatPercent(profit)}</span> : null}</td>
              <td className="data-value">{weight === null ? "—" : `${weight.toFixed(1)}%`}</td>
              <td className="data-value">—</td>
              <td>{quote?.status === "ok" ? <span className={`source-chip ${verificationClass(quote.verification)}`} title={quoteVerificationTitle(quote)}>{verificationLabel(quote.verification, quote.sourceCount)}</span> : <span className="source-chip error" title={quote?.error || "请检查代码或持仓类型"}>未获取行情</span>}</td>
              {onRemove ? <td><button className="row-action" type="button" onClick={() => onRemove(item)} aria-label={`删除${item.name}`}>删除</button></td> : null}
            </tr>;
          })}
        </tbody>
      </table>
      {filtered.length === 0 ? <div className="empty-state">{holdings.length === 0 ? "还没有持仓，先添加一项。" : "没有找到匹配的持仓。"}</div> : null}
    </div>
  );
}

function StockHoldingTable({ holdings, quotes = [] }: { holdings: Holding[]; quotes?: Quote[] }) {
  const totalMarketValue = holdings.reduce((sum, holding) => sum + (holdingMarketValue(holding, quoteFor(quotes, holding)) ?? 0), 0);
  return (
    <div className="table-scroll" role="region" aria-label="股票持仓收益表，可横向滚动">
      <table className="data-table stock-holdings-table">
        <thead><tr><th>股票</th><th>今盈亏</th><th>总盈亏</th><th>总收益率</th><th>现价</th><th>成本</th><th>数量</th><th>市值/仓位</th><th>行情</th></tr></thead>
        <tbody>{holdings.map((item) => {
          const quote = quoteFor(quotes, item);
          const price = quote?.status === "ok" ? quote.price : null;
          const previousClose = quote?.status === "ok" ? quote.previousClose : null;
          const cost = Number(item.cost ?? 0);
          const quantity = Number(item.quantity ?? 0);
          const hasCost = Number.isFinite(cost) && cost > 0;
          const hasQuantity = Number.isFinite(quantity) && quantity > 0;
          const dayProfit = price !== null && previousClose !== null && hasQuantity ? (price - previousClose) * quantity : null;
          const totalProfit = price !== null && hasCost && hasQuantity ? (price - cost) * quantity : null;
          const totalReturn = price !== null && hasCost ? ((price / cost) - 1) * 100 : null;
          const marketValue = price !== null && hasQuantity ? price * quantity : null;
          const weight = marketValue !== null && totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : null;
          const dayClass = dayProfit === null ? "" : dayProfit >= 0 ? "up-text" : "down-text";
          const totalClass = totalProfit === null ? "" : totalProfit >= 0 ? "up-text" : "down-text";
          return <tr key={`${item.type}-${item.code}-${item.name}`}>
            <td><div className="asset-name"><span className="asset-icon">股</span><div><strong>{item.name}</strong><span>{item.code}</span></div></div></td>
            <td><strong className={`data-value ${dayClass}`}>{formatSignedMoney(dayProfit)}</strong><span className={`quote-change ${dayClass}`}>{formatPercent(quote?.changePercent ?? null)}</span></td>
            <td><strong className={`data-value ${totalClass}`}>{formatSignedMoney(totalProfit)}</strong></td>
            <td><strong className={`data-value ${totalClass}`}>{formatPercent(totalReturn)}</strong></td>
            <td><strong className="data-value">{price === null ? "—" : `¥${formatNumber(price)}`}</strong></td>
            <td><strong className="data-value">{hasCost ? `¥${formatNumber(cost)}` : "—"}</strong></td>
            <td><strong className="data-value">{hasQuantity ? quantity.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "—"}</strong>{hasQuantity ? <span className="quote-change">股</span> : null}</td>
            <td><strong className="data-value">{marketValue === null ? "—" : `¥${formatNumber(marketValue)}`}</strong><span className="quote-change">{weight === null ? "仓位 —" : `仓位 ${weight.toFixed(1)}%`}</span></td>
            <td>{quote?.status === "ok" ? <span className={`source-chip ${verificationClass(quote.verification)}`} title={quoteVerificationTitle(quote)}>{verificationLabel(quote.verification, quote.sourceCount)}</span> : <span className="source-chip error" title={quote?.error || "请检查代码或持仓类型"}>未获取</span>}</td>
          </tr>;
        })}</tbody>
      </table>
      {holdings.length === 0 ? <div className="empty-state">还没有持仓，先添加一项。</div> : null}
    </div>
  );
}

function HistoryChart({ points, range }: { points: NonNullable<HistoryResult["recent"]>; range: string }) {
  const source = points.filter((point) => Number.isFinite(point.close) && point.close > 0);
  const grouped = range === "日线" ? source : source.reduce<Array<typeof source>>((groups, point, index) => {
    const bucket = range === "周线" ? Math.floor(index / 5) : Math.floor(index / 20);
    (groups[bucket] ||= []).push(point);
    return groups;
  }, []).map((group) => group[group.length - 1]);
  if (grouped.length < 2) return <div className="empty-chart tall"><div><strong>历史样本不足</strong><p>有效日线返回后才绘制走势。</p></div></div>;
  const values = grouped.map((point) => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const pointsAttribute = values.map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / spread) * 32}`).join(" ");
  const latest = grouped[grouped.length - 1];
  return <div className="history-chart" role="img" aria-label={`${range}历史走势，${grouped.length} 个样本，最新收盘 ${formatNumber(latest.close)}`}>
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path className="history-chart-area" d={`M 0 38 L ${pointsAttribute.replaceAll(" ", " L ")} L 100 38 Z`} /><polyline className="history-chart-line" points={pointsAttribute} /></svg>
    <div className="history-chart-meta"><span>{grouped[0].date}</span><strong>{formatNumber(latest.close)}</strong><span>{latest.date} · {formatPercent(latest.changePercent)}</span></div>
  </div>;
}

function FundManagerResearch({ products, status }: { products: FundResearchProduct[]; status: DataStatus }) {
  if (status === "loading") return <SourceState title="经理与产品档案" description="正在同步公开基金档案" status="pending" />;
  if (status === "error") return <SourceState title="经理与产品档案" description="公开基金源暂不可用，页面稍后会重试" status="error" />;
  if (!products.length) return <div className="fund-research-empty"><strong>还没有基金持仓</strong><p>添加 ETF 或场外基金后自动读取经理与产品档案。</p></div>;
  return <div className="fund-manager-list">{products.map((product) => {
    const returnClass = (product.manager?.returnPercent ?? 0) >= 0 ? "up-text" : "down-text";
    return <article key={product.code}>
      <div className="fund-research-title"><span className="asset-icon">基</span><div><strong>{product.name}</strong><span>{product.code} · {product.fundType || product.type}</span></div></div>
      {product.profileStatus === "ok" && product.manager ? <dl><div><dt>现任经理</dt><dd>{product.manager.names.join("、")}</dd></div><div><dt>本轮任职</dt><dd>{product.manager.startDate || "—"}</dd><small>{product.manager.tenure || "任职期未披露"}</small></div><div><dt>本轮回报</dt><dd className={returnClass}>{formatPercent(product.manager.returnPercent)}</dd></div></dl> : <p className="fund-research-unavailable">当前产品档案未返回可核验的现任经理。</p>}
      <footer><span title={product.sources?.join("、") || product.source}>{product.company || product.source} · {verificationLabel(product.verification, product.sourceCount)}</span><a href={product.profileUrl} target="_blank" rel="noreferrer">查看档案<Icon name="arrow" size={14} /></a></footer>
    </article>;
  })}</div>;
}

function FundOverlapResearch({ products, overlaps, disclosureCount, status }: { products: FundResearchProduct[]; overlaps: FundOverlapItem[]; disclosureCount: number; status: DataStatus }) {
  if (status === "loading") return <SourceState title="基金定期报告" description="正在读取最新披露的前十大持仓" status="pending" />;
  if (status === "error") return <SourceState title="基金定期报告" description="公开基金源暂不可用，页面稍后会重试" status="error" />;
  if (products.length < 2) return <div className="fund-research-empty"><strong>至少需要两只基金</strong><p>添加两只或更多基金后，按最新定期报告计算共同重仓。</p></div>;
  if (disclosureCount < 2) return <div className="fund-research-empty"><strong>可用定期报告不足</strong><p>目前只有 {disclosureCount} 只基金取得持仓披露，暂不能计算重叠。</p></div>;
  if (!overlaps.length) return <div className="fund-research-empty"><strong>前十大持仓没有交集</strong><p>已比较 {disclosureCount} 只基金的最新公开定期报告。</p></div>;
  return <div className="fund-overlap-list">{overlaps.map((item) => <article key={item.code}>
    <header><div><strong>{item.name}</strong><span>{item.code}</span></div><b>{item.fundCount} 只基金共同持有</b></header>
    <div className="overlap-weight"><span>披露权重合计</span><strong>{item.combinedWeightPercent.toFixed(2)}%</strong></div>
    <ul>{item.funds.map((fund) => <li key={fund.code}><span>{fund.name}</span><b>{fund.weightPercent.toFixed(2)}%</b><small>{fund.reportDate || "报告期未披露"}</small></li>)}</ul>
  </article>)}</div>;
}

function FundHistoryResearch({ fund, result, status }: { fund?: Holding; result: FundHistoryResult | null; status: DataStatus }) {
  if (!fund) return <div className="fund-research-empty"><strong>还没有基金持仓</strong><p>添加 ETF 或场外基金后自动计算历史相似走势。</p></div>;
  if (status === "loading" || status === "idle") return <SourceState title="历史净值相似度" description={`正在计算 ${fund.name} 最近 15 个开放日形态`} status="pending" />;
  if (status === "error" || !result) return <SourceState title="历史净值相似度" description="历史净值暂不可用，页面稍后会重试" status="error" />;
  const statsAvailable = result.status === "available";
  return <div className="fund-history-research">
    <div className="fund-history-summary"><div><strong>{result.name}</strong><span>{result.code} · 截止 {result.asOf || "待核验"}</span></div><span className={`source-chip ${statsAvailable ? "ready" : "pending"}`}>{statsAvailable ? `${result.sampleSize} 个有效样本` : "样本不足"}</span></div>
    <dl className="history-stats"><div><dt>有效样本</dt><dd>{result.sampleSize}</dd></div><div><dt>随后 5 日上涨比例</dt><dd>{statsAvailable && result.stats.upRatio5d !== null ? `${(result.stats.upRatio5d * 100).toFixed(1)}%` : "—"}</dd></div><div><dt>随后 20 日平均</dt><dd>{statsAvailable ? formatPercent(result.stats.averageReturn20d) : "—"}</dd></div><div><dt>样本最差回撤</dt><dd>{statsAvailable ? formatPercent(result.stats.worstDrawdown20d) : "—"}</dd></div></dl>
    {result.matches.length ? <ol className="fund-history-matches">{result.matches.slice(0, 4).map((match) => <li key={match.endDate}><time>{match.endDate}</time><span>相似度 {(match.similarity * 100).toFixed(0)}%</span><b className={(match.return20d ?? 0) >= 0 ? "up-text" : "down-text"}>后 20 日 {formatPercent(match.return20d)}</b></li>)}</ol> : null}
    <p>{result.note}</p>
    <footer><span>{result.source} · 回看 {result.observationCount} 个开放日</span><a href={result.sourceUrl} target="_blank" rel="noreferrer">查看净值原文<Icon name="arrow" size={14} /></a></footer>
  </div>;
}

function AnalysisResearch({ analysis, onCopyEvidence }: { analysis: Analysis; onCopyEvidence: () => void }) {
  const tomorrowTone = analysis.tomorrow.direction === "偏涨" ? "up" : analysis.tomorrow.direction === "偏跌" ? "down" : "flat";
  return <>
    <section className={`tomorrow-card ${tomorrowTone}`} aria-label="明天走势预测">
      <header><div><span>明天（下一交易日） · 重点看 {analysis.tomorrow.focusAsset}</span><strong>更可能{analysis.tomorrow.direction}</strong></div><b>{analysis.tomorrow.confidence === null ? "把握未知" : `把握 ${analysis.tomorrow.confidence}%`}</b></header>
      <div className="tomorrow-probabilities" aria-label="明日三种走势概率">
        <div><span>上涨</span><strong>{analysis.tomorrow.upProbability === null ? "—" : `${analysis.tomorrow.upProbability}%`}</strong></div>
        <div><span>震荡</span><strong>{analysis.tomorrow.flatProbability === null ? "—" : `${analysis.tomorrow.flatProbability}%`}</strong></div>
        <div><span>下跌</span><strong>{analysis.tomorrow.downProbability === null ? "—" : `${analysis.tomorrow.downProbability}%`}</strong></div>
      </div>
      <p>{analysis.tomorrow.reason}</p>
      <div className="tomorrow-action"><span>建议怎么做</span><strong>{analysis.tomorrow.suggestedAction}</strong><p>{analysis.tomorrow.actionCondition}</p></div>
      <small><b>开盘先看：</b>{analysis.tomorrow.openingCheck}</small>
    </section>
    {analysis.dataPoints.length ? <div className="analysis-data-grid" aria-label="组合关键数据">{analysis.dataPoints.map((item) => <article key={`${item.label}-${item.value}`}><span>{item.label}</span><strong>{item.value}</strong><p>{item.interpretation}</p><small>{item.source}</small></article>)}</div> : null}
    {analysis.expertPanel?.length ? <><div className="analysis-section-label"><strong>AI 分析小组的三句结论</strong><span>看盘面、看持仓、再把风险挑出来</span></div><ol className="queue-list expert-panel-list">{analysis.expertPanel.map((item, index) => <li key={item.role}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.role}</strong><p>{item.conclusion}</p><small>根据：{item.evidence}</small></div><span className="source-chip ready">已会诊</span></li>)}</ol></> : null}
    <div className="analysis-section-label"><strong>接下来可以怎么做</strong><span>先看条件，再决定要不要动作</span></div>
    <ol className="analysis-action-list">{analysis.actions.map((item, index) => <li key={`${item.target}-${item.action}-${index}`}><header><div className="action-heading"><span>{item.target}</span><strong>{item.action}</strong></div><span className={`action-priority priority-${item.priority}`}>{item.priority}优先</span></header><p>{item.reason}</p><small>什么时候这样做：{item.trigger}</small></li>)}</ol>
    {analysis.watchItems.length ? <><div className="analysis-section-label"><strong>为什么这么判断</strong><span>这次真正用到的数据</span></div><ol className="queue-list">{analysis.watchItems.map((item, index) => <li key={`${item.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.reason}</p><small>{item.evidence}</small></div><span className="source-chip ready">有数据</span></li>)}</ol></> : null}
    <div className="analysis-footnotes">
      <div className="forecast-block"><strong>接下来可能怎么走 · {analysis.forecast.horizon}</strong><p className="forecast-lead">更可能：{analysis.forecast.direction} · 把握 {analysis.forecast.confidence === null ? "—" : `${analysis.forecast.confidence}%`}</p><dl className="forecast-scenarios"><div><dt>最可能</dt><dd>{analysis.forecast.baseCase}</dd></div><div><dt>如果走强</dt><dd>{analysis.forecast.bullCase}</dd></div><div><dt>如果走弱</dt><dd>{analysis.forecast.bearCase}</dd></div></dl><p><b>什么情况说明刚才看错了：</b>{analysis.forecast.invalidation}</p></div>
      <div><strong>风险提示</strong>{analysis.risks.length ? <ul>{analysis.risks.map((risk, index) => <li key={`${risk}-${index}`}>{risk}</li>)}</ul> : <p>模型未补充额外风险，仍需核对公告原文。</p>}</div>
      <div><strong>以前有没有类似情况</strong><p>{analysis.similarPattern.note}</p></div>
      {analysis.evidence ? <div><strong>这次完整用了哪些数据</strong><p>{analysis.evidence.coverage?.length ? analysis.evidence.coverage.map((item) => `${item.label} ${item.available}${item.expected === null ? "" : `/${item.expected}`}`).join(" · ") : `${analysis.evidence.quoteCount} 项行情 · ${analysis.evidence.noticeCount} 条公告 · 历史样本 ${analysis.evidence.similarHistorySampleSize ?? "—"}`}</p>{analysis.evidence.missingCategories?.length ? <p><b>本轮缺失：</b>{analysis.evidence.missingCategories.join("；")}。模型已被要求降低判断把握。</p> : <p>本轮主要证据类别均已取得可用数据。</p>}<button className="plain-link" type="button" onClick={onCopyEvidence}>复制数据明细 JSON（完整）<Icon name="arrow" size={15} /></button></div> : null}
      <small>{analysis.disclaimer}</small>
    </div>
  </>;
}

function HomeDashboard({ holdings, quotes, query, onAdd, onOpenNews, onRemove, holdingStatus, marketStatus, marketSourceStatus, healthChecks, newsStatus, notices, marketNews, analysis, analysisStatus, analysisError, onAnalyze, onCopyEvidence }: { holdings: Holding[]; quotes: Quote[]; query: string; onAdd: () => void; onOpenNews: () => void; onRemove: (holding: Holding) => void; holdingStatus: "loading" | "ready" | "error"; marketStatus: DataStatus; marketSourceStatus: MarketSourceStatus[]; healthChecks: HealthCheck[]; newsStatus: DataStatus; notices: NoticeItem[]; marketNews: MarketNewsItem[]; analysis: Analysis | null; analysisStatus: DataStatus; analysisError: string; onAnalyze: () => void; onCopyEvidence: () => void }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const canAnalyze = holdings.some((holding) => quoteFor(quotes, holding)?.status === "ok");

  return (
    <div className="page-stack home-dashboard">
      <section className="workspace-hero">
        <div className="hero-copy">
          <div className="context-line"><span>组合工作台</span><span>{marketStatus === "ready" ? "真实行情 · 带时间戳" : "正在等待真实行情"}</span></div>
          <div className="hero-heading-row">
            <div>
              <span className="hero-heading-label">AI 组合摘要</span>
              <h2>{analysis ? "今日组合观察" : "先核对持仓与行情"}</h2>
            </div>
            {analysis ? <span className={`hero-risk-chip risk-${analysis.riskLevel}`}>风险 {analysis.riskLevel}</span> : null}
          </div>
          {analysis ? <div className="hero-summary-card"><span>明天更可能{analysis.tomorrow.direction} · 上涨 {formatProbability(analysis.tomorrow.upProbability)} / 震荡 {formatProbability(analysis.tomorrow.flatProbability)} / 下跌 {formatProbability(analysis.tomorrow.downProbability)}</span><p>{analysis.summary}</p><small>建议：{analysis.tomorrow.suggestedAction}</small></div> : <p className="hero-summary-empty">让 AI 用简单的话告诉你：明天更可能怎么走，以及可以怎么做。</p>}
          <p className="hero-meta">{analysis ? `我的看法：${plainStance(analysis.stance)} · 明天判断把握 ${analysis.tomorrow.confidence === null ? "—" : `${analysis.tomorrow.confidence}%`} · 数据时间 ${new Date(analysis.evidenceAsOf).toLocaleString("zh-CN")}` : "所有数值来自已标注来源；数据不够时会直接说看不清。"}</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onAdd}><Icon name="plus" size={16} />添加持仓</button>
            <button className="secondary-button" type="button" onClick={onAnalyze} disabled={!canAnalyze || analysisStatus === "loading"} title={!canAnalyze && holdings.length ? "当前持仓未获取到行情，请检查代码或类型" : undefined}><Icon name="check" size={16} />{analysisStatus === "loading" ? "分析中…" : analysis ? "重新分析" : "AI 分析"}</button>
            <button className="secondary-button" type="button" onClick={() => setAnalysisOpen((value) => !value)} aria-expanded={analysisOpen} aria-controls="analysis-basis">
              {analysisOpen ? "收起分析依据" : "查看分析依据"}<Icon name="arrow" size={16} />
            </button>
          </div>
          {analysisOpen ? (
            <div className="analysis-basis" id="analysis-basis">
              <ol><li>先核对每只持仓的最新行情、估值/基金档案和历史风险。</li><li>再看大盘指数、市场涨跌家数、行业强弱与最新公开资讯。</li><li>把持仓自身证据和整个市场放在一起比较。</li><li>最后用白话预测明天，并说明每只什么时候可以动作。</li></ol>
            </div>
          ) : null}
        </div>
        <PortfolioCompass analysis={analysis} />
      </section>

      <AssetOverview scope="全部持仓" holdings={holdings} quotes={quotes} />

      {analysisError ? <div className="inline-alert" role="alert"><Icon name="info" size={17} /><span>{analysisError}</span></div> : null}

      <section className="two-column-grid home-primary-grid">
        <div className="panel analysis-queue">
          <SectionHeading title={analysis ? "AI 研判与动作" : "AI 分析队列"} note={analysis ? `生成于 ${new Date(analysis.generatedAt).toLocaleString("zh-CN")}` : "行情、公告和历史统计准备完成后即可运行。"} />
          {analysis ? <AnalysisResearch analysis={analysis} onCopyEvidence={onCopyEvidence} /> : <ol className="queue-list"><li><span>01</span><div><strong>逐只持仓</strong><p>行情、估值/基金档案、公告、历史和风险。</p></div><span className={`source-chip ${marketStatus === "ready" ? "ready" : "pending"}`}>{marketStatus === "ready" ? "就绪" : "等待"}</span></li><li><span>02</span><div><strong>整个市场</strong><p>主要指数、市场宽度、行业强弱与多源资讯。</p></div><span className={`source-chip ${newsStatus === "ready" ? "ready" : "pending"}`}>{newsStatus === "ready" ? "就绪" : "等待"}</span></li><li><span>03</span><div><strong>综合预测</strong><p>证据缺失会降低把握度，不用假数据补齐。</p></div><Pending compact /></li></ol>}
        </div>
        <div className="panel news-entry">
          <SectionHeading title="实时资讯" note={`${marketNews.length} 条市场快讯 · ${notices.length} 条持仓公告`} />
          <SourceState title="全市场快讯" description={newsStatus === "ready" ? "公开市场消息已同步；无需先添加持仓" : newsStatus === "error" ? "快讯源暂不可用" : "正在同步市场快讯"} status={newsStatus === "ready" ? "ready" : newsStatus === "error" ? "error" : "pending"} />
          {marketNews.length ? <ol className="news-preview-list">{marketNews.slice(0, 3).map((item) => <li key={item.id}><button type="button" onClick={onOpenNews}><span>{item.title}</span><time>{formatNewsTime(item.publishedAt, true)}</time></button></li>)}</ol> : null}
          <button className="plain-link" type="button" onClick={onOpenNews}>查看资讯模块<Icon name="arrow" size={16} /></button>
        </div>
      </section>

      <section className="panel holdings-panel">
        <SectionHeading
          title="我的持仓"
          note="价格与收益来自行情源；评分只在完成 AI 分析后显示。"
          action={<div className="section-button-group"><button className="primary-button" type="button" onClick={onAnalyze} disabled={!canAnalyze || analysisStatus === "loading"}><Icon name="check" size={16} />{analysisStatus === "loading" ? "分析中…" : analysis ? "重新分析" : "开始 AI 分析"}</button><button className="secondary-button" type="button" onClick={onAdd}><Icon name="plus" size={16} />添加持仓</button></div>}
        />
        <HoldingTable holdings={holdings} quotes={quotes} query={query} onRemove={onRemove} />
        {holdings.length > 0 && !canAnalyze ? <div className="holding-guidance"><Icon name="info" size={17} /><div><strong>AI 分析尚未开启</strong><p>当前持仓没有取得真实行情，请删除后重新搜索并选择正确的代码与类型。</p></div></div> : null}
      </section>

      <TransactionLedger holdings={holdings} />

      <div className="home-system-stack">
        <section className="status-grid" aria-label="数据接入状态">
          <SourceState title="A 股行情" description={marketStatus === "ready" ? "真实行情已同步；交易时段每 30 秒更新" : marketStatus === "error" ? "行情源暂不可用" : "正在同步真实行情"} status={marketStatus === "ready" ? "ready" : marketStatus === "error" ? "error" : "pending"} />
          <SourceState title="持仓数据" description={holdingStatus === "ready" ? "已按账号隔离并保存到数据库" : holdingStatus === "error" ? "数据库暂不可用，请稍后重试" : "正在连接账号持仓库"} status={holdingStatus === "ready" ? "ready" : holdingStatus === "error" ? "error" : "pending"} />
          <SourceState title="AI 联合研判" description={analysis ? "AI 分析小组已完成本轮匿名研判" : "每次开始前都会单独确认匿名发送范围"} status={analysis ? "ready" : analysisError ? "error" : "pending"} />
        </section>

        <section className="panel source-health-panel" aria-label="数据源健康状态">
          <SectionHeading title="数据源健康" note="统一适配层只报告最近一次真实请求状态，不把未请求误报为正常。" />
          <div className="source-health-grid">
            {marketSourceStatus.length ? marketSourceStatus.map((source) => <div className="source-health-item" key={source.source}><div><strong>{source.source}</strong><span>{source.coverage}</span></div><span className={`source-chip ${source.status === "unavailable" ? "error" : verificationClass(source.verification)}`}>{source.status === "unavailable" ? "不可用" : source.status === "stale" ? `陈旧 · ${verificationLabel(source.verification, source.sourceCount)}` : verificationLabel(source.verification, source.sourceCount)}</span><small>{source.error || (source.retrievedAt ? `最近请求 ${formatQuoteTime(source.retrievedAt)}` : "尚未请求")}</small></div>) : <SourceState title="行情适配层" description="首次行情请求完成后显示来源、验证状态和覆盖范围。" status="pending" pendingLabel="待请求" />}
            {healthChecks.map((check) => <div className="source-health-item" key={check.key}><div><strong>{check.label}</strong><span>配置与服务能力</span></div><span className={`source-chip ${check.state === "ready" ? "ready" : check.state === "not_configured" ? "error" : "pending"}`}>{check.state === "ready" ? "已配置" : check.state === "not_configured" ? "未配置" : "待请求"}</span><small>{check.detail}</small></div>)}
            <div className="source-health-item"><div><strong>资讯聚合</strong><span>快讯与政策</span></div><span className={`source-chip ${newsStatus === "ready" ? "ready" : newsStatus === "error" ? "error" : "pending"}`}>{newsStatus === "ready" ? "正常" : newsStatus === "error" ? "不可用" : "同步中"}</span><small>{newsStatus === "ready" ? `${marketNews.length} 条市场资讯；来源链接可追溯` : "不影响持仓录入"}</small></div>
            <div className="source-health-item"><div><strong>账号同步</strong><span>持仓、流水、自选</span></div><span className={`source-chip ${holdingStatus === "ready" ? "ready" : holdingStatus === "error" ? "error" : "pending"}`}>{holdingStatus === "ready" ? "已隔离" : holdingStatus === "error" ? "异常" : "同步中"}</span><small>当前账号私有空间；跨设备需登录同一账号</small></div>
          </div>
        </section>
      </div>

      <div className="safety-line"><Icon name="info" size={17} /><p>分析仅供个人研究参考，不构成投资建议或交易指令；关键信息应回到公告原文核验。</p></div>
    </div>
  );
}

function AIndexCard({ name, code, quote }: { name: string; code: string; quote?: Quote }) {
  const price = quote?.price ?? null;
  const previousClose = quote?.previousClose ?? null;
  const high = quote?.high ?? null;
  const low = quote?.low ?? null;
  const changeAmount = price !== null && previousClose !== null ? price - previousClose : null;
  const rangePosition = price !== null && high !== null && low !== null && high > low
    ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100))
    : 50;
  const changeClass = (quote?.changePercent ?? 0) >= 0 ? "up-text" : "down-text";

  return (
    <article className="market-index-card">
      <header><div><strong>{name}</strong><span>{code}</span></div><span className={`market-index-change ${changeClass}`}>{formatPercent(quote?.changePercent ?? null)}</span></header>
      <div className="market-index-price"><strong>{formatNumber(price)}</strong><span className={changeClass}>{changeAmount === null ? "—" : `${changeAmount >= 0 ? "+" : ""}${changeAmount.toFixed(2)}`}</span></div>
      <div className="market-index-range" role="img" aria-label={`${name}日内最低 ${formatNumber(low)}，最高 ${formatNumber(high)}，当前 ${formatNumber(price)}`}>
        <span className="market-index-range-fill" style={{ width: `${rangePosition}%` }} />
        <i style={{ left: `${rangePosition}%` }} />
      </div>
      <footer><span>低 {formatNumber(low)}</span><span>高 {formatNumber(high)}</span></footer>
    </article>
  );
}

function AStockMarketTable({ items, status, coverage, onSelect }: { items: AStockRankItem[]; status: DataStatus; coverage: AMarketOverview["coverage"] | undefined; onSelect: (item: AStockRankItem) => void }) {
  if (!items.length) return <div className="empty-state market-table-empty">{status === "loading" ? "正在同步 A 股排行…" : "当前排行暂不可用，页面会自动重试。"}</div>;
  const topTwenty = items.slice(0, 20);
  return (
    <div className="table-scroll market-table-scroll" role="region" aria-label="A 股行情排行，可横向滚动">
      <table className="market-data-table">
        <thead><tr><th>排名</th><th>名称/代码</th><th>最新价</th><th>涨跌额</th><th>涨跌幅</th><th>成交量</th><th>成交额</th><th>范围</th></tr></thead>
        <tbody>{topTwenty.map((item, index) => {
          const changeClass = item.changePercent >= 0 ? "up-text" : "down-text";
          return <tr key={item.code}><td className="market-rank-number">{String(index + 1).padStart(2, "0")}</td><td><button className="market-symbol-button" type="button" onClick={() => onSelect(item)}><strong>{item.name}</strong><span>{item.code}</span></button></td><td className="data-value">¥{formatNumber(item.price)}</td><td className={changeClass}>{formatChangeAmount(item.price, item.previousClose)}</td><td className={changeClass}>{formatPercent(item.changePercent)}</td><td className="data-value">{formatCompactMarketValue(item.volume)}</td><td className="data-value">{formatCompactMarketValue(item.amount)}</td><td><span className="market-coverage-cell">{coverage === "不可用" || !coverage ? "待同步" : "实时前 20"}</span></td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

type SectorHeatNode = {
  item: ASectorItem;
  rank: number;
  weight: number;
};

type SectorHeatRect = SectorHeatNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

function layoutSectorTreemap(nodes: SectorHeatNode[], aspectRatio: number) {
  const sortedNodes = [...nodes].sort((a, b) => b.weight - a.weight || a.rank - b.rank);
  const rectangles: SectorHeatRect[] = [];
  const canvasWidth = Math.min(240, Math.max(48, aspectRatio * 100));
  const canvasHeight = 100;

  function layout(branch: SectorHeatNode[], x: number, y: number, width: number, height: number) {
    if (!branch.length) return;
    if (branch.length === 1) {
      rectangles.push({ ...branch[0], x, y, width, height });
      return;
    }

    const totalWeight = branch.reduce((sum, node) => sum + node.weight, 0);
    const targetWeight = totalWeight / 2;
    let firstWeight = 0;
    let splitIndex = 1;
    let smallestDifference = Number.POSITIVE_INFINITY;

    for (let index = 1; index < branch.length; index += 1) {
      firstWeight += branch[index - 1].weight;
      const difference = Math.abs(targetWeight - firstWeight);
      if (difference < smallestDifference) {
        smallestDifference = difference;
        splitIndex = index;
      }
    }

    const firstBranch = branch.slice(0, splitIndex);
    const secondBranch = branch.slice(splitIndex);
    const firstBranchWeight = firstBranch.reduce((sum, node) => sum + node.weight, 0);
    const firstRatio = firstBranchWeight / totalWeight;

    if (width >= height) {
      const firstWidth = width * firstRatio;
      layout(firstBranch, x, y, firstWidth, height);
      layout(secondBranch, x + firstWidth, y, width - firstWidth, height);
    } else {
      const firstHeight = height * firstRatio;
      layout(firstBranch, x, y, width, firstHeight);
      layout(secondBranch, x, y + firstHeight, width, height - firstHeight);
    }
  }

  layout(sortedNodes, 0, 0, canvasWidth, canvasHeight);
  return rectangles.map((rectangle) => ({
    ...rectangle,
    x: (rectangle.x / canvasWidth) * 100,
    y: (rectangle.y / canvasHeight) * 100,
    width: (rectangle.width / canvasWidth) * 100,
    height: (rectangle.height / canvasHeight) * 100,
  }));
}

function buildSectorTreemap(items: ASectorItem[], aspectRatio: number) {
  const positiveAmounts = items
    .map((item) => item.amount)
    .filter((amount): amount is number => amount !== null && amount > 0)
    .sort((a, b) => a - b);
  const medianAmount = positiveAmounts.length ? positiveAmounts[Math.floor(positiveAmounts.length / 2)] : 1;
  const minimumAmount = Math.max(medianAmount * 0.08, 1);
  return layoutSectorTreemap(items.map((item, rank): SectorHeatNode => ({
    item,
    rank,
    weight: Math.sqrt(Math.max(item.amount ?? minimumAmount, minimumAmount)),
  })), aspectRatio);
}

function ASectorHeatmap({ items, status }: { items: ASectorItem[]; status: DataStatus }) {
  const heatmapRef = useRef<HTMLDivElement>(null);
  const [heatmapRatio, setHeatmapRatio] = useState(16 / 9);

  useEffect(() => {
    const heatmap = heatmapRef.current;
    if (!heatmap) return;
    const updateRatio = () => {
      const bounds = heatmap.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const nextRatio = bounds.width / bounds.height;
      setHeatmapRatio((currentRatio) => Math.abs(currentRatio - nextRatio) < 0.03 ? currentRatio : nextRatio);
    };
    updateRatio();
    const observer = new ResizeObserver(updateRatio);
    observer.observe(heatmap);
    return () => observer.disconnect();
  }, [items.length]);

  if (!items.length) return <div className="empty-state market-table-empty">{status === "loading" ? "正在同步行业板块…" : "行业数据源本轮未响应，网站会自动重试。"}</div>;
  const heatItems = buildSectorTreemap(items, heatmapRatio);
  return (
    <>
      <div className="sector-heatmap" ref={heatmapRef} role="list" aria-label={`A 股行业强弱热力图，共 ${items.length} 个实时行业板块；面积参考成交额，红色上涨、绿色下跌，颜色越深代表涨跌幅越大`}>
      {heatItems.map(({ item, rank, x, y, width, height }) => {
        const area = width * height;
        const shortestSide = Math.min(width, height);
        const size = area >= 520 && shortestSide >= 10 ? "hero" : area >= 240 && shortestSide >= 6 ? "wide" : area < 105 || shortestSide < 4.5 ? "compact" : "standard";
        const direction = item.changePercent > 0.005 ? "up" : item.changePercent < -0.005 ? "down" : "flat";
        const absoluteChange = Math.abs(item.changePercent);
        const intensity = absoluteChange >= 5 ? "strong" : absoluteChange >= 2 ? "medium" : "soft";
        return (
          <article
            className={`sector-heat-tile ${direction} ${intensity} size-${size}`}
            key={item.code}
            role="listitem"
            aria-label={`${item.name}，涨跌幅 ${formatPercent(item.changePercent)}，成交额 ${formatCompactMarketValue(item.amount)}`}
            style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}
          >
            <span className="sector-heat-rank">{String(rank + 1).padStart(2, "0")}</span>
            <div className="sector-heat-name"><strong>{item.name}</strong><small>{item.code}</small></div>
            <b>{formatPercent(item.changePercent)}</b>
            <span className="sector-heat-amount">成交额 {formatCompactMarketValue(item.amount)}</span>
          </article>
        );
      })}
      </div>
      <div className="sector-heat-scale" role="img" aria-label="涨跌幅色阶：红色代表上涨，绿色代表下跌，颜色越深幅度越大">
        <span className="up strong"><b>5%+</b><small>强涨</small></span>
        <span className="up medium"><b>2–5%</b><small>上涨</small></span>
        <span className="up soft"><b>0–2%</b><small>微涨</small></span>
        <span className="flat"><b>0%</b><small>平盘</small></span>
        <span className="down soft"><b>0–2%</b><small>微跌</small></span>
        <span className="down medium"><b>2–5%</b><small>下跌</small></span>
        <span className="down strong"><b>5%+</b><small>强跌</small></span>
      </div>
    </>
  );
}

function MarketSourceSummary({ sources }: { sources: MarketSourceStatus[] }) {
  if (!sources.length) return null;
  return <section className="status-grid market-source-grid" aria-label="行情来源状态">{sources.map((source) => {
    const state = source.status === "unavailable" || source.verification === "conflict" ? "error" : source.status === "ok" && source.verification === "verified" ? "ready" : "pending";
    const label = source.status === "ok" ? "已同步" : source.status === "stale" ? "沿用最近快照" : "暂不可用";
    return <SourceState key={source.source} title={source.source} description={`${source.coverage} · ${label} · ${verificationLabel(source.verification, source.sourceCount)}${source.error ? ` · ${source.error}` : ""}`} status={state} pendingLabel={source.status === "stale" ? "快照" : verificationLabel(source.verification, source.sourceCount)} />;
  })}</section>;
}

function MarketPage({ quotes, status, overview, sourceStatus }: { quotes: Quote[]; status: DataStatus; overview: AMarketOverview | null; sourceStatus: MarketSourceStatus[] }) {
  const [stockSearch, setStockSearch] = useState("");
  const [stockResults, setStockResults] = useState<SecuritySearchResult[]>([]);
  const [stockSearchStatus, setStockSearchStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [selectedStock, setSelectedStock] = useState<SecuritySearchResult | null>(null);
  const [lookupQuote, setLookupQuote] = useState<Quote | null>(null);
  const [lookupStatus, setLookupStatus] = useState<DataStatus>("idle");
  const [marketView, setMarketView] = useState<"stocks" | "sectors" | "breadth">("stocks");
  const [rankView, setRankView] = useState<"gainers" | "losers" | "active">("gainers");
  const [rankDirection, setRankDirection] = useState<"desc" | "asc">("desc");
  const indices = [
    ["上证指数", "000001"], ["深证成指", "399001"], ["创业板指", "399006"], ["科创 50", "000688"],
  ];
  const breadthItems = [...new Map([...(overview?.gainers ?? []), ...(overview?.losers ?? []), ...(overview?.active ?? [])].map((item) => [item.code, item])).values()];
  const sampleUpCount = breadthItems.filter((item) => item.changePercent > 0.005).length;
  const sampleFlatCount = breadthItems.filter((item) => Math.abs(item.changePercent) <= 0.005).length;
  const sampleDownCount = breadthItems.filter((item) => item.changePercent < -0.005).length;
  const breadthUpCount = overview?.breadthAvailable ? overview.upCount : sampleUpCount;
  const breadthFlatCount = overview?.breadthAvailable ? overview.flatCount : sampleFlatCount;
  const breadthDownCount = overview?.breadthAvailable ? overview.downCount : sampleDownCount;
  const breadthSampleSize = overview?.breadthAvailable ? overview.breadthSampleSize : breadthItems.length;
  const breadthAmount = overview?.breadthAvailable ? overview.totalAmount : breadthItems.reduce((sum, item) => sum + (item.amount ?? 0), 0) || null;
  const breadthLimitUpCount = overview?.breadthAvailable ? overview.limitUpCount : breadthItems.filter((item) => item.changePercent >= 9.8).length;
  const breadthLimitDownCount = overview?.breadthAvailable ? overview.limitDownCount : breadthItems.filter((item) => item.changePercent <= -9.8).length;
  const breadthSampleLabel = overview?.breadthAvailable ? "成交活跃宽度样本" : "三榜去重样本";
  const totalCount = breadthUpCount + breadthFlatCount + breadthDownCount;
  const upWidth = totalCount ? (breadthUpCount / totalCount) * 100 : 0;
  const flatWidth = totalCount ? (breadthFlatCount / totalCount) * 100 : 0;
  const downWidth = totalCount ? (breadthDownCount / totalCount) * 100 : 0;
  const breadthSummary = !totalCount ? "市场宽度暂不可用" : breadthUpCount > breadthDownCount ? "样本上涨占优" : breadthDownCount > breadthUpCount ? "样本下跌占优" : "样本涨跌接近";
  const sectorCount = overview?.sectors.length ?? 0;
  const sectorTotal = overview?.sectorTotal ?? sectorCount;
  const sectorCoverage = sectorCount ? `行业热力图 ${sectorCount}${sectorTotal > sectorCount ? `/${sectorTotal}` : ""}` : "行业热力图待同步";
  const sectorSyncNote = sectorCount ? sectorTotal > sectorCount ? `目标 48 个行业样本，本轮成功同步 ${sectorCount} 个` : "涨幅前 24 + 跌幅前 24，共 48 个行业样本" : "正在同步 48 个行业强弱样本";
  const coverageNote = overview?.coverage === "全市场" ? `沪深京 A 股宽度样本 ${overview.breadthSampleSize} 只 · 股票榜前 20 / ${sectorCoverage}` : overview?.coverage === "实时排行" ? `沪深京实时排行 · 股票榜前 20 / 宽度样本 ${breadthSampleSize || "待同步"} / ${sectorCoverage}` : "实时排行暂不可用";
  const rankItems = useMemo(() => rankView === "gainers" ? overview?.gainers ?? [] : rankView === "losers" ? overview?.losers ?? [] : overview?.active ?? [], [overview, rankView]);
  const sortedRankItems = useMemo(() => {
    const value = (item: AStockRankItem) => rankView === "active" ? item.amount ?? Number.NEGATIVE_INFINITY : item.changePercent;
    return [...rankItems].sort((left, right) => {
      const difference = value(right) - value(left);
      return rankDirection === "desc" ? difference : -difference;
    });
  }, [rankDirection, rankItems, rankView]);
  const rankLabel = rankView === "gainers" ? "涨幅榜" : rankView === "losers" ? "跌幅榜" : "成交额榜";
  const rankNote = rankView === "gainers" ? "按当日涨跌幅排序" : rankView === "losers" ? "按当日跌幅排序" : "按当日成交额排序";

  useEffect(() => {
    const query = stockSearch.trim();
    if (!query || selectedStock) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStockSearchStatus("loading");
      try {
        const params = new URLSearchParams({ q: query, kind: "股票" });
        const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: SecuritySearchResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "股票搜索失败。");
        const items = payload.items ?? [];
        setStockResults(items);
        setStockSearchStatus(items.length ? "ready" : "empty");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setStockResults([]);
        setStockSearchStatus("error");
      }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectedStock, stockSearch]);

  function updateMarketSearch(value: string) {
    setStockSearch(value);
    setSelectedStock(null);
    setLookupQuote(null);
    setLookupStatus("idle");
    setStockResults([]);
    setStockSearchStatus(value.trim() ? "loading" : "idle");
  }

  async function chooseMarketStock(item: SecuritySearchResult) {
    setSelectedStock(item);
    setStockSearch(`${item.code} ${item.name}`);
    setStockResults([]);
    setStockSearchStatus("ready");
    setLookupStatus("loading");
    try {
      const response = await fetch("/api/market", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings: [{ code: item.code, type: "股票" }] }) });
      const payload = await response.json() as { quotes?: Quote[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "个股行情请求失败。");
      const quote = payload.quotes?.find((value) => value.type === "股票" && value.code === item.code) ?? null;
      setLookupQuote(quote);
      setLookupStatus(quote?.status === "ok" ? "ready" : "error");
    } catch {
      setLookupQuote(null);
      setLookupStatus("error");
    }
  }

  function chooseRankStock(item: AStockRankItem) {
    void chooseMarketStock({ code: item.code, name: item.name, type: "股票", source: item.source });
  }

  return (
    <div className="page-stack">
      <section className="page-intro market-page-intro">
        <div><span>A 股行情</span><h2>沪深京市场</h2><p>指数定方向，排行找线索，搜索直接看个股。所有数字标明真实数据范围。</p></div>
        <span className={`source-chip ${status === "ready" ? "ready" : status === "error" ? "error" : "pending"}`}>{status === "ready" ? overview?.coverage ?? "已同步" : status === "error" ? "行情异常" : "同步中"}</span>
      </section>
      <section className="market-index-grid" aria-label="A 股主要指数">
        {indices.map(([name, code]) => {
          const quote = quotes.find((item) => item.type === "指数" && item.code === code);
          return <AIndexCard key={code} name={name} code={code} quote={quote} />;
        })}
      </section>
      <MarketSourceSummary sources={sourceStatus} />
      <section className="panel market-terminal">
        <div className="market-terminal-head">
          <div className="market-terminal-title"><span>市场中心</span><h2>A 股行情</h2><p>{coverageNote} · 交易时段每 30 秒，其他时段每 5 分钟</p></div>
          <div className="market-terminal-tools">
            <div className="security-search-block market-terminal-search">
              <label className="sr-only" htmlFor="market-stock-search">股票代码或名称</label>
              <div className="security-search-input"><Icon name="search" size={17} /><input id="market-stock-search" value={stockSearch} onChange={(event) => updateMarketSearch(event.target.value)} placeholder="搜索股票代码或名称" role="combobox" aria-autocomplete="list" aria-expanded={stockResults.length > 0} aria-controls="market-search-results" autoComplete="off" />{stockSearchStatus === "loading" ? <span>搜索中</span> : null}</div>
              {stockResults.length ? <div className="security-search-results market-terminal-results" id="market-search-results" role="listbox">{stockResults.map((item) => <button type="button" role="option" aria-selected="false" key={item.code} onClick={() => void chooseMarketStock(item)}><span><strong>{item.name}</strong><small>A 股 · {verificationLabel(item.verification, item.sourceCount)} · 点击查看行情</small></span><b>{item.code}</b></button>)}</div> : null}
              {stockSearchStatus === "empty" ? <p className="search-feedback">没有找到匹配股票，请检查代码或名称。</p> : null}
              {stockSearchStatus === "error" ? <p className="search-feedback error">搜索暂不可用，请稍后再试。</p> : null}
            </div>
            <span className={`source-chip ${status === "ready" ? "ready" : status === "error" ? "error" : "pending"}`}>{overview?.coverage === "全市场" || overview?.coverage === "实时排行" ? "实时排行" : overview?.coverage ?? "同步中"}</span>
          </div>
        </div>

        {selectedStock ? <article className="market-lookup-strip"><div className="market-lookup-summary"><div><span>{selectedStock.code}</span><h3>{selectedStock.name}</h3></div><div><strong>{lookupStatus === "loading" ? "同步中" : lookupQuote?.price === null || lookupQuote?.price === undefined ? "—" : `¥${formatNumber(lookupQuote.price)}`}</strong><em className={(lookupQuote?.changePercent ?? 0) >= 0 ? "up-text" : "down-text"}>{formatPercent(lookupQuote?.changePercent ?? null)}</em></div><button className="icon-button" type="button" aria-label="关闭个股行情" onClick={() => updateMarketSearch("")}><Icon name="close" size={17} /></button></div><dl><div><dt>今开</dt><dd>{formatNumber(lookupQuote?.open ?? null)}</dd></div><div><dt>昨收</dt><dd>{formatNumber(lookupQuote?.previousClose ?? null)}</dd></div><div><dt>最高</dt><dd>{formatNumber(lookupQuote?.high ?? null)}</dd></div><div><dt>最低</dt><dd>{formatNumber(lookupQuote?.low ?? null)}</dd></div><div><dt>成交量</dt><dd>{formatCompactMarketValue(lookupQuote?.volume ?? null)}</dd></div><div><dt>成交额</dt><dd>{formatCompactMarketValue(lookupQuote?.amount ?? null)}</dd></div></dl><p>{lookupStatus === "error" ? "当前代码未取得行情，请稍后重试。" : `${lookupQuote?.source ?? "正在同步公开行情"} · ${formatQuoteTime(lookupQuote?.asOf ?? null)} · 仅查看行情，不加入持仓、不调用 AI`}</p></article> : null}

        <div className="market-primary-tabs" role="tablist" aria-label="A 股市场分类">
          {([{ key: "stocks", label: "全部股票" }, { key: "sectors", label: "行业板块" }, { key: "breadth", label: "市场宽度" }] as const).map((item) => <button type="button" role="tab" aria-selected={marketView === item.key} className={marketView === item.key ? "active" : ""} key={item.key} onClick={() => setMarketView(item.key)}>{item.label}</button>)}
        </div>

        {marketView === "stocks" ? <div className="market-rank-tabs"><div className="market-sort-controls"><label className="market-sort-field"><span>排序</span><select aria-label="股票排行方式" value={rankView} onChange={(event) => { const next = event.target.value as typeof rankView; setRankView(next); setRankDirection(next === "losers" ? "asc" : "desc"); }}><option value="gainers">涨幅榜</option><option value="losers">跌幅榜</option><option value="active">成交额榜</option></select></label><button className="market-sort-direction" type="button" onClick={() => setRankDirection((current) => current === "desc" ? "asc" : "desc")} aria-label={`切换${rankLabel}为${rankDirection === "desc" ? "升序" : "降序"}`}>{rankDirection === "desc" ? "降序 ↓" : "升序 ↑"}</button></div><p>{rankNote} · 当前{rankDirection === "desc" ? "降序" : "升序"} · 沪深京实时前 20 · 点击股票名称可展开详情</p></div> : null}

        <div className="market-terminal-body" role="tabpanel">
          {marketView === "stocks" ? <AStockMarketTable items={sortedRankItems} status={status} coverage={overview?.coverage} onSelect={chooseRankStock} /> : null}
          {marketView === "sectors" ? <><div className="market-view-note sector-heatmap-note"><div><strong>行业热力图</strong><p>{sectorSyncNote}</p></div><div className="sector-heat-legend" aria-label="热力图编码说明"><span className="size">面积：成交额</span><span className="color">颜色：涨跌幅</span></div></div><ASectorHeatmap items={overview?.sectors ?? []} status={status} /></> : null}
          {marketView === "breadth" ? <div className="market-breadth-view"><div className="market-breadth-lead"><span>盘面状态</span><strong>{breadthSummary}</strong><p>{totalCount ? `沪深京${breadthSampleLabel} ${breadthSampleSize} 只，只描述当前样本，不外推为全市场家数或仓位建议。` : "市场宽度样本暂时未返回；股票三榜与行业热力图仍会独立更新，页面不会用固定股票补位。"}</p></div><div className="breadth-meter" role="img" aria-label={`上涨 ${breadthUpCount}，平盘 ${breadthFlatCount}，下跌 ${breadthDownCount}`}><span className="up" style={{ width: `${upWidth}%` }} /><span className="flat" style={{ width: `${flatWidth}%` }} /><span className="down" style={{ width: `${downWidth}%` }} /></div><dl className="market-breadth-facts"><div><dt>样本上涨</dt><dd className="up-text">{totalCount ? breadthUpCount : "—"}</dd></div><div><dt>样本平盘</dt><dd>{totalCount ? breadthFlatCount : "—"}</dd></div><div><dt>样本下跌</dt><dd className="down-text">{totalCount ? breadthDownCount : "—"}</dd></div><div><dt>样本成交额</dt><dd>{totalCount ? formatCompactMarketValue(breadthAmount) : "—"}</dd></div><div><dt>样本涨停约</dt><dd>{totalCount ? breadthLimitUpCount : "—"}</dd></div><div><dt>样本跌停约</dt><dd>{totalCount ? breadthLimitDownCount : "—"}</dd></div></dl></div> : null}
        </div>

        <div className="market-terminal-foot"><Icon name="info" size={16} /><p>{overview ? `${overview.source} · ${coverageNote}` : "正在同步 A 股实时排行"}。股票三榜各显示实时前 20；市场宽度优先取 500 只成交活跃股票，失败时退回三榜去重样本；行业热力图取涨幅前 24 与跌幅前 24；宽度与行业每分钟最多更新一次，短时异常保留最近成功快照，不使用固定股票或行业补位。</p></div>
      </section>
    </div>
  );
}

function StocksPage({ holdings, quotes, onAdd, refreshVersion }: { holdings: Holding[]; quotes: Quote[]; onAdd: () => void; refreshVersion: number }) {
  const [range, setRange] = useState("日线");
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [historyStatus, setHistoryStatus] = useState<DataStatus>("idle");
  const [fundamentals, setFundamentals] = useState<FundamentalSnapshot | null>(null);
  const [fundamentalsStatus, setFundamentalsStatus] = useState<DataStatus>("idle");
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [riskStatus, setRiskStatus] = useState<DataStatus>("idle");
  const stocks = holdings.filter((item) => item.type === "股票");
  const selected = stocks[0];
  const selectedQuote = selected ? quoteFor(quotes, selected) : undefined;
  const [watchlist, setWatchlist] = useState<StockWatchlistItem[]>([]);
  const [watchlistStatus, setWatchlistStatus] = useState<DataStatus>("loading");
  const [watchlistQuotes, setWatchlistQuotes] = useState<Quote[]>([]);
  const [watchlistQuoteStatus, setWatchlistQuoteStatus] = useState<DataStatus>("idle");
  const [watchSearch, setWatchSearch] = useState("");
  const [watchResults, setWatchResults] = useState<SecuritySearchResult[]>([]);
  const [watchSearchStatus, setWatchSearchStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [watchMessage, setWatchMessage] = useState("");
  const [savingWatchCode, setSavingWatchCode] = useState("");
  const [deletingWatchId, setDeletingWatchId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stock-watchlist", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as { items?: StockWatchlistItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "股票自选读取失败。");
        if (!cancelled) { setWatchlist(payload.items ?? []); setWatchlistStatus("ready"); }
      })
      .catch(() => { if (!cancelled) setWatchlistStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const query = watchSearch.trim();
    if (!query) {
      const timer = window.setTimeout(() => { setWatchResults([]); setWatchSearchStatus("idle"); }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setWatchSearchStatus("loading");
      try {
        const params = new URLSearchParams({ q: query, kind: "股票" });
        const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: SecuritySearchResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "股票搜索失败。");
        const items = payload.items ?? [];
        setWatchResults(items);
        setWatchSearchStatus(items.length ? "ready" : "empty");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setWatchResults([]); setWatchSearchStatus("error");
      }
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [watchSearch]);

  const refreshWatchlistQuotes = useCallback(async () => {
    if (!watchlist.length) { setWatchlistQuotes([]); setWatchlistQuoteStatus("ready"); return; }
    setWatchlistQuoteStatus("loading");
    try {
      const response = await fetch("/api/market", { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings: watchlist.map(({ code, name }) => ({ code, name, type: "股票" })), includeAMarket: false }) });
      const payload = await response.json() as { quotes?: Quote[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "股票自选行情请求失败。");
      setWatchlistQuotes(payload.quotes ?? []);
      setWatchlistQuoteStatus("ready");
    } catch {
      setWatchlistQuoteStatus("error");
    }
  }, [watchlist]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;
    const run = async () => {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      await refreshWatchlistQuotes();
      inFlight = false;
      if (!cancelled) timer = window.setTimeout(run, marketRefreshInterval("a"));
    };
    const onVisibility = () => { if (document.visibilityState === "visible") { if (timer) window.clearTimeout(timer); void run(); } };
    void run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refreshVersion, refreshWatchlistQuotes]);

  async function addToWatchlist(item: SecuritySearchResult) {
    setSavingWatchCode(item.code); setWatchMessage("");
    try {
      const response = await fetch("/api/stock-watchlist", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: item.code, name: item.name }) });
      const payload = await response.json() as { item?: StockWatchlistItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || "股票自选保存失败。");
      setWatchlist((current) => [payload.item!, ...current.filter((value) => value.code !== payload.item!.code)]);
      setWatchSearch(""); setWatchResults([]); setWatchSearchStatus("idle"); setWatchMessage(`${item.name}已加入股票自选。`);
    } catch (reason) { setWatchMessage(reason instanceof Error ? reason.message : "股票自选保存失败。"); }
    finally { setSavingWatchCode(""); }
  }

  async function removeFromWatchlist(item: StockWatchlistItem) {
    setDeletingWatchId(item.id); setWatchMessage("");
    try {
      const response = await fetch("/api/stock-watchlist", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const payload = response.status === 204 ? null : await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload?.error || "股票自选删除失败。");
      setWatchlist((current) => current.filter((value) => value.id !== item.id)); setWatchMessage(`${item.name}已移出股票自选。`);
    } catch (reason) { setWatchMessage(reason instanceof Error ? reason.message : "股票自选删除失败。"); }
    finally { setDeletingWatchId(null); }
  }

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: selected.code }) })
      .then(async (response) => {
        const payload = await response.json() as HistoryResult & { error?: string };
        if (!response.ok) throw new Error(payload.error || "历史行情请求失败。");
        if (!cancelled) { setHistory(payload); setHistoryStatus("ready"); }
      })
      .catch(() => { if (!cancelled) setHistoryStatus("error"); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      const timer = window.setTimeout(() => { setFundamentals(null); setRiskMetrics(null); setFundamentalsStatus("idle"); setRiskStatus("idle"); }, 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) {
        setFundamentalsStatus("loading");
        setRiskStatus("loading");
      }
    }, 0);
    const input = JSON.stringify({ code: selected.code });
    Promise.all([
      fetch("/api/fundamentals", { method: "POST", headers: { "Content-Type": "application/json" }, body: input, cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as FundamentalSnapshot & { error?: string };
        if (!response.ok) throw new Error(payload.error || "基本面请求失败。");
        return payload;
      }),
      fetch("/api/risk", { method: "POST", headers: { "Content-Type": "application/json" }, body: input, cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as RiskMetrics & { error?: string };
        if (!response.ok) throw new Error(payload.error || "风险指标请求失败。");
        return payload;
      }),
    ]).then(([nextFundamentals, nextRisk]) => {
      if (cancelled) return;
      setFundamentals(nextFundamentals);
      setRiskMetrics(nextRisk);
      setFundamentalsStatus("ready");
      setRiskStatus("ready");
    }).catch(() => {
      if (cancelled) return;
      setFundamentalsStatus("error");
      setRiskStatus("error");
    });
    return () => { cancelled = true; window.clearTimeout(loadingTimer); };
  }, [selected]);

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><span>个股研究</span><h2>{selected ? selected.name : "还没有股票持仓"}</h2><p>{selected ? `${selected.code} · ${formatNumber(selectedQuote?.price ?? null)} · ${formatPercent(selectedQuote?.changePercent ?? null)}` : "添加股票后在这里查看分析。"}</p></div>
        <button className="primary-button" type="button" onClick={onAdd}><Icon name="plus" size={16} />添加股票</button>
      </section>
      <AssetOverview scope="股票持仓" holdings={stocks} quotes={quotes} />
      <section className="panel stock-watchlist-panel">
        <SectionHeading title="股票自选" note="搜索代码或名称，加入后永久保存；行情独立更新，不会计入持仓。" />
        <div className="security-search-block stock-watchlist-search">
          <label htmlFor="stock-watch-search"><span>搜索股票</span></label>
          <div className="security-search-input"><Icon name="search" size={17} /><input id="stock-watch-search" value={watchSearch} onChange={(event) => setWatchSearch(event.target.value)} placeholder="例如 600519 或 贵州茅台" role="combobox" aria-autocomplete="list" aria-expanded={watchResults.length > 0} aria-controls="stock-watch-search-results" autoComplete="off" />{watchSearchStatus === "loading" ? <span>搜索中</span> : null}</div>
          {watchResults.length ? <div className="security-search-results stock-watchlist-results" id="stock-watch-search-results" role="listbox">{watchResults.map((item) => { const alreadyAdded = watchlist.some((value) => value.code === item.code); return <button type="button" role="option" aria-selected={alreadyAdded} key={item.code} disabled={alreadyAdded || savingWatchCode === item.code} onClick={() => void addToWatchlist(item)}><span><strong>{item.name}</strong><small>A 股 · {verificationLabel(item.verification, item.sourceCount)} · {alreadyAdded ? "已在自选" : "点击加入自选"}</small></span><b>{item.code}</b></button>; })}</div> : null}
          {watchSearchStatus === "empty" ? <p className="search-feedback">没有找到匹配股票，请检查代码或名称。</p> : null}
          {watchSearchStatus === "error" ? <p className="search-feedback error">搜索暂不可用，请稍后再试。</p> : null}
          {watchMessage ? <p className={`search-feedback ${watchMessage.includes("失败") || watchMessage.includes("无效") || watchMessage.includes("最多") ? "error" : "success"}`} role="status">{watchMessage}</p> : null}
        </div>
        <div className="stock-watchlist-list" role="region" aria-label="股票自选列表，可横向滚动">
          {watchlistStatus === "loading" ? <SourceState title="股票自选" description="正在读取本机或账号同步数据" status="pending" /> : watchlistStatus === "error" ? <SourceState title="股票自选" description="自选列表暂不可用，请稍后刷新" status="error" /> : watchlist.length ? <div className="data-table-scroll"><table className="stock-watchlist-table"><thead><tr><th>股票</th><th>最新价</th><th>涨跌额</th><th>涨跌幅</th><th>行情</th><th>管理</th></tr></thead><tbody>{watchlist.map((item) => { const quote = watchlistQuotes.find((value) => value.type === "股票" && value.code === item.code); return <tr key={item.id}><td><div className="stock-watchlist-name"><strong>{item.name}</strong><span>{item.code}</span></div></td><td className="number-cell">{formatNumber(quote?.price ?? null)}</td><td className={(quote?.changePercent ?? 0) >= 0 ? "up-text number-cell" : "down-text number-cell"}>{formatChangeAmount(quote?.price ?? null, quote?.previousClose ?? null)}</td><td className={(quote?.changePercent ?? 0) >= 0 ? "up-text number-cell" : "down-text number-cell"}>{formatPercent(quote?.changePercent ?? null)}</td><td><span className={`source-chip ${quote?.status === "ok" ? verificationClass(quote.verification) : watchlistQuoteStatus === "error" ? "error" : "pending"}`} title={quoteVerificationTitle(quote)}>{quote?.status === "ok" ? verificationLabel(quote.verification, quote.sourceCount) : watchlistQuoteStatus === "error" ? "暂不可用" : "同步中"}</span></td><td><button className="table-action danger" type="button" disabled={deletingWatchId === item.id} onClick={() => void removeFromWatchlist(item)}>{deletingWatchId === item.id ? "删除中" : "删除"}</button></td></tr>; })}</tbody></table></div> : <div className="empty-state compact"><strong>还没有自选股票</strong><span>搜索代码或名称，加入后可在这里快速查看行情。</span></div>}
        </div>
        <p className="watchlist-privacy"><Icon name="info" size={15} />股票自选最多保存 30 只；会随账号同步到其他设备，不会进入 AI 持仓分析。</p>
      </section>
      <section className="stock-workbench">
        <div className="panel chart-panel">
          <div className="section-heading">
            <div><h2>走势与位置</h2><p>{range}视图 · {history?.source || "正在读取历史行情"}{history ? ` · ${verificationLabel(history.verification, history.sourceCount)}` : ""}</p></div>
            <div className="segmented-control" aria-label="K 线周期">
              {["日线", "周线", "月线"].map((item) => <button key={item} type="button" className={range === item ? "active" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}
            </div>
          </div>
          {historyStatus === "ready" && history?.recent?.length ? <HistoryChart points={history.recent} range={range} /> : <div className="empty-chart tall" role="img" aria-label={`${range}行情摘要`}><span className="chart-rule" /><span className="chart-rule" /><span className="chart-rule" /><div><strong>{selectedQuote?.status === "ok" ? `${formatNumber(selectedQuote.price)} · ${formatPercent(selectedQuote.changePercent)}` : "等待行情"}</strong><p>{selectedQuote?.status === "ok" ? `开 ${formatNumber(selectedQuote.open)} · 高 ${formatNumber(selectedQuote.high)} · 低 ${formatNumber(selectedQuote.low)}` : "上游恢复后显示当日价格位置。"}</p></div></div>}
        </div>
        <aside className="panel score-panel">
          <SectionHeading title="综合分析" note="只展示已返回的基本面与量化风险，不使用演示评分。" />
          <div className="score-placeholder"><strong>{riskMetrics?.riskScore ?? "—"}</strong><span>{riskMetrics ? `量化风险 · ${riskMetrics.riskLevel}` : "添加持仓后可用"}</span></div>
          <dl className="score-facts"><div><dt>估值 PE(TTM)</dt><dd>{formatNumber(fundamentals?.metrics.peTtm ?? null)}</dd></div><div><dt>市净率 PB</dt><dd>{formatNumber(fundamentals?.metrics.pb ?? null)}</dd></div><div><dt>年化波动</dt><dd>{riskMetrics ? formatPercent(riskMetrics.annualizedVolatility) : "—"}</dd></div><div><dt>最大回撤</dt><dd>{riskMetrics ? formatPercent(riskMetrics.maxDrawdown) : "—"}</dd></div></dl>
        </aside>
      </section>
      <section className="two-column-grid">
        <div className="panel"><SectionHeading title="历史相似走势" note={history ? `${history.note} ${verificationLabel(history.verification, history.sourceCount)}${history.deviationPercent === null || history.deviationPercent === undefined ? "" : `，最新共同收盘偏差 ${history.deviationPercent.toFixed(3)}%`}。` : "样本条件、数量和后续表现都会完整披露。"} />{historyStatus === "ready" && history ? <dl className="history-stats"><div><dt>有效样本</dt><dd>{history.sampleSize}</dd></div><div><dt>随后 5 日上涨比例</dt><dd>{history.stats.upRatio5d === null ? "—" : `${(history.stats.upRatio5d * 100).toFixed(1)}%`}</dd></div><div><dt>随后 20 日平均</dt><dd>{formatPercent(history.stats.averageReturn20d)}</dd></div><div><dt>样本最差回撤</dt><dd>{formatPercent(history.stats.worstDrawdown20d)}</dd></div></dl> : <SourceState title="相似形态引擎" description={historyStatus === "error" ? "历史行情暂不可用" : "正在计算最近 15 日相似形态"} status={historyStatus === "error" ? "error" : "pending"} />}</div>
        <div className="panel"><SectionHeading title="基本面 / 估值" note={fundamentals?.asOf ? `更新时间 ${formatQuoteTime(fundamentals.asOf)} · ${verificationLabel(fundamentals.verification, fundamentals.sourceCount)} · ${fundamentals.source}` : "公开行情快照；财报成长率缺失时明确留空。"} />{!selected ? <SourceState title="基本面快照" description="添加股票持仓后读取 PE、PB 与总市值。" pendingLabel="添加持仓后可用" /> : fundamentalsStatus === "loading" ? <SourceState title="基本面快照" description="正在读取公开估值快照" status="pending" /> : fundamentalsStatus === "error" || !fundamentals ? <SourceState title="基本面快照" description="公开估值快照暂不可用，页面会自动重试" status="error" /> : <><dl className="fundamental-metrics"><div><dt>市盈率 PE(TTM)</dt><dd>{formatNumber(fundamentals.metrics.peTtm)}</dd></div><div><dt>市净率 PB</dt><dd>{formatNumber(fundamentals.metrics.pb)}</dd></div><div><dt>市销率 PS(TTM)</dt><dd>{formatNumber(fundamentals.metrics.psTtm)}</dd></div><div><dt>总市值</dt><dd>{formatCompactMarketValue(fundamentals.metrics.marketCap)}</dd></div><div><dt>ROE</dt><dd>{formatPercent(fundamentals.metrics.roe)}</dd></div><div><dt>利润增速</dt><dd>{formatPercent(fundamentals.metrics.profitGrowth)}</dd></div></dl><p className={`research-note ${fundamentals.verification === "conflict" ? "error" : ""}`}>{fundamentals.note}{fundamentals.conflicts.length ? ` 冲突：${fundamentals.conflicts.join("；")}。` : ""} <a href={fundamentals.sourceUrl} target="_blank" rel="noreferrer">查看主源原文<Icon name="arrow" size={14} /></a></p></>}</div>
        <div className="panel"><SectionHeading title="量化风险" note={riskMetrics?.asOf ? `截至 ${riskMetrics.asOf} · ${riskMetrics.source}` : "基于复权日线计算，指标缺失时留空。"} />{!selected ? <SourceState title="风险指标" description="添加股票持仓后计算波动、回撤与 VaR。" pendingLabel="添加持仓后可用" /> : riskStatus === "loading" ? <SourceState title="风险指标" description="正在计算最近最多 520 个交易日" status="pending" /> : riskStatus === "error" || !riskMetrics ? <SourceState title="风险指标" description="历史行情样本暂不可用，页面会自动重试" status="error" /> : <><dl className="risk-metrics"><div><dt>年化波动</dt><dd>{formatPercent(riskMetrics.annualizedVolatility)}</dd></div><div><dt>最大回撤</dt><dd>{formatPercent(riskMetrics.maxDrawdown)}</dd></div><div><dt>VaR 95%</dt><dd>{formatPercent(riskMetrics.valueAtRisk95)}</dd></div><div><dt>下行波动</dt><dd>{formatPercent(riskMetrics.downsideDeviation)}</dd></div><div><dt>上涨日占比</dt><dd>{riskMetrics.winRate === null ? "—" : `${(riskMetrics.winRate * 100).toFixed(1)}%`}</dd></div><div><dt>最长连跌</dt><dd>{riskMetrics.lossStreak} 日</dd></div></dl><p className="research-note">{riskMetrics.note}</p></>}</div>
      </section>
      <section className="panel">
        <SectionHeading title="股票持仓" note="先看盈亏结果，再核对价格、成本和仓位。" action={<button className="primary-button" type="button" onClick={onAdd}><Icon name="plus" size={16} />添加股票</button>} />
        <StockHoldingTable holdings={stocks} quotes={quotes} />
      </section>
    </div>
  );
}

function FundsPage({ holdings, quotes, onAdd }: { holdings: Holding[]; quotes: Quote[]; onAdd: () => void }) {
  const [filter, setFilter] = useState<"全部" | "ETF" | "场外基金">("全部");
  const [fundQuery, setFundQuery] = useState("");
  const [fundSort, setFundSort] = useState<"默认" | "收益" | "市值">("默认");
  const [research, setResearch] = useState<FundResearchSnapshot | null>(null);
  const [researchStatus, setResearchStatus] = useState<DataStatus>("idle");
  const [researchResultKey, setResearchResultKey] = useState("");
  const [historyFundCode, setHistoryFundCode] = useState("");
  const [fundHistory, setFundHistory] = useState<FundHistoryResult | null>(null);
  const [fundHistoryStatus, setFundHistoryStatus] = useState<DataStatus>("idle");
  const [fundHistoryResultCode, setFundHistoryResultCode] = useState("");
  const listRef = useRef<HTMLElement>(null);
  const allFunds = useMemo(() => holdings.filter((item) => item.type !== "股票"), [holdings]);
  const funds = useMemo(() => {
    const query = fundQuery.trim().toLowerCase();
    const visible = allFunds.filter((item) => (filter === "全部" || item.type === filter) && (!query || `${item.name}${item.code}`.toLowerCase().includes(query)));
    return [...visible].sort((a, b) => {
      if (fundSort === "收益") return (Number(b.holdingProfit ?? -Infinity) || -Infinity) - (Number(a.holdingProfit ?? -Infinity) || -Infinity);
      if (fundSort === "市值") return (Number(b.holdingAmount ?? -Infinity) || -Infinity) - (Number(a.holdingAmount ?? -Infinity) || -Infinity);
      return 0;
    });
  }, [allFunds, filter, fundQuery, fundSort]);
  const fundResearchKey = useMemo(() => allFunds.map((item) => `${item.type}:${item.code}:${item.name}`).sort().join("|"), [allFunds]);

  useEffect(() => {
    if (!fundResearchKey) return;
    let cancelled = false;
    const requestedFunds = allFunds.map(({ code, name, type }) => ({ code, name, type }));
    fetch("/api/funds", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ funds: requestedFunds }) })
      .then(async (response) => {
        const payload = await response.json() as FundResearchSnapshot & { error?: string };
        if (!response.ok) throw new Error(payload.error || "基金研究数据请求失败。");
        if (!cancelled) { setResearch(payload); setResearchResultKey(fundResearchKey); setResearchStatus("ready"); }
      })
      .catch(() => { if (!cancelled) { setResearchResultKey(fundResearchKey); setResearchStatus("error"); } });
    return () => { cancelled = true; };
  }, [allFunds, fundResearchKey]);

  const visibleResearch = fundResearchKey && researchResultKey === fundResearchKey ? research : null;
  const visibleResearchStatus = !fundResearchKey ? "ready" : researchResultKey === fundResearchKey ? researchStatus : "loading";
  const selectedHistoryFund = allFunds.find((item) => item.code === historyFundCode) || allFunds[0];

  useEffect(() => {
    if (!selectedHistoryFund) return;
    let cancelled = false;
    fetch("/api/fund-history", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ code: selectedHistoryFund.code, name: selectedHistoryFund.name, type: selectedHistoryFund.type }) })
      .then(async (response) => {
        const payload = await response.json() as FundHistoryResult & { error?: string };
        if (!response.ok) throw new Error(payload.error || "基金历史相似请求失败。");
        if (!cancelled) { setFundHistory(payload); setFundHistoryResultCode(selectedHistoryFund.code); setFundHistoryStatus("ready"); }
      })
      .catch(() => { if (!cancelled) { setFundHistoryResultCode(selectedHistoryFund.code); setFundHistoryStatus("error"); } });
    return () => { cancelled = true; };
  }, [selectedHistoryFund]);

  const visibleFundHistory = selectedHistoryFund && fundHistoryResultCode === selectedHistoryFund.code ? fundHistory : null;
  const visibleFundHistoryStatus = !selectedHistoryFund ? "idle" : fundHistoryResultCode === selectedHistoryFund.code ? fundHistoryStatus : "loading";

  function chooseFilter(value: typeof filter) {
    setFilter(value);
    window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><span>基金研究</span><h2>股票与基金分开分析</h2><p>ETF 看盘中行情与折溢价，场外基金看净值、回撤和同类比较。</p></div>
        <button className="primary-button" type="button" onClick={onAdd}><Icon name="plus" size={16} />添加基金</button>
      </section>
      <AssetOverview scope="基金持仓" holdings={allFunds} quotes={quotes} />
      <section className="fund-route-grid">
        <article>
          <span>ETF</span><h2>盘中数据路线</h2><p>行情、折溢价、跟踪误差与持仓穿透。</p>
          <button type="button" onClick={() => chooseFilter("ETF")}>查看 ETF<Icon name="arrow" size={16} /></button>
        </article>
        <article>
          <span>场外基金</span><h2>净值数据路线</h2><p>历史回撤、同类排名、基金经理和持仓风格。</p>
          <button type="button" onClick={() => chooseFilter("场外基金")}>查看场外基金<Icon name="arrow" size={16} /></button>
        </article>
      </section>
      <section className="panel" ref={listRef} tabIndex={-1}>
        <SectionHeading
          title="基金持仓"
          note={`当前筛选：${filter} · ${funds.length}/${allFunds.length} 只`}
          action={<div className="filter-pills">{(["全部", "ETF", "场外基金"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>}
        />
        <div className="fund-screen-tools"><label><span>搜索基金</span><input value={fundQuery} onChange={(event) => setFundQuery(event.target.value)} placeholder="代码或名称" /></label><label><span>排序</span><select value={fundSort} onChange={(event) => setFundSort(event.target.value as typeof fundSort)}><option>默认</option><option>收益</option><option>市值</option></select></label><small>只使用已录入的持有金额与持有收益，不补造净值。</small></div>
        <HoldingTable holdings={funds} quotes={quotes} />
      </section>
      <section className="two-column-grid">
        <div className="panel fund-research-panel"><SectionHeading title="基金经理" note={visibleResearch ? `${visibleResearch.products.filter((item) => item.profileStatus === "ok").length}/${visibleResearch.products.length} 只产品档案可用 · ${visibleResearch.source}` : "读取现任经理、任职期与本轮回报。"} /><FundManagerResearch products={visibleResearch?.products || []} status={visibleResearchStatus} /></div>
        <div className="panel fund-research-panel"><SectionHeading title="重仓重叠" note={visibleResearch ? `按 ${visibleResearch.disclosureCount} 只基金最新前十大披露计算，权重不可直接视为实际组合仓位。` : "按最新定期报告的前十大股票持仓计算。"} /><FundOverlapResearch products={visibleResearch?.products || []} overlaps={visibleResearch?.overlaps || []} disclosureCount={visibleResearch?.disclosureCount || 0} status={visibleResearchStatus} /></div>
      </section>
      <section className="panel fund-history-panel">
        <SectionHeading title="历史相似走势" note="逐只基金按单位净值日收益形态计算，不混合不同基金样本。" action={allFunds.length > 1 ? <label className="fund-history-select"><span>选择基金</span><select value={selectedHistoryFund?.code || ""} onChange={(event) => setHistoryFundCode(event.target.value)}>{allFunds.map((item) => <option key={`${item.type}-${item.code}`} value={item.code}>{item.name} · {item.code}</option>)}</select></label> : undefined} />
        <FundHistoryResearch fund={selectedHistoryFund} result={visibleFundHistory} status={visibleFundHistoryStatus} />
      </section>
    </div>
  );
}

function NewsPage({ marketNews, notices, status, noticeStatus }: { marketNews: MarketNewsItem[]; notices: NoticeItem[]; status: DataStatus; noticeStatus: DataStatus }) {
  const [filter, setFilter] = useState<"全部" | "快讯" | "政策" | "持仓">("全部");
  const [expanded, setExpanded] = useState<string | null>(null);
  const sourceCount = new Set(marketNews.flatMap((item) => item.sources?.map((source) => source.name) || [item.source])).size;
  const visible = [
    ...(filter === "持仓" ? [] : marketNews.filter((item) => filter === "全部" || item.category === filter).map((item) => ({ ...item, stream: "市场" as const }))),
    ...(filter === "全部" || filter === "持仓" ? notices.map((item) => ({ ...item, summary: "", stream: "持仓" as const })) : []),
  ].sort((a, b) => newsTimeValue(b.publishedAt) - newsTimeValue(a.publishedAt));

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><span>资讯雷达</span><h2>不加持仓，也能先看市场正在发生什么。</h2><p>聚合多家 7×24 快讯和监管政策；持仓公告单独标记，重复事件合并展示。</p></div>
        <span className={`source-chip ${status === "ready" ? "ready" : status === "error" ? "error" : "pending"}`}>{status === "ready" ? `${sourceCount} 个来源 · ${marketNews.length} 条资讯 · ${notices.length} 条公告` : status === "error" ? "资讯同步异常" : "同步中"}</span>
      </section>
      <section className="news-layout">
        <div className="panel">
          <SectionHeading title="资讯流" note="按发布时间排列；同一事件合并来源，不复制媒体全文。" action={<div className="filter-pills">{(["全部", "快讯", "政策", "持仓"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>} />
          <div className="pipeline-list">
            {visible.map((item) => {
              const itemKey = `${item.stream}-${item.id}`;
              const detailId = `news-${item.stream}-${item.id}-detail`;
              const isOpen = expanded === itemKey;
              return (
                <article key={itemKey}>
                  <span className={`pipeline-type ${item.stream === "持仓" ? "holding" : item.category === "政策" ? "policy" : ""}`}>{item.category}</span>
                  <div><h3>{item.title}</h3><p>{item.stream === "持仓" ? `${item.code} · ` : ""}{formatNewsTime(item.publishedAt)} · {item.source}{item.stream === "市场" && item.sourceCount > 1 ? `等 ${item.sourceCount} 个来源` : ""}</p>{isOpen ? <div className="pipeline-detail" id={detailId}>{item.summary ? <p>{item.summary}</p> : <p>{item.stream === "持仓" ? "公告内容请以交易所披露原文为准。" : "本站仅聚合标题与原文入口，请到来源网站核验详情。"}</p>}<div className="news-source-links">{item.stream === "市场" ? (item.sources?.length ? item.sources : [{ name: item.source, url: item.url }]).map((source) => <a key={`${source.name}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">{source.name}原文<Icon name="arrow" size={15} /></a>) : <a href={item.url} target="_blank" rel="noreferrer">查看公告原文<Icon name="arrow" size={15} /></a>}</div></div> : null}</div>
                  <button className="icon-button" type="button" aria-label={`${isOpen ? "收起" : "查看"}${item.title}说明`} aria-expanded={isOpen} aria-controls={detailId} onClick={() => setExpanded(isOpen ? null : itemKey)}><Icon name="arrow" size={17} /></button>
                </article>
              );
            })}
            {visible.length === 0 ? <div className="empty-state">{filter === "持仓" ? (noticeStatus === "loading" ? "正在同步持仓公告…" : "未添加股票持仓，或当前持仓暂无新公告；市场快讯仍可查看。") : status === "loading" ? "正在同步多源资讯…" : `暂未取得${filter === "全部" ? "资讯" : filter}，请稍后自动重试。`}</div> : null}
          </div>
        </div>
        <aside className="panel rules-panel">
          <SectionHeading title="阅读规则" note="先分清消息类型，再判断影响。" />
          <ol><li><span>1</span><p><strong>多源快讯</strong>用于了解全局；重复事件会合并，但不等于事实已被完全确认。</p></li><li><span>2</span><p><strong>政策与公告</strong>优先核对监管机构、政府部门和交易所原文。</p></li><li><span>3</span><p><strong>不过度反应</strong>单条资讯不直接触发操作建议，AI 也不会后台自动分析。</p></li></ol>
        </aside>
      </section>
    </div>
  );
}

function UsMoveList({ items, status }: { items: UsRankItem[]; status: DataStatus }) {
  if (!items.length) return <div className="empty-state">{status === "loading" ? "正在同步热门股排行…" : "排行源暂不可用，页面会自动重试。"}</div>;
  return <div className="table-scroll" role="region" aria-label="热门美股涨跌排行，可横向滚动"><table className="data-table us-move-table"><thead><tr><th>名称/代码</th><th>最新价</th><th>涨跌额</th><th>涨跌幅</th></tr></thead><tbody>{items.slice(0, 6).map((item) => { const changeClass = item.changePercent >= 0 ? "up-text" : "down-text"; return <tr key={item.code}><td><strong>{item.name}</strong><span>{item.code}</span></td><td className="data-value">${formatNumber(item.price)}</td><td className={changeClass}>{formatChangeAmount(item.price, item.previousClose)}</td><td className={changeClass}>{formatPercent(item.changePercent)}</td></tr>; })}</tbody></table></div>;
}

function UsPage({ refreshVersion }: { refreshVersion: number }) {
  const [watchlist, setWatchlist] = useState<UsWatchlistItem[]>([]);
  const [watchlistStatus, setWatchlistStatus] = useState<DataStatus>("loading");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [indices, setIndices] = useState<Quote[]>([]);
  const [rankings, setRankings] = useState<{ active: UsRankItem[]; gainers: UsRankItem[]; losers: UsRankItem[] }>({ active: [], gainers: [], losers: [] });
  const [status, setStatus] = useState<DataStatus>("loading");
  const [lastUpdated, setLastUpdated] = useState("等待首次同步");
  const [stockSearch, setStockSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UsSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [savingSymbol, setSavingSymbol] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWatchlist() {
      try {
        const response = await fetch("/api/us-watchlist", { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json() as { items?: UsWatchlistItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "美股自选读取失败。");
        if (!cancelled) {
          setWatchlist(payload.items ?? []);
          setWatchlistStatus("ready");
        }
      } catch {
        if (!cancelled) setWatchlistStatus("error");
      }
    }
    void loadWatchlist();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;
    async function loadUsMarket() {
      try {
        const response = await fetch("/api/market", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usSymbols: watchlist.map((item) => item.symbol), includeUsMarket: true }) });
        const payload = await response.json() as { usQuotes?: Quote[]; usIndices?: Quote[]; usRankings?: { active?: UsRankItem[]; gainers?: UsRankItem[]; losers?: UsRankItem[] }; retrievedAt?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "美股行情请求失败。");
        if (!cancelled) {
          const nextQuotes = payload.usQuotes ?? [];
          const nextIndices = payload.usIndices ?? [];
          setQuotes(nextQuotes);
          setIndices(nextIndices);
          setRankings({ active: payload.usRankings?.active ?? [], gainers: payload.usRankings?.gainers ?? [], losers: payload.usRankings?.losers ?? [] });
          setStatus([...nextQuotes, ...nextIndices].some((item) => item.status === "ok") ? "ready" : "error");
          if (payload.retrievedAt) setLastUpdated(new Date(payload.retrievedAt).toLocaleTimeString("zh-CN", { hour12: false }));
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    function clearTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = window.setTimeout(() => { void refreshNow(); }, marketRefreshInterval("us"));
    }

    async function refreshNow() {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      try {
        await loadUsMarket();
      } finally {
        inFlight = false;
        schedule();
      }
    }

    function handleVisibility() {
      if (document.hidden) clearTimer();
      else void refreshNow();
    }

    void refreshNow();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshVersion, watchlist]);

  useEffect(() => {
    const query = stockSearch.trim();
    if (!query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchStatus("loading");
      try {
        const params = new URLSearchParams({ q: query, kind: "美股" });
        const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: UsSearchResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "美股搜索失败。");
        const items = payload.items ?? [];
        setSearchResults(items);
        setSearchStatus(items.length ? "ready" : "empty");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSearchResults([]);
        setSearchStatus("error");
      }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [stockSearch]);

  function updateStockSearch(value: string) {
    setStockSearch(value);
    setSearchResults([]);
    setSearchStatus(value.trim() ? "loading" : "idle");
    setSearchMessage("");
  }

  async function addWatch(item: UsSearchResult) {
    if (savingSymbol) return;
    setSavingSymbol(item.code);
    setSearchMessage("");
    try {
      const response = await fetch("/api/us-watchlist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: item.code, name: item.name }),
      });
      const payload = await response.json() as { item?: UsWatchlistItem; created?: boolean; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || "美股自选保存失败。");
      setWatchlist((current) => [payload.item as UsWatchlistItem, ...current.filter((entry) => entry.id !== payload.item?.id)]);
      setWatchlistStatus("ready");
      setSearchMessage(payload.created ? `${item.name}已加入并长期保存到本设备。` : `${item.name}已经在自选中。`);
      setStockSearch("");
      setSearchResults([]);
      setSearchStatus("idle");
    } catch (reason) {
      setSearchMessage(reason instanceof Error ? reason.message : "美股自选保存失败，请稍后再试。");
    } finally {
      setSavingSymbol("");
    }
  }

  async function removeWatch(item: UsWatchlistItem) {
    if (deletingId !== null) return;
    setDeletingId(item.id);
    setSearchMessage("");
    try {
      const response = await fetch("/api/us-watchlist", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "删除失败。");
      }
      setWatchlist((current) => current.filter((entry) => entry.id !== item.id));
      setQuotes((current) => current.filter((quote) => quote.code !== item.symbol));
      setSearchMessage(`${item.name}已从美股自选中删除。`);
    } catch (reason) {
      setSearchMessage(reason instanceof Error ? reason.message : "删除失败，请稍后再试。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro night-intro">
        <div><span>夜间行情</span><h2>先看三大指数，再看常看的公司。</h2><p>只展示可追溯行情；美股交易时段每 30 秒，其他时段每 5 分钟。</p></div><span className={`source-chip ${status === "ready" ? "ready" : status === "error" ? "error" : "pending"}`}>{status === "ready" ? `已同步 · ${lastUpdated}` : status === "error" ? "行情异常" : "同步中"}</span>
      </section>
      <section className="index-grid us-index-grid" aria-label="美股三大指数">
        {[{ code: "NDX", name: "纳斯达克" }, { code: "SPX", name: "标普 500" }, { code: "DJIA", name: "道琼斯" }].map((item) => { const quote = indices.find((value) => value.code === item.code); return <article className="index-row" key={item.code}><div><span>{item.name}</span><small>{item.code} · 美股指数</small></div><strong>{formatNumber(quote?.price ?? null)}</strong><span className={`muted-value ${(quote?.changePercent ?? 0) >= 0 ? "up-text" : "down-text"}`}>{formatChangeAmount(quote?.price ?? null, quote?.previousClose ?? null)} · {formatPercent(quote?.changePercent ?? null)}</span></article>; })}
      </section>
      <section className="panel">
        <SectionHeading title="美股自选" note="搜代码或名称，点击结果即可加入；刷新和重启后仍保留。" />
        <div className="security-search-block us-search-block">
          <label htmlFor="us-stock-search"><span>搜索美股</span></label>
          <div className="security-search-input"><Icon name="search" size={17} /><input id="us-stock-search" value={stockSearch} onChange={(event) => updateStockSearch(event.target.value)} placeholder="例如 MSFT 或 微软" role="combobox" aria-autocomplete="list" aria-expanded={searchResults.length > 0} aria-controls="us-search-results" autoComplete="off" />{searchStatus === "loading" ? <span>搜索中</span> : null}</div>
          {searchResults.length ? <div className="security-search-results" id="us-search-results" role="listbox">{searchResults.map((item) => <button type="button" role="option" aria-selected={watchlist.some((entry) => entry.symbol === item.code)} key={item.code} disabled={savingSymbol !== ""} onClick={() => void addWatch(item)}><span><strong>{item.name}</strong><small>{savingSymbol === item.code ? "正在保存…" : watchlist.some((entry) => entry.symbol === item.code) ? "已在自选 · 点击更新" : "美股 · 点击加入自选"}</small></span><b>{item.code}</b></button>)}</div> : null}
          {searchStatus === "empty" ? <p className="search-feedback">没有找到匹配美股，请换代码、中文名或英文名。</p> : null}
          {searchStatus === "error" ? <p className="search-feedback error">搜索暂不可用，请稍后再试。</p> : null}
          {searchMessage ? <p className="search-feedback" role="status">{searchMessage}</p> : null}
        </div>
        <div className="watch-list" aria-live="polite">
          {watchlist.map((item) => { const quote = quotes.find((value) => value.code === item.symbol); return <article key={item.id}><span className="us-symbol">{item.symbol.slice(0, 2)}</span><div><strong>{item.symbol}</strong><p>{item.name}</p></div><div><strong className="data-value">{quote?.price === null || quote?.price === undefined ? "—" : `$${formatNumber(quote.price)}`}</strong><p className={(quote?.changePercent ?? 0) >= 0 ? "up-text" : "down-text"}>{formatChangeAmount(quote?.price ?? null, quote?.previousClose ?? null)} · {formatPercent(quote?.changePercent ?? null)}</p></div>{quote?.status === "ok" ? <span className="source-chip ready">已同步</span> : <Pending compact />}<button className="row-action watch-remove" type="button" disabled={deletingId !== null} onClick={() => void removeWatch(item)} aria-label={`删除${item.name}`}>{deletingId === item.id ? "删除中" : "删除"}</button></article>; })}
          {watchlistStatus === "loading" ? <div className="empty-state">正在读取本设备的美股自选…</div> : null}
          {watchlistStatus === "ready" && watchlist.length === 0 ? <div className="empty-state">还没有美股自选。请在上方搜索代码或名称，点击结果即可添加。</div> : null}
          {watchlistStatus === "error" ? <div className="empty-state">美股自选读取失败，请稍后刷新重试。</div> : null}
        </div>
        <p className="watchlist-privacy"><Icon name="info" size={15} />自选保存在当前设备的匿名私有空间，不会进入 AI 持仓分析；清除浏览器网站数据后将无法找回。</p>
      </section>
      <section className="panel us-active-panel">
        <SectionHeading title="热门股成交榜" note="按常见大型美股样本的成交额排序，不代表全市场排名。" />
        <div className="table-scroll" role="region" aria-label="热门美股成交排行，可横向滚动">
          <table className="data-table us-active-table"><thead><tr><th>名称/代码</th><th>最新价</th><th>涨跌额</th><th>涨跌幅</th><th>昨收</th><th>最高</th><th>最低</th><th>成交额</th></tr></thead><tbody>{rankings.active.slice(0, 8).map((item) => { const changeClass = item.changePercent >= 0 ? "up-text" : "down-text"; return <tr key={item.code}><td><strong>{item.name}</strong><span>{item.code}</span></td><td className="data-value">${formatNumber(item.price)}</td><td className={changeClass}>{formatChangeAmount(item.price, item.previousClose)}</td><td className={changeClass}>{formatPercent(item.changePercent)}</td><td className="data-value">{formatNumber(item.previousClose)}</td><td className="data-value">{formatNumber(item.high)}</td><td className="data-value">{formatNumber(item.low)}</td><td className="data-value">{formatCompactMarketValue(item.amount)}</td></tr>; })}</tbody></table>
          {!rankings.active.length ? <div className="empty-state">{status === "loading" ? "正在同步成交排行…" : "成交排行暂不可用，页面会自动重试。"}</div> : null}
        </div>
      </section>
      <section className="two-column-grid us-ranking-grid">
        <div className="panel"><SectionHeading title="热门股涨幅榜" note="当前热门样本中涨幅靠前的公司。" /><UsMoveList items={rankings.gainers} status={status} /></div>
        <div className="panel"><SectionHeading title="热门股跌幅榜" note="当前热门样本中跌幅靠前的公司。" /><UsMoveList items={rankings.losers} status={status} /></div>
      </section>
      <section className="panel"><SectionHeading title="行情说明" note="不从美股涨跌直接推导 A 股操作。" /><SourceState title="指数、个股与热门样本" description={status === "ready" ? `东方财富 / 腾讯公开行情 · 北京时间 ${lastUpdated}` : status === "error" ? "上游暂不可用，页面会自动重试" : "正在连接夜间行情"} status={status === "ready" ? "ready" : status === "error" ? "error" : "pending"} /></section>
    </div>
  );
}

function TransactionLedger({ holdings }: { holdings: Holding[] }) {
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [summaries, setSummaries] = useState<TransactionAssetSummary[]>([]);
  const [status, setStatus] = useState<DataStatus>("idle");
  const [assetKey, setAssetKey] = useState("");
  const [side, setSide] = useState<PortfolioTransaction["side"]>("买入");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedHolding = holdings.find((item) => `${item.type}:${item.code}` === assetKey) ?? holdings[0];
  const needsPrice = side === "买入" || side === "卖出" || side === "期初";

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/transactions", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { transactions?: PortfolioTransaction[]; summary?: TransactionAssetSummary[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "交易流水读取失败。");
      setTransactions(payload.transactions ?? []);
      setSummaries(payload.summary ?? []);
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "交易流水读取失败。");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedHolding) { setError("请先添加一项持仓，再记录交易流水。"); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedHolding.type, code: selectedHolding.code, name: selectedHolding.name, side, amount, fee, quantity: needsPrice ? quantity : null, price: needsPrice ? price : null, occurredAt, note }),
      });
      const payload = await response.json() as { transaction?: PortfolioTransaction; error?: string };
      if (!response.ok || !payload.transaction) throw new Error(payload.error || "交易流水保存失败。");
      setTransactions((current) => [payload.transaction as PortfolioTransaction, ...current].slice(0, 50));
      void load();
      setAmount(""); setFee("0"); setQuantity(""); setPrice(""); setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "交易流水保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(transaction: PortfolioTransaction) {
    const response = await fetch("/api/transactions", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: transaction.id }) });
    if (response.ok) { setTransactions((current) => current.filter((item) => item.id !== transaction.id)); void load(); }
    else setError("交易流水删除失败，请稍后重试。");
  }

  return <section className="panel transaction-ledger">
    <div className="transaction-ledger-head">
      <div><span className="transaction-kicker">ACCOUNTING LOG · 私有账本</span><h2>交易流水</h2><p>记录买卖、费用和分红，让成本与已实现收益有迹可循。</p></div>
      <div className="transaction-ledger-summary" aria-label="交易流水概览"><div><strong>{transactions.length}</strong><span>已记录</span></div><div><strong>{holdings.length}</strong><span>持仓标的</span></div></div>
    </div>
    {!holdings.length ? <div className="transaction-empty"><span className="transaction-empty-mark"><Icon name="plus" size={18} /></span><div><strong>先添加持仓，再建立成本基线</strong><p>添加股票、ETF 或场外基金后，这里会出现对应的流水录入表。</p></div></div> : <>
      <form className="transaction-form" onSubmit={submit}>
        <div className="transaction-form-grid">
          <label className="transaction-field transaction-field-wide"><span>标的</span><select value={assetKey || (selectedHolding ? `${selectedHolding.type}:${selectedHolding.code}` : "")} onChange={(event) => setAssetKey(event.target.value)}>{holdings.map((holding) => <option key={`${holding.type}:${holding.code}`} value={`${holding.type}:${holding.code}`}>{holding.name} · {holding.code}</option>)}</select></label>
          <label className="transaction-field transaction-field-wide"><span>流水类型</span><select value={side} onChange={(event) => setSide(event.target.value as PortfolioTransaction["side"])}>{(["买入", "卖出", "分红", "费用", "期初"] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="transaction-field"><span>金额（元）</span><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" step="0.01" placeholder="10000.00" required /></label>
          <label className="transaction-field"><span>费用（元）</span><input value={fee} onChange={(event) => setFee(event.target.value)} type="number" min="0" step="0.01" placeholder="没有就填 0" required /></label>
          {needsPrice ? <><label className="transaction-field"><span>数量</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.0001" step="0.0001" placeholder="100" required /></label><label className="transaction-field"><span>成交价（元）</span><input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="0.0001" step="0.0001" placeholder="168.50" required /></label></> : null}
          <label className="transaction-field transaction-field-wide"><span>发生时间</span><input value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} type="datetime-local" required /></label>
          <label className="transaction-field transaction-field-wide"><span>备注（可选）</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="例如：转入旧账户成本" /></label>
        </div>
        <div className="transaction-form-footer"><span className="form-hint"><Icon name="info" size={15} />金额、数量和费用只保存在当前账号私有空间。</span><button className="primary-button" type="submit" disabled={saving}><Icon name="plus" size={16} />{saving ? "保存中…" : "记录流水"}</button></div>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status === "loading" ? <SourceState title="交易流水" description="正在读取本设备流水" status="pending" /> : null}
      {summaries.length ? <div className="transaction-cost-batches" aria-label="FIFO 成本批次摘要">
        <div className="transaction-subheading"><div><span>FIFO COST LOTS · 成本批次</span><strong>剩余成本与已实现结果</strong></div><small>按发生时间先进先出；卖出不足时仅核算已有批次</small></div>
        <div className="transaction-batch-grid">{summaries.map((summary) => <article key={`${summary.type}:${summary.code}`}>
          <header><div><strong>{summary.name}</strong><span>{summary.code} · {summary.type}</span></div><b>{summary.lotCount} 个批次</b></header>
          <dl><div><dt>剩余数量</dt><dd>{summary.quantity > 0 ? summary.quantity.toLocaleString("zh-CN", { maximumFractionDigits: 4 }) : "—"}</dd></div><div><dt>剩余成本</dt><dd>¥{formatNumber(summary.costBasis)}</dd></div><div><dt>已实现盈亏</dt><dd className={summary.realizedProfit >= 0 ? "up-text" : "down-text"}>{formatSignedMoney(summary.realizedProfit)}</dd></div><div><dt>分红 / 费用</dt><dd>{formatSignedMoney(summary.dividends - summary.fees)}</dd></div></dl>
          <footer>{summary.remainingLots.slice(0, 3).map((lot) => <span key={`${lot.sourceTransactionId}-${lot.occurredAt}`}>批次 {new Date(lot.occurredAt).toLocaleDateString("zh-CN")} · {lot.quantity.toLocaleString("zh-CN", { maximumFractionDigits: 4 })} · ¥{formatNumber(lot.unitCost, 4)}</span>)}</footer>
        </article>)}</div>
      </div> : null}
      {transactions.length ? <div className="table-scroll transaction-table-scroll"><table className="data-table"><thead><tr><th>时间</th><th>标的</th><th>类型</th><th>金额</th><th>数量/价格</th><th>管理</th></tr></thead><tbody>{transactions.slice(0, 8).map((transaction) => <tr key={transaction.id}><td className="transaction-time">{new Date(transaction.occurredAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td><strong>{transaction.name}</strong><span>{transaction.code}</span></td><td><span className={`transaction-side transaction-side-${transaction.side === "买入" || transaction.side === "期初" ? "in" : transaction.side === "卖出" ? "out" : "neutral"}`}>{transaction.side}</span></td><td className="data-value">¥{formatNumber(Number(transaction.amount))}</td><td>{transaction.quantity && transaction.price ? `${transaction.quantity} · ¥${transaction.price}` : "—"}</td><td><button className="plain-link" type="button" onClick={() => void remove(transaction)}>删除</button></td></tr>)}</tbody></table></div> : status === "ready" ? <div className="transaction-empty transaction-empty-compact"><span className="transaction-empty-mark"><Icon name="check" size={17} /></span><div><strong>流水账本还是空的</strong><p>建议先用“期初”记录已有持仓的成本基线。</p></div></div> : null}
    </>}
  </section>;
}

function AddHoldingDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (holding: Holding) => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchFieldRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<HoldingKind>("股票");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SecuritySearchResult[]>([]);
  const [selected, setSelected] = useState<SecuritySearchResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [cost, setCost] = useState("");
  const [quantity, setQuantity] = useState("");
  const [holdingAmount, setHoldingAmount] = useState("");
  const [holdingProfit, setHoldingProfit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fundPrincipal = Number(holdingAmount) - Number(holdingProfit);
  const fundReturn = Number.isFinite(fundPrincipal) && fundPrincipal > 0 && holdingProfit !== "" ? (Number(holdingProfit) / fundPrincipal) * 100 : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.close();
      }
    };
    dialog.showModal();
    dialog.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => searchFieldRef.current?.focus());
    return () => dialog.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const query = search.trim();
    if (!query || selected) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchStatus("loading");
      try {
        const params = new URLSearchParams({ q: query, kind });
        const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { items?: SecuritySearchResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "搜索失败。");
        const items = payload.items ?? [];
        setResults(items);
        setSearchStatus(items.length ? "ready" : "empty");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setResults([]);
        setSearchStatus("error");
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, search, selected]);

  function chooseKind(next: HoldingKind) {
    setKind(next);
    setSearch("");
    setSelected(null);
    setResults([]);
    setSearchStatus("idle");
    setError("");
    window.requestAnimationFrame(() => searchFieldRef.current?.focus());
  }

  function updateSearch(value: string) {
    setSearch(value);
    setSelected(null);
    setResults([]);
    setSearchStatus(value.trim() ? "loading" : "idle");
    setError("");
  }

  function chooseSecurity(item: SecuritySearchResult) {
    setSelected(item);
    setSearch(`${item.code} ${item.name}`);
    setResults([]);
    setSearchStatus("ready");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setError("请先搜索，并从结果中选择正确的代码和名称。");
      searchFieldRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        code: selected.code,
        name: selected.name,
        type: kind,
        cost: kind === "场外基金" ? "" : cost,
        quantity: kind === "场外基金" ? "" : quantity,
        holdingAmount: kind === "场外基金" ? holdingAmount : null,
        holdingProfit: kind === "场外基金" ? holdingProfit : null,
      });
      dialogRef.current?.close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "持仓保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="add-title"
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); dialogRef.current?.close(); }}
    >
      <div className="dialog-surface">
        <div className="dialog-head"><div><h2 id="add-title">添加持仓</h2><p>先选类型，再搜索代码或名称。不同持仓只填写真正需要的数据。</p></div><button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="关闭添加持仓弹窗"><Icon name="close" /></button></div>
        <form onSubmit={submit}>
          <fieldset className="holding-kind-fieldset"><legend>持仓类型</legend><div className="holding-kind-tabs">{(["股票", "ETF", "场外基金"] as const).map((item) => <button key={item} type="button" className={kind === item ? "active" : ""} aria-pressed={kind === item} onClick={() => chooseKind(item)}>{item}</button>)}</div></fieldset>
          <div className="security-search-block">
            <label htmlFor="holding-security-search"><span>{kind === "场外基金" ? "基金代码或名称" : `${kind}代码或名称`}</span></label>
            <div className="security-search-input"><Icon name="search" size={17} /><input ref={searchFieldRef} id="holding-security-search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder={kind === "场外基金" ? "例如 110022 或 易方达消费" : kind === "ETF" ? "例如 510300 或 沪深300" : "例如 600519 或 贵州茅台"} role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls="holding-search-results" autoComplete="off" required />{searchStatus === "loading" ? <span>搜索中</span> : null}</div>
            {results.length ? <div className="security-search-results" id="holding-search-results" role="listbox">{results.map((item) => <button type="button" role="option" aria-selected={selected?.code === item.code} key={`${item.type}-${item.code}`} onClick={() => chooseSecurity(item)}><span><strong>{item.name}</strong><small>{item.type} · {verificationLabel(item.verification, item.sourceCount)}</small></span><b>{item.code}</b></button>)}</div> : null}
            {selected ? <div className="selected-security"><Icon name="check" size={17} /><div><strong>{selected.name}</strong><span>{selected.code} · {selected.type}</span></div><button type="button" onClick={() => updateSearch("")}>重选</button></div> : null}
            {!selected && searchStatus === "empty" ? <p className="search-feedback">没有找到匹配结果，请检查类型或关键词。</p> : null}
            {!selected && searchStatus === "error" ? <p className="search-feedback error">搜索服务暂不可用，请稍后重试。</p> : null}
          </div>
          {kind === "场外基金" ? <><div className="form-row"><label><span>当前持有金额（元）</span><input value={holdingAmount} onChange={(event) => setHoldingAmount(event.target.value)} type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="例如 12500.00" required /></label><label><span>持有收益（元）</span><input value={holdingProfit} onChange={(event) => setHoldingProfit(event.target.value)} type="number" inputMode="decimal" step="0.01" placeholder="盈利填正数，亏损填负数" required /></label></div><p className="form-hint fund-return-preview"><Icon name="info" size={16} />{fundReturn === null ? "填写金额后自动计算持有收益率。" : `自动计算持有收益率：${formatPercent(fundReturn)}`}</p></> : <><div className="form-row"><label><span>平均成本（元）</span><input value={cost} onChange={(event) => setCost(event.target.value)} type="number" inputMode="decimal" min="0.0001" step="0.0001" placeholder="例如 168.50" required /></label><label><span>持有数量</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" inputMode="decimal" min="0.0001" step="0.0001" placeholder="例如 100" required /></label></div><p className="form-hint"><Icon name="info" size={16} />持仓收益会根据最新行情、平均成本和数量自动计算。</p></>}
          <p className="form-hint privacy-hint"><Icon name="info" size={16} />搜索时只发送关键词；金额、收益、成本和数量只保存在当前账号私有空间。</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => dialogRef.current?.close()} disabled={saving}>取消</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中…" : "保存持仓"}</button></div>
        </form>
      </div>
    </dialog>
  );
}

function AiConsentDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); dialog.close(); } };
    dialog.showModal();
    dialog.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => confirmRef.current?.focus());
    return () => dialog.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function confirm() {
    setSending(true);
    try {
      await onConfirm();
      dialogRef.current?.close();
    } finally {
      setSending(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog utility-dialog" aria-labelledby="ai-consent-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); if (!sending) dialogRef.current?.close(); }}>
      <div className="dialog-surface">
        <div className="dialog-head"><div><h2 id="ai-consent-title">确认开始 AI 联合研判</h2><p>本次点击同意后，网站才会把下列匿名摘要交给外部 AI 服务，由 AI 分析小组联合研判；不会在后台自动分析。</p></div><button className="icon-button" type="button" disabled={sending} onClick={() => dialogRef.current?.close()} aria-label="关闭 AI 分析确认"><Icon name="close" /></button></div>
        <div className="consent-list"><p><Icon name="check" size={17} /><span><strong>会发送</strong>匿名编号与比例、涨跌/收益、匿名化估值和财报摘要、行业强弱、基金档案摘要、逐只历史风险，以及公开指数、市场宽度、脱敏公告和多源资讯。</span></p><p><Icon name="close" size={17} /><span><strong>不会发送</strong>持仓证券代码、证券名称、成本、数量、持有/收益金额、交易流水明细、设备标识或 Cookie。</span></p></div>
        <div className="dialog-actions"><button className="secondary-button" type="button" disabled={sending} onClick={() => dialogRef.current?.close()}>取消</button><button ref={confirmRef} className="primary-button" type="button" disabled={sending} onClick={() => void confirm()}>{sending ? "联合研判中…" : "同意并开始研判"}</button></div>
      </div>
    </dialog>
  );
}

function UtilityDialog({ view, onClose }: { view: Exclude<UtilityView, null>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = {
    help: { title: "使用说明", body: "先添加持仓，行情与相关公告会自动同步。AI 联合研判会在每次确认匿名发送范围后开始；缺失数据不会用演示值代替。" },
    settings: { title: "同步设置", body: "A 股和美股在各自交易时段每 30 秒同步，其他时段每 5 分钟；页面转到后台会暂停，回来立即更新；手动刷新间隔 30 秒。" },
    account: { title: "账号同步", body: "持仓、交易流水、股票自选和美股自选会随账号同步到其他设备；退出后需重新登录才能访问。" },
  }[view];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.close();
      }
    };
    dialog.showModal();
    dialog.addEventListener("keydown", closeOnEscape);
    return () => dialog.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog utility-dialog"
      aria-labelledby="utility-title"
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); dialogRef.current?.close(); }}
    >
      <div className="dialog-surface"><div className="dialog-head"><div><h2 id="utility-title">{copy.title}</h2><p>{copy.body}</p></div><button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label={`关闭${copy.title}`}><Icon name="close" /></button></div><div className="dialog-actions"><button className="primary-button" type="button" onClick={() => dialogRef.current?.close()}>知道了</button></div></div>
    </dialog>
  );
}

function AuthDialog({ auth, onClose, onAuthChange }: { auth: AuthState; onClose: () => void; onAuthChange: (next: AuthState) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); dialog.close(); } };
    dialog.showModal();
    dialog.addEventListener("keydown", closeOnEscape);
    return () => dialog.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) { setError("两次输入的密码不一致。"); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const payload = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || `${mode === "login" ? "登录" : "注册"}失败。`);
      onAuthChange({ authenticated: true, user: payload.user, sync: "account" });
      dialogRef.current?.close();
      window.location.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试。"); }
    finally { setSaving(false); }
  }

  async function logout() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("退出登录失败，请稍后重试。");
      onAuthChange({ authenticated: false, user: null, sync: "device" });
      dialogRef.current?.close();
      window.location.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "退出登录失败。"); }
    finally { setSaving(false); }
  }

  return (
    <dialog ref={dialogRef} className="dialog utility-dialog" aria-labelledby="auth-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); if (!saving) dialogRef.current?.close(); }}>
      <div className="dialog-surface">
        <div className="dialog-head"><div><h2 id="auth-title">{auth.authenticated ? "账号同步" : mode === "login" ? "登录股基罗盘" : "创建同步账号"}</h2><p>{auth.authenticated ? "持仓、交易流水、股票自选和美股自选已随账号保存，其他设备登录同一账号即可查看。" : "登录后，持仓、交易流水、股票自选和美股自选会同步到其他设备；当前设备数据会合并到账号，原匿名副本保留。"}</p></div><button className="icon-button" type="button" disabled={saving} onClick={() => dialogRef.current?.close()} aria-label="关闭账号同步"><Icon name="close" /></button></div>
        {auth.authenticated ? <div className="account-summary"><p className="account-email">{auth.user?.email}</p><p className="form-hint">已开启跨设备同步。退出后将回到登录页，未登录不能访问持仓和研究数据。</p><div className="dialog-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => dialogRef.current?.close()}>关闭</button><button className="primary-button" type="button" disabled={saving} onClick={() => void logout()}>{saving ? "退出中…" : "退出账号"}</button></div></div> : <form onSubmit={(event) => void submit(event)}><label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label><label>密码<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" minLength={8} required /></label>{mode === "register" ? <label>确认密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" minLength={8} required /></label> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "首次使用？注册" : "已有账号？登录"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "处理中…" : mode === "login" ? "登录并同步" : "注册并同步"}</button></div></form>}
      </div>
    </dialog>
  );
}

function ForcedLoginScreen({ onAuthChange }: { onAuthChange: (next: AuthState) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || `${mode === "login" ? "登录" : "注册"}失败。`);
      onAuthChange({ authenticated: true, user: payload.user, sync: "account" });
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-gate" aria-labelledby="forced-auth-title">
      <section className="auth-gate-card">
        <div className="auth-gate-brand"><CompassMark /><div><strong>股基罗盘</strong><span>个人研究工作台</span></div></div>
        <div className="dialog-head"><div><h1 id="forced-auth-title">{mode === "login" ? "登录股基罗盘" : "创建研究账号"}</h1><p>登录后才能查看、添加和分析持仓；数据会随账号安全同步到其他设备。</p></div></div>
        <form onSubmit={(event) => void submit(event)}>
          <label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
          <label>密码<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" minLength={8} required /></label>
          {mode === "register" ? <label>确认密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" minLength={8} required /></label> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "首次使用？注册" : "已有账号？登录"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "处理中…" : mode === "login" ? "登录并继续" : "注册并继续"}</button></div>
        </form>
        <p className="auth-gate-note"><Icon name="info" size={15} />持仓、交易流水、自选和 AI 分析均需要登录账号。</p>
      </section>
    </main>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [query, setQuery] = useState("");
  const [lastRequested, setLastRequested] = useState("尚未请求");
  const [refreshRemaining, setRefreshRemaining] = useState(0);
  const [manualRefreshVersion, setManualRefreshVersion] = useState(0);
  const [holdings, setHoldings] = useState(initialHoldings);
  const [holdingStatus, setHoldingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [marketStatus, setMarketStatus] = useState<DataStatus>("loading");
  const [aMarket, setAMarket] = useState<AMarketOverview | null>(null);
  const [marketSourceStatus, setMarketSourceStatus] = useState<MarketSourceStatus[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [marketNews, setMarketNews] = useState<MarketNewsItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [newsStatus, setNewsStatus] = useState<DataStatus>("loading");
  const [noticeStatus, setNoticeStatus] = useState<DataStatus>("idle");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [evidencePackage, setEvidencePackage] = useState<Record<string, unknown> | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<DataStatus>("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [utilityView, setUtilityView] = useState<UtilityView>(null);
  const [auth, setAuth] = useState<AuthState>({ authenticated: false, user: null, sync: "device" });
  const [authReady, setAuthReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const addTriggerRef = useRef<HTMLElement | null>(null);

  const activeLabel = useMemo(() => navItems.find((item) => item.id === activeSection)?.label ?? "首页", [activeSection]);
  const today = useMemo(() => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("/", "."), []);
  const refreshLabel = refreshRemaining > 0 ? `${Math.floor(refreshRemaining / 60)}:${String(refreshRemaining % 60).padStart(2, "0")}` : "刷新";
  const stripIndices = useMemo(() => [
    { name: "上证", code: "000001" },
    { name: "深证", code: "399001" },
    { name: "创业板", code: "399006" },
  ].map((item) => ({ ...item, quote: quotes.find((quote) => quote.type === "指数" && quote.code === item.code) })), [quotes]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json() as Promise<{ authenticated?: boolean; user?: AuthUser | null; sync?: "account" | "device" }>)
      .then((payload) => {
        if (!cancelled) setAuth({ authenticated: Boolean(payload.authenticated), user: payload.user ?? null, sync: payload.sync === "account" ? "account" : "device" });
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = themeMode === "auto" ? (media.matches ? "dark" : "light") : themeMode;
      document.documentElement.dataset.theme = resolved;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  useEffect(() => {
    if (!auth.authenticated) return;
    let cancelled = false;
    async function loadHoldings() {
      try {
        const response = await fetch("/api/holdings", { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json() as { holdings?: Holding[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "持仓读取失败。");
        if (!cancelled) {
          setHoldings(payload.holdings ?? []);
          setHoldingStatus("ready");
        }
      } catch {
        if (!cancelled) setHoldingStatus("error");
      }
    }
    void loadHoldings();
    return () => { cancelled = true; };
  }, [auth.authenticated]);

  useEffect(() => {
    if (!auth.authenticated) return;
    let cancelled = false;
    fetch("/api/health", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { checks?: HealthCheck[] };
        if (response.ok && !cancelled) setHealthChecks(payload.checks ?? []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [auth.authenticated]);

  const loadMarket = useCallback(async (currentHoldings: Holding[]) => {
    try {
      const response = await fetch("/api/market", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: currentHoldings.map(({ code, type }) => ({ code, type })), includeAMarket: true }),
      });
      const payload = await response.json() as { quotes?: Quote[]; aMarket?: AMarketOverview | null; sourceStatus?: MarketSourceStatus[]; retrievedAt?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "行情同步失败。");
      const nextQuotes = payload.quotes ?? [];
      setQuotes(nextQuotes);
      setAMarket(payload.aMarket ?? null);
      setMarketSourceStatus(payload.sourceStatus ?? []);
      setMarketStatus(nextQuotes.some((quote) => quote.status === "ok") || (payload.aMarket?.coverage && payload.aMarket.coverage !== "不可用") ? "ready" : "error");
      if (payload.retrievedAt) setLastRequested(new Date(payload.retrievedAt).toLocaleTimeString("zh-CN", { hour12: false }));
    } catch {
      setMarketStatus("error");
    }
  }, []);

  const loadMarketNews = useCallback(async () => {
    try {
      const response = await fetch("/api/news", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { items?: MarketNewsItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "市场快讯同步失败。");
      setMarketNews(payload.items ?? []);
      setNewsStatus((payload.items?.length ?? 0) > 0 ? "ready" : "error");
    } catch {
      setNewsStatus("error");
    }
  }, []);

  const loadNotices = useCallback(async (currentHoldings: Holding[]) => {
    const codes = currentHoldings.filter((holding) => holding.type !== "场外基金").map((holding) => holding.code);
    if (codes.length === 0) {
      setNotices([]);
      setNoticeStatus("ready");
      return;
    }
    setNoticeStatus("loading");
    try {
      const response = await fetch("/api/news", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const payload = await response.json() as { items?: NoticeItem[]; errors?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "公告同步失败。");
      setNotices(payload.items ?? []);
      setNoticeStatus((payload.errors?.length ?? 0) > 0 && (payload.items?.length ?? 0) === 0 ? "error" : "ready");
    } catch {
      setNoticeStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!auth.authenticated) return;
    const immediate = window.setTimeout(() => { void loadMarketNews(); }, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void loadMarketNews(); }, IDLE_MARKET_REFRESH_MS);
    const handleVisibility = () => { if (!document.hidden) void loadMarketNews(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auth.authenticated, loadMarketNews]);

  useEffect(() => {
    if (holdingStatus !== "ready") return;
    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;

    function clearTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = window.setTimeout(() => { void refreshNow(); }, marketRefreshInterval("a"));
    }

    async function refreshNow() {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      try {
        await loadMarket(holdings);
      } finally {
        inFlight = false;
        schedule();
      }
    }

    function handleVisibility() {
      if (document.hidden) clearTimer();
      else void refreshNow();
    }

    void refreshNow();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [holdingStatus, holdings, loadMarket]);

  useEffect(() => {
    if (holdingStatus !== "ready") return;
    const immediate = window.setTimeout(() => { void loadNotices(holdings); }, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void loadNotices(holdings); }, IDLE_MARKET_REFRESH_MS);
    const handleVisibility = () => { if (!document.hidden) void loadNotices(holdings); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [holdingStatus, holdings, loadNotices]);

  useEffect(() => {
    if (refreshRemaining <= 0) return;
    const timer = window.setInterval(() => setRefreshRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [refreshRemaining]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const lastManualRefresh = Number(window.localStorage.getItem("glp_manual_refresh_at") || 0);
      if (!Number.isFinite(lastManualRefresh) || lastManualRefresh <= 0) return;
      setRefreshRemaining(Math.max(0, Math.ceil((lastManualRefresh + MANUAL_REFRESH_COOLDOWN_MS - Date.now()) / 1000)));
      setLastRequested(new Date(lastManualRefresh).toLocaleTimeString("zh-CN", { hour12: false }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function changeSection(section: Section) {
    setActiveSection(section);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAdd() {
    addTriggerRef.current = document.activeElement as HTMLElement;
    setShowAdd(true);
  }

  function closeAdd() {
    setShowAdd(false);
    window.requestAnimationFrame(() => addTriggerRef.current?.focus());
  }

  async function refreshMarket() {
    if (refreshRemaining > 0) return;
    const requestedAt = Date.now();
    window.localStorage.setItem("glp_manual_refresh_at", String(requestedAt));
    setLastRequested(new Date(requestedAt).toLocaleTimeString("zh-CN", { hour12: false }));
    setRefreshRemaining(MANUAL_REFRESH_COOLDOWN_MS / 1000);
    setManualRefreshVersion((value) => value + 1);
    setStatusMessage("正在同步行情、市场快讯与持仓公告。");
    await Promise.all([loadMarket(holdings), loadMarketNews(), loadNotices(holdings)]);
    setStatusMessage("行情与资讯已完成本次同步；手动刷新 30 秒后可再次使用。");
  }

  function cycleTheme() {
    setThemeMode((current) => current === "auto" ? "light" : current === "light" ? "dark" : "auto");
  }

  async function requestAnonymousAnalysis() {
    setAnalysisStatus("loading");
    setAnalysisError("");
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const payload = await response.json() as { analysis?: Analysis; error?: string };
      if (!response.ok || !payload.analysis) throw new Error(payload.error || "AI 分析失败。");
      let nextAnalysis = payload.analysis;
      try {
        const evidenceResponse = await fetch("/api/analysis", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "evidence" }),
        });
        const localEvidence = await evidenceResponse.json() as Record<string, unknown>;
        if (evidenceResponse.ok) {
          setEvidencePackage(localEvidence);
          const notices = (localEvidence.notices ?? {}) as Record<string, unknown>;
          const transactions = (localEvidence.transactions ?? {}) as Record<string, unknown>;
          const localCoverage = Array.isArray(localEvidence.coverage) ? localEvidence.coverage as AnalysisEvidenceCoverage[] : payload.analysis.evidence?.coverage;
          const quoteCoverage = localCoverage?.find((item) => item.key === "quotes");
          const historyCoverage = localCoverage?.find((item) => item.key === "history");
          nextAnalysis = {
            ...payload.analysis,
            evidence: {
              ...(payload.analysis.evidence ?? { quoteCount: 0, noticeCount: 0, similarHistorySampleSize: null, sources: [], asOf: payload.analysis.evidenceAsOf }),
              quoteCount: Number(quoteCoverage?.available ?? payload.analysis.evidence?.quoteCount ?? 0),
              noticeCount: Number(notices.count ?? payload.analysis.evidence?.noticeCount ?? 0),
              transactionCount: Number(transactions.count ?? 0),
              similarHistorySampleSize: payload.analysis.evidence?.similarHistorySampleSize ?? historyCoverage?.available ?? null,
              coverage: localCoverage,
              missingCategories: Array.isArray(localEvidence.missingCategories) ? localEvidence.missingCategories.filter((item): item is string => typeof item === "string") : payload.analysis.evidence?.missingCategories,
              sources: Array.isArray(localEvidence.sources) ? localEvidence.sources.filter((item): item is string => typeof item === "string") : payload.analysis.evidence?.sources ?? [],
              asOf: payload.analysis.evidence?.asOf ?? payload.analysis.evidenceAsOf,
            },
          };
        }
      } catch {
        // AI 分析已成功时，本地证据包失败不阻断分析结果。
      }
      setAnalysis(nextAnalysis);
      setAnalysisStatus("ready");
      setStatusMessage("AI 分析小组已综合公开市场与逐只匿名持仓证据；敏感持仓数字和流水明细只保存在本地证据包中。");
    } catch (reason) {
      setAnalysisStatus("error");
      setAnalysisError(reason instanceof Error ? reason.message : "AI 分析失败，请稍后重试。");
    }
  }

  async function copyEvidencePackage() {
    if (!analysis?.evidence) return;
    const packageData = evidencePackage ?? {
      packageVersion: "1.0",
      generatedAt: analysis.generatedAt,
      evidenceAsOf: analysis.evidenceAsOf,
      quoteCount: analysis.evidence.quoteCount,
      noticeCount: analysis.evidence.noticeCount,
      transactionCount: analysis.evidence.transactionCount,
      riskMetrics: analysis.evidence.riskMetrics,
      similarHistorySampleSize: analysis.evidence.similarHistorySampleSize,
      sources: analysis.evidence.sources,
      disclaimer: analysis.disclaimer,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(packageData, null, 2));
      setStatusMessage("这次分析使用的数据明细 JSON 已复制。");
    } catch {
      setStatusMessage("当前浏览器不允许复制数据明细，请使用 HTTPS 或手动查看分析结果。");
    }
  }

  async function addHolding(holding: Holding) {
    const response = await fetch("/api/holdings", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(holding),
    });
    const payload = await response.json() as { holding?: Holding; error?: string };
    if (!response.ok || !payload.holding) throw new Error(payload.error || "持仓保存失败。");
    setHoldings((current) => [payload.holding as Holding, ...current.filter((item) => !(item.code === payload.holding?.code && item.type === payload.holding?.type))]);
    setHoldingStatus("ready");
    setAnalysis(null);
    setEvidencePackage(null);
    setAnalysisStatus("idle");
    setAnalysisError("");
    setStatusMessage(`${holding.name}已保存到本设备的私有持仓空间。`);
  }

  async function removeHolding(holding: Holding) {
    if (!holding.id) return;
    const response = await fetch("/api/holdings", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: holding.id }),
    });
    if (!response.ok) {
      setStatusMessage(`${holding.name}删除失败，请稍后重试。`);
      return;
    }
    setHoldings((current) => current.filter((item) => item.id !== holding.id));
    setAnalysis(null);
    setEvidencePackage(null);
    setAnalysisStatus("idle");
    setAnalysisError("");
    setStatusMessage(`${holding.name}已从持仓中删除。`);
  }

  if (!authReady) {
    return <main className="auth-loading" aria-live="polite">正在检查登录状态…</main>;
  }
  if (!auth.authenticated) {
    return <ForcedLoginScreen onAuthChange={setAuth} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><CompassMark /><div><strong>股基罗盘</strong><span>个人研究工作台</span></div></div>
        <nav aria-label="主导航">
          {navItems.map((item) => <button aria-current={activeSection === item.id ? "page" : undefined} aria-label={item.ariaLabel ?? item.label} className={activeSection === item.id ? "active" : ""} type="button" key={item.id} onClick={() => changeSection(item.id)}><span className="nav-symbol">{item.short}</span><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-status"><div><span className="status-dot" /><strong>{auth.authenticated ? "账号同步已接入" : holdingStatus === "error" ? "持仓库连接异常" : "需要登录账号"}</strong></div><p>{auth.authenticated ? "已同步到账号 · 多设备可用" : "登录后才能访问私有数据"}<br />交易时段行情每 30 秒更新</p></div>
        <div className="sidebar-foot"><button type="button" onClick={() => setUtilityView("help")}><Icon name="help" size={17} />使用说明</button><button type="button" onClick={() => setUtilityView("settings")}><Icon name="settings" size={17} />同步设置</button><p>仅供个人研究参考</p></div>
      </aside>

      <main className="main-area">
        <div className="market-strip" aria-label="市场快照">
          {stripIndices.map(({ name, code, quote }) => <span key={code}><b>{name}</b><strong>{formatNumber(quote?.price ?? null)}</strong><em className={(quote?.changePercent ?? 0) >= 0 ? "up-text" : "down-text"}>{formatPercent(quote?.changePercent ?? null)}</em></span>)}<span className="market-note">{marketStatus === "ready" ? "真实行情" : marketStatus === "error" ? "行情异常" : "同步中"}</span>
        </div>
        <header className="topbar">
          <div className="mobile-brand"><CompassMark compact /><strong>股基罗盘</strong></div>
          <div className="page-title"><span>{today} · {activeLabel}</span><h1>{activeSection === "home" ? "我的持仓" : activeSection === "market" ? "A 股行情" : activeSection === "stocks" ? "股票分析" : activeSection === "funds" ? "基金分析" : activeSection === "news" ? "实时资讯" : "美股观察"}</h1></div>
          <div className="top-actions">
            {activeSection === "home" ? <label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索持仓" aria-label="搜索持仓代码或名称" /></label> : null}
            <div className="update-state"><span>上次请求</span><strong>{lastRequested}</strong></div>
            <button className="refresh-button" type="button" onClick={() => void refreshMarket()} disabled={refreshRemaining > 0} aria-label={refreshRemaining > 0 ? `距离下次手动刷新还有${refreshLabel}` : "请求同步行情"}><Icon name="refresh" size={17} /><span>{refreshLabel}</span></button>
            <button className="theme-button" type="button" onClick={cycleTheme} aria-label="切换主题"><Icon name="theme" size={17} /><span>{themeMode === "auto" ? "自动" : themeMode === "light" ? "浅色" : "深色"}</span></button>
            <button className="icon-button account-button" type="button" aria-label="打开账户信息" onClick={() => setUtilityView("account")}><Icon name="account" size={18} /></button>
          </div>
        </header>

        <div className="content-area">
          {activeSection === "home" ? <HomeDashboard holdings={holdings} quotes={quotes} query={query} onAdd={openAdd} onOpenNews={() => changeSection("news")} onRemove={removeHolding} holdingStatus={holdingStatus} marketStatus={marketStatus} marketSourceStatus={marketSourceStatus} healthChecks={healthChecks} newsStatus={newsStatus} notices={notices} marketNews={marketNews} analysis={analysis} analysisStatus={analysisStatus} analysisError={analysisError} onAnalyze={() => setShowAiConsent(true)} onCopyEvidence={() => void copyEvidencePackage()} /> : null}
          {activeSection === "market" ? <MarketPage quotes={quotes} status={marketStatus} overview={aMarket} sourceStatus={marketSourceStatus} /> : null}
          {activeSection === "stocks" ? <StocksPage holdings={holdings} quotes={quotes} onAdd={openAdd} refreshVersion={manualRefreshVersion} /> : null}
          {activeSection === "funds" ? <FundsPage holdings={holdings} quotes={quotes} onAdd={openAdd} /> : null}
          {activeSection === "news" ? <NewsPage marketNews={marketNews} notices={notices} status={newsStatus} noticeStatus={noticeStatus} /> : null}
          {activeSection === "us" ? <UsPage refreshVersion={manualRefreshVersion} /> : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="手机主导航">{navItems.map((item) => <button aria-current={activeSection === item.id ? "page" : undefined} aria-label={item.ariaLabel ?? item.label} className={activeSection === item.id ? "active" : ""} key={item.id} type="button" onClick={() => changeSection(item.id)}><span>{item.short}</span><small>{item.label}</small></button>)}</nav>
      {showAdd ? <AddHoldingDialog onClose={closeAdd} onSubmit={addHolding} /> : null}
      {showAiConsent ? <AiConsentDialog onClose={() => setShowAiConsent(false)} onConfirm={requestAnonymousAnalysis} /> : null}
      {utilityView === "account" ? <AuthDialog auth={auth} onClose={() => setUtilityView(null)} onAuthChange={setAuth} /> : utilityView ? <UtilityDialog view={utilityView} onClose={() => setUtilityView(null)} /> : null}
      <div className="sr-only" role="status" aria-live="polite">{statusMessage}</div>
    </div>
  );
}
