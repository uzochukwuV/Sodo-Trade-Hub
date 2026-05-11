import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const commentPostTypeEnum = pgEnum("comment_post_type", [
  "trade",
  "signal",
  "pain_room",
  "intent",
]);

export const commentsTable = pgTable("comments", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => tradersTable.id),
  postType: commentPostTypeEnum("post_type").notNull(),
  postId: integer("post_id").notNull(),
  content: text("content").notNull(),
  likeCount: integer("like_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Comment = typeof commentsTable.$inferSelect;
export type InsertComment = typeof commentsTable.$inferInsert;
