import { env } from "cloudflare:workers";
import type { AMarketOverview, ASectorItem, AStockRankItem, HoldingKind, MarketSourceStatus, Quote, UsRankItem } from "@/lib/types";

export type MarketItem = { code: string; type: HoldingKind | "指数"; name?: string };

type EastmoneyQuoteRow = {
  f2?: number | string;
  f3?: number | string;
  f5?: number | string;
  f6?: number | string;
  f12?: string;
  f13?: number | string;
  f14?: string;
  f15?: number | string;
  f16?: number | string;
  f17?: number | string;
  f18?: number | string;
};

type EastmoneyListResponse = { data?: { diff?: EastmoneyQuoteRow[]; total?: number | string } };
type SinaStockRow = {
  code?: string;
  name?: string;
  trade?: number | string;
  pricechange?: number | string;
  changepercent?: number | string;
  settlement?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  volume?: number | string;
  amount?: number | string;
};
type EastmoneyFundNavResponse = {
  Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }> };
  ErrCode?: number;
};
const runtimeEnv = env as unknown as Record<string, string | undefined>;
const marketBase = (runtimeEnv.MARKET_API_BASE_URL || "https://push2.eastmoney.com").replace(/\/$/, "");
const marketFallbackBase = (runtimeEnv.MARKET_API_FALLBACK_BASE_URL || "https://push2delay.eastmoney.com").replace(/\/$/, "");
const sinaIndustryUrl = "https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php";
const sinaMarketBases = ["https://money.finance.sina.com.cn", "https://vip.stock.finance.sina.com.cn"];
const MARKET_CACHE_TTL_MS = 15 * 1000;
const A_SECTOR_CACHE_TTL_MS = 60 * 1000;
const A_SECTOR_STALE_TTL_MS = 30 * 60 * 1000;
const A_BREADTH_CACHE_TTL_MS = 60 * 1000;
const A_BREADTH_STALE_TTL_MS = 30 * 60 * 1000;
const A_STOCK_RANK_LIMIT = 20;
const A_BREADTH_SAMPLE_SIZE = 500;
const marketCache = new Map<string, { expiresAt: number; staleUntil?: number; value?: unknown; pending?: Promise<unknown> }>();
const staleCacheKeys = new Set<string>();

async function withMarketCache<T>(key: string, loader: () => Promise<T>, ttlMs = MARKET_CACHE_TTL_MS, staleIfErrorMs = 0): Promise<T> {
  const current = marketCache.get(key);
  if (current?.value !== undefined && current.expiresAt > Date.now()) return current.value as T;
  if (current?.pending) return current.pending as Promise<T>;
  const staleValue = current?.value as T | undefined;
  const staleUntil = current?.staleUntil ?? 0;
  const pending = loader()
    .then((value) => {
      staleCacheKeys.delete(key);
      marketCache.set(key, { value, expiresAt: Date.now() + ttlMs, staleUntil: Date.now() + staleIfErrorMs });
      if (marketCache.size > 200) {
        const nowValue = Date.now();
        for (const [cacheKey, entry] of marketCache) {
          if (!entry.pending && entry.expiresAt <= nowValue) marketCache.delete(cacheKey);
        }
      }
      return value;
    })
    .catch((error) => {
      if (staleValue !== undefined && staleUntil > Date.now()) {
        staleCacheKeys.add(key);
        marketCache.set(key, { value: staleValue, expiresAt: Date.now() + ttlMs, staleUntil });
        return staleValue;
      }
      marketCache.delete(key);
      throw error;
    });
  marketCache.set(key, { value: staleValue, pending, expiresAt: current?.expiresAt ?? 0, staleUntil });
  return pending;
}

