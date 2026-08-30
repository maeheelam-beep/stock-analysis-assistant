import { defaultIndices, fetchMarketSnapshot, type MarketItem } from "@/lib/market-data";
import { requireAuthenticatedOwner } from "@/lib/device-owner";
import type { HoldingKind } from "@/lib/types";

const kinds = new Set<HoldingKind>(["股票", "ETF", "场外基金"]);

function parseBody(input: unknown) {
  const body = (input ?? {}) as { holdings?: unknown; usSymbols?: unknown; includeUsMarket?: unknown; includeAMarket?: unknown };
  const holdings = Array.isArray(body.holdings) ? body.holdings : [];
  const items: MarketItem[] = holdings.slice(0, 30).flatMap((value) => {
    const row = value as Record<string, unknown>;
    const type = String(row.type ?? "") as HoldingKind;
    const code = String(row.code ?? "").trim();
    if (!kinds.has(type) || !/^\d{6}$/.test(code)) return [];
    return [{ type, code }];
  });
  const usSymbols = (Array.isArray(body.usSymbols) ? body.usSymbols : [])
    .map(String)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z][A-Z.-]{0,9}$/.test(symbol))
    .slice(0, 20);
  return { items, usSymbols, includeUsMarket: body.includeUsMarket === true, includeAMarket: body.includeAMarket === true };
}

function json(data: unknown) {
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  return json(await fetchMarketSnapshot(defaultIndices, [], false, true));
}

export async function POST(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  try {
    const { items, usSymbols, includeUsMarket, includeAMarket } = parseBody(await request.json());
    return json(await fetchMarketSnapshot([...defaultIndices, ...items], usSymbols, includeUsMarket, includeAMarket));
  } catch {
    return Response.json({ error: "行情请求格式无效。" }, { status: 400 });
  }
}
