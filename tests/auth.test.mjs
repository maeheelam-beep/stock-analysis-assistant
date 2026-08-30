import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("account auth has password hashing, expiring sessions, and migration", async () => {
  const auth = await read("lib/auth.ts");
  const owner = await read("lib/device-owner.ts");
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /PBKDF2_ITERATIONS/);
  assert.match(auth, /SESSION_COOKIE_NAME = "glp_session"/);
  assert.match(auth, /Max-Age=\$\{SESSION_MAX_AGE\}/);
  assert.match(auth, /migrateOwnerData/);
  assert.match(auth, /INSERT INTO accounts/);
  assert.match(auth, /INSERT INTO account_sessions/);
  assert.match(owner, /getAuthSession/);
  assert.match(owner, /account\?\.ownerKey/);
  assert.match(owner, /requireAuthenticatedOwner/);
  assert.match(owner, /AUTH_REQUIRED/);
});

test("account routes expose register, login, logout, and session status", async () => {
  assert.match(await read("app/api/auth/register/route.ts"), /registerAccount/);
  assert.match(await read("app/api/auth/login/route.ts"), /loginAccount/);
  assert.match(await read("app/api/auth/logout/route.ts"), /logoutAccount/);
  assert.match(await read("app/api/auth/me/route.ts"), /authenticated/);
  assert.match(await read("app/page.tsx"), /跨设备同步/);
  assert.match(await read("app/page.tsx"), /\/api\/auth\//);
  assert.match(await read("app/page.tsx"), /function ForcedLoginScreen/);
  assert.match(await read("app/page.tsx"), /登录后才能查看、添加和分析持仓/);
});

test("private data routes enforce an authenticated account", async () => {
  const routes = await Promise.all([
    read("app/api/holdings/route.ts"),
    read("app/api/transactions/route.ts"),
    read("app/api/stock-watchlist/route.ts"),
    read("app/api/us-watchlist/route.ts"),
    read("app/api/analysis/route.ts"),
    read("app/api/market/route.ts"),
    read("app/api/news/route.ts"),
  ]);
  for (const route of routes) {
    assert.match(route, /requireAuthenticatedOwner/);
    assert.match(route, /required\.response/);
  }
});
