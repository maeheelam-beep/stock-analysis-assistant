import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/fund-history-data.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/fund-history/route.ts", import.meta.url), "utf8");

test("fund history compares one fund against its own public NAV history", () => {
  assert.match(source, /export function parseFundNetWorthScript/);
  assert.match(source, /Data_netWorthTrend/);
  assert.match(source, /timeZone: "Asia\/Shanghai"/);
  assert.match(source, /allPoints\.slice\(-780\)/);
  assert.match(source, /const shapeLength = 15/);
  assert.match(source, /candidate\.similarity < 0\.55/);
  assert.match(source, /matches\.length >= 3 \? "available" : "insufficient"/);
  assert.match(source, /FUND_HISTORY_CACHE_TTL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(source, /历史相似不代表未来表现/);
});

test("fund history API validates fund type and limits browser refresh pressure", () => {
  assert.match(route, /type !== "ETF" && type !== "场外基金"/);
  assert.match(route, /\^\\d\{6\}\$/);
  assert.match(route, /max-age=300, stale-while-revalidate=21600/);
});
