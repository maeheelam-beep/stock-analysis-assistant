import { ensurePortfolioSchema, getD1 } from "@/db";
import type { UsWatchlistRecord } from "@/lib/types";

const MAX_US_WATCHLIST_ITEMS = 30;

type UsWatchlistRow = {
  id: number;
  symbol: string;
  name: string;
  created_at: number;
  updated_at: number;
};

function toRecord(row: UsWatchlistRow): UsWatchlistRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateUsWatchlistItem(input: unknown) {
  const payload = (input ?? {}) as Record<string, unknown>;
  const symbol = String(payload.symbol ?? "").trim().toUpperCase();
  const name = String(payload.name ?? "").trim();
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error("美股代码格式无效，请从搜索结果中选择。");
  if (name.length < 1 || name.length > 80) throw new Error("美股名称长度应为 1–80 个字符。");
  return { symbol, name };
}

export async function listUsWatchlist(ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare(`
    SELECT id, symbol, name, created_at, updated_at
    FROM us_watchlist
    WHERE owner_key = ?
    ORDER BY updated_at DESC, id DESC
  `).bind(ownerKey).all<UsWatchlistRow>();
  return result.results.map(toRecord);
}

export async function saveUsWatchlistItem(input: unknown, ownerKey: string) {
  const item = validateUsWatchlistItem(input);
  await ensurePortfolioSchema();
  const existing = await getD1().prepare(`
    SELECT id FROM us_watchlist WHERE owner_key = ? AND symbol = ?
  `).bind(ownerKey, item.symbol).first<{ id: number }>();

  if (!existing) {
    const count = await getD1().prepare(`
      SELECT COUNT(*) AS total FROM us_watchlist WHERE owner_key = ?
    `).bind(ownerKey).first<{ total: number }>();
    if (Number(count?.total ?? 0) >= MAX_US_WATCHLIST_ITEMS) throw new Error(`美股自选最多保存 ${MAX_US_WATCHLIST_ITEMS} 只，请先删除不再关注的公司。`);
  }

  const now = Date.now();
  await getD1().prepare(`
    INSERT INTO us_watchlist (owner_key, symbol, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_key, symbol) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at
  `).bind(ownerKey, item.symbol, item.name, now, now).run();

  const row = await getD1().prepare(`
    SELECT id, symbol, name, created_at, updated_at
    FROM us_watchlist
    WHERE owner_key = ? AND symbol = ?
  `).bind(ownerKey, item.symbol).first<UsWatchlistRow>();
  if (!row) throw new Error("美股自选保存后未能读取。");
  return { item: toRecord(row), created: !existing };
}

export async function deleteUsWatchlistItem(id: number, ownerKey: string) {
  await ensurePortfolioSchema();
  const result = await getD1().prepare("DELETE FROM us_watchlist WHERE id = ? AND owner_key = ?").bind(id, ownerKey).run();
  return Number(result.meta.changes ?? 0) > 0;
}
