import { env } from "cloudflare:workers";
import type { MarketNewsItem, NoticeItem } from "@/lib/types";

type NoticeRow = {
  art_code?: string;
  title?: string;
  notice_date?: string;
  display_time?: string;
  codes?: Array<{ stock_code?: string }>;
};

type NoticeResponse = { data?: { list?: NoticeRow[] } };
type FastNewsRow = {
  code?: string;
  title?: string;
  summary?: string;
  showTime?: string;
};
type FastNewsResponse = { data?: { fastNewsList?: FastNewsRow[] } };
type SinaNewsRow = { id?: number | string; rich_text?: string; create_time?: string; docurl?: string };
type SinaNewsResponse = { result?: { data?: { feed?: { list?: SinaNewsRow[] } } } };
type CsrcNewsRow = { manuscriptId?: string; title?: string; memo?: string; content?: string; url?: string; publishedTimeStr?: string };
type CsrcNewsResponse = { data?: { results?: CsrcNewsRow[] } };
type GovernmentPolicyRow = { TITLE?: string; URL?: string; DOCRELPUBTIME?: string };
type TianapiNewsRow = { id?: string | number; title?: string; description?: string; ctime?: string; source?: string; url?: string };
type TianapiResponse = { code?: number; msg?: string; result?: { newslist?: TianapiNewsRow[] }; newslist?: TianapiNewsRow[] };
const runtimeEnv = env as unknown as Record<string, string | undefined>;
const noticeBase = (runtimeEnv.NOTICE_API_BASE_URL || "https://np-anotice-stock.eastmoney.com").replace(/\/$/, "");
const fastNewsBase = (runtimeEnv.FAST_NEWS_API_BASE_URL || "https://np-weblist.eastmoney.com").replace(/\/$/, "");
const NEWS_CACHE_TTL_MS = 2 * 60 * 1000;
let newsCache: { expiresAt: number; value?: Awaited<ReturnType<typeof loadMarketNews>>; pending?: ReturnType<typeof loadMarketNews> } | undefined;

function cleanText(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}

function stableId(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

function newsItem(input: Omit<MarketNewsItem, "sources" | "sourceCount">): MarketNewsItem {
  return { ...input, sources: [{ name: input.source, url: input.url }], sourceCount: 1 };
}

function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/^【[^】]{1,20}】/, "").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function similarTitle(a: string, b: string) {
  const left = normalizedTitle(a);
  const right = normalizedTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 12 && longer.includes(shorter) && shorter.length / longer.length >= 0.7) return true;
  const pairs = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const leftPairs = pairs(left);
  const rightPairs = pairs(right);
  const shared = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  const total = new Set([...leftPairs, ...rightPairs]).size;
  return total > 0 && shared / total >= 0.72;
}

export function mergeMarketNews(items: MarketNewsItem[]) {
  const sorted = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const merged: MarketNewsItem[] = [];
  for (const item of sorted) {
    const itemTime = Date.parse(item.publishedAt);
    const match = merged.find((candidate) => {
      const candidateTime = Date.parse(candidate.publishedAt);
      const closeInTime = !Number.isFinite(itemTime) || !Number.isFinite(candidateTime) || Math.abs(itemTime - candidateTime) <= 12 * 60 * 60 * 1000;
      return closeInTime && similarTitle(candidate.title, item.title);
    });
    if (!match) {
      merged.push({ ...item, sources: [...item.sources] });
      continue;
    }
    const sources = [...match.sources, ...item.sources].filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);
    match.sources = sources;
    match.sourceCount = sources.length;
    match.source = sources.map((source) => source.name).filter((name, index, all) => all.indexOf(name) === index).join(" / ");
    if (item.summary.length > match.summary.length) match.summary = item.summary;
    if (item.category === "政策") match.category = "政策";
  }
  return merged;
}

