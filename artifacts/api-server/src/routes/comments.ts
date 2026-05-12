import { Router, type IRouter } from "express";
import { db, commentsTable, tradersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireTrader, getCurrentTraderId } from "../lib/auth";

const router: IRouter = Router();

const POST_TYPES = ["trade", "signal", "pain_room", "intent"] as const;
type PostType = typeof POST_TYPES[number];

router.get("/comments/:postType/:postId", async (req, res) => {
  const postType = req.params.postType as PostType;
  const postId = Number(req.params.postId);
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  if (!POST_TYPES.includes(postType)) {
    res.status(400).json({ error: "Invalid postType" });
    return;
  }

  const rows = await db
    .select({
      id: commentsTable.id,
      traderId: commentsTable.traderId,
      traderUsername: tradersTable.username,
      traderHandle: tradersTable.handle,
      traderRepScore: tradersTable.repScore,
      postType: commentsTable.postType,
      postId: commentsTable.postId,
      content: commentsTable.content,
      likeCount: commentsTable.likeCount,
      createdAt: commentsTable.createdAt,
    })
    .from(commentsTable)
    .innerJoin(tradersTable, eq(commentsTable.traderId, tradersTable.id))
    .where(and(eq(commentsTable.postType, postType), eq(commentsTable.postId, postId)))
    .orderBy(desc(commentsTable.createdAt))
    .limit(limit);

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(commentsTable)
    .where(and(eq(commentsTable.postType, postType), eq(commentsTable.postId, postId)));

  res.json({
    comments: rows.map(r => ({ ...r, traderRepScore: Number(r.traderRepScore), createdAt: r.createdAt.toISOString() })),
    total: Number(total),
  });
});

router.post("/comments/:postType/:postId", requireTrader(), async (req, res) => {
  const postType = req.params.postType as PostType;
  const postId = Number(req.params.postId);
  const { content } = req.body;
  const traderId = getCurrentTraderId(req);

  if (!POST_TYPES.includes(postType)) {
    res.status(400).json({ error: "Invalid postType" });
    return;
  }
  if (!content || String(content).trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (String(content).length > 500) {
    res.status(400).json({ error: "Comment must be 500 characters or fewer" });
    return;
  }

  const trader = await db.query.tradersTable.findFirst({ where: eq(tradersTable.id, traderId) });
  if (!trader) {
    res.status(404).json({ error: "Trader not found" });
    return;
  }

  const [comment] = await db.insert(commentsTable).values({
    traderId,
    postType,
    postId,
    content: String(content).trim(),
  }).returning();

  res.status(201).json({
    ...comment,
    traderUsername: trader.username,
    traderHandle: trader.handle,
    traderRepScore: Number(trader.repScore),
    createdAt: comment.createdAt.toISOString(),
  });
});

export default router;
