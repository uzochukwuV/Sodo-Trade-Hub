import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Server-side session store for express-session (connect-pg-simple).
 *
 * The table layout is dictated by connect-pg-simple's default schema (sid PK,
 * JSON sess blob, expire timestamp) — we mirror it here in Drizzle so that
 * `db push` doesn't see the table as an orphan and try to drop it on every
 * post-merge run. The runtime CREATE-IF-NOT-EXISTS in app.ts is still the
 * source of truth for boot, but having it in the schema keeps `db push` quiet
 * AND lets us query/inspect sessions via the typed client if we ever need to.
 *
 * Do NOT change column names/types — connect-pg-simple writes/reads them by
 * literal SQL, not via Drizzle, so any drift breaks session persistence.
 */
export const userSessionsTable = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey().notNull(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => ({
  expireIdx: index("IDX_user_sessions_expire").on(t.expire),
}));

export type UserSession = typeof userSessionsTable.$inferSelect;
