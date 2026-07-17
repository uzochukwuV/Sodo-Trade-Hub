import { pgTable, serial, integer, text, timestamp, pgEnum, jsonb, index } from "drizzle-orm/pg-core";
import { walletProfilesTable } from "./wallet_profiles";

export const walletVerificationStatusEnum = pgEnum("wallet_verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const walletVerificationEventsTable = pgTable("wallet_verification_events", {
  id: serial("id").primaryKey(),
  walletProfileId: integer("wallet_profile_id").notNull().references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  sodexPositionId: text("sodex_position_id"),
  txHash: text("tx_hash"),
  chainId: integer("chain_id"),
  contractAddress: text("contract_address"),
  blockNumber: integer("block_number"),
  status: walletVerificationStatusEnum("status").notNull().default("pending"),
  evidence: jsonb("evidence"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  walletIdx: index("wallet_verification_events_wallet_idx").on(t.walletProfileId, t.createdAt),
}));

export type WalletVerificationEvent = typeof walletVerificationEventsTable.$inferSelect;
export type InsertWalletVerificationEvent = typeof walletVerificationEventsTable.$inferInsert;
