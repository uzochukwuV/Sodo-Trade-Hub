import { pgTable, serial, integer, text, jsonb, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const alertTypeEnum = pgEnum("alert_type", [
  // tracked trader the user follows opened a new position
  "trader_open",
  // tracked trader the user follows closed a position (with PnL)
  "trader_close",
  // a new comment on the user's post / intent / pain room
  "new_comment",
  // someone validated/invalidated the user's intent
  "intent_voted",
  // intent the user voted on resolved
  "intent_resolved",
  // a tracked trader entered a position aligned with one of user's open intents
  "intent_alignment",
  // co-cluster wallet entered something the user might like
  "graph_signal",
]);

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: alertTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  // Free-form structured payload (e.g. {tradeId, asset, pnl, walletAddress})
  payload: jsonb("payload"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userUnreadIdx: index("alerts_user_unread_idx").on(t.userId, t.isRead, t.createdAt),
}));

export type Alert = typeof alertsTable.$inferSelect;
export type InsertAlert = typeof alertsTable.$inferInsert;
