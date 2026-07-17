import { pgTable, serial, integer, text, boolean, timestamp, pgEnum, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const alertScopeEnum = pgEnum("alert_scope", ["wallet", "market", "copy", "leaderboard"]);
export const alertEventTypeEnum = pgEnum("alert_event_type", [
  "open_position",
  "close_position",
  "big_pnl",
  "whale",
  "leaderboard_shift",
  "price_move",
  "trade_context",
  "signal",
]);

export const alertRulesTable = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  scope: alertScopeEnum("scope").notNull(),
  eventType: alertEventTypeEnum("event_type").notNull(),
  filters: jsonb("filters").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  alertRuleIdx: index("alert_rules_user_scope_idx").on(t.userId, t.scope, t.eventType),
}));

export const alertMatchesTable = pgTable("alert_matches", {
  id: serial("id").primaryKey(),
  alertRuleId: integer("alert_rule_id").notNull().references(() => alertRulesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  eventType: alertEventTypeEnum("event_type").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  matchedAt: timestamp("matched_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
});

export type AlertRule = typeof alertRulesTable.$inferSelect;
export type InsertAlertRule = typeof alertRulesTable.$inferInsert;
export type AlertMatch = typeof alertMatchesTable.$inferSelect;
export type InsertAlertMatch = typeof alertMatchesTable.$inferInsert;