function now() {
  return new Date().toISOString();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function aShareSecid(item: MarketItem) {
  const market = item.type === "指数" ? (item.code.startsWith("399") ? "0" : "1") : (/^[569]/.test(item.code) ? "1" : "0");
  return `${market}.${item.code}`;
}

function unavailable(item: MarketItem, error: string): Quote {
  return {
    key: `${item.type}:${item.code}`,
    code: item.code,
    name: item.name || item.code,
    type: item.type,
    price: null,
    changePercent: null,
    previousClose: null,
    open: null,
    high: null,
    low: null,
    volume: null,
    amount: null,
    currency: "CNY",
    asOf: null,
    source: "东方财富公开行情",
    status: "unavailable",
    error,
  };
}

function singleSourceQuote(quote: Quote): Quote {
  return {
    ...quote,
    sources: [quote.source],
    sourceCount: 1,
    verification: "single",
    deviationPercent: null,
  };
}

function reconcileQuotes(primary: Quote | undefined, secondary: Quote | undefined, item: MarketItem, error = "上游未返回该代码。"): Quote {
  const primaryOk = primary?.status === "ok" && primary.price !== null;
  const secondaryOk = secondary?.status === "ok" && secondary.price !== null;
  if (primaryOk && secondaryOk && primary && secondary) {
    const deviationPercent = primary.price && secondary.price
      ? Math.abs(primary.price - secondary.price) / Math.abs(primary.price) * 100
      : null;
    const sources = [...new Set([primary.source, secondary.source])];
    const conflict = deviationPercent !== null && deviationPercent > 0.5;
    return {
      ...primary,
      source: sources.join(" + "),
      sources,
      sourceCount: sources.length,
      verification: conflict ? "conflict" : "verified",
      deviationPercent: deviationPercent === null ? null : Number(deviationPercent.toFixed(3)),
      error: conflict ? `两个行情源价格偏差 ${deviationPercent.toFixed(2)}%` : undefined,
    };
  }
  if (primaryOk && primary) return singleSourceQuote(primary);
  if (secondaryOk && secondary) return singleSourceQuote(secondary);
  return singleSourceQuote(primary ?? secondary ?? unavailable(item, error));
}

async function fetchTencentListedQuotes(items: MarketItem[]) {
  if (items.length === 0) return [];
  const queryMap = new Map(items.map((item) => {
    const market = item.type === "指数" ? (item.code.startsWith("399") ? "sz" : "sh") : (/^[569]/.test(item.code) ? "sh" : "sz");
    return [`${market}${item.code}`, item];
  }));
  const response = await fetch(`https://qt.gtimg.cn/q=${[...queryMap.keys()].join(",")}`, {
    headers: { Accept: "text/plain", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`备用行情响应 ${response.status}`);
  const text = await response.text();
  const quotes = new Map<string, Quote>();
  for (const match of text.matchAll(/v_((?:sh|sz)\d+)="([^"]*)"/g)) {
    const item = queryMap.get(match[1]);
    if (!item) continue;
    const fields = match[2].split("~");
    const price = numberOrNull(fields[3]);
    if (price === null) continue;
    quotes.set(`${item.type}:${item.code}`, {
      key: `${item.type}:${item.code}`,
      code: item.code,
      name: item.name || item.code,
      type: item.type,
      price,
      changePercent: numberOrNull(fields[32]),
      previousClose: numberOrNull(fields[4]),
      open: numberOrNull(fields[5]),
      high: numberOrNull(fields[33]),
      low: numberOrNull(fields[34]),
      volume: numberOrNull(fields[6]),
      amount: (numberOrNull(fields[37]) ?? 0) * 10_000,
      currency: "CNY",
      asOf: fields[30] || now(),
      source: "腾讯公开行情",
      status: "ok",
    });
  }
  return items.map((item) => quotes.get(`${item.type}:${item.code}`) ?? unavailable(item, "两个公开行情源均未返回该代码。"));
}

async function fetchJson<T>(url: string, timeout = 7000) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`上游行情响应 ${response.status}`);
  return response.json() as Promise<T>;
}

function replaceMarketBase(url: string, base: string) {
  const parsed = new URL(url);
  return `${base}${parsed.pathname}${parsed.search}`;
}

async function fetchMarketJson<T>(url: string, timeout = 7000) {
  try {
    return await fetchJson<T>(url, timeout);
  } catch {
    return fetchJson<T>(replaceMarketBase(url, marketFallbackBase), timeout);
  }
}

async function fetchTencentUsRows(queryCodes: string[]) {
  const response = await fetch(`https://qt.gtimg.cn/q=${queryCodes.map((code) => `us${encodeURIComponent(code)}`).join(",")}`, {
    headers: { Accept: "text/plain", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`备用行情响应 ${response.status}`);
  const text = await response.text();
  const rows = new Map<string, string[]>();
  for (const match of text.matchAll(/v_us([A-Za-z0-9.]+)="([^"]*)"/g)) {
    const fields = match[2].split("~");
    if (fields[0] === "200") rows.set(match[1].toUpperCase(), fields);
  }
  if (rows.size === 0) throw new Error("备用行情未返回有效数据。");
  return rows;
}

async function fetchTencentUsRow(queryCode: string) {
  const rows = await fetchTencentUsRows([queryCode]);
  const fields = rows.get(queryCode.toUpperCase());
  if (!fields) throw new Error("备用行情未返回该代码。");
  return fields;
}

function tencentUsQuote(fields: string[], code: string, name: string, type: "美股" | "美股指数"): Quote | null {
  const price = numberOrNull(fields[3]);
  if (price === null) return null;
  return {
    key: `${type}:${code}`,
    code,
    name,
    type,
    price,
    changePercent: numberOrNull(fields[32]),
    previousClose: numberOrNull(fields[4]),
    open: numberOrNull(fields[5]),
    high: numberOrNull(fields[33]),
    low: numberOrNull(fields[34]),
    volume: numberOrNull(fields[6]),
    amount: numberOrNull(fields[37]),
    currency: "USD",
    asOf: fields[30] || now(),
    source: "腾讯公开行情",
    status: "ok",
  };
}

async function fetchListedQuotes(items: MarketItem[]) {
  if (items.length === 0) return [];
  const tencentPromise = fetchTencentListedQuotes(items).catch(() => [] as Quote[]);
  const bySecid = new Map(items.map((item) => [aShareSecid(item), item]));
  const url = new URL(`${marketBase}/api/qt/ulist.np/get`);
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fields", "f2,f3,f5,f6,f12,f13,f14,f15,f16,f17,f18");
  url.searchParams.set("secids", [...bySecid.keys()].join(","));

  try {
    const payload = await fetchJson<EastmoneyListResponse>(url.toString());
    const result = new Map<string, Quote>();
    for (const row of payload.data?.diff ?? []) {
      const item = bySecid.get(`${String(row.f13 ?? "")}.${String(row.f12 ?? "")}`);
      if (!item) continue;
      const price = numberOrNull(row.f2);
      result.set(`${item.type}:${item.code}`, {
        key: `${item.type}:${item.code}`,
        code: item.code,
        name: String(row.f14 || item.name || item.code),
        type: item.type,
        price,
        changePercent: numberOrNull(row.f3),
        previousClose: numberOrNull(row.f18),
        open: numberOrNull(row.f17),
        high: numberOrNull(row.f15),
        low: numberOrNull(row.f16),
        volume: numberOrNull(row.f5),
        amount: numberOrNull(row.f6),
        currency: "CNY",
        asOf: now(),
        source: "东方财富公开行情",
        status: price === null ? "unavailable" : "ok",
      });
    }
    const tencent = new Map((await tencentPromise).map((quote) => [quote.key, quote]));
    return items.map((item) => reconcileQuotes(result.get(`${item.type}:${item.code}`), tencent.get(`${item.type}:${item.code}`), item));
  } catch (error) {
    const message = error instanceof Error ? error.message : "行情请求失败。";
    const tencent = new Map((await tencentPromise).map((quote) => [quote.key, quote]));
    return items.map((item) => reconcileQuotes(undefined, tencent.get(`${item.type}:${item.code}`), item, message));
  }
}

async function fetchFundEstimate(item: MarketItem): Promise<Quote> {
  const url = `https://fundgz.1234567.com.cn/js/${encodeURIComponent(item.code)}.js?rt=${Date.now()}`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`基金净值响应 ${response.status}`);
    const text = await response.text();
    const match = text.match(/jsonpgz\((.*)\)\s*;?$/s);
    if (!match) throw new Error("基金净值格式异常。");
    const data = JSON.parse(match[1]) as Record<string, string>;
    const price = numberOrNull(data.gsz || data.dwjz);
    return {
      key: `${item.type}:${item.code}`,
      code: item.code,
      name: data.name || item.name || item.code,
      type: "场外基金",
      price,
      changePercent: numberOrNull(data.gszzl),
      previousClose: numberOrNull(data.dwjz),
      open: null,
      high: null,
      low: null,
      volume: null,
      amount: null,
      currency: "CNY",
      asOf: data.gztime || data.jzrq || now(),
      source: "天天基金公开净值",
      status: price === null ? "unavailable" : "ok",
    };
  } catch {
    return fetchLatestFundNav(item);
  }
}

