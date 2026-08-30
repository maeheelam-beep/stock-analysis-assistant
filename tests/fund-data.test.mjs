import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/fund-data.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/funds/route.ts", import.meta.url), "utf8");

test("fund research parses manager profiles and quarterly holdings", () => {
  assert.match(source, /export function parseFundManagerPage/);
  assert.match(source, /基金经理变动一览/);
  assert.match(source, /export function parseFundHoldingsScript/);
  assert.match(source, /FundArchivesDatas\.aspx\?type=jjcc/);
  assert.match(source, /\.filter\(\(item\) => item\.fundCount >= 2\)/);
  assert.match(source, /FUND_RESEARCH_CACHE_TTL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(source, /FundPageInfoService\.tabjjgk/);
  assert.match(source, /fetchSinaFundProfile/);
  assert.match(source, /profileSources\.length < 2/);
  assert.match(source, /managerConflict/);
});

test("fund research API accepts only fund holdings", () => {
  assert.match(route, /type !== "ETF" && type !== "场外基金"/);
  assert.match(route, /\^\\d\{6\}\$/);
  assert.match(route, /Cache-Control": "private, no-store"/);
});
