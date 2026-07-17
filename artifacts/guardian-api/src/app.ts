import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { z } from "zod";
import { Guardian } from "./guardian.js";
import { createStore } from "./store.js";

const logger = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

const RequestSchema = z.object({
  userId: z.string(),
  tradeId: z.string().optional(),
  automationId: z.string().optional(),
  accountId: z.number().int().nonnegative(),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  symbol: z.string(),
  symbolId: z.number().int().positive().optional(),
  prompt: z.string(),
  mode: z.enum(["ADVISORY", "APPROVAL_REQUIRED", "AUTOMATIC", "FULLY_AUTOMATIC"]).default("ADVISORY"),
  state: z.unknown().optional(),
});

export function createApp() {
  const app = express();
  const guardian = new Guardian(createStore());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => res.json({
    ok: true,
    service: "guardian-api",
    executionEnabled: process.env["GUARDIAN_EXECUTION_ENABLED"] === "1",
    aiConfigured: Boolean(process.env["OPENROUTER_API_KEY"]),
    redisConfigured: Boolean(process.env["REDIS_URL"]),
  }));

  app.post("/strategies/compile", async (req, res) => {
    try { res.json(await guardian.compile(RequestSchema.omit({ state: true }).parse(req.body))); } catch (e) { error(res, e); }
  });
  app.post("/automations", async (req, res) => {
    try { res.status(201).json(await guardian.create(RequestSchema.parse(req.body))); } catch (e) { error(res, e); }
  });
  app.get("/automations", async (_req, res) => res.json({ automations: await guardian.list() }));
  app.get("/automations/:tradeId", async (req, res) => {
    const result = await guardian.get(req.params["tradeId"] ?? "");
    if (!result.mandate) { res.status(404).json({ error: "not_found" }); return; }
    res.json(result);
  });
  app.post("/automations/:tradeId/policy-rules", async (req, res) => {
    try { res.status(201).json(await guardian.addPolicyRule(req.params["tradeId"] ?? "", req.body)); } catch (e) { error(res, e); }
  });
  app.put("/automations/:tradeId/policy-rules", async (req, res) => {
    try { res.json({ mandate: await guardian.replacePolicyRules(req.params["tradeId"] ?? "", req.body?.rules ?? req.body) }); } catch (e) { error(res, e); }
  });
  app.put("/trades/:tradeId/state", async (req, res) => {
    try { res.json({ state: await guardian.state({ ...req.body, tradeId: req.params["tradeId"] }) }); } catch (e) { error(res, e); }
  });
  app.post("/automations/:tradeId/evaluate", async (req, res) => {
    try { res.json(await guardian.evaluate(req.params["tradeId"] ?? "")); } catch (e) { error(res, e); }
  });
  app.post("/actions/:actionId/approve", async (req, res) => {
    try { res.json({ action: await guardian.approve(req.params["actionId"] ?? "") }); } catch (e) { error(res, e); }
  });
  app.post("/actions/:actionId/execute", async (req, res) => {
    try { res.json({ result: await guardian.execute(req.params["actionId"] ?? "") }); } catch (e) { error(res, e); }
  });
  return app;
}

function error(res: express.Response, err: unknown) {
  if (err instanceof z.ZodError) { res.status(400).json({ error: "validation_failed", issues: err.issues }); return; }
  const message = err instanceof Error ? err.message : String(err);
  res.status(message.endsWith("_not_found") ? 404 : 400).json({ error: message });
}
