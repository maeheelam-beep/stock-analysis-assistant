import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("health endpoint separates configuration, recent source status, and unknown state", async () => {
  const route = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");

  assert.match(route, /requireAuthenticatedOwner/);
  assert.match(route, /DEEPSEEK_RELAY_URL/);
  assert.match(route, /DEEPSEEK_RELAY_TOKEN/);
  assert.match(route, /state: "unknown"/);
  assert.match(route, /unknown 表示尚未发起该类上游请求/);
  assert.match(route, /Cache-Control.*private, no-store/);
});

test("local evidence package 2.0 keeps complete research details outside external AI", async () => {
  const source = await readFile(new URL("../lib/evidence-data.ts", import.meta.url), "utf8");

  assert.match(source, /packageVersion: "2\.0"/);
  assert.match(source, /collectComprehensiveAnalysisContext/);
  assert.match(source, /coverage,/);
  assert.match(source, /missingCategories,/);
  assert.match(source, /summarizeTransactions\(transactions\)/);
  assert.match(source, /riskMetrics: research\?\.riskMetrics \?\? research\?\.fundHistory\?\.riskMetrics/);
  assert.match(source, /fundamentals: research\?\.fundamentals/);
  assert.match(source, /disclosedHoldings: fundProduct\.holdings/);
  assert.match(source, /不会发送给外部 AI/);
});
