import { Router, type IRouter } from "express";
import { db, alertsTable, notificationChannelsTable, alertRulesTable, alertOutcomesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, getCurrentUser } from "../lib/auth";
import { listAlertRules, upsertAlertRule } from "../services/alert-engine";

const router: IRouter = Router();

router.get("/alerts", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  const unreadOnly = String(req.query.unreadOnly ?? "0") === "1";
  const where = unreadOnly
    ? and(eq(alertsTable.userId, u.id), eq(alertsTable.isRead, false))
    : eq(alertsTable.userId, u.id);
  const alerts = await db.select().from(alertsTable).where(where).orderBy(desc(alertsTable.createdAt)).limit(limit);
  res.json({ alerts });
});

router.post("/alerts/read-all", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  await db.update(alertsTable).set({ isRead: true }).where(eq(alertsTable.userId, u.id));
  res.json({ ok: true });
});

router.get("/alerts/rules", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const rules = await listAlertRules(u.id);
  res.json({ rules });
});

router.post("/alerts/rules", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const rule = await upsertAlertRule(u.id, {
    name: String(req.body?.name ?? "Rule"),
    scope: (req.body?.scope ?? "wallet") as "wallet" | "market" | "copy" | "leaderboard",
    eventType: (req.body?.eventType ?? "open_position") as any,
    filters: (req.body?.filters ?? {}) as Record<string, unknown>,
    isEnabled: Boolean(req.body?.isEnabled ?? true),
  });
  res.status(rule ? 201 : 500).json({ rule });
});

router.put("/alerts/rules/:id", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const id = Number(req.params.id);
  const rule = await upsertAlertRule(u.id, {
    id,
    name: String(req.body?.name ?? "Rule"),
    scope: (req.body?.scope ?? "wallet") as "wallet" | "market" | "copy" | "leaderboard",
    eventType: (req.body?.eventType ?? "open_position") as any,
    filters: (req.body?.filters ?? {}) as Record<string, unknown>,
    isEnabled: Boolean(req.body?.isEnabled ?? true),
  });
  if (!rule) {
    res.status(404).json({ error: "rule_not_found" });
    return;
  }
  res.json({ rule });
});

router.delete("/alerts/rules/:id", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const id = Number(req.params.id);
  await db.delete(alertRulesTable).where(and(eq(alertRulesTable.id, id), eq(alertRulesTable.userId, u.id)));
  res.json({ ok: true });
});

router.get("/alerts/channels", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const channels = await db.select().from(notificationChannelsTable).where(eq(notificationChannelsTable.userId, u.id)).orderBy(desc(notificationChannelsTable.updatedAt));
  res.json({ channels });
});

router.get("/alerts/outcomes", requireAuth(), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  const outcomes = await db.select().from(alertOutcomesTable).orderBy(desc(alertOutcomesTable.createdAt)).limit(limit);
  res.json({ outcomes });
});

export default router;
