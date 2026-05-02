import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const signalSideEnum = pgEnum("signal_side", ["LONG", "SHORT"]);

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
  isActive: boolean("is_active").notNull().default(true),
  likeCount: integer("like_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Signal = typeof signalsTable.$inferSelect;
export type InsertSignal = typeof signalsTable.$inferInsert;
