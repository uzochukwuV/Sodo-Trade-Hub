import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tradersTable } from "./traders";

export const walletProfileStatusEnum = pgEnum("wallet_profile_status", [
  "active",
  "watchlist",
  "hidden",
  "banned",
]);

export const walletProfilesTable = pgTable("wallet_profiles", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  displayName: text("display_name"),
  handle: text("handle"),
  traderId: integer("trader_id").references(() => tradersTable.id),
  status: walletProfileStatusEnum("status").notNull().default("active"),
  isAutoDiscovered: boolean("is_auto_discovered").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at"),
  lastSeenAt: timestamp("last_seen_at"),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  walletUq: uniqueIndex("wallet_profiles_wallet_uq").on(t.walletAddress),
  traderIdx: index("wallet_profiles_trader_idx").on(t.traderId),
}));

export type WalletProfile = typeof walletProfilesTable.$inferSelect;
export type InsertWalletProfile = typeof walletProfilesTable.$inferInsert;
