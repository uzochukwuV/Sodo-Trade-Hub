import { pgTable, serial, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";

export const jobRunStatusEnum = pgEnum("job_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const jobRunsTable = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull(),
  status: jobRunStatusEnum("status").notNull().default("queued"),
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  jobIdx: index("job_runs_job_status_idx").on(t.jobName, t.status, t.createdAt),
}));

export type JobRun = typeof jobRunsTable.$inferSelect;
export type InsertJobRun = typeof jobRunsTable.$inferInsert;
