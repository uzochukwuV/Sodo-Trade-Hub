import { pgTable, serial, integer, text, numeric, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletTradeFillsTable = pgTable("wallet_trade_fills", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  sodexTradeId: text("sodex_trade_id").notNull(),
  sodexPositionId: text("sodex_position_id"),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 18, scale: 8 }).notNull(),
  qty: numeric("qty", { precision: 18, scale: 8 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 8 }),
  ts: timestamp("ts").notNull(),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  fillUq: uniqueIndex("wallet_trade_fills_wallet_trade_uq").on(t.walletProfileId, t.sodexTradeId),
  fillIdx: index("wallet_trade_fills_wallet_idx").on(t.walletProfileId, t.ts),
}));

export type WalletTradeFill = typeof walletTradeFillsTable.$inferSelect;
export type InsertWalletTradeFill = typeof walletTradeFillsTable.$inferInsert;
