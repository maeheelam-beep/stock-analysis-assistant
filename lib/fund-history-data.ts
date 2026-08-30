type FundNavPoint = { date: string; nav: number };
type FundHistoryMatch = { endDate: string; similarity: number; return5d: number | null; return20d: number | null; maxDrawdown20d: number | null };

export type FundHistorySimilarity = {
  code: string;
  name: string;
  source: string;
  sourceUrl: string;
  asOf: string | null;
  windowDays: number;
  sampleSize: number;
  observationCount: number;
  status: "available" | "insufficient";
  stats: { upRatio5d: number | null; averageReturn5d: number | null; upRatio20d: number | null; averageReturn20d: number | null; worstDrawdown20d: number | null };
  riskMetrics: {
    observationCount: number;
    annualizedVolatility: number | null;
    maxDrawdown: number | null;
    valueAtRisk95: number | null;
    downsideDeviation: number | null;
    winRate: number | null;
    riskLevel: "低" | "中" | "高" | "未知";
  };
  matches: FundHistoryMatch[];
  note: string;
};

const FUND_HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const fundHistoryCache = new Map<string, { expiresAt: number; value?: FundHistorySimilarity; pending?: Promise<FundHistorySimilarity> }>();

function correlation(a: number[], b: number[]) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    numerator += deltaA * deltaB;
    varianceA += deltaA ** 2;
    varianceB += deltaB ** 2;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator === 0 ? 0 : numerator / denominator;
}

function forwardReturn(points: FundNavPoint[], index: number, days: number) {
  const current = points[index];
  const future = points[index + days];
  if (!current || !future || current.nav === 0) return null;
  return ((future.nav / current.nav) - 1) * 100;
}

function maxDrawdown(points: FundNavPoint[], start: number, days: number) {
  const window = points.slice(start, start + days + 1);
  if (window.length < 2) return null;
  let peak = window[0].nav;
  let worst = 0;
  for (const point of window) {
    peak = Math.max(peak, point.nav);
    worst = Math.min(worst, ((point.nav / peak) - 1) * 100);
  }
  return worst;
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? null;
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (index - lower);
}

function trailingMaxDrawdown(points: FundNavPoint[]) {
  if (points.length < 2) return null;
  let peak = points[0].nav;
  let worst = 0;
  for (const point of points) {
    peak = Math.max(peak, point.nav);
    worst = Math.min(worst, (point.nav / peak - 1) * 100);
  }
  return worst;
}

function calculateFundRisk(points: FundNavPoint[], returns: number[]): FundHistorySimilarity["riskMetrics"] {
  const recentPoints = points.slice(-521);
  const recentReturns = returns.slice(-520).filter((value) => Number.isFinite(value) && Math.abs(value) <= 30);
  const dailyVolatility = standardDeviation(recentReturns);
  const annualizedVolatility = dailyVolatility === null ? null : dailyVolatility * Math.sqrt(250);
  const downside = recentReturns.map((value) => Math.min(0, value));
  const downsideDeviation = downside.length ? Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length) * Math.sqrt(250) : null;
  const drawdown = trailingMaxDrawdown(recentPoints);
  const valueAtRisk95 = percentile(recentReturns, 0.05);
  const scoreParts = [
    annualizedVolatility === null ? null : Math.min(100, annualizedVolatility * 3),
    drawdown === null ? null : Math.min(100, Math.abs(drawdown) * 2),
    valueAtRisk95 === null ? null : Math.min(100, Math.abs(valueAtRisk95) * 8),
  ].filter((value): value is number => value !== null);
  const riskScore = scoreParts.length ? scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length : null;
  return {
    observationCount: recentReturns.length,
    annualizedVolatility,
    maxDrawdown: drawdown,
    valueAtRisk95,
    downsideDeviation,
    winRate: recentReturns.length ? recentReturns.filter((value) => value > 0).length / recentReturns.length : null,
    riskLevel: riskScore === null ? "未知" : riskScore >= 67 ? "高" : riskScore >= 34 ? "中" : "低",
  };
}

function formatShanghaiDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseFundNetWorthScript(script: string) {
  const name = script.match(/var\s+fS_name\s*=\s*"([^"]+)"/)?.[1] || "";
  const trendText = script.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/)?.[1];
  if (!trendText) return { name, points: [] as FundNavPoint[] };
  let rows: Array<{ x?: unknown; y?: unknown }> = [];
  try { rows = JSON.parse(trendText) as Array<{ x?: unknown; y?: unknown }>; } catch { return { name, points: [] as FundNavPoint[] }; }
  const points = rows.flatMap((row) => {
    const timestamp = Number(row.x);
    const nav = Number(row.y);
    if (!Number.isFinite(timestamp) || !Number.isFinite(nav) || nav <= 0) return [];
    return [{ date: formatShanghaiDate(timestamp), nav }];
  });
  return { name, points };
}

