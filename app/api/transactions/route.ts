import { requireAuthenticatedOwner, withDeviceCookie } from "@/lib/device-owner";
import { createTransaction, deleteTransaction, listTransactions, summarizeTransactions } from "@/lib/transactions-store";
import type { HoldingKind } from "@/lib/types";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "交易流水服务发生未知错误。";
}

export async function GET(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as HoldingKind | null;
    const code = url.searchParams.get("code")?.trim().toUpperCase() || "";
    const asset = type && code ? { type, code } : undefined;
    const transactions = await listTransactions(owner.ownerKey, asset);
    return withDeviceCookie(Response.json({ transactions, summary: summarizeTransactions(transactions), source: "D1" }), owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error), transactions: [], summary: [] }, { status: 503 }), owner.setCookie);
  }
}

export async function POST(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    const transaction = await createTransaction(await request.json(), owner.ownerKey);
    return withDeviceCookie(Response.json({ transaction }, { status: 201 }), owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error) }, { status: 400 }), owner.setCookie);
  }
}

export async function DELETE(request: Request) {
  const required = await requireAuthenticatedOwner(request);
  if (required.response) return required.response;
  const owner = required.owner;
  try {
    const payload = await request.json().catch(() => ({})) as { id?: unknown };
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return withDeviceCookie(Response.json({ error: "交易流水 id 无效。" }, { status: 400 }), owner.setCookie);
    const deleted = await deleteTransaction(id, owner.ownerKey);
    const response = deleted ? new Response(null, { status: 204 }) : Response.json({ error: "未找到该交易流水。" }, { status: 404 });
    return withDeviceCookie(response, owner.setCookie);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error) }, { status: 400 }), owner.setCookie);
  }
}
