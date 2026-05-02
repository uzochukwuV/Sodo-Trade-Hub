import { pgTable, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const copyConfigsTable = pgTable("copy_configs", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  leaderId: integer("leader_id").notNull().references(() => tradersTable.id),
  isActive: boolean("is_active").notNull().default(true),
  maxPositionSizeUsd: numeric("max_position_size_usd", { precision: 18, scale: 2 }).notNull().default("100"),
  maxLeverage: integer("max_leverage").notNull().default(5),
  stopLossPct: numeric("stop_loss_pct", { precision: 5, scale: 2 }).notNull().default("10"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CopyConfig = typeof copyConfigsTable.$inferSelect;
export type InsertCopyConfig = typeof copyConfigsTable.$inferInsert;
