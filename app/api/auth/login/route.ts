import { loginAccount } from "@/lib/auth";
import { getDeviceOwner, withDeviceCookie } from "@/lib/device-owner";

function messageFrom(error: unknown) { return error instanceof Error ? error.message : "登录失败，请稍后重试。"; }

export async function POST(request: Request) {
  const owner = await getDeviceOwner(request);
  try {
    const payload = await request.json() as { email?: unknown; password?: unknown };
    const result = await loginAccount(request, payload.email, payload.password, owner.anonymousOwnerKey);
    return withDeviceCookie(Response.json({ authenticated: true, user: result.user, sync: "account" }), [owner.setCookie, result.sessionCookie]);
  } catch (error) {
    return withDeviceCookie(Response.json({ error: messageFrom(error) }, { status: 400 }), owner.setCookie);
  }
}
