import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull().references(() => tradersTable.id),
  followingId: integer("following_id").notNull().references(() => tradersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.followerId, t.followingId)]);

export type Follow = typeof followsTable.$inferSelect;
export type InsertFollow = typeof followsTable.$inferInsert;
