import { ensurePortfolioSchema, getD1 } from "@/db";
import type { HoldingKind, PortfolioTransaction, PortfolioTransactionSide } from "@/lib/types";

type TransactionRow = {
  id: number;
  code: string;
  name: string;
  kind: HoldingKind;
  side: PortfolioTransactionSide;
  quantity: string | null;
  price: string | null;
  amount: string;
  fee: string;
  occurred_at: number;
  note: string | null;
  created_at: number;
};

const allowedKinds = new Set<HoldingKind>(["股票", "ETF", "场外基金"]);
const allowedSides = new Set<PortfolioTransactionSide>(["买入", "卖出", "分红", "费用", "期初"]);

function toRecord(row: TransactionRow): PortfolioTransaction {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.kind,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    fee: row.fee,
    occurredAt: row.occurred_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

function decimal(value: unknown, label: string, { optional = false, maxDecimals = 2, allowZero = false } = {}) {
  const text = String(value ?? "").trim();
  if (optional && text === "") return null;
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${maxDecimals}})?$`);
  if (!pattern.test(text) || (allowZero ? Number(text) < 0 : Number(text) <= 0)) throw new Error(`${label}必须是${allowZero ? "不小于 0" : "大于 0"}的数字，最多 ${maxDecimals} 位小数。`);
  return text;
}

export function validateTransaction(input: unknown) {
  const payload = (input ?? {}) as Record<string, unknown>;
  const type = String(payload.type ?? "") as HoldingKind;
  const side = String(payload.side ?? "") as PortfolioTransactionSide;
  const code = String(payload.code ?? "").trim().toUpperCase();
  const name = String(payload.name ?? "").trim();
  const amount = decimal(payload.amount, "成交金额", { maxDecimals: 2 });
  const fee = decimal(payload.fee ?? "0", "费用", { maxDecimals: 2, optional: true, allowZero: true }) ?? "0";
  const quantity = decimal(payload.quantity, "数量", { maxDecimals: 4, optional: true });
  const price = decimal(payload.price, "成交价", { maxDecimals: 4, optional: true });
  const note = String(payload.note ?? "").trim();
  const occurredAtValue = payload.occurredAt;
  const occurredAt = occurredAtValue === undefined || occurredAtValue === null || occurredAtValue === ""
    ? Date.now()
    : typeof occurredAtValue === "number" && Number.isFinite(occurredAtValue)
      ? Math.round(occurredAtValue)
      : Date.parse(String(occurredAtValue));

  if (!allowedKinds.has(type)) throw new Error("交易标的类型无效。");
  if (!allowedSides.has(side)) throw new Error("交易类型无效。");
  if (!/^\d{6}$/.test(code)) throw new Error("A 股、ETF 或场外基金代码应为 6 位数字。");
  if (!name || name.length > 60) throw new Error("名称长度应为 1–60 个字符。");
  if (!Number.isFinite(occurredAt) || occurredAt < 0) throw new Error("发生时间无效。");
  if (note.length > 200) throw new Error("备注最多 200 个字符。");
  if (["买入", "卖出", "期初"].includes(side) && (!quantity || !price)) throw new Error("买入、卖出和期初记录需要填写数量与成交价。");
  if (["分红", "费用"].includes(side) && (quantity || price)) throw new Error("分红或费用记录不需要填写数量与成交价。");
  return { type, side, code, name, amount, fee, quantity, price, note: note || null, occurredAt };
}

const SELECT_COLUMNS = "id, code, name, kind, side, quantity, price, amount, fee, occurred_at, note, created_at";

export async function listTransactions(ownerKey: string, asset?: { type: HoldingKind; code: string }) {
  await ensurePortfolioSchema();
  const db = getD1();
  const result = asset
    ? await db.prepare(`SELECT ${SELECT_COLUMNS} FROM portfolio_transactions WHERE owner_key = ? AND kind = ? AND code = ? ORDER BY occurred_at DESC, id DESC`).bind(ownerKey, asset.type, asset.code).all<TransactionRow>()
    : await db.prepare(`SELECT ${SELECT_COLUMNS} FROM portfolio_transactions WHERE owner_key = ? ORDER BY occurred_at DESC, id DESC LIMIT 500`).bind(ownerKey).all<TransactionRow>();
  return result.results.map(toRecord);
}

export async function createTransaction(input: unknown, ownerKey: string) {
  const transaction = validateTransaction(input);
  await ensurePortfolioSchema();
  const result = await getD1().prepare(`
    INSERT INTO portfolio_transactions (owner_key, code, name, kind, side, quantity, price, amount, fee, occurred_at, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(ownerKey, transaction.code, transaction.name, transaction.type, transaction.side, transaction.quantity, transaction.price, transaction.amount, transaction.fee, transaction.occurredAt, transaction.note).run();
  const id = Number(result.meta.last_row_id ?? 0);
  const row = await getD1().prepare(`SELECT ${SELECT_COLUMNS} FROM portfolio_transactions WHERE id = ? AND owner_key = ?`).bind(id, ownerKey).first<TransactionRow>();
  if (!row) throw new Error("交易流水保存后未能读取。");
  return toRecord(row);
}

