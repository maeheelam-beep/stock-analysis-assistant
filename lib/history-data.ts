import { env } from "cloudflare:workers";

export type DailyPoint = { date: string; open: number; close: number; high: number; low: number; changePercent: number };
type Match = { endDate: string; similarity: number; return5d: number | null; return20d: number | null; maxDrawdown20d: number | null };
type HistoricalSeries = { name: string; points: DailyPoint[]; source: string; sources: string[]; sourceCount: number; verification: "verified" | "single" | "conflict"; deviationPercent: number | null };

const runtimeEnv = env as unknown as Record<string, string | undefined>;
const marketBase = (runtimeEnv.MARKET_API_BASE_URL || "https://push2.eastmoney.com").replace(/\/$/, "");
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const historyCache = new Map<string, { expiresAt: number; value?: HistoricalSeries; pending?: Promise<HistoricalSeries> }>();

function secid(code: string) {
  return `${/^[569]/.test(code) ? "1" : "0"}.${code}`;
}

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

function forwardReturn(points: DailyPoint[], index: number, days: number) {
  const future = points[index + days];
  const current = points[index];
  if (!future || !current || current.close === 0) return null;
  return ((future.close / current.close) - 1) * 100;
}

function maxDrawdown(points: DailyPoint[], start: number, days: number) {
  const window = points.slice(start, start + days + 1);
  if (window.length < 2) return null;
  let peak = window[0].close;
  let worst = 0;
  for (const point of window) {
    peak = Math.max(peak, point.close);
    worst = Math.min(worst, ((point.close / peak) - 1) * 100);
  }
  return worst;
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export async function fetchHistorySimilarity(code: string) {
  const { name, points, source, sources, sourceCount, verification, deviationPercent } = await fetchHistoricalPoints(code, 520);
  if (points.length < 100) throw new Error("历史行情样本不足 100 个交易日。");

  const shapeLength = 15;
  const returns = points.slice(1).map((point) => point.changePercent);
  const currentShape = returns.slice(-shapeLength);
  const candidates: Array<{ endIndex: number; similarity: number }> = [];
  const latestStart = returns.length - shapeLength - 25;
  for (let start = shapeLength; start <= latestStart; start += 1) {
    const shape = returns.slice(start - shapeLength, start);
    candidates.push({ endIndex: start, similarity: correlation(currentShape, shape) });
  }
  candidates.sort((a, b) => b.similarity - a.similarity);

  const selected: Array<{ endIndex: number; similarity: number }> = [];
  for (const candidate of candidates) {
    if (candidate.similarity < 0.55) break;
    if (selected.every((item) => Math.abs(item.endIndex - candidate.endIndex) >= shapeLength)) selected.push(candidate);
    if (selected.length === 8) break;
  }

  const matches: Match[] = selected.map((item) => ({
    endDate: points[item.endIndex]?.date || "",
    similarity: item.similarity,
    return5d: forwardReturn(points, item.endIndex, 5),
    return20d: forwardReturn(points, item.endIndex, 20),
    maxDrawdown20d: maxDrawdown(points, item.endIndex, 20),
  }));
  const valid5d = matches.map((item) => item.return5d).filter((value): value is number => value !== null);
  const valid20d = matches.map((item) => item.return20d).filter((value): value is number => value !== null);

  return {
    code,
    name,
    source,
    sources,
    sourceCount,
    verification,
    deviationPercent,
    asOf: points.at(-1)?.date || null,
    windowDays: shapeLength,
    sampleSize: matches.length,
    status: matches.length >= 3 ? "available" : "insufficient",
    stats: {
      upRatio5d: valid5d.length ? valid5d.filter((value) => value > 0).length / valid5d.length : null,
      averageReturn5d: average(matches.map((item) => item.return5d)),
      upRatio20d: valid20d.length ? valid20d.filter((value) => value > 0).length / valid20d.length : null,
      averageReturn20d: average(matches.map((item) => item.return20d)),
      worstDrawdown20d: matches.length ? Math.min(...matches.map((item) => item.maxDrawdown20d ?? 0)) : null,
    },
    matches,
    recent: points.slice(-60),
    note: "相似度仅比较最近 15 个交易日的日收益形态；样本少于 3 个时不输出统计结论。",
  };
}

export async function fetchHistoricalPoints(code: string, limit = 520) {
  const boundedLimit = Math.max(100, Math.min(1000, Math.round(limit)));
  const cacheKey = `${code}:${boundedLimit}`;
  const cached = historyCache.get(cacheKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;

  const pending = loadHistoricalPoints(code, boundedLimit)
    .then((value) => {
      historyCache.set(cacheKey, { value, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS });
      return value;
    })
    .catch((error) => {
      historyCache.delete(cacheKey);
      throw error;
    });
  historyCache.set(cacheKey, { expiresAt: 0, pending });
  return pending;
}

async function loadEastmoneyHistoricalPoints(code: string, limit: number): Promise<HistoricalSeries> {
  const url = new URL(`${marketBase.replace("push2.", "push2his.")}/api/qt/stock/kline/get`);
  url.searchParams.set("secid", secid(code));
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", "0");
  url.searchParams.set("end", "20500101");
  url.searchParams.set("lmt", String(limit));

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url.toString(), { headers: { "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error(`历史行情响应 ${response.status}`);
      const payload = await response.json() as { data?: { name?: string; klines?: string[] } };
      const points: DailyPoint[] = (payload.data?.klines ?? []).flatMap((line) => {
        const [date, open, close, high, low, , , , pct] = line.split(",");
        const numbers = [open, close, high, low, pct].map(Number);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || numbers.some((value) => !Number.isFinite(value)) || numbers.slice(0, 4).some((value) => value <= 0)) return [];
        return [{ date, open: numbers[0], close: numbers[1], high: numbers[2], low: numbers[3], changePercent: numbers[4] }];
      });
      if (points.length < 100) throw new Error("历史行情有效数据不足 100 个交易日。");
      return { name: payload.data?.name || code, points: points.slice(-limit), source: "东方财富复权日线", sources: ["东方财富复权日线"], sourceCount: 1, verification: "single", deviationPercent: null };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("历史行情请求失败。");
}

function tencentSymbol(code: string) {
  return `${/^[569]/.test(code) ? "sh" : "sz"}${code}`;
}

async function loadTencentHistoricalPoints(code: string, limit: number): Promise<HistoricalSeries> {
  const symbol = tencentSymbol(code);
  const url = new URL("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get");
  url.searchParams.set("param", `${symbol},day,,,${Math.min(1000, limit + 1)},qfq`);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`腾讯历史行情响应 ${response.status}`);
  const payload = await response.json() as { data?: Record<string, { qfqday?: string[][]; day?: string[][]; qt?: Record<string, string[]> }> };
  const data = payload.data?.[symbol];
  const rows = data?.qfqday ?? data?.day ?? [];
  const raw = rows.flatMap((row) => {
    const [date = "", open, close, high, low] = row;
    const values = [open, close, high, low].map(Number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || values.some((value) => !Number.isFinite(value) || value <= 0)) return [];
    return [{ date, open: values[0], close: values[1], high: values[2], low: values[3] }];
  });
  const points: DailyPoint[] = raw.slice(1).map((row, index) => {
    const previous = raw[index];
    return { ...row, changePercent: previous && previous.close > 0 ? ((row.close / previous.close) - 1) * 100 : 0 };
  }).slice(-limit);
  if (points.length < 100) throw new Error("腾讯历史行情有效数据不足 100 个交易日。");
  const qtName = data?.qt?.[symbol]?.[1];
  return { name: qtName || code, points, source: "腾讯前复权日线", sources: ["腾讯前复权日线"], sourceCount: 1, verification: "single", deviationPercent: null };
}

function reconcileHistoricalSeries(primary: HistoricalSeries, secondary: HistoricalSeries): HistoricalSeries {
  const secondaryByDate = new Map(secondary.points.map((point) => [point.date, point]));
  const latestCommon = [...primary.points].reverse().find((point) => secondaryByDate.has(point.date));
  const comparison = latestCommon ? secondaryByDate.get(latestCommon.date) : undefined;
  const deviationPercent = latestCommon && comparison && latestCommon.close > 0 ? Math.abs(latestCommon.close - comparison.close) / latestCommon.close * 100 : null;
  const sources = [...new Set([...primary.sources, ...secondary.sources])];
  return {
    ...primary,
    source: sources.join(" + "),
    sources,
    sourceCount: sources.length,
    verification: deviationPercent !== null && deviationPercent <= 0.5 ? "verified" : "conflict",
    deviationPercent: deviationPercent === null ? null : Number(deviationPercent.toFixed(3)),
  };
}

async function loadHistoricalPoints(code: string, limit: number): Promise<HistoricalSeries> {
  const [eastmoney, tencent] = await Promise.allSettled([loadEastmoneyHistoricalPoints(code, limit), loadTencentHistoricalPoints(code, limit)]);
  if (eastmoney.status === "fulfilled" && tencent.status === "fulfilled") return reconcileHistoricalSeries(eastmoney.value, tencent.value);
  if (eastmoney.status === "fulfilled") return eastmoney.value;
  if (tencent.status === "fulfilled") return tencent.value;
  throw eastmoney.reason instanceof Error ? eastmoney.reason : tencent.reason instanceof Error ? tencent.reason : new Error("两个历史行情源均不可用。");
}
