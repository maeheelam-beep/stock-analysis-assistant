import type { HoldingKind } from "@/lib/types";

export type FundResearchInput = { code: string; name?: string; type: Extract<HoldingKind, "ETF" | "场外基金"> };

export type FundManagerProfile = {
  names: string[];
  startDate: string | null;
  tenure: string | null;
  returnPercent: number | null;
};

export type FundDisclosedHolding = {
  code: string;
  name: string;
  weightPercent: number;
};

export type FundResearchProduct = {
  code: string;
  name: string;
  type: FundResearchInput["type"];
  fundType: string | null;
  company: string | null;
  manager: FundManagerProfile | null;
  reportDate: string | null;
  holdings: FundDisclosedHolding[];
  profileStatus: "ok" | "unavailable";
  holdingsStatus: "ok" | "unavailable";
  source: string;
  sources: string[];
  sourceCount: number;
  verification: "verified" | "single" | "conflict";
  profileUrl: string;
  holdingsUrl: string;
  error?: string;
};

export type FundOverlapItem = {
  code: string;
  name: string;
  fundCount: number;
  combinedWeightPercent: number;
  funds: Array<{ code: string; name: string; weightPercent: number; reportDate: string | null }>;
};

export type FundResearchSnapshot = {
  products: FundResearchProduct[];
  overlaps: FundOverlapItem[];
  disclosureCount: number;
  retrievedAt: string;
  source: string;
};

const FUND_RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const fundResearchCache = new Map<string, { expiresAt: number; value?: FundResearchProduct; pending?: Promise<FundResearchProduct> }>();

type SinaFundProfileResponse = {
  result?: {
    status?: { code?: number };
    data?: { jjqc?: string; jjjc?: string; Type3Name?: string; ManagerName?: string; glr?: string };
  };
};

function htmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function rowCells(row: string) {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => htmlText(match[1]));
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/[%千万元亿,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchFundText(url: string, referer: string) {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml", Referer: referer, "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`基金档案响应 ${response.status}`);
  return response.text();
}

async function fetchSinaFundProfile(code: string) {
  const url = new URL("https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabjjgk");
  url.searchParams.set("symbol", code);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`新浪基金档案响应 ${response.status}`);
  const payload = await response.json() as SinaFundProfileResponse;
  const data = payload.result?.data;
  if (payload.result?.status?.code !== 0 || !data) throw new Error("新浪基金档案未返回有效数据。");
  const names = htmlText(data.ManagerName || "").split(/[、,，\s]+/).filter(Boolean);
  const profile = {
    fundName: htmlText(data.jjqc || data.jjjc || ""),
    fundType: htmlText(data.Type3Name || "") || null,
    company: htmlText(data.glr || "") || null,
    manager: names.length ? { names, startDate: null, tenure: null, returnPercent: null } satisfies FundManagerProfile : null,
  };
  if (!profile.fundName && !profile.fundType && !profile.company && !profile.manager) throw new Error("新浪基金档案缺少可用字段。");
  return profile;
}

function normalizeOrganization(value: string | null) {
  return (value || "").replace(/基金管理|股份|有限责任|有限公司|公司|\s/g, "");
}

