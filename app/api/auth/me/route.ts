import { getDeviceOwner, withDeviceCookie } from "@/lib/device-owner";

export async function GET(request: Request) {
  try {
    const owner = await getDeviceOwner(request);
    return withDeviceCookie(Response.json({ authenticated: Boolean(owner.account), user: owner.account?.user ?? null, sync: owner.account ? "account" : "device" }), owner.setCookie);
  } catch {
    return Response.json({ error: "账号状态暂时不可用。" }, { status: 503 });
  }
}
