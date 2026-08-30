import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/news-data.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/news/route.ts", import.meta.url), "utf8");

test("market news aggregates independent media and official policy sources", () => {
  assert.match(source, /async function fetchEastmoneyNews/);
  assert.match(source, /async function fetchSinaNews/);
  assert.match(source, /async function fetchCsrcPolicies/);
  assert.match(source, /async function fetchGovernmentPolicies/);
  assert.match(source, /async function fetchTianapiNews/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /NEWS_CACHE_TTL_MS = 2 \* 60 \* 1000/);
  assert.match(source, /category: "政策"/);
});

test("news merging keeps all original links and isolates source failures", () => {
  assert.match(source, /export function mergeMarketNews/);
  assert.match(source, /similarTitle/);
  assert.match(source, /sourceCount: 1/);
  assert.match(source, /candidate\.url === source\.url/);
  assert.match(source, /所有市场资讯源暂不可用/);
  assert.match(route, /stale-while-revalidate=240/);
});
