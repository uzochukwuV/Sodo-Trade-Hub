import { pgTable, serial, integer, text, numeric, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletScoresTable = pgTable("wallet_scores", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  compositeScore: numeric("composite_score", { precision: 5, scale: 2 }).notNull().default("0"),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }).notNull().default("0"),
  consistencyScore: numeric("consistency_score", { precision: 5, scale: 2 }).notNull().default("0"),
  timingScore: numeric("timing_score", { precision: 5, scale: 2 }).notNull().default("0"),
  specializationScore: numeric("specialization_score", { precision: 5, scale: 2 }).notNull().default("0"),
  tier: text("tier").notNull().default("BRONZE"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
  rationale: text("rationale"),
  features: jsonb("features"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  walletScoreUq: uniqueIndex("wallet_scores_wallet_uq").on(t.walletProfileId),
  walletScoreIdx: index("wallet_scores_tier_idx").on(t.tier, t.compositeScore),
}));

export type WalletScore = typeof walletScoresTable.$inferSelect;
export type InsertWalletScore = typeof walletScoresTable.$inferInsert;
