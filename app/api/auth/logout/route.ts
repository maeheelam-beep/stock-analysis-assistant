import { logoutAccount } from "@/lib/auth";
import { getDeviceOwner, withDeviceCookie } from "@/lib/device-owner";

export async function POST(request: Request) {
  try {
    const owner = await getDeviceOwner(request);
    const clearCookie = await logoutAccount(request);
    return withDeviceCookie(Response.json({ authenticated: false, user: null, sync: "device" }), [owner.setCookie, clearCookie]);
  } catch {
    return Response.json({ error: "退出登录失败，请稍后重试。" }, { status: 503 });
  }
}