async function fetchLatestFundNav(item: MarketItem): Promise<Quote> {
  const url = new URL("https://api.fund.eastmoney.com/f10/lsjz");
  url.searchParams.set("fundCode", item.code);
  url.searchParams.set("pageIndex", "1");
  url.searchParams.set("pageSize", "2");
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json", Referer: "https://fundf10.eastmoney.com/", "User-Agent": "GuJiLuoPan/1.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`基金净值响应 ${response.status}`);
    const payload = await response.json() as EastmoneyFundNavResponse;
    const latest = payload.Data?.LSJZList?.[0];
    const previous = payload.Data?.LSJZList?.[1];
    const price = numberOrNull(latest?.DWJZ);
    if (payload.ErrCode !== 0 || price === null) throw new Error("基金最新净值暂不可用。");
    return {
      key: `${item.type}:${item.code}`,
      code: item.code,
      name: item.name || item.code,
      type: "场外基金",
      price,
      changePercent: numberOrNull(latest?.JZZZL),
      previousClose: numberOrNull(previous?.DWJZ),
      open: null,
      high: null,
      low: null,
      volume: null,
      amount: null,
      currency: "CNY",
      asOf: latest?.FSRQ || now(),
      source: "东方财富·天天基金最新净值",
      status: "ok",
    };
  } catch (error) {
    return unavailable(item, error instanceof Error ? error.message : "基金净值请求失败。");
  }
}

async function fetchUsQuote(symbol: string): Promise<Quote> {
  for (const secid of [`105.${symbol}`, `106.${symbol}`, `107.${symbol}`]) {
    const url = new URL(`${marketBase}/api/qt/stock/get`);
    url.searchParams.set("fltt", "2");
    url.searchParams.set("fields", "f2,f3,f5,f6,f12,f14,f15,f16,f17,f18");
    url.searchParams.set("secid", secid);
    try {
      const payload = await fetchJson<{ data?: EastmoneyQuoteRow }>(url.toString());
      const row = payload.data;
      const price = numberOrNull(row?.f2);
      if (!row || price === null) continue;
      return {
        key: `美股:${symbol}`,
        code: symbol,
        name: String(row.f14 || symbol),
        type: "美股",
        price,
        changePercent: numberOrNull(row.f3),
        previousClose: numberOrNull(row.f18),
        open: numberOrNull(row.f17),
        high: numberOrNull(row.f15),
        low: numberOrNull(row.f16),
        volume: numberOrNull(row.f5),
        amount: numberOrNull(row.f6),
        currency: "USD",
        asOf: now(),
        source: "东方财富公开行情",
        status: "ok",
      };
    } catch {
      continue;
    }
  }
  try {
    const fields = await fetchTencentUsRow(symbol);
    const fallback = tencentUsQuote(fields, symbol, symbol, "美股");
    if (fallback) return fallback;
  } catch {
    // Both public quote sources are unavailable; return an explicit empty quote below.
  }
  return {
    ...unavailable({ code: symbol, type: "股票", name: symbol }, "未找到美股代码或上游暂不可用。"),
    key: `美股:${symbol}`,
    type: "美股",
    currency: "USD",
  };
}

