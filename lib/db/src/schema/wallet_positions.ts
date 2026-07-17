import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletPositionStatusEnum = pgEnum("wallet_position_status", [
  "open",
  "closed",
  "hit",
  "stopped",
]);

export const walletPositionsTable = pgTable("wallet_positions", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  sodexPositionId: text("sodex_position_id").notNull(),
  sodexTradeId: text("sodex_trade_id"),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  leverage: integer("leverage").notNull().default(1),
  status: walletPositionStatusEnum("status").notNull().default("open"),
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at"),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }),
  pnlPct: numeric("pnl_pct", { precision: 10, scale: 4 }),
  notionalUsd: numeric("notional_usd", { precision: 18, scale: 2 }),
  isVerified: boolean("is_verified").notNull().default(false),
  isOnChainVerified: boolean("is_on_chain_verified").notNull().default(false),
  source: text("source"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  walletPosUq: uniqueIndex("wallet_positions_wallet_pos_uq").on(t.walletProfileId, t.sodexPositionId),
  walletPosIdx: index("wallet_positions_wallet_idx").on(t.walletProfileId, t.status, t.closedAt),
  symbolIdx: index("wallet_positions_symbol_idx").on(t.symbol, t.closedAt),
}));

export type WalletPosition = typeof walletPositionsTable.$inferSelect;
export type InsertWalletPosition = typeof walletPositionsTable.$inferInsert;
