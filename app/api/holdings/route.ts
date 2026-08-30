import { requireAuthenticatedOwner, withDeviceCookie } from "@/lib/device-owner";
import { createHolding, deleteHolding, listHoldings } from "@/lib/holdings-store";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "持仓服务发生未知错误。";
}

export async function GET(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    return withDeviceCookie(Response.json({ holdings: await listHoldings(owner.ownerKey), source: "D1" }), owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error), holdings: [] }, { status: 503 }), owner.setCookie);
  }
}

export async function POST(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    const holding = await createHolding(await request.json(), owner.ownerKey);
    return withDeviceCookie(Response.json({ holding }, { status: 201 }), owner.setCookie);
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
    if (!Number.isInteger(id) || id <= 0) return withDeviceCookie(Response.json({ error: "持仓 id 无效。" }, { status: 400 }), owner.setCookie);
    const deleted = await deleteHolding(id, owner.ownerKey);
    const response = deleted ? new Response(null, { status: 204 }) : Response.json({ error: "未找到该持仓。" }, { status: 404 });
    return withDeviceCookie(response, owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error) }, { status: 400 }), owner.setCookie);
  }
}