const usIndexItems = [
  { code: "NDX", name: "纳斯达克", secid: "100.NDX" },
  { code: "SPX", name: "标普 500", secid: "100.SPX" },
  { code: "DJIA", name: "道琼斯", secid: "100.DJIA" },
] as const;

function unavailableUsIndex(item: (typeof usIndexItems)[number], error: string): Quote {
  return {
    key: `美股指数:${item.code}`,
    code: item.code,
    name: item.name,
    type: "美股指数",
    price: null,
    changePercent: null,
    previousClose: null,
    open: null,
    high: null,
    low: null,
    volume: null,
    amount: null,
    currency: "USD",
    asOf: null,
    source: "东方财富公开行情",
    status: "unavailable",
    error,
  };
}

async function fetchUsIndices(): Promise<Quote[]> {
  const bySecid = new Map(usIndexItems.map((item) => [item.secid, item]));
  const url = new URL(`${marketBase}/api/qt/ulist.np/get`);
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fields", "f2,f3,f5,f6,f12,f13,f14,f15,f16,f17,f18");
  url.searchParams.set("secids", usIndexItems.map((item) => item.secid).join(","));

  try {
    const payload = await fetchJson<EastmoneyListResponse>(url.toString());
    const result = new Map<string, Quote>();
    for (const row of payload.data?.diff ?? []) {
      const item = bySecid.get(`${String(row.f13 ?? "")}.${String(row.f12 ?? "")}`);
      if (!item) continue;
      const price = numberOrNull(row.f2);
      result.set(item.code, {
        key: `美股指数:${item.code}`,
        code: item.code,
        name: String(row.f14 || item.name),
        type: "美股指数",
        price,
        changePercent: numberOrNull(row.f3),
        previousClose: numberOrNull(row.f18),
        open: numberOrNull(row.f17),
        high: numberOrNull(row.f15),
        low: numberOrNull(row.f16),
        volume: numberOrNull(row.f5),
        amount: numberOrNull(row.f6),
        currency: "USD",
        asOf: now(),
        source: "东方财富公开行情",
        status: price === null ? "unavailable" : "ok",
      });
    }
    const quotes = await Promise.all(usIndexItems.map(async (item) => {
      const primary = result.get(item.code);
      if (primary?.status === "ok") return primary;
      try {
        const queryCode = item.code === "NDX" ? "IXIC" : item.code === "SPX" ? "INX" : "DJI";
        return tencentUsQuote(await fetchTencentUsRow(queryCode), item.code, item.name, "美股指数") ?? unavailableUsIndex(item, "上游未返回该指数。");
      } catch {
        return unavailableUsIndex(item, "两个公开行情源均未返回该指数。");
      }
    }));
    return quotes;
  } catch (error) {
    const message = error instanceof Error ? error.message : "美股指数请求失败。";
    return Promise.all(usIndexItems.map(async (item) => {
      try {
        const queryCode = item.code === "NDX" ? "IXIC" : item.code === "SPX" ? "INX" : "DJI";
        return tencentUsQuote(await fetchTencentUsRow(queryCode), item.code, item.name, "美股指数") ?? unavailableUsIndex(item, message);
      } catch {
        return unavailableUsIndex(item, message);
      }
    }));
  }
}

async function fetchUsRankList(field: "f3" | "f6", descending: boolean): Promise<UsRankItem[]> {
  const url = new URL(`${marketBase}/api/qt/clist/get`);
  url.searchParams.set("pn", "1");
  url.searchParams.set("pz", "30");
  url.searchParams.set("po", descending ? "1" : "0");
  url.searchParams.set("np", "1");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fid", field);
  url.searchParams.set("fs", "m:105,m:106,m:107");
  url.searchParams.set("fields", "f2,f3,f5,f6,f12,f13,f14,f15,f16,f17,f18");

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await fetchJson<EastmoneyListResponse>(url.toString(), 9000);
      return (payload.data?.diff ?? []).flatMap<UsRankItem>((row) => {
        const code = String(row.f12 ?? "").trim().toUpperCase();
        const name = String(row.f14 ?? "").trim();
        const price = numberOrNull(row.f2);
        const changePercent = numberOrNull(row.f3);
        const amount = numberOrNull(row.f6);
        if (!/^[A-Z][A-Z.-]{0,9}$/.test(code) || !name || price === null || changePercent === null) return [];
        if (/\b(?:Wt|Warrant|Right)\b/i.test(name) || price < 0.1 || (amount ?? 0) < 100_000) return [];
        return [{
          code,
          name,
          price,
          changePercent,
          previousClose: numberOrNull(row.f18),
          open: numberOrNull(row.f17),
          high: numberOrNull(row.f15),
          low: numberOrNull(row.f16),
          volume: numberOrNull(row.f5),
          amount,
          source: "东方财富公开美股排行",
        }];
      }).slice(0, 8);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("美股排行请求失败。");
}

