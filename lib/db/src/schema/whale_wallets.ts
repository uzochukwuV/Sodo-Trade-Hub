import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const whaleWalletsTable = pgTable("whale_wallets", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  label: text("label"),
  txCount: integer("tx_count").notNull().default(0),
  contractsInteracted: text("contracts_interacted"),
  firstSeenAt: timestamp("first_seen_at"),
  lastSeenAt: timestamp("last_seen_at"),
  isProfiled: boolean("is_profiled").notNull().default(false),
  profiledTraderId: integer("profiled_trader_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WhaleWallet = typeof whaleWalletsTable.$inferSelect;
export type InsertWhaleWallet = typeof whaleWalletsTable.$inferInsert;
