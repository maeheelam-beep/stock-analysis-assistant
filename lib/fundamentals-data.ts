import { env } from "cloudflare:workers";
import type { FundamentalSnapshot } from "@/lib/types";

const runtimeEnv = env as unknown as Record<string, string | undefined>;
const marketBase = (runtimeEnv.MARKET_API_BASE_URL || "https://push2.eastmoney.com").replace(/\/$/, "");

type FundamentalProviderSnapshot = {
  code: string;
  name: string;
  industry: string | null;
  source: string;
  sourceUrl: string;
  metrics: FundamentalSnapshot["metrics"];
};

type FinancialReportSnapshot = {
  reportAsOf: string | null;
  source: string;
  metrics: Pick<FundamentalSnapshot["metrics"], "roe" | "revenueGrowth" | "profitGrowth">;
};

const FUNDAMENTAL_CACHE_TTL_MS = 5 * 60 * 1000;
const fundamentalCache = new Map<string, { expiresAt: number; value?: FundamentalSnapshot; pending?: Promise<FundamentalSnapshot> }>();

function secid(code: string) {
  return `${/^[569]/.test(code) ? "1" : "0"}.${code}`;
}

function marketSymbol(code: string) {
  return `${/^[569]/.test(code) ? "sh" : "sz"}${code}`;
}

function secuCode(code: string) {
  const suffix = /^[48]/.test(code) ? "BJ" : /^[569]/.test(code) ? "SH" : "SZ";
  return `${code}.${suffix}`;
}

function numberValue(value: unknown, divisor = 1) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / divisor : null;
}

function emptyMetrics(): FundamentalSnapshot["metrics"] {
  return { peTtm: null, pb: null, psTtm: null, roe: null, revenueGrowth: null, profitGrowth: null, marketCap: null };
}

