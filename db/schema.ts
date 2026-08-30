import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const holdings = sqliteTable(
  "holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["股票", "ETF", "场外基金"] }).notNull(),
    cost: text("cost").notNull(),
    quantity: text("quantity").notNull(),
    holdingAmount: text("holding_amount"),
    holdingProfit: text("holding_profit"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("idx_holdings_owner_kind_code").on(table.ownerKey, table.kind, table.code),
    index("idx_holdings_owner_updated").on(table.ownerKey, table.updatedAt),
  ],
);

export const usWatchlist = sqliteTable(
  "us_watchlist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("idx_us_watchlist_owner_symbol").on(table.ownerKey, table.symbol),
    index("idx_us_watchlist_owner_updated").on(table.ownerKey, table.updatedAt),
  ],
);

export const stockWatchlist = sqliteTable(
  "stock_watchlist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("idx_stock_watchlist_owner_code").on(table.ownerKey, table.code),
    index("idx_stock_watchlist_owner_updated").on(table.ownerKey, table.updatedAt),
  ],
);

/**
 * 交易流水是持仓的可追溯来源。当前匿名 V1 仍保留 holdings 快照，
 * 这张表让后续可逐步从“手填成本”迁移到买卖、费用和分红组成的账本。
 */
export const portfolioTransactions = sqliteTable(
  "portfolio_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["股票", "ETF", "场外基金"] }).notNull(),
    side: text("side", { enum: ["买入", "卖出", "分红", "费用", "期初"] }).notNull(),
    quantity: text("quantity"),
    price: text("price"),
    amount: text("amount").notNull(),
    fee: text("fee").notNull().default("0"),
    occurredAt: integer("occurred_at").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("idx_portfolio_transactions_owner_occurred").on(table.ownerKey, table.occurredAt),
    index("idx_portfolio_transactions_owner_asset").on(table.ownerKey, table.kind, table.code),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
);

export const accountSessions = sqliteTable(
  "account_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    lastSeenAt: integer("last_seen_at").notNull().default(sql`(unixepoch() * 1000)`),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    index("idx_account_sessions_account").on(table.accountId, table.expiresAt),
    index("idx_account_sessions_token").on(table.tokenHash),
  ],
);
