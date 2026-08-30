import { searchSecurities } from "@/lib/security-search";
import type { SecuritySearchKind } from "@/lib/security-search";

const kinds = new Set<SecuritySearchKind>(["股票", "ETF", "场外基金", "美股"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "") as SecuritySearchKind;
  if (!kinds.has(kind)) return Response.json({ error: "搜索类型无效。", items: [] }, { status: 400 });
  if (query.length < 1 || query.length > 30) return Response.json({ items: [] });
  if (!/^[\p{L}\p{N} .·()（）+-]+$/u.test(query)) return Response.json({ error: "请输入证券代码或名称。", items: [] }, { status: 400 });
  try {
    const items = await searchSecurities(query, kind);
    return Response.json({ items, privacy: "仅向证券搜索源发送本次代码或名称关键词。" }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return Response.json({ error: "证券搜索暂不可用，请稍后重试。", items: [] }, { status: 502 });
  }
}
