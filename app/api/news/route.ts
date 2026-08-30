import { fetchMarketNews, fetchNotices } from "@/lib/news-data";
import { requireAuthenticatedOwner } from "@/lib/device-owner";

export async function GET() {
  try {
    const result = await fetchMarketNews();
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=240" } });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "市场快讯同步失败。";
    return Response.json({ error: message, items: [] }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  try {
    const payload = (await request.json()) as { codes?: unknown };
    const codes = (Array.isArray(payload.codes) ? payload.codes : []).map(String).map((code) => code.trim()).filter((code) => /^\d{6}$/.test(code)).slice(0, 12);
    const result = await fetchNotices(codes);
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ error: "资讯请求格式无效。", items: [] }, { status: 400 });
  }
}
