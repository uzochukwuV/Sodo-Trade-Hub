import { pgTable, serial, text, numeric, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";

export const traderTierEnum = pgEnum("trader_tier", ["BRONZE", "SILVER", "GOLD", "DIAMOND"]);

export const tradersTable = pgTable("traders", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  handle: text("handle").notNull().unique(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  repScore: numeric("rep_score", { precision: 5, scale: 2 }).notNull().default("0"),
  tier: traderTierEnum("tier").notNull().default("BRONZE"),
  totalPnlUsd: numeric("total_pnl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  tradeCount: integer("trade_count").notNull().default(0),
  followerCount: integer("follower_count").notNull().default(0),
  // Reputation dimensions
  signalAccuracy: numeric("signal_accuracy", { precision: 5, scale: 2 }).notNull().default("0"),
  validationAccuracy: numeric("validation_accuracy", { precision: 5, scale: 2 }).notNull().default("0"),
  mentorScore: numeric("mentor_score", { precision: 5, scale: 2 }).notNull().default("0"),
  streakDays: integer("streak_days").notNull().default(0),
  streakShields: integer("streak_shields").notNull().default(0),
  totalSignals: integer("total_signals").notNull().default(0),
  signalsHit: integer("signals_hit").notNull().default(0),
  signalsStopped: integer("signals_stopped").notNull().default(0),
  totalBreakdownsGiven: integer("total_breakdowns_given").notNull().default(0),
  totalBreakdownsHelpful: integer("total_breakdowns_helpful").notNull().default(0),
  walletAddress: text("wallet_address"),
  isAutoDiscovered: boolean("is_auto_discovered").notNull().default(false),
  onchainTxCount: integer("onchain_tx_count").notNull().default(0),
  onchainSuccessRate: numeric("onchain_success_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  contractsTouched: integer("contracts_touched").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at"),
  lastSeenAt: timestamp("last_seen_at"),
  // Sodex leaderboard tracking
  leaderboardRank: integer("leaderboard_rank"),
  leaderboardWindow: text("leaderboard_window"),
  volumeUsd: numeric("volume_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  avgLeverage: numeric("avg_leverage", { precision: 8, scale: 2 }).notNull().default("0"),
  // Signal poller — high-water mark of positions we've already imported
  lastSyncedPositionId: text("last_synced_position_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Trader = typeof tradersTable.$inferSelect;
export type InsertTrader = typeof tradersTable.$inferInsert;
