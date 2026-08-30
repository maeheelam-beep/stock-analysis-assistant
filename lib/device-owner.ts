import { getAuthSession, migrateOwnerData } from "@/lib/auth";

const COOKIE_NAME = "glp_device";
const ONE_YEAR = 60 * 60 * 24 * 365;

function parseCookies(header: string | null) {
  return new Map(
    (header ?? "").split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
      const index = item.indexOf("=");
      return index < 0 ? [item, ""] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
    }),
  );
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export async function getDeviceOwner(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const existing = cookies.get(COOKIE_NAME);
  const token = existing && /^[a-f0-9-]{36}$/i.test(existing) ? existing : crypto.randomUUID();
  const anonymousOwnerKey = await hashToken(token);
  const account = await getAuthSession(request);
  if (account) await migrateOwnerData(anonymousOwnerKey, account.ownerKey);
  const ownerKey = account?.ownerKey ?? anonymousOwnerKey;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  // Refresh the anonymous device cookie on every private-data request so active
  // users keep access to their saved records. Clearing site data or changing
  // browsers still creates a new private space because there is no login yet.
  const setCookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ONE_YEAR}${secure}`;
  return { ownerKey, anonymousOwnerKey, account, setCookie };
}

/**
 * Private data is account-scoped in forced-login mode. Keep the anonymous
 * device owner available for the login/register migration flow, but reject
 * every private API request until a valid account session is present.
 */
export async function requireAuthenticatedOwner(request: Request) {
  const owner = await getDeviceOwner(request);
  if (owner.account) return { owner, response: null as Response | null };
  return {
    owner,
    response: withDeviceCookie(
      Response.json({ error: "请先登录股基罗盘账号。", code: "AUTH_REQUIRED" }, { status: 401 }),
      owner.setCookie,
    ),
  };
}

export function withDeviceCookie(response: Response, setCookie: string | string[] | null) {
  for (const cookie of setCookie ? (Array.isArray(setCookie) ? setCookie : [setCookie]) : []) response.headers.append("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