export async function deleteTransaction(id: number, ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare("DELETE FROM portfolio_transactions WHERE id = ? AND owner_key = ?").bind(id, ownerKey).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export type CostLot = {
  sourceTransactionId: number;
  occurredAt: number;
  quantity: number;
  unitCost: number;
};

export type TransactionAssetSummary = {
  code: string;
  name: string;
  type: HoldingKind;
  quantity: number;
  /** Remaining FIFO cost basis, excluding future market value. */
  investedAmount: number;
  costBasis: number;
  realizedAmount: number;
  realizedProfit: number;
  dividends: number;
  fees: number;
  transactionCount: number;
  lotCount: number;
  remainingLots: CostLot[];
};

export function summarizeTransactions(transactions: PortfolioTransaction[]) {
  const grouped = new Map<string, TransactionAssetSummary>();
  // A list endpoint is newest-first, but accounting must always replay history.
  const ordered = [...transactions].sort((a, b) => a.occurredAt - b.occurredAt || a.id - b.id);
  for (const transaction of ordered) {
    const key = `${transaction.type}:${transaction.code}`;
    const current = grouped.get(key) ?? { code: transaction.code, name: transaction.name, type: transaction.type, quantity: 0, investedAmount: 0, costBasis: 0, realizedAmount: 0, realizedProfit: 0, dividends: 0, fees: 0, transactionCount: 0, lotCount: 0, remainingLots: [] };
    const amount = Number(transaction.amount) || 0;
    const fee = Number(transaction.fee) || 0;
    const quantity = Number(transaction.quantity ?? 0) || 0;
    current.transactionCount += 1;
    current.fees += fee;
    if (transaction.side === "买入" || transaction.side === "期初") {
      const unitCost = quantity > 0 ? (amount + fee) / quantity : 0;
      if (quantity > 0 && Number.isFinite(unitCost)) current.remainingLots.push({ sourceTransactionId: transaction.id, occurredAt: transaction.occurredAt, quantity, unitCost });
    } else if (transaction.side === "卖出") {
      let remainingToSell = quantity;
      let costBasis = 0;
      while (remainingToSell > 1e-9 && current.remainingLots.length) {
        const lot = current.remainingLots[0];
        const consumed = Math.min(remainingToSell, lot.quantity);
        costBasis += consumed * lot.unitCost;
        lot.quantity -= consumed;
        remainingToSell -= consumed;
        if (lot.quantity <= 1e-9) current.remainingLots.shift();
      }
      current.realizedProfit += amount - fee - costBasis;
      current.realizedAmount += amount - fee;
    } else if (transaction.side === "分红") {
      current.dividends += amount;
    } else {
      current.fees += amount;
    }
    current.quantity = current.remainingLots.reduce((sum, lot) => sum + lot.quantity, 0);
    current.costBasis = current.remainingLots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
    current.investedAmount = current.costBasis;
    current.lotCount = current.remainingLots.length;
    grouped.set(key, current);
  }
  return [...grouped.values()].map((item) => ({ ...item, quantity: Math.max(0, item.quantity), costBasis: Math.max(0, item.costBasis), investedAmount: Math.max(0, item.investedAmount) })).filter((item) => item.quantity > 0 || item.investedAmount > 0 || item.dividends > 0 || item.realizedAmount !== 0 || item.fees > 0);
}
