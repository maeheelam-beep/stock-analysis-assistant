import { ensurePortfolioSchema, getD1 } from "@/db";

export const SESSION_COOKIE_NAME = "glp_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 120_000;

export type AuthUser = { id: number; email: string; createdAt: number };
export type AuthSession = { user: AuthUser; ownerKey: string; sessionToken: string };

type AccountRow = { id: number; email: string; password_hash: string; password_salt: string; created_at: number };
type SessionRow = { account_id: number; expires_at: number; email: string; created_at: number };

function hex(value: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(value instanceof Uint8Array ? value : value)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function bytesFromHex(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function hashToken(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: bytesFromHex(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return hex(bits);
}

async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = hex(salt);
  return { saltHex, hashHex: await hashPassword(password, saltHex) };
}

function parseCookies(header: string | null) {
  return new Map((header ?? "").split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return index < 0 ? [item, ""] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
  }));
}

function sessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateCredentials(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效的邮箱地址。");
  if (password.length < 8 || password.length > 128) throw new Error("密码长度需为 8-128 位。");
}

export function accountOwnerKey(accountId: number) {
  return hashToken(`account:${accountId}`);
}

export async function getAuthSession(request: Request): Promise<AuthSession | null> {
  await ensurePortfolioSchema();
  const token = parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE_NAME);
  if (!token || !/^[a-f0-9-]{20,}$/i.test(token)) return null;
  const tokenHash = await hashToken(token);
  const d1 = getD1();
  const row = await d1.prepare(`SELECT s.account_id, s.expires_at, a.email, a.created_at FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`)
    .bind(tokenHash, Date.now()).first<SessionRow>();
  if (!row) {
    await d1.prepare("DELETE FROM account_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  await d1.prepare("UPDATE account_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(Date.now(), tokenHash).run();
  return { user: { id: row.account_id, email: row.email, createdAt: row.created_at }, ownerKey: await accountOwnerKey(row.account_id), sessionToken: token };
}

/** Merge anonymous records into an account without erasing the original device copy. */
export async function migrateOwnerData(fromOwnerKey: string, toOwnerKey: string) {
  if (!fromOwnerKey || fromOwnerKey === toOwnerKey) return;
  await ensurePortfolioSchema();
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`UPDATE holdings SET owner_key = ? WHERE owner_key = ? AND NOT EXISTS (SELECT 1 FROM holdings existing WHERE existing.owner_key = ? AND existing.kind = holdings.kind AND existing.code = holdings.code)`)
      .bind(toOwnerKey, fromOwnerKey, toOwnerKey),
    d1.prepare(`UPDATE us_watchlist SET owner_key = ? WHERE owner_key = ? AND NOT EXISTS (SELECT 1 FROM us_watchlist existing WHERE existing.owner_key = ? AND existing.symbol = us_watchlist.symbol)`)
      .bind(toOwnerKey, fromOwnerKey, toOwnerKey),
    d1.prepare(`UPDATE stock_watchlist SET owner_key = ? WHERE owner_key = ? AND NOT EXISTS (SELECT 1 FROM stock_watchlist existing WHERE existing.owner_key = ? AND existing.code = stock_watchlist.code)`)
      .bind(toOwnerKey, fromOwnerKey, toOwnerKey),
    d1.prepare("UPDATE portfolio_transactions SET owner_key = ? WHERE owner_key = ?").bind(toOwnerKey, fromOwnerKey),
  ]);
}

async function createSession(request: Request, user: AuthUser, ownerKey: string) {
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const d1 = getD1();
  await d1.prepare("DELETE FROM account_sessions WHERE account_id = ? OR expires_at <= ?").bind(user.id, now).run();
  await d1.prepare("INSERT INTO account_sessions (account_id, token_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(user.id, tokenHash, now, now, now + SESSION_MAX_AGE * 1000).run();
  return { user, ownerKey, sessionCookie: sessionCookie(request, token) };
}

export async function registerAccount(request: Request, emailValue: unknown, passwordValue: unknown, anonymousOwnerKey: string) {
  const email = normalizeEmail(emailValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  validateCredentials(email, password);
  await ensurePortfolioSchema();
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id FROM accounts WHERE email = ? COLLATE NOCASE LIMIT 1").bind(email).first<{ id: number }>();
  if (existing) throw new Error("该邮箱已注册，请直接登录。");
  const passwordData = await createPasswordHash(password);
  const now = Date.now();
  const result = await d1.prepare("INSERT INTO accounts (email, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(email, passwordData.hashHex, passwordData.saltHex, now, now).run();
  const accountId = Number(result.meta.last_row_id);
  const ownerKey = await accountOwnerKey(accountId);
  await migrateOwnerData(anonymousOwnerKey, ownerKey);
  return createSession(request, { id: accountId, email, createdAt: now }, ownerKey);
}

export async function loginAccount(request: Request, emailValue: unknown, passwordValue: unknown, anonymousOwnerKey: string) {
  const email = normalizeEmail(emailValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  validateCredentials(email, password);
  await ensurePortfolioSchema();
  const d1 = getD1();
  const row = await d1.prepare("SELECT id, email, password_hash, password_salt, created_at FROM accounts WHERE email = ? COLLATE NOCASE LIMIT 1").bind(email).first<AccountRow>();
  if (!row || (await hashPassword(password, row.password_salt)) !== row.password_hash) throw new Error("邮箱或密码不正确。");
  const ownerKey = await accountOwnerKey(row.id);
  await migrateOwnerData(anonymousOwnerKey, ownerKey);
  return createSession(request, { id: row.id, email: row.email, createdAt: row.created_at }, ownerKey);
}

export async function logoutAccount(request: Request) {
  const token = parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE_NAME);
  await ensurePortfolioSchema();
  if (token) {
    const d1 = getD1();
    await d1.prepare("DELETE FROM account_sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
  }
  return clearSessionCookie(request);
}