export function parseFundManagerPage(html: string, code: string, fallbackName: string) {
  const fundName = htmlText(html.match(new RegExp(`<h4[^>]*class=["']title["'][\\s\\S]*?<a[^>]*>([\\s\\S]*?)\\s*\\(${code}\\)<\\/a>`, "i"))?.[1] || fallbackName || code);
  const fundType = htmlText(html.match(/<label>类型：\s*<span>([\s\S]*?)<\/span>/i)?.[1] || "") || null;
  const company = htmlText(html.match(/<label>管理人：\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "") || null;
  const currentTable = html.match(/基金经理变动一览[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  const currentRow = currentTable.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || "";
  const cells = rowCells(currentRow);
  const headerManager = htmlText(html.match(/基金经理：(?:&nbsp;|\s)*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
  const names = cells[2] ? cells[2].split(/\s+/).filter(Boolean) : headerManager ? [headerManager] : [];
  const manager = names.length ? {
    names,
    startDate: cells[0] || null,
    tenure: cells[3] || null,
    returnPercent: numberOrNull(cells[4]),
  } satisfies FundManagerProfile : null;
  return { fundName, fundType, company, manager };
}

function fundArchiveContent(script: string) {
  const content = script.match(/content:"([\s\S]*?)",arryear:/i)?.[1];
  if (!content) return "";
  return content
    .replace(/\\"/g, '"')
    .replace(/\\r\\n|\\n|\\r/g, "")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

export function parseFundHoldingsScript(script: string) {
  const content = fundArchiveContent(script);
  if (!content) return { reportDate: null, holdings: [] as FundDisclosedHolding[], fundName: "" };
  const reportDate = content.match(/截止至：[\s\S]*?(\d{4}-\d{2}-\d{2})/i)?.[1] || null;
  const fundName = htmlText(content.match(/<h4[^>]*>[\s\S]*?<a[^>]*title=['"]([^'"]+)['"]/i)?.[1] || "");
  const body = content.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  const holdings = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((match) => {
    const cells = rowCells(match[1]);
    const code = cells[1]?.match(/\d{6}/)?.[0] || "";
    const name = cells[2] || "";
    const weightCell = cells.slice(3).find((cell) => /^-?\d+(?:\.\d+)?%$/.test(cell));
    const weightPercent = numberOrNull(weightCell);
    if (!code || !name || weightPercent === null) return [];
    return [{ code, name, weightPercent }];
  }).slice(0, 10);
  return { reportDate, holdings, fundName };
}

async function loadFundProduct(item: FundResearchInput): Promise<FundResearchProduct> {
  const profileUrl = `https://fundf10.eastmoney.com/jjjl_${encodeURIComponent(item.code)}.html`;
  const holdingsUrl = `https://fundf10.eastmoney.com/ccmx_${encodeURIComponent(item.code)}.html`;
  const archiveUrl = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${encodeURIComponent(item.code)}&topline=10&year=${new Date().getFullYear()}&month=&rt=${Math.random()}`;
  const [profileResult, sinaProfileResult, holdingsResult] = await Promise.allSettled([
    fetchFundText(profileUrl, profileUrl),
    fetchSinaFundProfile(item.code),
    fetchFundText(archiveUrl, holdingsUrl),
  ]);

  const eastmoneyProfile = profileResult.status === "fulfilled"
    ? parseFundManagerPage(profileResult.value, item.code, item.name || item.code)
    : { fundName: item.name || item.code, fundType: null, company: null, manager: null };
  const sinaProfile = sinaProfileResult.status === "fulfilled" ? sinaProfileResult.value : null;
  const profile = {
    fundName: eastmoneyProfile.fundName || sinaProfile?.fundName || item.name || item.code,
    fundType: eastmoneyProfile.fundType || sinaProfile?.fundType || null,
    company: eastmoneyProfile.company || sinaProfile?.company || null,
    manager: eastmoneyProfile.manager || sinaProfile?.manager || null,
  };
  const disclosure = holdingsResult.status === "fulfilled"
    ? parseFundHoldingsScript(holdingsResult.value)
    : { reportDate: null, holdings: [], fundName: "" };
  const errors = [profileResult, sinaProfileResult, holdingsResult].flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "公开基金源请求失败"] : []);
  const profileSources = [profileResult.status === "fulfilled" ? "天天基金公开档案" : null, sinaProfileResult.status === "fulfilled" ? "新浪基金档案" : null].filter((source): source is string => Boolean(source));
  const managerConflict = Boolean(eastmoneyProfile.manager && sinaProfile?.manager && !eastmoneyProfile.manager.names.some((name) => sinaProfile.manager?.names.includes(name)));
  const companyConflict = Boolean(eastmoneyProfile.company && sinaProfile?.company && normalizeOrganization(eastmoneyProfile.company) !== normalizeOrganization(sinaProfile.company));
  const verification = profileSources.length < 2 ? "single" : managerConflict || companyConflict ? "conflict" : "verified";

  return {
    code: item.code,
    name: profile.fundName || disclosure.fundName || item.name || item.code,
    type: item.type,
    fundType: profile.fundType,
    company: profile.company,
    manager: profile.manager,
    reportDate: disclosure.reportDate,
    holdings: disclosure.holdings,
    profileStatus: profile.manager ? "ok" : "unavailable",
    holdingsStatus: holdingsResult.status === "fulfilled" && disclosure.holdings.length ? "ok" : "unavailable",
    source: [...profileSources, "天天基金定期报告"].join(" + "),
    sources: profileSources,
    sourceCount: profileSources.length,
    verification,
    profileUrl,
    holdingsUrl,
    error: errors.length ? errors.join("；") : undefined,
  };
}

async function cachedFundProduct(item: FundResearchInput) {
  const current = fundResearchCache.get(item.code);
  if (current?.value && current.expiresAt > Date.now()) return current.value;
  if (current?.pending) return current.pending;
  const pending = loadFundProduct(item)
    .then((value) => {
      fundResearchCache.set(item.code, { value, expiresAt: Date.now() + FUND_RESEARCH_CACHE_TTL_MS });
      return value;
    })
    .catch((error) => {
      fundResearchCache.delete(item.code);
      throw error;
    });
  fundResearchCache.set(item.code, { pending, expiresAt: Date.now() + FUND_RESEARCH_CACHE_TTL_MS });
  return pending;
}

function calculateFundOverlaps(products: FundResearchProduct[]) {
  const stocks = new Map<string, FundOverlapItem>();
  products.filter((product) => product.holdingsStatus === "ok").forEach((product) => {
    product.holdings.forEach((holding) => {
      const current = stocks.get(holding.code) || { code: holding.code, name: holding.name, fundCount: 0, combinedWeightPercent: 0, funds: [] };
      current.fundCount += 1;
      current.combinedWeightPercent += holding.weightPercent;
      current.funds.push({ code: product.code, name: product.name, weightPercent: holding.weightPercent, reportDate: product.reportDate });
      stocks.set(holding.code, current);
    });
  });
  return [...stocks.values()]
    .filter((item) => item.fundCount >= 2)
    .sort((a, b) => b.fundCount - a.fundCount || b.combinedWeightPercent - a.combinedWeightPercent)
    .slice(0, 10)
    .map((item) => ({ ...item, combinedWeightPercent: Number(item.combinedWeightPercent.toFixed(2)) }));
}

export async function fetchFundResearch(items: FundResearchInput[]): Promise<FundResearchSnapshot> {
  const unique = [...new Map(items.map((item) => [item.code, item])).values()].slice(0, 12);
  const products = await Promise.all(unique.map(cachedFundProduct));
  return {
    products,
    overlaps: calculateFundOverlaps(products),
    disclosureCount: products.filter((product) => product.holdingsStatus === "ok").length,
    retrievedAt: new Date().toISOString(),
    source: "天天基金 + 新浪基金公开档案；持仓来自天天基金定期报告",
  };
}
