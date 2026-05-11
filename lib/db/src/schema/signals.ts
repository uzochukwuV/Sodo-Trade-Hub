import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const signalSideEnum = pgEnum("signal_side", ["LONG", "SHORT"]);
export const signalStatusEnum = pgEnum("signal_status", ["open", "hit", "stopped"]);

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => tradersTable.id),
  asset: text("asset").notNull(),
  side: signalSideEnum("side").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  targetPrice: numeric("target_price", { precision: 18, scale: 8 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 8 }).notNull(),
  confidence: integer("confidence").notNull().default(70),
  reasoning: text("reasoning"),
  status: signalStatusEnum("status").notNull().default("open"),
  isActive: boolean("is_active").notNull().default(true),
  likeCount: integer("like_count").notNull().default(0),
  txHash: text("tx_hash"),
  // Sodex position id this signal was created from. Prevents the 60s poller from
  // re-inserting the same OPEN position as a new signal on every cycle.
  sodexPositionId: text("sodex_position_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  sodexPosUq: uniqueIndex("signals_trader_sodex_uq").on(t.traderId, t.sodexPositionId),
}));

export type Signal = typeof signalsTable.$inferSelect;
export type InsertSignal = typeof signalsTable.$inferInsert;
