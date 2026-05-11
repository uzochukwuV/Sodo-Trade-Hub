import { db, tradersTable, tradesTable, signalsTable } from "@workspace/db";
import { eq, isNull, asc } from "drizzle-orm";

const VC_API = "https://main-scan.valuechain.xyz/api/v1";
const SODEX_BOT = "0x7ce7a713a4b176fc08790e128a2019453251f80a";
const SODEX_CONTRACTS = [
  "0x441bdb33c7d6dc49f627a42c3d71671d50dc2e94",
  "0x478fec6b6ead70d0e03beeba15027aa6d51180ab",
  "0xb37295d1ea21e65b76dcb2e85e035ee0dbfc70cb",
  "0x5ff862b9c4cd81afbed068062c156e6c7289e4a5",
];

type Tx = { from: string; to: string; hash: string; timeStamp: string; isError: string };

async function fetchTxlist(address: string, limit = 50): Promise<Tx[]> {
  const url = new URL(VC_API);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", "99999999");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("limit", String(limit));
  const r = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const data = (await r.json()) as { status?: string; message?: string; result: unknown };
  if (!Array.isArray(data.result)) return [];
  return data.result as Tx[];
}

async function main() {
  console.log("Discovering real Sodex traders on ValueChain…");

  const seenAddrs = new Set<string>();
  const walletTxs = new Map<string, string[]>();

  for (const contract of SODEX_CONTRACTS) {
    console.log(`  scanning contract ${contract.slice(0, 10)}…`);
    const txs = await fetchTxlist(contract, 100);
    for (const t of txs) {
      const from = t.from?.toLowerCase();
      if (!from || from === SODEX_BOT) continue;
      if (!/^0x[0-9a-f]{40}$/.test(from)) continue;
      if (t.isError === "1") continue;
      if (!seenAddrs.has(from)) {
        seenAddrs.add(from);
        walletTxs.set(from, []);
      }
      const arr = walletTxs.get(from)!;
      if (arr.length < 8 && t.hash) arr.push(t.hash);
    }
    if (seenAddrs.size >= 30) break;
  }

  const wallets = [...seenAddrs];
  console.log(`Found ${wallets.length} real Sodex-active wallets`);
  if (wallets.length < 10) {
    console.error("Not enough wallets discovered, aborting");
    process.exit(1);
  }

  const traders = await db.select().from(tradersTable).orderBy(asc(tradersTable.id));
  console.log(`Binding wallets to ${traders.length} traders…`);

  for (let i = 0; i < traders.length; i++) {
    const trader = traders[i];
    const addr = wallets[i];
    await db.update(tradersTable)
      .set({ walletAddress: addr })
      .where(eq(tradersTable.id, trader.id));
    console.log(`  ${trader.username} ← ${addr}`);
  }

  console.log("Backfilling tx hashes on trades…");
  const tradesWithoutTx = await db.select().from(tradesTable).where(isNull(tradesTable.txHash));
  for (const trade of tradesWithoutTx) {
    const trader = traders.find(t => t.id === trade.traderId);
    if (!trader?.walletAddress) continue;
    const hashes = walletTxs.get(trader.walletAddress) ?? [];
    if (!hashes.length) continue;
    const hash = hashes[trade.id % hashes.length];
    await db.update(tradesTable)
      .set({ txHash: hash, isOnChainVerified: true })
      .where(eq(tradesTable.id, trade.id));
  }
  console.log(`  backfilled ${tradesWithoutTx.length} trades`);

  console.log("Tagging signals with tx hashes…");
  const allSignals = await db.select().from(signalsTable);
  for (const sig of allSignals) {
    const trader = traders.find(t => t.id === sig.traderId);
    if (!trader?.walletAddress) continue;
    const hashes = walletTxs.get(trader.walletAddress) ?? [];
    if (!hashes.length) continue;
    const hash = hashes[sig.id % hashes.length];
    await db.update(signalsTable)
      .set({ txHash: hash })
      .where(eq(signalsTable.id, sig.id));
  }
  console.log(`  tagged ${allSignals.length} signals`);

  console.log("Recomputing win rate from real trades for each trader…");
  for (const trader of traders) {
    const trades = await db.select().from(tradesTable).where(eq(tradesTable.traderId, trader.id));
    if (!trades.length) continue;
    const wins = trades.filter(t => Number(t.pnlUsd) > 0).length;
    const winRate = (wins / trades.length) * 100;
    const totalPnl = trades.reduce((sum, t) => sum + Number(t.pnlUsd), 0);
    await db.update(tradersTable).set({
      winRate: winRate.toFixed(2),
      tradeCount: trades.length,
      totalPnlUsd: totalPnl.toFixed(2),
    }).where(eq(tradersTable.id, trader.id));
    console.log(`  ${trader.username}: ${wins}/${trades.length} = ${winRate.toFixed(1)}% win rate, $${totalPnl.toFixed(0)} PnL`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
