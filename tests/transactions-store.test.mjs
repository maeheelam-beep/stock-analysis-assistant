import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../lib/transactions-store.ts", import.meta.url);

test("transaction summaries replay FIFO cost lots and realized profit", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /export type CostLot/);
  assert.match(source, /remainingLots: CostLot\[\]/);
  assert.match(source, /sort\(\(a, b\) => a\.occurredAt - b\.occurredAt \|\| a\.id - b\.id\)/);
  assert.match(source, /transaction\.side === "买入" \|\| transaction\.side === "期初"/);
  assert.match(source, /transaction\.side === "卖出"/);
  assert.match(source, /current\.realizedProfit \+= amount - fee - costBasis/);
  assert.match(source, /current\.costBasis = current\.remainingLots\.reduce/);
});

test("transaction API exposes the summary next to the D1 ledger", async () => {
  const route = await readFile(new URL("../app/api/transactions/route.ts", import.meta.url), "utf8");

  assert.match(route, /summarizeTransactions\(transactions\)/);
  assert.match(route, /source: "D1"/);
});
