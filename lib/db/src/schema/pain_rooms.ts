import { pgTable, serial, integer, text, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const whatFailedEnum = pgEnum("what_failed", [
  "entry_timing",
  "thesis",
  "sizing",
  "risk_management",
  "exit_timing",
  "leverage",
]);

export const painRoomsTable = pgTable("pain_rooms", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => tradersTable.id),
  asset: text("asset").notNull(),
  side: text("side").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }).notNull(),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }).notNull(),
  pnlPct: numeric("pnl_pct", { precision: 10, scale: 4 }).notNull(),
  leverage: integer("leverage").notNull().default(1),
  positionSize: numeric("position_size", { precision: 18, scale: 2 }).notNull().default("0"),
  comment: text("comment"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedBreakdownId: integer("resolved_breakdown_id"),
  likeCount: integer("like_count").notNull().default(0),
  breakdownCount: integer("breakdown_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const breakdownsTable = pgTable("breakdowns", {
  id: serial("id").primaryKey(),
  painRoomId: integer("pain_room_id").notNull().references(() => painRoomsTable.id),
  responderId: integer("responder_id").notNull().references(() => tradersTable.id),
  whatFailed: whatFailedEnum("what_failed").notNull(),
  dataShowed: text("data_showed").notNull(),
  doDifferently: text("do_differently").notNull(),
  likeCount: integer("like_count").notNull().default(0),
  isMarkedHelpful: boolean("is_marked_helpful").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PainRoom = typeof painRoomsTable.$inferSelect;
export type InsertPainRoom = typeof painRoomsTable.$inferInsert;
export type Breakdown = typeof breakdownsTable.$inferSelect;
export type InsertBreakdown = typeof breakdownsTable.$inferInsert;