async function fetchUsRankings() {
  const popularUniverse = [
    ["NVDA", "英伟达"], ["AAPL", "苹果"], ["MSFT", "微软"], ["AMZN", "亚马逊"],
    ["GOOGL", "谷歌"], ["META", "Meta"], ["TSLA", "特斯拉"], ["AVGO", "博通"],
    ["AMD", "超威半导体"], ["NFLX", "奈飞"], ["PLTR", "Palantir"], ["COIN", "Coinbase"],
    ["TSM", "台积电"], ["BABA", "阿里巴巴"], ["JPM", "摩根大通"], ["BAC", "美国银行"],
    ["XOM", "埃克森美孚"], ["LLY", "礼来"], ["WMT", "沃尔玛"], ["COST", "好市多"],
    ["ORCL", "甲骨文"], ["CRM", "赛富时"], ["INTC", "英特尔"], ["QCOM", "高通"],
  ] as const;
  try {
    const rows = await fetchTencentUsRows(popularUniverse.map(([code]) => code));
    const sample = popularUniverse.flatMap<UsRankItem>(([code, name]) => {
      const fields = rows.get(code);
      if (!fields) return [];
      const price = numberOrNull(fields[3]);
      const changePercent = numberOrNull(fields[32]);
      if (price === null || changePercent === null) return [];
      return [{
        code,
        name,
        price,
        changePercent,
        previousClose: numberOrNull(fields[4]),
        open: numberOrNull(fields[5]),
        high: numberOrNull(fields[33]),
        low: numberOrNull(fields[34]),
        volume: numberOrNull(fields[6]),
        amount: numberOrNull(fields[37]),
        source: "腾讯公开行情·热门股样本",
      }];
    });
    if (sample.length > 0) {
      return {
        active: [...sample].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 8),
        gainers: [...sample].sort((a, b) => b.changePercent - a.changePercent).slice(0, 8),
        losers: [...sample].sort((a, b) => a.changePercent - b.changePercent).slice(0, 8),
      };
    }
  } catch {
    // Fall through to the broader public-market list when the popular sample is unavailable.
  }
  const settled = await Promise.allSettled([
    fetchUsRankList("f6", true),
    fetchUsRankList("f3", true),
    fetchUsRankList("f3", false),
  ]);
  const items = settled.map((result) => result.status === "fulfilled" ? result.value : []);
  return { active: items[0], gainers: items[1], losers: items[2] };
}

const A_SECTOR_SAMPLE_PER_SIDE = 24;
const A_SECTOR_SAMPLE_TARGET = A_SECTOR_SAMPLE_PER_SIDE * 2;

export function parseSinaIndustryPayload(text: string): ASectorItem[] {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("新浪行业排行格式无效。");
  const rows = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
  return Object.values(rows).flatMap<ASectorItem>((value) => {
    if (typeof value !== "string") return [];
    const fields = value.split(",");
    const code = String(fields[0] ?? "").trim();
    const name = String(fields[1] ?? "").trim();
    const changePercent = numberOrNull(fields[5]);
    if (!code.startsWith("new_") || code === "new_stock" || !name || changePercent === null) return [];
    return [{ code, name, changePercent, amount: numberOrNull(fields[7]), source: "新浪财经行业排行" }];
  });
}

function selectASectorExtremes(items: ASectorItem[]) {
  const sorted = [...items].sort((a, b) => b.changePercent - a.changePercent);
  const selected = new Map<string, ASectorItem>();
  sorted.slice(0, A_SECTOR_SAMPLE_PER_SIDE).forEach((item) => selected.set(item.code, item));
  sorted.slice(-A_SECTOR_SAMPLE_PER_SIDE).forEach((item) => selected.set(item.code, item));
  return [...selected.values()].sort((a, b) => b.changePercent - a.changePercent);
}

async function fetchSinaASectors(): Promise<ASectorItem[]> {
  const response = await fetch(sinaIndustryUrl, {
    headers: { Accept: "text/plain", Referer: "https://finance.sina.com.cn/stock/sl/", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`新浪行业排行响应 ${response.status}`);
  const text = new TextDecoder("gbk").decode(await response.arrayBuffer());
  const items = parseSinaIndustryPayload(text);
  if (items.length < A_SECTOR_SAMPLE_PER_SIDE) throw new Error("新浪行业排行返回数量不足。");
  return items;
}

async function fetchEastmoneyASectorRank(descending: boolean): Promise<ASectorItem[]> {
  const url = new URL(`${marketBase}/api/qt/clist/get`);
  url.searchParams.set("pn", "1");
  url.searchParams.set("pz", String(A_SECTOR_SAMPLE_PER_SIDE));
  url.searchParams.set("po", descending ? "1" : "0");
  url.searchParams.set("np", "1");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fid", "f3");
  url.searchParams.set("fs", "m:90+t:2");
  url.searchParams.set("fields", "f3,f6,f12,f14");
  const payload = await fetchMarketJson<EastmoneyListResponse>(url.toString(), 9000);
  return (payload.data?.diff ?? []).flatMap<ASectorItem>((row) => {
    const code = String(row.f12 ?? "").trim();
    const name = String(row.f14 ?? "").trim();
    const changePercent = numberOrNull(row.f3);
    if (!code || !name || changePercent === null) return [];
    return [{ code, name, changePercent, amount: numberOrNull(row.f6), source: "东方财富行业板块强弱排行" }];
  }).slice(0, A_SECTOR_SAMPLE_PER_SIDE);
}

async function fetchEastmoneyASectors(): Promise<ASectorItem[]> {
  const settled = await Promise.allSettled([fetchEastmoneyASectorRank(true), fetchEastmoneyASectorRank(false)]);
  const unique = new Map<string, ASectorItem>();
  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((item) => unique.set(item.code, item));
  });
  const items = [...unique.values()];
  if (!items.length) throw new Error("东方财富行业板块强弱排行暂不可用。");
  return items;
}

