import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { isAddress, getAddress } from "viem";
import { newNonce, buildSiweMessage, verifySiwe, requireAuth, getCurrentUser } from "../lib/auth";

const router: IRouter = Router();

/**
 * Step 1 — Client posts {address}. Server returns {nonce, message}.
 * Client signs `message` in the wallet, then calls /verify.
 */
router.post("/auth/nonce", async (req, res) => {
  const addrRaw = String(req.body?.address ?? "").trim();
  if (!isAddress(addrRaw)) { res.status(400).json({ error: "bad_address" }); return; }
  const address = getAddress(addrRaw);

  const nonce = newNonce();
  const issuedAt = new Date();

  // Upsert user row + stash nonce. We always use lowercase for the DB key
  // so a checksummed/lowercase variant of the same wallet maps to one row.
  const dbAddr = address.toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.walletAddress, dbAddr)).limit(1);

  if (existing) {
    await db.update(usersTable)
      .set({ nonce, nonceIssuedAt: issuedAt })
      .where(eq(usersTable.id, existing.id));
  } else {
    await db.insert(usersTable).values({
      walletAddress: dbAddr,
      nonce,
      nonceIssuedAt: issuedAt,
    });
  }

  const message = buildSiweMessage({ address, nonce, issuedAt });
  res.json({ nonce, message });
});

/**
 * Step 2 — Client posts {address, message, signature}. Server verifies and creates session.
 */
router.post("/auth/verify", async (req, res) => {
  const addrRaw = String(req.body?.address ?? "").trim();
  const message = String(req.body?.message ?? "");
  const signature = String(req.body?.signature ?? "") as `0x${string}`;
  if (!isAddress(addrRaw) || !message || !signature.startsWith("0x")) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  const address = getAddress(addrRaw);
  const dbAddr = address.toLowerCase();

  const [u] = await db.select().from(usersTable).where(eq(usersTable.walletAddress, dbAddr)).limit(1);
  if (!u || !u.nonce || !u.nonceIssuedAt) { res.status(400).json({ error: "no_nonce" }); return; }

  const ok = await verifySiwe({
    address,
    message,
    signature,
    expectedNonce: u.nonce,
    nonceIssuedAt: u.nonceIssuedAt,
  });
  if (!ok) { res.status(401).json({ error: "bad_signature" }); return; }

  // ATOMIC nonce burn — conditional UPDATE WHERE nonce = expected. If two requests
  // race, only one will return a row; the other gets `burned.length === 0` and is rejected.
  // This closes the TOCTOU replay window between verifySiwe and the nonce clear.
  const burned = await db.update(usersTable)
    .set({ nonce: null, nonceIssuedAt: null, lastSeenAt: new Date() })
    .where(and(eq(usersTable.id, u.id), eq(usersTable.nonce, u.nonce), isNotNull(usersTable.nonce)))
    .returning({ id: usersTable.id });
  if (burned.length === 0) { res.status(409).json({ error: "nonce_already_consumed" }); return; }

  // Regenerate session ID on login to defeat session fixation attacks (a pre-login
  // session can't be promoted to authenticated; cookie value rotates).
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.userId = u.id;
  req.session.walletAddress = dbAddr;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  res.json({ id: u.id, walletAddress: dbAddr, displayName: u.displayName });
});

router.post("/auth/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth(), async (req, res) => {
  const u = getCurrentUser(req)!;
  res.json({
    id: u.id,
    walletAddress: u.walletAddress,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    traderId: u.traderId,
    joinedAt: u.joinedAt,
    lastSeenAt: u.lastSeenAt,
  });
});

export default router;
