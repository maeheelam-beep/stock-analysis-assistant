import { requireAuthenticatedOwner, withDeviceCookie } from "@/lib/device-owner";
import { deleteStockWatchlistItem, listStockWatchlist, saveStockWatchlistItem } from "@/lib/stock-watchlist-store";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "股票自选服务发生未知错误。";
}

export async function GET(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    return withDeviceCookie(Response.json({ items: await listStockWatchlist(owner.ownerKey), source: "D1" }), owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error), items: [] }, { status: 503 }), owner.setCookie);
  }
}

export async function POST(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    const saved = await saveStockWatchlistItem(await request.json(), owner.ownerKey);
    return withDeviceCookie(Response.json(saved, { status: saved.created ? 201 : 200 }), owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error) }, { status: 400 }), owner.setCookie);
  }
}

export async function DELETE(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    const payload = (await request.json()) as { id?: unknown };
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return withDeviceCookie(Response.json({ error: "股票自选 id 无效。" }, { status: 400 }), owner.setCookie);
    const deleted = await deleteStockWatchlistItem(id, owner.ownerKey);
    const response = deleted ? new Response(null, { status: 204 }) : Response.json({ error: "未找到该股票自选。" }, { status: 404 });
    return withDeviceCookie(response, owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error) }, { status: 400 }), owner.setCookie);
  }
}