async function fetchEastmoneyFundamentals(code: string): Promise<FundamentalProviderSnapshot> {
  const url = new URL(`${marketBase}/api/qt/stock/get`);
  url.searchParams.set("secid", secid(code));
  url.searchParams.set("fields", "f57,f58,f43,f127,f162,f164,f167,f116,f117,f124");
  const response = await fetch(url.toString(), { headers: { "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`东方财富基本面响应 ${response.status}`);
  const payload = await response.json() as { data?: Record<string, unknown> | null };
  const data = payload.data || {};
  const metrics = { ...emptyMetrics(), peTtm: numberValue(data.f162, 100), psTtm: numberValue(data.f164, 100), pb: numberValue(data.f167, 100), marketCap: numberValue(data.f116) };
  if (Object.values(metrics).every((value) => value === null)) throw new Error("东方财富估值快照未返回有效指标。");
  return { code, name: String(data.f58 || code), industry: String(data.f127 || "").trim() || null, source: "东方财富估值快照", sourceUrl: `https://quote.eastmoney.com/${marketSymbol(code)}.html`, metrics };
}

async function fetchEastmoneyFinancialReport(code: string): Promise<FinancialReportSnapshot> {
  const url = new URL("https://datacenter.eastmoney.com/securities/api/data/v1/get");
  url.searchParams.set("reportName", "RPT_F10_FINANCE_MAINFINADATA");
  url.searchParams.set("columns", "REPORT_DATE,REPORT_DATE_NAME,ROEJQ,TOTALOPERATEREVETZ,PARENTNETPROFITTZ");
  url.searchParams.set("filter", `(SECUCODE="${secuCode(code)}")`);
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("sortTypes", "-1");
  url.searchParams.set("sortColumns", "REPORT_DATE");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`东方财富财报响应 ${response.status}`);
  const payload = await response.json() as { result?: { data?: Array<Record<string, unknown>> } | null };
  const row = payload.result?.data?.[0];
  if (!row) throw new Error("东方财富最新财报未返回有效数据。");
  const metrics = {
    roe: numberValue(row.ROEJQ),
    revenueGrowth: numberValue(row.TOTALOPERATEREVETZ),
    profitGrowth: numberValue(row.PARENTNETPROFITTZ),
  };
  if (Object.values(metrics).every((value) => value === null)) throw new Error("东方财富最新财报缺少可用指标。");
  return {
    reportAsOf: String(row.REPORT_DATE || row.REPORT_DATE_NAME || "").slice(0, 10) || null,
    source: "东方财富最新公开财报",
    metrics,
  };
}

export function parseTencentFundamentalRow(row: string, code: string): FundamentalProviderSnapshot {
  const fields = row.split("~");
  const totalMarketCapYi = numberValue(fields[45] || fields[44]);
  const metrics = {
    ...emptyMetrics(),
    peTtm: numberValue(fields[39]),
    pb: numberValue(fields[46]),
    marketCap: totalMarketCapYi === null ? null : totalMarketCapYi * 100_000_000,
  };
  if (Object.values(metrics).every((value) => value === null)) throw new Error("腾讯估值快照未返回有效指标。");
  return { code, name: code, industry: null, source: "腾讯估值快照", sourceUrl: `https://gu.qq.com/${marketSymbol(code)}/gp`, metrics };
}

async function fetchTencentFundamentals(code: string): Promise<FundamentalProviderSnapshot> {
  const symbol = marketSymbol(code);
  const response = await fetch(`https://qt.gtimg.cn/q=${symbol}`, { headers: { Accept: "text/plain", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`腾讯基本面响应 ${response.status}`);
  const row = (await response.text()).match(/="([^"]*)"/)?.[1];
  if (!row) throw new Error("腾讯估值快照格式异常。");
  return parseTencentFundamentalRow(row, code);
}

function relativeDeviation(left: number, right: number) {
  const denominator = Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);
  return Math.abs(left - right) / denominator * 100;
}

function mergeProviderSnapshots(code: string, snapshots: FundamentalProviderSnapshot[], financialReport: FinancialReportSnapshot | null): FundamentalSnapshot {
  const primary = snapshots[0];
  const secondary = snapshots[1];
  const sources = snapshots.map((snapshot) => snapshot.source);
  const metrics = emptyMetrics();
  for (const key of Object.keys(metrics) as Array<keyof FundamentalSnapshot["metrics"]>) {
    metrics[key] = snapshots.find((snapshot) => snapshot.metrics[key] !== null)?.metrics[key] ?? null;
  }
  if (financialReport) {
    metrics.roe = financialReport.metrics.roe;
    metrics.revenueGrowth = financialReport.metrics.revenueGrowth;
    metrics.profitGrowth = financialReport.metrics.profitGrowth;
  }
  const conflicts: string[] = [];
  if (primary && secondary) {
    const labels = { peTtm: "PE(TTM)", pb: "PB", marketCap: "总市值" } as const;
    for (const key of ["peTtm", "pb", "marketCap"] as const) {
      const left = primary.metrics[key];
      const right = secondary.metrics[key];
      if (left === null || right === null) continue;
      const deviation = relativeDeviation(left, right);
      if (deviation > 10) conflicts.push(`${labels[key]} 两源偏差 ${deviation.toFixed(1)}%`);
    }
  }
  const availableCount = Object.values(metrics).filter((value) => value !== null).length;
  const verification = snapshots.length < 2 ? "single" : conflicts.length ? "conflict" : "verified";
  return {
    code,
    name: snapshots.find((snapshot) => snapshot.name !== code)?.name || code,
    asOf: new Date().toISOString(),
    reportAsOf: financialReport?.reportAsOf ?? null,
    industry: snapshots.find((snapshot) => snapshot.industry)?.industry ?? null,
    source: [...sources, ...(financialReport ? [financialReport.source] : [])].join(" + "),
    sources: [...sources, ...(financialReport ? [financialReport.source] : [])],
    sourceCount: sources.length,
    verification,
    conflicts,
    sourceUrl: primary?.sourceUrl || `https://quote.eastmoney.com/${marketSymbol(code)}.html`,
    status: availableCount >= 2 ? "available" : availableCount ? "partial" : "unavailable",
    metrics,
    note: `${verification === "verified" ? "PE、PB 与总市值已进行公开双源交叉核验" : verification === "conflict" ? "公开来源存在差异，页面保留主源数值并披露冲突" : "本轮仅一个公开估值源可用"}；ROE、营收与利润增速来自最新公开财报，缺失时留空，不用演示值替代。`,
  };
}

async function loadFundamentalSnapshot(code: string): Promise<FundamentalSnapshot> {
  const [eastmoney, tencent, financialReport] = await Promise.allSettled([
    fetchEastmoneyFundamentals(code),
    fetchTencentFundamentals(code),
    fetchEastmoneyFinancialReport(code),
  ]);
  const valuationResults = [eastmoney, tencent];
  const snapshots = valuationResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!snapshots.length) {
    const errors = valuationResults.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "估值源请求失败"] : []);
    throw new Error(errors.join("；") || "两个公开估值源均不可用。");
  }
  return mergeProviderSnapshots(code, snapshots, financialReport.status === "fulfilled" ? financialReport.value : null);
}

export async function fetchFundamentalSnapshot(code: string): Promise<FundamentalSnapshot> {
  const current = fundamentalCache.get(code);
  if (current?.value && current.expiresAt > Date.now()) return current.value;
  if (current?.pending) return current.pending;
  const pending = loadFundamentalSnapshot(code).then((value) => {
    fundamentalCache.set(code, { value, expiresAt: Date.now() + FUNDAMENTAL_CACHE_TTL_MS });
    return value;
  }).catch((error) => {
    fundamentalCache.delete(code);
    throw error;
  });
  fundamentalCache.set(code, { expiresAt: 0, pending });
  return pending;
}