async function fetchEastmoneyNews() {
  const url = new URL(`${fastNewsBase}/comm/web/getFastNewsList`);
  url.searchParams.set("client", "web");
  url.searchParams.set("biz", "web_724");
  url.searchParams.set("fastColumn", "102");
  url.searchParams.set("sortEnd", "");
  url.searchParams.set("pageSize", "30");
  url.searchParams.set("req_trace", `${Date.now()}`);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`快讯源响应 ${response.status}`);
  const payload = await response.json() as FastNewsResponse;
  const items = (payload.data?.fastNewsList ?? []).flatMap<MarketNewsItem>((row) => {
    const id = String(row.code ?? "").trim();
    const title = String(row.title ?? "").trim();
    if (!/^\d{12,}$/.test(id) || !title) return [];
    return [newsItem({
      id,
      title,
      summary: String(row.summary ?? "").trim(),
      publishedAt: String(row.showTime ?? "").trim(),
      source: "东方财富 7×24 快讯",
      url: `https://finance.eastmoney.com/a/${encodeURIComponent(id)}.html`,
      category: "快讯",
    })];
  });
  return items;
}

async function fetchSinaNews() {
  const url = new URL("https://zhibo.sina.com.cn/api/zhibo/feed");
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "30");
  url.searchParams.set("zhibo_id", "152");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`新浪快讯响应 ${response.status}`);
  const payload = await response.json() as SinaNewsResponse;
  return (payload.result?.data?.feed?.list ?? []).flatMap<MarketNewsItem>((row) => {
    const text = cleanText(row.rich_text);
    const id = String(row.id ?? "").trim();
    if (!id || !text) return [];
    const bracket = text.match(/^【([^】]+)】\s*(.*)$/);
    const title = cleanText(bracket?.[1] || text).slice(0, 180);
    const summary = cleanText(bracket?.[2] || "").slice(0, 500);
    const originalUrl = String(row.docurl ?? "").trim() || "https://finance.sina.com.cn/7x24/notification.shtml";
    return [newsItem({ id: `sina-${id}`, title, summary, publishedAt: String(row.create_time ?? ""), source: "新浪财经 7×24", url: originalUrl, category: "快讯" })];
  });
}

async function fetchCsrcPolicies() {
  const url = new URL("https://www.csrc.gov.cn/searchList/a1a078ee0bc54721ab6b148884c784a8");
  url.searchParams.set("_isAgg", "true");
  url.searchParams.set("_isJson", "true");
  url.searchParams.set("_pageSize", "12");
  url.searchParams.set("_template", "index");
  url.searchParams.set("page", "1");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`证监会要闻响应 ${response.status}`);
  const payload = await response.json() as CsrcNewsResponse;
  return (payload.data?.results ?? []).flatMap<MarketNewsItem>((row) => {
    const title = cleanText(row.title);
    const rawUrl = String(row.url ?? "").trim();
    if (!title || !rawUrl) return [];
    const originalUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : new URL(rawUrl, "https://www.csrc.gov.cn").toString();
    return [newsItem({ id: `csrc-${row.manuscriptId || stableId(originalUrl)}`, title, summary: cleanText(row.memo || row.content).slice(0, 500), publishedAt: String(row.publishedTimeStr ?? ""), source: "中国证监会", url: originalUrl, category: "政策" })];
  });
}

const POLICY_KEYWORDS = /金融|证券|基金|资本市场|经济|消费|投资|财政|税|外贸|产业|企业|房地产|就业|科技|知识产权|能源|碳达峰|农业农村|自由贸易|营商环境/;

async function fetchGovernmentPolicies() {
  const response = await fetch("https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json", { headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`中国政府网政策响应 ${response.status}`);
  const payload = await response.json() as GovernmentPolicyRow[];
  return payload.slice(0, 80).flatMap<MarketNewsItem>((row) => {
    const title = cleanText(row.TITLE);
    const originalUrl = String(row.URL ?? "").trim();
    if (!title || !originalUrl || !POLICY_KEYWORDS.test(title)) return [];
    return [newsItem({ id: `gov-${stableId(originalUrl)}`, title, summary: "", publishedAt: String(row.DOCRELPUBTIME ?? ""), source: "中国政府网", url: originalUrl, category: "政策" })];
  }).slice(0, 12);
}

async function fetchTianapiNews() {
  const apiKey = runtimeEnv.TIANAPI_KEY?.trim();
  if (!apiKey) return [];
  const url = new URL("https://apis.tianapi.com/caijing/index");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("num", "30");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`天聚财经响应 ${response.status}`);
  const payload = await response.json() as TianapiResponse;
  if (payload.code && payload.code !== 200) throw new Error(payload.msg || `天聚财经业务响应 ${payload.code}`);
  return (payload.result?.newslist ?? payload.newslist ?? []).flatMap<MarketNewsItem>((row) => {
    const title = cleanText(row.title);
    const originalUrl = String(row.url ?? "").trim();
    if (!title || !originalUrl) return [];
    const source = cleanText(row.source) || "天聚财经";
    return [newsItem({ id: `tian-${row.id || stableId(originalUrl)}`, title, summary: cleanText(row.description).slice(0, 500), publishedAt: String(row.ctime ?? ""), source, url: originalUrl, category: "快讯" })];
  });
}