export function calculateFundHistorySimilarity(code: string, name: string, allPoints: FundNavPoint[]): FundHistorySimilarity {
  const sourceUrl = `https://fund.eastmoney.com/${code}.html`;
  const points = allPoints.slice(-780);
  const shapeLength = 15;
  if (points.length < 100) throw new Error("基金历史净值样本不足 100 个开放日。");
  const returns = points.slice(1).map((point, index) => ((point.nav / points[index].nav) - 1) * 100);
  const currentShape = returns.slice(-shapeLength);
  const candidates: Array<{ endIndex: number; similarity: number }> = [];
  const latestStart = returns.length - shapeLength - 25;
  for (let start = shapeLength; start <= latestStart; start += 1) {
    candidates.push({ endIndex: start, similarity: correlation(currentShape, returns.slice(start - shapeLength, start)) });
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  const selected: Array<{ endIndex: number; similarity: number }> = [];
  for (const candidate of candidates) {
    if (candidate.similarity < 0.55) break;
    if (selected.every((item) => Math.abs(item.endIndex - candidate.endIndex) >= shapeLength)) selected.push(candidate);
    if (selected.length === 8) break;
  }
  const matches = selected.map((item) => ({
    endDate: points[item.endIndex]?.date || "",
    similarity: item.similarity,
    return5d: forwardReturn(points, item.endIndex, 5),
    return20d: forwardReturn(points, item.endIndex, 20),
    maxDrawdown20d: maxDrawdown(points, item.endIndex, 20),
  }));
  const valid5d = matches.map((item) => item.return5d).filter((value): value is number => value !== null);
  const valid20d = matches.map((item) => item.return20d).filter((value): value is number => value !== null);
  const riskMetrics = calculateFundRisk(points, returns);
  return {
    code,
    name: name || code,
    source: "天天基金公开历史净值",
    sourceUrl,
    asOf: points.at(-1)?.date || null,
    windowDays: shapeLength,
    sampleSize: matches.length,
    observationCount: points.length,
    status: matches.length >= 3 ? "available" : "insufficient",
    stats: {
      upRatio5d: valid5d.length ? valid5d.filter((value) => value > 0).length / valid5d.length : null,
      averageReturn5d: average(matches.map((item) => item.return5d)),
      upRatio20d: valid20d.length ? valid20d.filter((value) => value > 0).length / valid20d.length : null,
      averageReturn20d: average(matches.map((item) => item.return20d)),
      worstDrawdown20d: matches.length ? Math.min(...matches.map((item) => item.maxDrawdown20d ?? 0)) : null,
    },
    riskMetrics,
    matches,
    note: "相似度只比较最近 15 个开放日的单位净值日收益形态；最多回看 780 个开放日，样本少于 3 个时不输出统计结论。历史相似不代表未来表现。",
  };
}

async function loadFundHistorySimilarity(code: string, fallbackName: string) {
  const sourceUrl = `https://fund.eastmoney.com/${encodeURIComponent(code)}.html`;
  const scriptUrl = `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js?v=${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const response = await fetch(scriptUrl, { headers: { Accept: "text/javascript", Referer: sourceUrl, "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`基金历史净值响应 ${response.status}`);
  const parsed = parseFundNetWorthScript(await response.text());
  return calculateFundHistorySimilarity(code, parsed.name || fallbackName, parsed.points);
}

export async function fetchFundHistorySimilarity(code: string, fallbackName = "") {
  const current = fundHistoryCache.get(code);
  if (current?.value && current.expiresAt > Date.now()) return current.value;
  if (current?.pending) return current.pending;
  const pending = loadFundHistorySimilarity(code, fallbackName)
    .then((value) => {
      fundHistoryCache.set(code, { value, expiresAt: Date.now() + FUND_HISTORY_CACHE_TTL_MS });
      return value;
    })
    .catch((error) => {
      fundHistoryCache.delete(code);
      throw error;
    });
  fundHistoryCache.set(code, { pending, expiresAt: Date.now() + FUND_HISTORY_CACHE_TTL_MS });
  return pending;
}
