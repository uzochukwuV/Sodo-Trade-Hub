import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletIntradayRollupsTable = pgTable("wallet_intraday_rollups", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  bucketStart: timestamp("bucket_start").notNull(),
  bucketSizeMinutes: integer("bucket_size_minutes").notNull().default(60),
  tradeCount: integer("trade_count").notNull().default(0),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  netFlowUsd: numeric("net_flow_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  intradayUq: uniqueIndex("wallet_intraday_rollups_wallet_bucket_uq").on(t.walletProfileId, t.bucketStart, t.bucketSizeMinutes),
  intradayIdx: index("wallet_intraday_rollups_bucket_idx").on(t.bucketStart, t.pnlUsd),
}));

export type WalletIntradayRollup = typeof walletIntradayRollupsTable.$inferSelect;
export type InsertWalletIntradayRollup = typeof walletIntradayRollupsTable.$inferInsert;
