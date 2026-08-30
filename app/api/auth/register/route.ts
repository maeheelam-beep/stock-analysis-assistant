import { registerAccount } from "@/lib/auth";
import { getDeviceOwner, withDeviceCookie } from "@/lib/device-owner";

function messageFrom(error: unknown) { return error instanceof Error ? error.message : "注册失败，请稍后重试。"; }

export async function POST(request: Request) {
  const owner = await getDeviceOwner(request);
  try {
    const payload = await request.json() as { email?: unknown; password?: unknown };
    const result = await registerAccount(request, payload.email, payload.password, owner.anonymousOwnerKey);
    return withDeviceCookie(Response.json({ authenticated: true, user: result.user, sync: "account" }, { status: 201 }), [owner.setCookie, result.sessionCookie]);
  } catch (error) {
    const message = messageFrom(error);
    return withDeviceCookie(Response.json({ error: message }, { status: message.includes("已注册") ? 409 : 400 }), owner.setCookie);
  }
}
