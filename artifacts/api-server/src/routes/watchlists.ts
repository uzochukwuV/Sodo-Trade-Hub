import { Router, type IRouter } from "express";
import { db, watchlistsTable, watchlistItemsTable, walletProfilesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAuth, getCurrentUser } from "../lib/auth";
import { upsertWatchlist } from "../services/alert-engine";
import { subscribeWatchedWallet } from "../services/wallet-subs";

const router: IRouter = Router();

router.get("/watchlists", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const watchlists = await db.select().from(watchlistsTable).where(eq(watchlistsTable.userId, u.id)).orderBy(desc(watchlistsTable.updatedAt));
  const ids = watchlists.map(w => w.id);
  const items = ids.length > 0
    ? await db.select().from(watchlistItemsTable).where(inArray(watchlistItemsTable.watchlistId, ids))
    : [];
  const grouped = watchlists.map(w => ({
    ...w,
    items: items.filter(i => i.watchlistId === w.id),
  }));
  res.json({ watchlists: grouped });
});

router.post("/watchlists", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const name = String(req.body?.name ?? "").trim();
  const kind = String(req.body?.kind ?? "my_wallets") as "my_wallets" | "my_market" | "copy_candidates" | "top_performers";
  if (!name) {
    res.status(400).json({ error: "name_required" });
    return;
  }
  const created = await upsertWatchlist(u.id, {
    name,
    kind,
    isDefault: Boolean(req.body?.isDefault),
    settings: (req.body?.settings ?? {}) as Record<string, unknown>,
  });
  res.status(created ? 201 : 500).json({ watchlist: created });
});

router.post("/watchlists/:watchlistId/items", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const watchlistId = Number(req.params.watchlistId);
  const watchlist = await db.query.watchlistsTable.findFirst({ where: and(eq(watchlistsTable.id, watchlistId), eq(watchlistsTable.userId, u.id)) });
  if (!watchlist) {
    res.status(404).json({ error: "watchlist_not_found" });
    return;
  }
  const walletAddress = String(req.body?.walletAddress ?? "").toLowerCase().trim();
  const symbol = req.body?.symbol ? String(req.body.symbol).trim() : null;
  const walletProfile = walletAddress
    ? await db.query.walletProfilesTable.findFirst({ where: eq(walletProfilesTable.walletAddress, walletAddress) })
    : null;
  const [item] = await db.insert(watchlistItemsTable).values({
    watchlistId,
    walletProfileId: walletProfile?.id ?? null,
    walletAddress: walletAddress || null,
    symbol,
    tag: req.body?.tag ? String(req.body.tag).trim() : null,
    filters: (req.body?.filters ?? {}) as Record<string, unknown>,
  }).returning();

  if (walletAddress) subscribeWatchedWallet(walletAddress);

  res.status(201).json({ item });
});

router.delete("/watchlists/:watchlistId/items/:itemId", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const watchlistId = Number(req.params.watchlistId);
  const itemId = Number(req.params.itemId);
  const watchlist = await db.query.watchlistsTable.findFirst({ where: and(eq(watchlistsTable.id, watchlistId), eq(watchlistsTable.userId, u.id)) });
  if (!watchlist) {
    res.status(404).json({ error: "watchlist_not_found" });
    return;
  }
  await db.delete(watchlistItemsTable).where(and(eq(watchlistItemsTable.id, itemId), eq(watchlistItemsTable.watchlistId, watchlistId)));
  res.json({ ok: true });
});

router.delete("/watchlists/:watchlistId", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  const watchlistId = Number(req.params.watchlistId);
  await db.delete(watchlistsTable).where(and(eq(watchlistsTable.id, watchlistId), eq(watchlistsTable.userId, u.id)));
  res.json({ ok: true });
});

export default router;
