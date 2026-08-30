import { ensurePortfolioSchema, getD1 } from "@/db";
import type { HoldingKind, HoldingRecord } from "@/lib/types";

type HoldingRow = {
  id: number;
  code: string;
  name: string;
  kind: HoldingKind;
  cost: string;
  quantity: string;
  holding_amount: string | null;
  holding_profit: string | null;
  created_at: number;
  updated_at: number;
};

const allowedKinds = new Set<HoldingKind>(["股票", "ETF", "场外基金"]);

function toRecord(row: HoldingRow): HoldingRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.kind,
    cost: row.cost,
    quantity: row.quantity,
    holdingAmount: row.holding_amount,
    holdingProfit: row.holding_profit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateHolding(input: unknown) {
  const payload = (input ?? {}) as Record<string, unknown>;
  const type = String(payload.type ?? "") as HoldingKind;
  const code = String(payload.code ?? "").trim().toUpperCase();
  const name = String(payload.name ?? "").trim();
  const cost = String(payload.cost ?? "").trim();
  const quantity = String(payload.quantity ?? "").trim();
  const holdingAmount = String(payload.holdingAmount ?? "").trim();
  const holdingProfit = String(payload.holdingProfit ?? "").trim();

  if (!allowedKinds.has(type)) throw new Error("持仓类型无效。");
  if (!/^\d{6}$/.test(code)) throw new Error("A 股、ETF 或场外基金代码应为 6 位数字。");
  if (name.length < 1 || name.length > 60) throw new Error("名称长度应为 1–60 个字符。");
  if (type === "场外基金") {
    if (!/^\d+(?:\.\d{1,2})?$/.test(holdingAmount) || Number(holdingAmount) <= 0) throw new Error("持有金额必须是大于 0 的数字，最多 2 位小数。");
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(holdingProfit)) throw new Error("持有收益应填写收益金额，可填写负数，最多 2 位小数。");
    if (Number(holdingAmount) - Number(holdingProfit) <= 0) throw new Error("持有金额减去持有收益后必须大于 0，请核对金额。");
    return { type, code, name, cost: "", quantity: "", holdingAmount, holdingProfit };
  }
  if (!/^\d+(?:\.\d{1,4})?$/.test(cost) || Number(cost) <= 0) throw new Error("平均成本必须是大于 0 的数字，最多 4 位小数。");
  if (!/^\d+(?:\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0) throw new Error("数量必须是大于 0 的数字，最多 4 位小数。");
  return { type, code, name, cost, quantity, holdingAmount: null, holdingProfit: null };
}

export async function listHoldings(ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare(`
    SELECT id, code, name, kind, cost, quantity, holding_amount, holding_profit, created_at, updated_at
    FROM holdings
    WHERE owner_key = ?
    ORDER BY updated_at DESC, id DESC
  `).bind(ownerKey).all<HoldingRow>();
  return result.results.map(toRecord);
}

export async function createHolding(input: unknown, ownerKey: string) {
  const holding = validateHolding(input);
  await ensurePortfolioSchema();
  const now = Date.now();
  await getD1().prepare(`
    INSERT INTO holdings (owner_key, code, name, kind, cost, quantity, holding_amount, holding_profit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_key, kind, code) DO UPDATE SET
      name = excluded.name,
      cost = excluded.cost,
      quantity = excluded.quantity,
      holding_amount = excluded.holding_amount,
      holding_profit = excluded.holding_profit,
      updated_at = excluded.updated_at
  `).bind(ownerKey, holding.code, holding.name, holding.type, holding.cost, holding.quantity, holding.holdingAmount, holding.holdingProfit, now, now).run();

  const row = await getD1().prepare(`
    SELECT id, code, name, kind, cost, quantity, holding_amount, holding_profit, created_at, updated_at
    FROM holdings
    WHERE owner_key = ? AND kind = ? AND code = ?
  `).bind(ownerKey, holding.type, holding.code).first<HoldingRow>();
  if (!row) throw new Error("持仓保存后未能读取。");
  return toRecord(row);
}

export async function deleteHolding(id: number, ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare("DELETE FROM holdings WHERE id = ? AND owner_key = ?").bind(id, ownerKey).run();
  return Number(result.meta.changes ?? 0) > 0;
}
