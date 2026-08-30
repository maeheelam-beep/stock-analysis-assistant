import { ensurePortfolioSchema, getD1 } from "@/db";
import type { StockWatchlistRecord } from "@/lib/types";

const MAX_STOCK_WATCHLIST_ITEMS = 30;

type StockWatchlistRow = {
  id: number;
  code: string;
  name: string;
  created_at: number;
  updated_at: number;
};

function toRecord(row: StockWatchlistRow): StockWatchlistRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateStockWatchlistItem(input: unknown) {
  const payload = (input ?? {}) as Record<string, unknown>;
  const code = String(payload.code ?? "").trim();
  const name = String(payload.name ?? "").trim();
  if (!/^\d{6}$/.test(code)) throw new Error("A 股代码格式无效，请从搜索结果中选择。");
  if (name.length < 1 || name.length > 80) throw new Error("股票名称长度应为 1–80 个字符。");
  return { code, name };
}

export async function listStockWatchlist(ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare(`
    SELECT id, code, name, created_at, updated_at
    FROM stock_watchlist
    WHERE owner_key = ?
    ORDER BY updated_at DESC, id DESC
  `).bind(ownerKey).all<StockWatchlistRow>();
  return result.results.map(toRecord);
}

export async function saveStockWatchlistItem(input: unknown, ownerKey: string) {
  const item = validateStockWatchlistItem(input);
  await ensurePortfolioSchema();
  const existing = await getD1().prepare(`
    SELECT id FROM stock_watchlist WHERE owner_key = ? AND code = ?
  `).bind(ownerKey, item.code).first<{ id: number }>();

  if (!existing) {
    const count = await getD1().prepare(`
      SELECT COUNT(*) AS total FROM stock_watchlist WHERE owner_key = ?
    `).bind(ownerKey).first<{ total: number }>();
    if (Number(count?.total ?? 0) >= MAX_STOCK_WATCHLIST_ITEMS) throw new Error(`股票自选最多保存 ${MAX_STOCK_WATCHLIST_ITEMS} 只，请先删除不再关注的股票。`);
  }

  const now = Date.now();
  await getD1().prepare(`
    INSERT INTO stock_watchlist (owner_key, code, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_key, code) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at
  `).bind(ownerKey, item.code, item.name, now, now).run();

  const row = await getD1().prepare(`
    SELECT id, code, name, created_at, updated_at
    FROM stock_watchlist
    WHERE owner_key = ? AND code = ?
  `).bind(ownerKey, item.code).first<StockWatchlistRow>();
  if (!row) throw new Error("股票自选保存后未能读取。");
  return { item: toRecord(row), created: !existing };
}

export async function deleteStockWatchlistItem(id: number, ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare("DELETE FROM stock_watchlist WHERE id = ? AND owner_key = ?").bind(id, ownerKey).run();
  return Number(result.meta.changes ?? 0) > 0;
}
