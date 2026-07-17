import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletDailyRollupsTable = pgTable("wallet_daily_rollups", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  day: timestamp("day").notNull(),
  tradeCount: integer("trade_count").notNull().default(0),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  avgLeverage: numeric("avg_leverage", { precision: 8, scale: 2 }).notNull().default("0"),
  avgHoldMinutes: numeric("avg_hold_minutes", { precision: 12, scale: 2 }).notNull().default("0"),
  drawdownUsd: numeric("drawdown_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  slippageUsd: numeric("slippage_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  dailyUq: uniqueIndex("wallet_daily_rollups_wallet_day_uq").on(t.walletProfileId, t.day),
  dailyIdx: index("wallet_daily_rollups_day_idx").on(t.day, t.pnlUsd),
}));

export type WalletDailyRollup = typeof walletDailyRollupsTable.$inferSelect;
export type InsertWalletDailyRollup = typeof walletDailyRollupsTable.$inferInsert;