async function fetchASectors(): Promise<{ items: ASectorItem[]; total: number }> {
  try {
    return { items: selectASectorExtremes(await fetchSinaASectors()), total: A_SECTOR_SAMPLE_TARGET };
  } catch {
    return { items: selectASectorExtremes(await fetchEastmoneyASectors()), total: A_SECTOR_SAMPLE_TARGET };
  }
}

function describeAMarketSource(stockSource: string, sectors: ASectorItem[]) {
  const sectorSources = [...new Set(sectors.map((item) => item.source))];
  if (!sectorSources.length) return stockSource;
  return stockSource ? `${stockSource}；行业：${sectorSources.join("、")}` : `行业：${sectorSources.join("、")}`;
}

function summarizeAStocks(items: AStockRankItem[], coverage: AMarketOverview["coverage"], source: string, sectors: ASectorItem[], sectorTotal: number | null): AMarketOverview {
  const sortedByAmount = [...items].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const liquid = items.filter((item) => (item.amount ?? 0) >= 1_000_000);
  return {
    coverage,
    breadthAvailable: true,
    breadthSampleSize: items.length,
    upCount: items.filter((item) => item.changePercent > 0.005).length,
    flatCount: items.filter((item) => Math.abs(item.changePercent) <= 0.005).length,
    downCount: items.filter((item) => item.changePercent < -0.005).length,
    limitUpCount: items.filter((item) => item.changePercent >= 9.8).length,
    limitDownCount: items.filter((item) => item.changePercent <= -9.8).length,
    totalAmount: items.reduce((sum, item) => sum + (item.amount ?? 0), 0) || null,
    active: sortedByAmount.slice(0, A_STOCK_RANK_LIMIT),
    gainers: [...liquid].sort((a, b) => b.changePercent - a.changePercent).slice(0, A_STOCK_RANK_LIMIT),
    losers: [...liquid].sort((a, b) => a.changePercent - b.changePercent).slice(0, A_STOCK_RANK_LIMIT),
    sectors,
    sectorTotal,
    source,
  };
}

function parseAStockRankItem(row: EastmoneyQuoteRow, source: string): AStockRankItem | null {
  const code = String(row.f12 ?? "").trim();
  const name = String(row.f14 ?? "").trim();
  const price = numberOrNull(row.f2);
  const changePercent = numberOrNull(row.f3);
  if (!/^\d{6}$/.test(code) || !name || price === null || changePercent === null) return null;
  return {
    code,
    name,
    price,
    changePercent,
    previousClose: numberOrNull(row.f18),
    open: numberOrNull(row.f17),
    high: numberOrNull(row.f15),
    low: numberOrNull(row.f16),
    volume: numberOrNull(row.f5),
    amount: numberOrNull(row.f6),
    source,
  };
}

export function parseSinaAStockRow(row: SinaStockRow, source: string): AStockRankItem | null {
  const code = String(row.code ?? "").trim();
  const name = String(row.name ?? "").trim();
  const price = numberOrNull(row.trade);
  const changePercent = numberOrNull(row.changepercent);
  if (!/^\d{6}$/.test(code) || !name || price === null || changePercent === null) return null;
  return {
    code,
    name,
    price,
    changePercent,
    previousClose: numberOrNull(row.settlement),
    open: numberOrNull(row.open),
    high: numberOrNull(row.high),
    low: numberOrNull(row.low),
    volume: numberOrNull(row.volume),
    amount: numberOrNull(row.amount),
    source,
  };
}

