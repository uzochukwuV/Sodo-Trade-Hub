import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// PG-backed session store. We reuse DATABASE_URL. We create the session table
// ourselves (one-shot SQL on boot) instead of relying on connect-pg-simple's
// createTableIfMissing — esbuild bundling drops the package's table.sql resource
// file, which would otherwise crash on first session write.
const PgStore = connectPgSimple(session);
const pgPool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) throw new Error("SESSION_SECRET env var is required");
const isProd = process.env["NODE_ENV"] === "production";

void pgPool.query(`
  CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
  );
  CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
`).catch(err => logger.error({ err }, "session_table_init_failed"));

app.set("trust proxy", 1);
app.use(session({
  store: new PgStore({ pool: pgPool, createTableIfMissing: false, tableName: "user_sessions" }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: { id: unknown; method: string; url?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: { statusCode: number }) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS: explicit allowlist. Defaults cover Replit dev + the deployed domains in
// $REPLIT_DOMAINS; override with CORS_ORIGINS (comma-separated). credentials:true
// is required for the session cookie to be sent on cross-origin requests.
const replitDomains = (process.env["REPLIT_DOMAINS"] ?? "").split(",").map(d => d.trim()).filter(Boolean).map(d => `https://${d}`);
const replitDevDomain = process.env["REPLIT_DEV_DOMAIN"] ? [`https://${process.env["REPLIT_DEV_DOMAIN"]}`] : [];
const explicitOrigins = (process.env["CORS_ORIGINS"] ?? "").split(",").map(o => o.trim()).filter(Boolean);
const allowOrigins = new Set<string>([...replitDomains, ...replitDevDomain, ...explicitOrigins]);
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl / server-to-server (no Origin header).
    if (!origin) return cb(null, true);
    if (allowOrigins.size === 0) return cb(null, true); // dev-friendly fallback if nothing configured
    cb(null, allowOrigins.has(origin));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
