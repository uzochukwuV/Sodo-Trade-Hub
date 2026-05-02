import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const intentSideEnum = pgEnum("intent_side", ["LONG", "SHORT"]);
export const intentStatusEnum = pgEnum("intent_status", ["open", "closed_hit", "closed_miss", "expired"]);
export const intentVoteEnum = pgEnum("intent_vote", ["valid", "invalid"]);

export const tradeIntentsTable = pgTable("trade_intents", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => tradersTable.id),
  asset: text("asset").notNull(),
  side: intentSideEnum("side").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  targetPrice: numeric("target_price", { precision: 18, scale: 8 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 8 }).notNull(),
  leverage: integer("leverage").notNull().default(1),
  reasoning: text("reasoning").notNull(),
  votesValid: integer("votes_valid").notNull().default(0),
  votesInvalid: integer("votes_invalid").notNull().default(0),
  status: intentStatusEnum("status").notNull().default("open"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intentVotesTable = pgTable("intent_votes", {
  id: serial("id").primaryKey(),
  intentId: integer("intent_id").notNull().references(() => tradeIntentsTable.id),
  voterId: integer("voter_id").notNull().references(() => tradersTable.id),
  vote: intentVoteEnum("vote").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TradeIntent = typeof tradeIntentsTable.$inferSelect;
export type InsertTradeIntent = typeof tradeIntentsTable.$inferInsert;
export type IntentVote = typeof intentVotesTable.$inferSelect;
