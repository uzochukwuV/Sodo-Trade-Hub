import { pgTable, integer, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

export const valuechainBlockAnalysesTable = pgTable("valuechain_block_analyses", {
  blockNumber: integer("block_number").primaryKey(),
  blockHash: text("block_hash").notNull(),
  chainId: integer("chain_id").notNull().default(138565),
  txCount: integer("tx_count").notNull().default(0),
  candidateCount: integer("candidate_count").notNull().default(0),
  sodexWalletCount: integer("sodex_wallet_count").notNull().default(0),
  clusterCount: integer("cluster_count").notNull().default(0),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
  facts: jsonb("facts").notNull(),
}, (t) => ({
  blockHashUq: uniqueIndex("valuechain_block_analyses_hash_uq").on(t.blockHash),
  analyzedIdx: index("valuechain_block_analyses_analyzed_idx").on(t.analyzedAt),
}));

export type ValuechainBlockAnalysis = typeof valuechainBlockAnalysesTable.$inferSelect;
export type InsertValuechainBlockAnalysis = typeof valuechainBlockAnalysesTable.$inferInsert;
