import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) throw new Error("持仓数据库尚未配置，请启用 D1 绑定 DB。");
  return env.DB;
}

let schemaReady: Promise<void> | null = null;

export function ensurePortfolioSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = d1.batch([
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS holdings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_key TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('股票', 'ETF', '场外基金')),
          cost TEXT NOT NULL,
          quantity TEXT NOT NULL,
          holding_amount TEXT,
          holding_profit TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `),
      d1.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_owner_kind_code
        ON holdings(owner_key, kind, code)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_holdings_owner_updated
        ON holdings(owner_key, updated_at)
      `),
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS us_watchlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_key TEXT NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `),
      d1.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_us_watchlist_owner_symbol
        ON us_watchlist(owner_key, symbol)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_us_watchlist_owner_updated
        ON us_watchlist(owner_key, updated_at)
      `),
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS stock_watchlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_key TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `),
      d1.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_watchlist_owner_code
        ON stock_watchlist(owner_key, code)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_stock_watchlist_owner_updated
        ON stock_watchlist(owner_key, updated_at)
      `),
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS portfolio_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_key TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('股票', 'ETF', '场外基金')),
          side TEXT NOT NULL CHECK (side IN ('买入', '卖出', '分红', '费用', '期初')),
          quantity TEXT,
          price TEXT,
          amount TEXT NOT NULL,
          fee TEXT NOT NULL DEFAULT '0',
          occurred_at INTEGER NOT NULL,
          note TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_owner_occurred
        ON portfolio_transactions(owner_key, occurred_at)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_owner_asset
        ON portfolio_transactions(owner_key, kind, code)
      `),
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL COLLATE NOCASE UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `),
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS account_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          expires_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_account_sessions_account
        ON account_sessions(account_id, expires_at)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS idx_account_sessions_token
        ON account_sessions(token_hash)
      `),
    ]).then(async () => {
      const columns = await d1.prepare("PRAGMA table_info(holdings)").all<{ name: string }>();
      const names = new Set(columns.results.map((column) => column.name));
      const migrations: ReturnType<typeof d1.prepare>[] = [];
      if (!names.has("holding_amount")) migrations.push(d1.prepare("ALTER TABLE holdings ADD COLUMN holding_amount TEXT"));
      if (!names.has("holding_profit")) migrations.push(d1.prepare("ALTER TABLE holdings ADD COLUMN holding_profit TEXT"));
      if (migrations.length) await d1.batch(migrations);
      await d1.prepare("PRAGMA optimize").run();
    }).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
