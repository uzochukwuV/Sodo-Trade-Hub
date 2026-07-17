import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { notificationChannelsTable } from "./notification_channels";
import { alertMatchesTable } from "./alert_rules";

export const notificationDeliveriesTable = pgTable("notification_deliveries", {
  id: serial("id").primaryKey(),
  alertMatchId: integer("alert_match_id").references(() => alertMatchesTable.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => notificationChannelsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  providerMessageId: text("provider_message_id"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  deliveryIdx: index("notification_deliveries_channel_status_idx").on(t.channelId, t.status, t.createdAt),
}));

export type NotificationDelivery = typeof notificationDeliveriesTable.$inferSelect;
export type InsertNotificationDelivery = typeof notificationDeliveriesTable.$inferInsert;
