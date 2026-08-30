import { fetchFundHistorySimilarity } from "@/lib/fund-history-data";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { code?: unknown; name?: unknown; type?: unknown };
    const code = String(payload.code ?? "").trim();
    const name = String(payload.name ?? "").trim().slice(0, 80);
    const type = String(payload.type ?? "");
    if (!/^\d{6}$/.test(code) || (type !== "ETF" && type !== "场外基金")) return Response.json({ error: "请选择有效的 ETF 或场外基金。" }, { status: 400 });
    return Response.json(await fetchFundHistorySimilarity(code, name), { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=21600" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "基金历史相似请求失败。" }, { status: 502 });
  }
}
