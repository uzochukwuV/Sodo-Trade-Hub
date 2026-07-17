import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const valuechainInvestigationsTable = pgTable("valuechain_investigations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  startBlock: integer("start_block").notNull(),
  blockCount: integer("block_count").notNull(),
  endBlock: integer("end_block").notNull(),
  summary: jsonb("summary").notNull(),
  blockNumbers: jsonb("block_numbers").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userCreatedIdx: index("valuechain_investigations_user_created_idx").on(t.userId, t.createdAt),
  rangeIdx: index("valuechain_investigations_range_idx").on(t.startBlock, t.endBlock),
}));

export type ValuechainInvestigation = typeof valuechainInvestigationsTable.$inferSelect;
export type InsertValuechainInvestigation = typeof valuechainInvestigationsTable.$inferInsert;
