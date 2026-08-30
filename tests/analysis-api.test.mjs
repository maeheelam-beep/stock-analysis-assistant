import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/analysis/route.ts", import.meta.url);

test("DeepSeek analysis uses the current official v1 endpoint", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /https:\/\/api\.deepseek\.com\/v1\/chat\/completions/);
  assert.doesNotMatch(route, /api\.deepseek\.com\/chat\/completions/);
});

test("DeepSeek upstream errors expose only the provider message", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /errorBody\?\.error\?\.message/);
  assert.doesNotMatch(route, /Authorization.*error|apiKey.*error/i);
});

test("DeepSeek relay is HTTPS-only and uses an independent server-side token", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /DEEPSEEK_RELAY_URL/);
  assert.match(route, /DEEPSEEK_RELAY_TOKEN/);
  assert.match(route, /parsedRelayUrl\.protocol !== "https:"/);
  assert.match(route, /"X-Relay-Token": relayToken/);
  assert.doesNotMatch(route, /error:\s*[`"'].*relayToken/i);
});

test("local evidence mode is separate from the DeepSeek consent path", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /body\.mode === "evidence"/);
  assert.match(route, /buildEvidencePackage\(owner\.ownerKey\)/);
  assert.match(route, /证据包生成失败/);
  assert.match(route, /body\.consent !== true/);
});

test("AI analysis predicts the next trading day in plain language with actions", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /AI 联合研判小组，不是真人专家/);
  assert.match(route, /盘面观察员/);
  assert.match(route, /持仓研究员/);
  assert.match(route, /风险把关员/);
  assert.match(route, /白话整理员/);
  assert.match(route, /不要输出内部推理过程/);
  assert.match(route, /像给不懂金融术语的朋友解释/);
  assert.match(route, /portfolioStats/);
  assert.match(route, /annualizedVolatilityPercent/);
  assert.match(route, /maxDrawdownPercent/);
  assert.match(route, /valueAtRisk95Percent/);
  assert.match(route, /expertPanel.*tomorrow.*forecast.*actions.*risks.*watchItems.*similarPattern/s);
  assert.match(route, /expertPanel 必须恰好包含三项/);
  assert.match(route, /字段为 summary、stance、score、riskLevel、expertPanel、tomorrow/);
  assert.match(route, /upProbability、flatProbability、downProbability/);
  assert.match(route, /focusAsset 必须是证据中某个完整资产别名/);
  assert.match(route, /suggestedAction/);
  assert.match(route, /actions 必须逐只持仓给建议/);
  assert.match(route, /target 必须原样使用证据里的完整资产别名/);
  assert.match(route, /missingActions/);
  assert.match(route, /sort\(\(left, right\) => right\.length - left\.length\)/);
  assert.match(route, /target: restoreAliases\(targetAlias, aliases\)/);
  assert.match(route, /不能保证收益、要求自动交易或给出精确买卖数量/);
  assert.match(route, /normalizedTomorrowProbabilities/);
});

test("AI analysis incorporates complete public market and per-holding evidence", async () => {
  const [route, context] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(new URL("../lib/analysis-context.ts", import.meta.url), "utf8"),
  ]);

  assert.match(context, /fetchMarketSnapshot\(defaultIndices\)/);
  assert.match(context, /fetchMarketSnapshot\(holdings\.map/);
  assert.match(context, /fetchMarketNews/);
  assert.match(context, /fetchFundamentalSnapshot/);
  assert.match(context, /fetchFundResearch/);
  assert.match(context, /fetchHistorySimilarity/);
  assert.match(context, /fetchFundHistorySimilarity/);
  assert.match(context, /fetchRiskMetrics/);
  assert.match(context, /key: "breadth"/);
  assert.match(context, /key: "sectors"/);
  assert.match(route, /marketContext/);
  assert.match(route, /strongestSectors/);
  assert.match(route, /latestNews/);
  assert.match(route, /fundamentals:/);
  assert.match(route, /fundResearch:/);
  assert.match(route, /missingCategories/);
  assert.match(route, /必须综合使用证据中的全部类别/);
  assert.match(route, /未发送持仓代码、名称、成本、数量、金额、流水明细或设备标识/);
});
