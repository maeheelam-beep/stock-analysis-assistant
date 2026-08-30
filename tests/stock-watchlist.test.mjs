import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("persists A-share stock watchlist without entering holdings or AI analysis", async () => {
  const [schema, database, store, route, auth, page] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/index.ts", root), "utf8"),
    readFile(new URL("lib/stock-watchlist-store.ts", root), "utf8"),
    readFile(new URL("app/api/stock-watchlist/route.ts", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);

  assert.match(schema, /sqliteTable\(\s*"stock_watchlist"/);
  assert.match(schema, /uniqueIndex\("idx_stock_watchlist_owner_code"\)/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS stock_watchlist/);
  assert.match(store, /MAX_STOCK_WATCHLIST_ITEMS = 30/);
  assert.match(store, /ON CONFLICT\(owner_key, code\) DO UPDATE/);
  assert.match(store, /DELETE FROM stock_watchlist WHERE id = \? AND owner_key = \?/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(auth, /UPDATE stock_watchlist SET owner_key/);
  assert.match(page, /function StocksPage/);
  assert.match(page, /股票自选/);
  assert.match(page, /股票自选最多保存 30 只/);
  assert.match(page, /fetch\("\/api\/stock-watchlist"/);
  assert.match(page, /搜索代码或名称，加入后永久保存/);
  assert.doesNotMatch(store, /holdings|DeepSeek|analysis/i);
});
