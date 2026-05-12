import { pgTable, serial, text, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Sogram users — wallet-authenticated humans (NOT to be confused with `traders`,
 * which are auto-discovered Sodex top performers ingested from the leaderboard).
 *
 * A user MAY also be a tracked trader (linked via `traderId`), but most users will
 * not appear on the Sodex leaderboard and just use the platform to follow / comment /
 * post intents / view their own dashboard.
 */
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  // Random nonce issued by GET /api/auth/nonce, consumed by POST /api/auth/verify.
  // Cleared on successful login so it can't be replayed.
  nonce: text("nonce"),
  nonceIssuedAt: timestamp("nonce_issued_at"),
  // Optional link to a tradersTable row if this wallet is also auto-discovered.
  // We don't FK this to avoid coupling — refreshed lazily by /api/me/stats.
  traderId: integer("trader_id"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  // Platform-side signal poller cursor (so a user's own positions get the same
  // dedup treatment as tracked traders when the user opts to publish them).
  lastSyncedPositionId: text("last_synced_position_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  isBanned: boolean("is_banned").notNull().default(false),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
}, (t) => ({
  walletUq: uniqueIndex("users_wallet_uq").on(t.walletAddress),
}));

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
