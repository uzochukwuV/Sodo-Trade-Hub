import { pgTable, serial, integer, text, numeric, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { alertMatchesTable } from "./alert_rules";
import { walletProfilesTable } from "./wallet_profiles";

export const alertOutcomesTable = pgTable("alert_outcomes", {
  id: serial("id").primaryKey(),
  alertMatchId: integer("alert_match_id").references(() => alertMatchesTable.id, { onDelete: "cascade" }),
  walletProfileId: integer("wallet_profile_id").references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address"),
  sodexPositionId: text("sodex_position_id"),
  status: text("status").notNull().default("open"),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }),
  finalPnlUsd: numeric("final_pnl_usd", { precision: 18, scale: 2 }),
  maxProfitUsd: numeric("max_profit_usd", { precision: 18, scale: 2 }),
  maxDrawdownUsd: numeric("max_drawdown_usd", { precision: 18, scale: 2 }),
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at"),
  resolvedAt: timestamp("resolved_at"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  outcomeUq: uniqueIndex("alert_outcomes_match_uq").on(t.alertMatchId),
  positionIdx: index("alert_outcomes_position_idx").on(t.walletAddress, t.sodexPositionId),
  statusIdx: index("alert_outcomes_status_idx").on(t.status, t.createdAt),
}));

export type AlertOutcome = typeof alertOutcomesTable.$inferSelect;
export type InsertAlertOutcome = typeof alertOutcomesTable.$inferInsert;
