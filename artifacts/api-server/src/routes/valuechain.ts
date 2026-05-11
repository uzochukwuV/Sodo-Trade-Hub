import { Router, type IRouter } from "express";
import { db, whaleWalletsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

const VALUECHAIN_API = "https://main-scan.valuechain.xyz/api/v1";
const SODEX_BOT = "0x7ce7a713a4b176fc08790e128a2019453251f80a";
const SODEX_CONTRACTS = [
  "0x441bdb33c7d6dc49f627a42c3d71671d50dc2e94",
  "0x478fec6b6ead70d0e03beeba15027aa6d51180ab",
  "0xb37295d1ea21e65b76dcb2e85e035ee0dbfc70cb",
  "0x5ff862b9c4cd81afbed068062c156e6c7289e4a5",
];

async function vcFetch(params: Record<string, string>) {
  const url = new URL(VALUECHAIN_API);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  return r.json() as Promise<{ status: string; result: unknown; message: string }>;
}

async function scanAddress(address: string) {
  const data = await vcFetch({
    module: "account", action: "txlist",
    address, startblock: "0", endblock: "99999999",
    sort: "desc", limit: "50",
  });
  if (data.status !== "1" || !Array.isArray(data.result)) return null;

  const txs = data.result as Array<{ from: string; to: string; timeStamp: string; hash: string }>;
  const toContracts = txs.filter(t => SODEX_CONTRACTS.includes(t.to?.toLowerCase()));
  const contractSet = new Set(toContracts.map(t => t.to));
  const timestamps = txs.map(t => Number(t.timeStamp) * 1000).filter(Boolean);

  return {
    txCount: txs.length,
    contractsInteracted: [...contractSet].join(","),
    firstSeenAt: timestamps.length ? new Date(Math.min(...timestamps)) : null,
    lastSeenAt: timestamps.length ? new Date(Math.max(...timestamps)) : null,
    isSodexRelated: toContracts.length > 0,
  };
}

router.get("/valuechain/whales", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const wallets = await db.select().from(whaleWalletsTable)
    .orderBy(desc(whaleWalletsTable.txCount))
    .limit(limit);
  res.json({ wallets });
});

router.post("/valuechain/scan", async (req, res) => {
  const { address, label } = req.body;

  if (address) {
    const addr = String(address).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/i.test(addr)) {
      res.status(400).json({ error: "Invalid EVM address" });
      return;
    }
    if (addr === SODEX_BOT) {
      res.status(400).json({ error: "That address is the Sodex system bot" });
      return;
    }

    const info = await scanAddress(addr);
    if (!info) {
      res.json({ scanned: 1, newFound: 0, wallets: [] });
      return;
    }

    const existing = await db.query.whaleWalletsTable.findFirst({ where: eq(whaleWalletsTable.address, addr) });
    if (existing) {
      await db.update(whaleWalletsTable).set({
        txCount: info.txCount,
        contractsInteracted: info.contractsInteracted || null,
        firstSeenAt: info.firstSeenAt,
        lastSeenAt: info.lastSeenAt,
        label: label ? String(label) : existing.label,
      }).where(eq(whaleWalletsTable.address, addr));
      const updated = await db.query.whaleWalletsTable.findFirst({ where: eq(whaleWalletsTable.address, addr) });
      res.json({ scanned: 1, newFound: 0, wallets: [updated] });
      return;
    }

    const [wallet] = await db.insert(whaleWalletsTable).values({
      address: addr,
      label: label ? String(label) : null,
      txCount: info.txCount,
      contractsInteracted: info.contractsInteracted || null,
      firstSeenAt: info.firstSeenAt,
      lastSeenAt: info.lastSeenAt,
      notes: info.isSodexRelated ? "Interacts with Sodex contracts" : null,
    }).returning();

    res.json({ scanned: 1, newFound: 1, wallets: [wallet] });
    return;
  }

  const newWallets: typeof whaleWalletsTable.$inferSelect[] = [];
  let scanned = 0;

  for (const contractAddr of SODEX_CONTRACTS.slice(0, 2)) {
    const data = await vcFetch({
      module: "account", action: "txlist",
      address: contractAddr, startblock: "0", endblock: "99999999",
      sort: "desc", limit: "20",
    });
    if (data.status !== "1" || !Array.isArray(data.result)) continue;

    const txs = data.result as Array<{ from: string; to: string; timeStamp: string }>;
    const uniqueAddrs = [...new Set(
      txs
        .map(t => t.from?.toLowerCase())
        .filter(a => a && a !== SODEX_BOT && /^0x[0-9a-f]{40}$/.test(a))
    )];

    for (const addr of uniqueAddrs.slice(0, 5)) {
      scanned++;
      const existing = await db.query.whaleWalletsTable.findFirst({ where: eq(whaleWalletsTable.address, addr) });
      if (existing) continue;

      const info = await scanAddress(addr);
      if (!info) continue;

      const [wallet] = await db.insert(whaleWalletsTable).values({
        address: addr,
        txCount: info.txCount,
        contractsInteracted: info.contractsInteracted || null,
        firstSeenAt: info.firstSeenAt,
        lastSeenAt: info.lastSeenAt,
        notes: "Auto-discovered from Sodex contract interactions",
      }).returning();

      newWallets.push(wallet);
    }
  }

  res.json({ scanned, newFound: newWallets.length, wallets: newWallets });
});

export default router;
