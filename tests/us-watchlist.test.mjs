import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("persists US watchlist by anonymous device without entering holdings", async () => {
  const [schema, database, store, route, deviceOwner] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/index.ts", root), "utf8"),
    readFile(new URL("lib/us-watchlist-store.ts", root), "utf8"),
    readFile(new URL("app/api/us-watchlist/route.ts", root), "utf8"),
    readFile(new URL("lib/device-owner.ts", root), "utf8"),
  ]);

  assert.match(schema, /sqliteTable\(\s*"us_watchlist"/);
  assert.match(schema, /uniqueIndex\("idx_us_watchlist_owner_symbol"\)/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS us_watchlist/);
  assert.match(store, /WHERE owner_key = \?/);
  assert.match(store, /MAX_US_WATCHLIST_ITEMS = 30/);
  assert.match(store, /ON CONFLICT\(owner_key, symbol\) DO UPDATE/);
  assert.match(store, /DELETE FROM us_watchlist WHERE id = \? AND owner_key = \?/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /withDeviceCookie/);
  assert.match(deviceOwner, /Max-Age=\$\{ONE_YEAR\}/);
  assert.doesNotMatch(store, /holdings|DeepSeek|analysis/i);
});
