import { pgTable, serial, integer, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";
import { usersTable } from "./users";

export const walletBacktestsTable = pgTable("wallet_backtests", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  windowDays: integer("window_days").notNull().default(30),
  sizingMode: text("sizing_mode").notNull().default("fixed_notional"),
  startingBalanceUsd: numeric("starting_balance_usd", { precision: 18, scale: 2 }).notNull().default("1000"),
  tradeSizeUsd: numeric("trade_size_usd", { precision: 18, scale: 2 }).notNull().default("100"),
  copyPnlUsd: numeric("copy_pnl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  copyReturnPct: numeric("copy_return_pct", { precision: 10, scale: 4 }).notNull().default("0"),
  maxDrawdownUsd: numeric("max_drawdown_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  maxDrawdownPct: numeric("max_drawdown_pct", { precision: 10, scale: 4 }).notNull().default("0"),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  tradeCount: integer("trade_count").notNull().default(0),
  bestSymbol: text("best_symbol"),
  worstSymbol: text("worst_symbol"),
  avgHoldMinutes: numeric("avg_hold_minutes", { precision: 12, scale: 2 }).notNull().default("0"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  walletBacktestIdx: index("wallet_backtests_wallet_created_idx").on(t.walletProfileId, t.createdAt),
  userBacktestIdx: index("wallet_backtests_user_created_idx").on(t.userId, t.createdAt),
}));

export type WalletBacktest = typeof walletBacktestsTable.$inferSelect;
export type InsertWalletBacktest = typeof walletBacktestsTable.$inferInsert;