async function fetchSinaAStockRows(searchParams: URLSearchParams, timeout = 9000): Promise<SinaStockRow[]> {
  let lastError: unknown;
  for (const base of sinaMarketBases) {
    try {
      const response = await fetch(`${base}/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?${searchParams.toString()}`, {
        headers: { Accept: "application/json", Referer: "https://finance.sina.com.cn/stock/sl/", "User-Agent": "GuJiLuoPan/1.0" },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error(`新浪 A 股行情响应 ${response.status}`);
      const text = new TextDecoder("gbk").decode(await response.arrayBuffer());
      const rows = JSON.parse(text) as unknown;
      if (!Array.isArray(rows)) throw new Error("新浪 A 股行情格式无效。");
      return rows as SinaStockRow[];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("新浪 A 股行情暂不可用。");
}

async function fetchSinaAStockRank(sortField: "changepercent" | "amount", descending: boolean, label: string): Promise<AStockRankItem[]> {
  const params = new URLSearchParams({ page: "1", num: String(A_STOCK_RANK_LIMIT), sort: sortField, asc: descending ? "0" : "1", node: "hs_a" });
  const rows = await fetchSinaAStockRows(params);
  const items = rows.flatMap<AStockRankItem>((row) => {
    const item = parseSinaAStockRow(row, `新浪财经沪深京 A 股${label}`);
    return item ? [item] : [];
  }).slice(0, A_STOCK_RANK_LIMIT);
  if (!items.length) throw new Error(`新浪 A 股${label}暂不可用。`);
  return items;
}

async function fetchEastmoneyAStockRank(sortField: "f3" | "f6", descending: boolean, label: string): Promise<AStockRankItem[]> {
  const url = new URL(`${marketBase}/api/qt/clist/get`);
  url.searchParams.set("pn", "1");
  url.searchParams.set("pz", String(A_STOCK_RANK_LIMIT));
  url.searchParams.set("po", descending ? "1" : "0");
  url.searchParams.set("np", "1");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fid", sortField);
  url.searchParams.set("fs", "m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23");
  url.searchParams.set("fields", "f2,f3,f5,f6,f12,f14,f15,f16,f17,f18");
  const payload = await fetchMarketJson<EastmoneyListResponse>(url.toString(), 9000);
  const items = (payload.data?.diff ?? []).flatMap<AStockRankItem>((row) => {
    const item = parseAStockRankItem(row, `东方财富沪深京 A 股${label}`);
    return item ? [item] : [];
  }).slice(0, A_STOCK_RANK_LIMIT);
  if (items.length === 0) throw new Error(`A 股${label}暂不可用。`);
  return items;
}

async function fetchAStockRank(sortField: "f3" | "f6", descending: boolean, label: string): Promise<AStockRankItem[]> {
  try {
    return await fetchSinaAStockRank(sortField === "f3" ? "changepercent" : "amount", descending, label);
  } catch {
    return fetchEastmoneyAStockRank(sortField, descending, label);
  }
}

async function fetchSinaABreadthSample(): Promise<AStockRankItem[]> {
  const pageSize = 100;
  const pageCount = Math.ceil(A_BREADTH_SAMPLE_SIZE / pageSize);
  const settled = await Promise.allSettled(
    Array.from({ length: pageCount }, (_, index) => {
      const params = new URLSearchParams({
        page: String(index + 1),
        num: String(pageSize),
        sort: "amount",
        asc: "0",
        node: "hs_a",
      });
      return fetchSinaAStockRows(params, 15000);
    }),
  );
  const rows = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const parsed = rows.flatMap<AStockRankItem>((row) => {
    const item = parseSinaAStockRow(row, "新浪财经沪深京 A 股成交活跃宽度样本");
    return item ? [item] : [];
  });
  const items = [
    ...new Map(parsed.map((item) => [item.code, item])).values(),
  ].slice(0, A_BREADTH_SAMPLE_SIZE);
  if (items.length < 300) throw new Error("新浪 A 股市场宽度样本不足。");
  return items;
}

async function fetchEastmoneyABreadthSample(): Promise<AStockRankItem[]> {
  const url = new URL(`${marketBase}/api/qt/clist/get`);
  url.searchParams.set("pn", "1");
  url.searchParams.set("pz", String(A_BREADTH_SAMPLE_SIZE));
  url.searchParams.set("po", "1");
  url.searchParams.set("np", "1");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fid", "f6");
  url.searchParams.set("fs", "m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23");
  url.searchParams.set("fields", "f2,f3,f5,f6,f12,f14,f15,f16,f17,f18");
  const payload = await fetchMarketJson<EastmoneyListResponse>(url.toString(), 12000);
  const items = (payload.data?.diff ?? []).flatMap<AStockRankItem>((row) => {
    const item = parseAStockRankItem(row, "东方财富沪深京 A 股成交活跃宽度样本");
    return item ? [item] : [];
  });
  if (items.length < A_BREADTH_SAMPLE_SIZE * 0.9) throw new Error("A 股市场宽度样本不完整。");
  return items;
}

async function fetchABreadthSample(): Promise<AStockRankItem[]> {
  try {
    return await fetchSinaABreadthSample();
  } catch {
    return fetchEastmoneyABreadthSample();
  }
}

function summarizeRankBreadth(gainers: AStockRankItem[], losers: AStockRankItem[], active: AStockRankItem[], sectors: ASectorItem[], sectorTotal: number | null, source: string): AMarketOverview {
  const unique = [...new Map([...gainers, ...losers, ...active].map((item) => [item.code, item])).values()];
  return {
    coverage: "实时排行",
    breadthAvailable: false,
    breadthSampleSize: 0,
    upCount: 0,
    flatCount: 0,
    downCount: 0,
    limitUpCount: 0,
    limitDownCount: 0,
    totalAmount: unique.reduce((sum, item) => sum + (item.amount ?? 0), 0) || null,
    active,
    gainers,
    losers,
    sectors,
    sectorTotal,
    source,
  };
}

async function fetchAMarketOverview(): Promise<AMarketOverview> {
  const [breadthSample, sectorResult, gainersResult, losersResult, activeResult] = await Promise.allSettled([
    withMarketCache("a:breadth", fetchABreadthSample, A_BREADTH_CACHE_TTL_MS, A_BREADTH_STALE_TTL_MS),
    withMarketCache("a:sectors", fetchASectors, A_SECTOR_CACHE_TTL_MS, A_SECTOR_STALE_TTL_MS),
    fetchAStockRank("f3", true, "涨幅榜"),
    fetchAStockRank("f3", false, "跌幅榜"),
    fetchAStockRank("f6", true, "成交额榜"),
  ]);
  const sectors = sectorResult.status === "fulfilled" ? sectorResult.value.items : [];
  const sectorTotal = sectorResult.status === "fulfilled" ? sectorResult.value.total : null;
  if (breadthSample.status === "fulfilled") {
    const stockSource = breadthSample.value[0]?.source || "沪深京 A 股成交活跃宽度样本";
    const overview = summarizeAStocks(breadthSample.value, "实时排行", describeAMarketSource(stockSource, sectors), sectors, sectorTotal);
    return {
      ...overview,
      gainers: gainersResult.status === "fulfilled" ? gainersResult.value : overview.gainers,
      losers: losersResult.status === "fulfilled" ? losersResult.value : overview.losers,
      active: activeResult.status === "fulfilled" ? activeResult.value : overview.active,
    };
  }
  const gainers = gainersResult.status === "fulfilled" ? gainersResult.value : [];
  const losers = losersResult.status === "fulfilled" ? losersResult.value : [];
  const active = activeResult.status === "fulfilled" ? activeResult.value : [];
  const rankingsAvailable = gainers.length > 0 || losers.length > 0 || active.length > 0;
  const rankingSources = [...new Set([...gainers, ...losers, ...active].map((item) => item.source))];
  if (!rankingsAvailable && !sectors.length) {
    return { ...summarizeRankBreadth([], [], [], [], null, "A 股实时排行暂不可用"), coverage: "不可用" };
  }
  return summarizeRankBreadth(gainers, losers, active, sectors, sectorTotal, describeAMarketSource(rankingSources.join("、"), sectors));
}

export async function fetchMarketSnapshot(items: MarketItem[], usSymbols: string[] = [], includeUsIndices = false, includeAMarket = false) {
  const uniqueItems = [...new Map(items.map((item) => [`${item.type}:${item.code}`, item])).values()].slice(0, 30);
  const listed = uniqueItems.filter((item) => item.type !== "场外基金");
  const funds = uniqueItems.filter((item) => item.type === "场外基金");
  const listedKey = listed.map((item) => `${item.type}:${item.code}`).sort().join(",");
  const [listedQuotes, fundQuotes, usQuotes, usIndices, usRankings, aMarket] = await Promise.all([
    withMarketCache(`listed:${listedKey}`, () => fetchListedQuotes(listed)),
    Promise.all(funds.map((item) => withMarketCache(`fund:${item.code}`, () => fetchFundEstimate(item)))),
    Promise.all([...new Set(usSymbols)].slice(0, 20).map((symbol) => withMarketCache(`us:${symbol}`, () => fetchUsQuote(symbol)))),
    includeUsIndices ? withMarketCache("us:indices", fetchUsIndices) : Promise.resolve([]),
    includeUsIndices ? withMarketCache("us:rankings", fetchUsRankings) : Promise.resolve({ active: [], gainers: [], losers: [] }),
    includeAMarket ? withMarketCache("a:overview", fetchAMarketOverview) : Promise.resolve(null),
  ]);
  const retrievedAt = now();
  const quotes = [...listedQuotes, ...fundQuotes.map(singleSourceQuote)];
  const listedCacheKey = `listed:${listedKey}`;
  const sourceGroups = new Map<string, { ok: number; unavailable: number; errors: string[]; coverage: Set<string>; stale: boolean; sourceCount: number; verification: "verified" | "single" | "conflict" }>();
  for (const quote of [...quotes, ...usQuotes, ...usIndices]) {
    const cacheKey = quote.type === "场外基金" ? `fund:${quote.code}` : quote.type === "美股" ? `us:${quote.code}` : quote.type === "美股指数" ? "us:indices" : listedCacheKey;
    const current = sourceGroups.get(quote.source) ?? { ok: 0, unavailable: 0, errors: [], coverage: new Set<string>(), stale: false, sourceCount: quote.sourceCount ?? 1, verification: quote.verification ?? "single" };
    current.stale ||= staleCacheKeys.has(cacheKey);
    current.sourceCount = Math.max(current.sourceCount, quote.sourceCount ?? 1);
    if (quote.verification === "conflict") current.verification = "conflict";
    else if (quote.verification === "verified" && current.verification !== "conflict") current.verification = "verified";
    if (quote.status === "ok") {
      current.ok += 1;
      if (quote.error) current.errors.push(quote.error);
    }
    else {
      current.unavailable += 1;
      if (quote.error) current.errors.push(quote.error);
    }
    current.coverage.add(quote.type);
    sourceGroups.set(quote.source, current);
  }
  if (aMarket?.source) {
    const source = aMarket.source;
    const current = sourceGroups.get(source) ?? { ok: 0, unavailable: 0, errors: [], coverage: new Set<string>(), stale: false, sourceCount: 1, verification: "single" };
    current.stale ||= staleCacheKeys.has("a:overview");
    current.ok += aMarket.coverage === "不可用" ? 0 : 1;
    current.unavailable += aMarket.coverage === "不可用" ? 1 : 0;
    current.coverage.add("A股排行");
    sourceGroups.set(source, current);
  }
  const sourceStatus: MarketSourceStatus[] = [...sourceGroups].map(([source, group]) => ({
    source,
    status: group.ok > 0 && group.stale ? "stale" : group.ok > 0 && group.unavailable === 0 ? "ok" : group.ok > 0 ? "stale" : "unavailable",
    retrievedAt,
    coverage: [...group.coverage].join("、") || "未知",
    sourceCount: group.sourceCount,
    verification: group.verification,
    error: group.errors[0],
  }));
  return { quotes, usQuotes, usIndices, usRankings, aMarket, sourceStatus, retrievedAt };
}

export const defaultIndices: MarketItem[] = [
  { code: "000001", type: "指数", name: "上证指数" },
  { code: "399001", type: "指数", name: "深证成指" },
  { code: "399006", type: "指数", name: "创业板指" },
  { code: "000688", type: "指数", name: "科创 50" },
];
