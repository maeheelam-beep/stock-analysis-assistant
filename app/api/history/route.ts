import { fetchHistorySimilarity } from "@/lib/history-data";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { code?: unknown };
    const code = String(payload.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return Response.json({ error: "股票代码应为 6 位数字。" }, { status: 400 });
    return Response.json(await fetchHistorySimilarity(code), { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=900" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "历史走势请求失败。" }, { status: 502 });
  }
}
