/**
 * Standalone schema migration runner for Docker deployments.
 *
 * Uses createRequire to load 'pg' via CommonJS resolution from /app/api/
 * so it works regardless of where this file lives in the container.
 * ES module `import 'pg'` resolution ignores NODE_PATH and directory tricks;
 * createRequire does not.
 */
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Resolve pg from the api's standalone node_modules (created by pnpm deploy)
const require = createRequire("/app/api/package.json");
const { Pool } = require("pg");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("[migrate] ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const MIGRATIONS_DIR = "/app/migrations";

async function runMigrations() {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();

  try {
    console.log("[migrate] Connected to database");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id         SERIAL PRIMARY KEY,
        hash       TEXT   NOT NULL UNIQUE,
        created_at BIGINT
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR).catch(() => []))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[migrate] No migration files found — skipping");
      return;
    }

    for (const file of files) {
      const existing = await client.query(
        'SELECT id FROM "__drizzle_migrations" WHERE hash = $1',
        [file]
      );
      if (existing.rows.length > 0) {
        console.log(`[migrate] Already applied: ${file}`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        await client.query(stmt);
      }

      await client.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [file, Date.now()]
      );
      console.log(`[migrate] Applied: ${file}`);
    }

    console.log("[migrate] All migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("[migrate] FAILED:", err.message);
  process.exit(1);
});