async function loadMarketNews() {
  const sourceNames = ["东方财富", "新浪财经", "中国证监会", "中国政府网", ...(runtimeEnv.TIANAPI_KEY?.trim() ? ["天聚财经"] : [])];
  const settled = await Promise.allSettled([fetchEastmoneyNews(), fetchSinaNews(), fetchCsrcPolicies(), fetchGovernmentPolicies(), ...(runtimeEnv.TIANAPI_KEY?.trim() ? [fetchTianapiNews()] : [])]);
  const merged = mergeMarketNews(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  const items = [...merged.filter((item) => item.category === "快讯").slice(0, 50), ...merged.filter((item) => item.category === "政策").slice(0, 20)]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const sources = settled.map((result, index) => ({ name: sourceNames[index], status: result.status === "fulfilled" ? "ok" as const : "error" as const, count: result.status === "fulfilled" ? result.value.length : 0 }));
  if (!items.length) throw new Error("所有市场资讯源暂不可用。");
  return { items, sources, retrievedAt: new Date().toISOString() };
}

export async function fetchMarketNews() {
  if (newsCache?.value && newsCache.expiresAt > Date.now()) return newsCache.value;
  if (newsCache?.pending) return newsCache.pending;
  const pending = loadMarketNews().then((value) => {
    newsCache = { value, expiresAt: Date.now() + NEWS_CACHE_TTL_MS };
    return value;
  }).catch((error) => {
    newsCache = undefined;
    throw error;
  });
  newsCache = { pending, expiresAt: Date.now() + NEWS_CACHE_TTL_MS };
  return pending;
}

async function fetchCodeNotices(code: string) {
  const url = new URL(`${noticeBase}/api/security/ann`);
  url.searchParams.set("sr", "-1");
  url.searchParams.set("page_size", "8");
  url.searchParams.set("page_index", "1");
  url.searchParams.set("ann_type", "A");
  url.searchParams.set("client_source", "web");
  url.searchParams.set("stock_list", code);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`公告源响应 ${response.status}`);
  const payload = await response.json() as NoticeResponse;
  return (payload.data?.list ?? []).flatMap<NoticeItem>((row) => {
    const id = String(row.art_code ?? "").trim();
    const title = String(row.title ?? "").trim();
    if (!id || !title) return [];
    const linkedCode = row.codes?.find((item) => item.stock_code === code)?.stock_code || code;
    return [{
      id,
      code: linkedCode,
      title,
      publishedAt: row.display_time || row.notice_date || "",
      source: "东方财富公告聚合（原文以交易所披露为准）",
      url: `https://data.eastmoney.com/notices/detail/${encodeURIComponent(linkedCode)}/${encodeURIComponent(id)}.html`,
      category: "公告",
    }];
  });
}

export async function fetchNotices(codes: string[]) {
  const uniqueCodes = [...new Set(codes.filter((code) => /^\d{6}$/.test(code)))].slice(0, 12);
  const settled = await Promise.allSettled(uniqueCodes.map(fetchCodeNotices));
  const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = settled.flatMap((result, index) => result.status === "rejected" ? [{ code: uniqueCodes[index], message: result.reason instanceof Error ? result.reason.message : "公告请求失败。" }] : []);
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 30);
  return { items: deduped, errors, retrievedAt: new Date().toISOString() };
}
