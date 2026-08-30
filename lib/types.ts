export type HoldingKind = "股票" | "ETF" | "场外基金";

export type VerificationStatus = "verified" | "single" | "conflict";

export type PortfolioTransactionSide = "买入" | "卖出" | "分红" | "费用" | "期初";

export type PortfolioTransaction = {
  id: number;
  code: string;
  name: string;
  type: HoldingKind;
  side: PortfolioTransactionSide;
  quantity: string | null;
  price: string | null;
  amount: string;
  fee: string;
  occurredAt: number;
  note: string | null;
  createdAt: number;
};

export type HoldingRecord = {
  id: number;
  code: string;
  name: string;
  type: HoldingKind;
  cost: string;
  quantity: string;
  holdingAmount: string | null;
  holdingProfit: string | null;
  createdAt: number;
  updatedAt: number;
};

export type UsWatchlistRecord = {
  id: number;
  symbol: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type StockWatchlistRecord = {
  id: number;
  code: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Quote = {
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

export type MarketSourceStatus = {
  source: string;
  status: "ok" | "stale" | "unavailable";
  retrievedAt: string;
  coverage: string;
  sourceCount?: number;
  verification?: VerificationStatus;
  error?: string;
};

export type NoticeItem = {
  id: string;
  code: string;
  title: string;
  publishedAt: string;
  source: string;
  url: string;
  category: "公告";
};

export type MarketNewsItem = {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  source: string;
  url: string;
  category: "快讯" | "政策";
  sources: Array<{ name: string; url: string }>;
  sourceCount: number;
};

export type UsRankItem = {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  source: string;
};

export type AStockRankItem = {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  source: string;
};

export type ASectorItem = {
  code: string;
  name: string;
  changePercent: number;
  amount: number | null;
  source: string;
};

export type AMarketOverview = {
  coverage: "全市场" | "实时排行" | "不可用";
  breadthAvailable: boolean;
  breadthSampleSize: number;
  upCount: number;
  flatCount: number;
  downCount: number;
  limitUpCount: number;
  limitDownCount: number;
  totalAmount: number | null;
  active: AStockRankItem[];
  gainers: AStockRankItem[];
  losers: AStockRankItem[];
  sectors: ASectorItem[];
  sectorTotal: number | null;
  source: string;
};

export type PortfolioAnalysis = {
  summary: string;
  stance: string;
  score: number | null;
  riskLevel: "低" | "中" | "高" | "未知";
  expertPanel: Array<{
    role: "盘面观察员" | "持仓研究员" | "风险把关员";
    conclusion: string;
    evidence: string;
  }>;
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
  evidence: {
    quoteCount: number;
    noticeCount: number;
    similarHistorySampleSize: number | null;
    transactionCount?: number;
    riskMetrics?: RiskMetrics | null;
    evidencePackageVersion?: string;
    coverage?: AnalysisEvidenceCoverage[];
    missingCategories?: string[];
    sources: string[];
    asOf: string;
  };
};

export type AnalysisEvidenceCoverage = {
  key: "quotes" | "indices" | "breadth" | "sectors" | "news" | "notices" | "fundamentals" | "fundResearch" | "history" | "risk";
  label: string;
  available: number;
  expected: number | null;
  asOf: string | null;
  sources: string[];
  note: string;
};

export type RiskMetrics = {
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

export type FundamentalSnapshot = {
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
  metrics: {
    peTtm: number | null;
    pb: number | null;
    psTtm: number | null;
    roe: number | null;
    revenueGrowth: number | null;
    profitGrowth: number | null;
    marketCap: number | null;
  };
  note: string;
};
