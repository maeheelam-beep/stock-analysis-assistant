import type { HoldingKind } from "@/lib/types";

type EastmoneySuggestion = {
  Code?: string;
  Name?: string;
  Classify?: string;
  SecurityType?: string;
  MktNum?: string | number;
};

type EastmoneySearchResponse = {
  QuotationCodeTable?: { Data?: EastmoneySuggestion[]; Status?: number };
};

export type SecuritySearchResult = {
  code: string;
  name: string;
  type: HoldingKind | "美股";
  source: string;
  sources: string[];
  sourceCount: number;
  verification: "verified" | "single";
};

export type SecuritySearchKind = HoldingKind | "美股";

function suggestionKind(item: EastmoneySuggestion): SecuritySearchKind | null {
  if (["105", "106", "107"].includes(String(item.MktNum ?? "")) || item.Classify === "UsStock") return "美股";
  if (item.Classify === "AStock") return "股票";
  if (item.Classify === "OTCFUND") return "场外基金";
  if (item.Classify === "Fund" && item.SecurityType === "8") return "ETF";
  return null;
}

async function searchEastmoneySecurities(query: string, kind: SecuritySearchKind) {
  const url = new URL("https://searchapi.eastmoney.com/api/suggest/get");
  url.searchParams.set("input", query);
  url.searchParams.set("type", "14");
  url.searchParams.set("token", "D43BF722C8E33BDC906FB84D85E326E8");
  url.searchParams.set("count", "10");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`证券搜索响应 ${response.status}`);
  const payload = await response.json() as EastmoneySearchResponse;
  return (payload.QuotationCodeTable?.Data ?? []).flatMap<SecuritySearchResult>((item) => {
    const type = suggestionKind(item);
    const code = String(item.Code ?? "").trim();
    const name = String(item.Name ?? "").trim();
    const validCode = type === "美股" ? /^[A-Z][A-Z.-]{0,9}$/i.test(code) : /^\d{6}$/.test(code);
    if (type !== kind || !validCode || !name) return [];
    return [{ code, name, type, source: "东方财富证券搜索", sources: ["东方财富证券搜索"], sourceCount: 1, verification: "single" as const }];
  }).slice(0, 8);
}

function decodeTencentHint(text: string) {
  const escaped = text.match(/v_hint="([\s\S]*?)";?\s*$/)?.[1] || "";
  if (!escaped) return "";
  try { return JSON.parse(`"${escaped.replace(/"/g, '\\"')}"`) as string; } catch { return escaped; }
}

function tencentKind(market: string, tag: string): SecuritySearchKind | null {
  if (market === "us") return "美股";
  if (market === "jj") return "场外基金";
  if (["sh", "sz"].includes(market) && tag.toUpperCase().includes("ETF")) return "ETF";
  if (["sh", "sz"].includes(market) && tag.toUpperCase().startsWith("GP")) return "股票";
  return null;
}

async function searchTencentSecurities(query: string, kind: SecuritySearchKind) {
  const url = new URL("https://smartbox.gtimg.cn/s3/");
  url.searchParams.set("q", query);
  url.searchParams.set("t", "all");
  const response = await fetch(url.toString(), {
    headers: { Accept: "text/plain", "User-Agent": "GuJiLuoPan/1.0" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`腾讯证券搜索响应 ${response.status}`);
  const decoded = decodeTencentHint(await response.text());
  return decoded.split("^").flatMap<SecuritySearchResult>((row) => {
    const [market = "", rawCode = "", name = "", , tag = ""] = row.split("~");
    const type = tencentKind(market.toLowerCase(), tag);
    const code = type === "美股" ? rawCode.split(".")[0].toUpperCase() : rawCode;
    const validCode = type === "美股" ? /^[A-Z][A-Z.-]{0,9}$/.test(code) : /^\d{6}$/.test(code);
    if (type !== kind || !validCode || !name.trim()) return [];
    return [{ code, name: name.trim(), type, source: "腾讯证券搜索", sources: ["腾讯证券搜索"], sourceCount: 1, verification: "single" }];
  }).slice(0, 8);
}

export async function searchSecurities(query: string, kind: SecuritySearchKind) {
  const settled = await Promise.allSettled([searchEastmoneySecurities(query, kind), searchTencentSecurities(query, kind)]);
  const fulfilled = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!fulfilled.length) throw new Error("两个公开证券搜索源均不可用。");
  const merged = new Map<string, SecuritySearchResult>();
  for (const items of fulfilled) {
    for (const item of items) {
      const key = `${item.type}:${item.code}`;
      const current = merged.get(key);
      if (!current) { merged.set(key, item); continue; }
      const sources = [...new Set([...current.sources, ...item.sources])];
      merged.set(key, { ...current, name: current.name || item.name, sources, sourceCount: sources.length, verification: sources.length > 1 ? "verified" : "single", source: sources.join(" + ") });
    }
  }
  return [...merged.values()].sort((a, b) => b.sourceCount - a.sourceCount).slice(0, 8);
}
