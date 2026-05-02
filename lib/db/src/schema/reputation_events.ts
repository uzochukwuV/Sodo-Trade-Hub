import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const repEventTypeEnum = pgEnum("rep_event_type", [
  "trade_win",
  "trade_loss",
  "signal_hit",
  "signal_stopped",
  "breakdown_given",
  "breakdown_helpful",
  "streak_extended",
  "streak_broken",
  "shield_earned",
  "shield_used",
  "validation_correct",
  "validation_wrong",
]);

export const reputationEventsTable = pgTable("reputation_events", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => tradersTable.id),
  eventType: repEventTypeEnum("event_type").notNull(),
  delta: numeric("delta", { precision: 8, scale: 4 }).notNull().default("0"),
  sourceId: integer("source_id"),
  sourceType: text("source_type"),
  meta: text("meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReputationEvent = typeof reputationEventsTable.$inferSelect;
export type InsertReputationEvent = typeof reputationEventsTable.$inferInsert;
