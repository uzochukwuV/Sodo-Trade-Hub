import { pgTable, serial, text, integer, numeric, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const leaderboardSnapshotsTable = pgTable("leaderboard_snapshots", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  windowType: text("window_type").notNull(),
  sortBy: text("sort_by").notNull().default("pnl"),
  rank: integer("rank").notNull(),
  pnlUsd: numeric("pnl_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  volumeUsd: numeric("volume_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  accountId: integer("account_id"),
  raw: jsonb("raw"),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
}, (t) => ({
  snapshotUq: uniqueIndex("leaderboard_snapshots_wallet_window_rank_uq").on(t.walletAddress, t.windowType, t.capturedAt),
  snapshotIdx: index("leaderboard_snapshots_window_rank_idx").on(t.windowType, t.rank, t.capturedAt),
  walletIdx: index("leaderboard_snapshots_wallet_idx").on(t.walletAddress, t.capturedAt),
}));

export type LeaderboardSnapshot = typeof leaderboardSnapshotsTable.$inferSelect;
export type InsertLeaderboardSnapshot = typeof leaderboardSnapshotsTable.$inferInsert;
