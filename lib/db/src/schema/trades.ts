import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const tradeSideEnum = pgEnum("trade_side", ["LONG", "SHORT"]);

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").references(() => tradersTable.id),
  walletAddress: text("wallet_address"),
  accountId: integer("account_id"),
  leaderboardRank: integer("leaderboard_rank"),
  leaderboardWindow: text("leaderboard_window"),
  asset: text("asset").notNull(),
  side: tradeSideEnum("side").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }).notNull(),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }).notNull(),
  pnlPct: numeric("pnl_pct", { precision: 10, scale: 4 }).notNull(),
  positionSize: numeric("position_size", { precision: 18, scale: 4 }).notNull(),
  leverage: integer("leverage").notNull().default(1),
  isVerified: boolean("is_verified").notNull().default(false),
  isOnChainVerified: boolean("is_on_chain_verified").notNull().default(false),
  txHash: text("tx_hash"),
  sodexTradeId: text("sodex_trade_id"),
  likeCount: integer("like_count").notNull().default(0),
  comment: text("comment"),
  // Position open time from Sodex — used by the trader-graph for co-entry analysis.
  // Nullable for legacy rows; new rows always set this.
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Prevents duplicate-trade re-inserts if the poller crashes mid-loop or if the
  // backfill overlaps with the first scheduled poll. Per (traderId, sodexTradeId).
  sodexTradeUq: uniqueIndex("trades_trader_sodex_uq").on(t.traderId, t.sodexTradeId),
  walletSodexTradeUq: uniqueIndex("trades_wallet_sodex_uq").on(t.walletAddress, t.sodexTradeId),
}));

export type Trade = typeof tradesTable.$inferSelect;
export type InsertTrade = typeof tradesTable.$inferInsert;
