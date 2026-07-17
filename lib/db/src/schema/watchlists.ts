import { pgTable, serial, integer, text, boolean, timestamp, pgEnum, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { walletProfilesTable } from "./wallet_profiles";

export const watchlistKindEnum = pgEnum("watchlist_kind", [
  "my_wallets",
  "my_market",
  "copy_candidates",
  "top_performers",
]);

export const watchlistsTable = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: watchlistKindEnum("kind").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  watchlistUq: uniqueIndex("watchlists_user_name_uq").on(t.userId, t.name),
  watchlistKindIdx: index("watchlists_user_kind_idx").on(t.userId, t.kind),
}));

export const watchlistItemsTable = pgTable("watchlist_items", {
  id: serial("id").primaryKey(),
  watchlistId: integer("watchlist_id").notNull().references(() => watchlistsTable.id, { onDelete: "cascade" }),
  walletProfileId: integer("wallet_profile_id").references(() => walletProfilesTable.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address"),
  symbol: text("symbol"),
  tag: text("tag"),
  filters: jsonb("filters"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  watchlistItemIdx: index("watchlist_items_watchlist_idx").on(t.watchlistId),
  watchlistWalletIdx: index("watchlist_items_wallet_idx").on(t.walletAddress),
}));

export type Watchlist = typeof watchlistsTable.$inferSelect;
export type InsertWatchlist = typeof watchlistsTable.$inferInsert;
export type WatchlistItem = typeof watchlistItemsTable.$inferSelect;
export type InsertWatchlistItem = typeof watchlistItemsTable.$inferInsert;
