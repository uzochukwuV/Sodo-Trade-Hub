import { pgTable, serial, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const sourceCursorsTable = pgTable("source_cursors", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  cursorType: text("cursor_type").notNull(),
  cursorValue: text("cursor_value"),
  metadata: jsonb("metadata"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  sourceCursorUq: uniqueIndex("source_cursors_source_type_uq").on(t.sourceName, t.cursorType),
}));

export type SourceCursor = typeof sourceCursorsTable.$inferSelect;
export type InsertSourceCursor = typeof sourceCursorsTable.$inferInsert;
