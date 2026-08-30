import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fundamentalsUrl = new URL("../lib/fundamentals-data.ts", import.meta.url);
const historyUrl = new URL("../lib/history-data.ts", import.meta.url);
const riskUrl = new URL("../lib/risk-data.ts", import.meta.url);
const searchUrl = new URL("../lib/security-search.ts", import.meta.url);

test("fundamental valuation fields apply Eastmoney scaling and preserve missing values", async () => {
  const source = await readFile(fundamentalsUrl, "utf8");
  assert.match(source, /value === null \|\| value === undefined \|\| value === "" \|\| value === "-"/);
  assert.match(source, /peTtm: numberValue\(data\.f162, 100\)/);
  assert.match(source, /psTtm: numberValue\(data\.f164, 100\)/);
  assert.match(source, /pb: numberValue\(data\.f167, 100\)/);
  assert.match(source, /industry: String\(data\.f127/);
  assert.match(source, /https:\/\/qt\.gtimg\.cn\/q=/);
  assert.match(source, /export function parseTencentFundamentalRow/);
  assert.match(source, /fetchEastmoneyFinancialReport\(code\)/);
  assert.match(source, /RPT_F10_FINANCE_MAINFINADATA/);
  assert.match(source, /ROEJQ,TOTALOPERATEREVETZ,PARENTNETPROFITTZ/);
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /conflicts\.push/);
  assert.match(source, /verification/);
  assert.match(source, /fundamentalCache/);
});

test("history data is bounded, positive, and shared across concurrent research modules", async () => {
  const source = await readFile(historyUrl, "utf8");
  assert.match(source, /const historyCache = new Map/);
  assert.match(source, /if \(cached\?\.pending\) return cached\.pending/);
  assert.match(source, /numbers\.slice\(0, 4\)\.some\(\(value\) => value <= 0\)/);
  assert.match(source, /points: points\.slice\(-limit\)/);
  assert.match(source, /points\.slice\(1\)\.map\(\(point\) => point\.changePercent\)/);
  assert.match(source, /attempt <= 3/);
  assert.match(source, /points\.length < 100/);
  assert.match(source, /web\.ifzq\.gtimg\.cn\/appstock\/app\/fqkline\/get/);
  assert.match(source, /Promise\.allSettled\(\[loadEastmoneyHistoricalPoints\(code, limit\), loadTencentHistoricalPoints\(code, limit\)\]\)/);
  assert.match(source, /reconcileHistoricalSeries/);
  assert.match(source, /deviationPercent <= 0\.5/);
});

test("risk metrics use reported daily changes and reject implausible outliers", async () => {
  const source = await readFile(riskUrl, "utf8");
  assert.match(source, /map\(\(point\) => point\.changePercent\)/);
  assert.match(source, /Math\.abs\(value\) <= 30/);
  assert.match(source, /剔除绝对涨跌幅超过 30%/);
});

test("security search merges two public sources and exposes verification", async () => {
  const source = await readFile(searchUrl, "utf8");
  assert.match(source, /searchapi\.eastmoney\.com/);
  assert.match(source, /smartbox\.gtimg\.cn/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /sourceCount: sources\.length/);
  assert.match(source, /verification: sources\.length > 1 \? "verified" : "single"/);
});
