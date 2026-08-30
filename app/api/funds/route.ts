import { fetchFundResearch, type FundResearchInput } from "@/lib/fund-data";

function parseBody(input: unknown) {
  const body = (input ?? {}) as { funds?: unknown };
  return (Array.isArray(body.funds) ? body.funds : []).slice(0, 12).flatMap((value) => {
    const row = value as Record<string, unknown>;
    const code = String(row.code ?? "").trim();
    const name = String(row.name ?? "").trim().slice(0, 80);
    const type = String(row.type ?? "");
    if (!/^\d{6}$/.test(code) || (type !== "ETF" && type !== "场外基金")) return [];
    return [{ code, name, type } as FundResearchInput];
  });
}

export async function POST(request: Request) {
  try {
    const funds = parseBody(await request.json());
    return Response.json(await fetchFundResearch(funds), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "基金研究数据请求格式无效。" }, { status: 400 });
  }
}
