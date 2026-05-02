import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const tradeSideEnum = pgEnum("trade_side", ["LONG", "SHORT"]);

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => tradersTable.id),
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
  likeCount: integer("like_count").notNull().default(0),
  comment: text("comment"),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Trade = typeof tradesTable.$inferSelect;
export type InsertTrade = typeof tradesTable.$inferInsert;
