import { pgTable, serial, integer, text, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletAssetStatsTable = pgTable("wallet_asset_stats", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  tradeCount: integer("trade_count").notNull().default(0),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  avgLeverage: numeric("avg_leverage", { precision: 8, scale: 2 }).notNull().default("0"),
  avgHoldMinutes: numeric("avg_hold_minutes", { precision: 12, scale: 2 }).notNull().default("0"),
  maxDrawdownUsd: numeric("max_drawdown_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  slippageUsd: numeric("slippage_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  lastTradeAt: timestamp("last_trade_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  walletAssetUq: uniqueIndex("wallet_asset_stats_wallet_symbol_uq").on(t.walletProfileId, t.symbol),
  walletAssetIdx: index("wallet_asset_stats_symbol_idx").on(t.symbol, t.pnlUsd),
}));

export type WalletAssetStats = typeof walletAssetStatsTable.$inferSelect;
export type InsertWalletAssetStats = typeof walletAssetStatsTable.$inferInsert;
