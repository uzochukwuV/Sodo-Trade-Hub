import { pgTable, serial, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";

export const indexerStateTable = pgTable("indexer_state", {
  id: serial("id").primaryKey(),
  lastBlock: integer("last_block").notNull().default(0),
  walletsDiscovered: integer("wallets_discovered").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  isRunning: boolean("is_running").notNull().default(false),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type IndexerState = typeof indexerStateTable.$inferSelect;
