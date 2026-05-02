import { Router, type IRouter } from "express";
import { db, tradersTable, tradesTable } from "@workspace/db";
import { eq, desc, ilike, count } from "drizzle-orm";
import {
  ListTradersQueryParams,
  CreateTraderBody,
  GetTraderParams,
  GetTraderTradesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/traders", async (req, res) => {
  const parsed = ListTradersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { limit } = parsed.data;
  const offset = Number(req.query.offset ?? 0);
  const search = req.query.search ? String(req.query.search) : undefined;

  let q = db.select().from(tradersTable).orderBy(desc(tradersTable.repScore)).limit(limit).offset(offset);
  if (search) {
    q = db.select().from(tradersTable).where(ilike(tradersTable.username, `%${search}%`)).orderBy(desc(tradersTable.repScore)).limit(limit).offset(offset) as typeof q;
  }
  const traders = await q;
  const [{ value: total }] = await db.select({ value: count() }).from(tradersTable);
  res.json({ traders, total: Number(total) });
});

router.post("/traders", async (req, res) => {
  const parsed = CreateTraderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [trader] = await db.insert(tradersTable).values(parsed.data).returning();
  res.status(201).json(trader);
});

router.get("/traders/:traderId", async (req, res) => {
  const parsed = GetTraderParams.safeParse({ traderId: Number(req.params.traderId) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const trader = await db.query.tradersTable.findFirst({
    where: eq(tradersTable.id, parsed.data.traderId),
  });
  if (!trader) {
    res.status(404).json({ error: "Trader not found" });
    return;
  }
  res.json(trader);
});

router.get("/traders/:traderId/trades", async (req, res) => {
  const traderId = Number(req.params.traderId);
  const parsed = GetTraderTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { limit } = parsed.data;
  const offset = Number(req.query.offset ?? 0);
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.traderId, traderId))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json({ trades, total: trades.length });
});

export default router;
