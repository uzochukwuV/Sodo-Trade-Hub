import { pgTable, serial, integer, text, boolean, timestamp, pgEnum, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationChannelTypeEnum = pgEnum("notification_channel_type", [
  "telegram",
  "email",
  "push",
]);

export const notificationChannelsTable = pgTable("notification_channels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: notificationChannelTypeEnum("type").notNull(),
  destination: text("destination").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  channelIdx: index("notification_channels_user_type_idx").on(t.userId, t.type),
}));

export type NotificationChannel = typeof notificationChannelsTable.$inferSelect;
export type InsertNotificationChannel = typeof notificationChannelsTable.$inferInsert;
