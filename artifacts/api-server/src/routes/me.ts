import { Router, type IRouter } from "express";
import { db, usersTable, tradesTable, alertsTable, tradersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, getCurrentUser } from "../lib/auth";
import { fetchPositions, computeMetrics } from "../services/leaderboard-tracker";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/me/stats — live compute the user's Sodex stats from their wallet history.
 * If we already track them as a `traders` row, also link `users.traderId` for fan-out.
 */
router.get("/me/stats", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  try {
    const positions = await fetchPositions(u.walletAddress, 200);
    const m = computeMetrics(positions);

    // Lazy-link: if any tracked trader matches this wallet, attach traderId.
    if (!u.traderId) {
      const [t] = await db.select().from(tradersTable).where(eq(tradersTable.walletAddress, u.walletAddress)).limit(1);
      if (t) {
        await db.update(usersTable).set({ traderId: t.id }).where(eq(usersTable.id, u.id));
      }
    }

    res.json({
      walletAddress: u.walletAddress,
      positions: positions.length,
      metrics: m,
      traderId: u.traderId,
    });
  } catch (err) {
    logger.warn({ err, wallet: u.walletAddress }, "me.stats_fail");
    res.status(502).json({ error: "sodex_fetch_failed" });
  }
});

/** GET /api/me/positions — live fetch user's Sodex positions (open + closed, last 100). */
router.get("/me/positions", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  try {
    const positions = await fetchPositions(u.walletAddress, 100);
    const open = positions.filter(p => p.active);
    const closed = positions.filter(p => !p.active);
    res.json({ open, closed, total: positions.length });
  } catch (err) {
    logger.warn({ err, wallet: u.walletAddress }, "me.positions_fail");
    res.status(502).json({ error: "sodex_fetch_failed" });
  }
});

/** GET /api/me/alerts — paginated alert inbox. ?unreadOnly=1 to filter. */
router.get("/me/alerts", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const unreadOnly = req.query["unreadOnly"] === "1";
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const where = unreadOnly
    ? and(eq(alertsTable.userId, u.id), eq(alertsTable.isRead, false))
    : eq(alertsTable.userId, u.id);
  const rows = await db.select().from(alertsTable).where(where).orderBy(desc(alertsTable.createdAt)).limit(limit);
  res.json({ alerts: rows });
});

/** POST /api/me/alerts/:id/read — mark a single alert read. */
router.post("/me/alerts/:id/read", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad_id" }); return; }
  await db.update(alertsTable).set({ isRead: true }).where(and(eq(alertsTable.id, id), eq(alertsTable.userId, u.id)));
  res.json({ ok: true });
});

/** POST /api/me/alerts/read-all — mark all alerts read. */
router.post("/me/alerts/read-all", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  await db.update(alertsTable).set({ isRead: true }).where(eq(alertsTable.userId, u.id));
  res.json({ ok: true });
});

/**
 * POST /api/me/publish-trade — publish one of the user's Sodex positions to the
 * public Sogram feed. Requires the user to be linked to a tracked trader row
 * (which happens automatically the first time they hit /api/me/stats if their
 * wallet is in our tracked set).
 */
router.post("/me/publish-trade", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  if (!u.traderId) { res.status(400).json({ error: "wallet_not_tracked", hint: "Call /api/me/stats first; wallet must appear in our tracked traders set." }); return; }

  const sodexPositionId = String(req.body?.sodexPositionId ?? "");
  const note = String(req.body?.note ?? "").slice(0, 500);
  if (!sodexPositionId) { res.status(400).json({ error: "missing_sodexPositionId" }); return; }

  // Fetch and validate the position belongs to this user's wallet.
  const positions = await fetchPositions(u.walletAddress, 200);
  const pos = positions.find(p => String(p.id) === sodexPositionId);
  if (!pos) { res.status(404).json({ error: "position_not_found" }); return; }
  if (pos.active) { res.status(400).json({ error: "position_still_open", hint: "Only closed positions can be published as trades." }); return; }

  const entry = parseFloat(pos.avgEntryPrice);
  const exit  = parseFloat(pos.avgClosePrice);
  const pnl   = parseFloat(pos.realizedPnL);
  const closedSize = parseFloat(pos.cumClosedSize);
  const notional = entry * closedSize;
  const pnlPct = notional > 0 ? (pnl / notional) * 100 * pos.leverage : 0;

  const [inserted] = await db.insert(tradesTable).values({
    traderId: u.traderId,
    asset: pos.symbol.replace("-USD", "/USDT"),
    side: pos.positionSide,
    entryPrice: entry.toFixed(8),
    exitPrice: exit.toFixed(8),
    pnlUsd: pnl.toFixed(2),
    pnlPct: pnlPct.toFixed(4),
    positionSize: notional.toFixed(4),
    leverage: pos.leverage,
    isVerified: true,
    isOnChainVerified: true,
    sodexTradeId: sodexPositionId,
    comment: note || (pnl > 0 ? `Closed ${pos.positionSide} ${pos.symbol} for +$${pnl.toFixed(0)}` : `Closed ${pos.positionSide} ${pos.symbol} for -$${Math.abs(pnl).toFixed(0)}`),
    openedAt: pos.createdAt ? new Date(pos.createdAt) : null,
    closedAt: new Date(pos.updatedAt),
  }).onConflictDoNothing({ target: [tradesTable.traderId, tradesTable.sodexTradeId] }).returning();

  res.json({ published: !!inserted, trade: inserted ?? null });
});

export default router;
