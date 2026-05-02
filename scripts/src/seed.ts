import { db, tradersTable, tradesTable, signalsTable, copyConfigsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  await db.delete(copyConfigsTable);
  await db.delete(signalsTable);
  await db.delete(tradesTable);
  await db.delete(tradersTable);

  const traders = await db.insert(tradersTable).values([
    {
      username: "CryptoWhale99",
      handle: "cryptowhale99",
      bio: "10x trader. BTC maxi. LONG bias. Been in the game since 2017.",
      repScore: "94.5",
      tier: "DIAMOND",
      totalPnlUsd: "1250000.00",
      winRate: "78.3",
      tradeCount: 412,
      followerCount: 8420,
    },
    {
      username: "SolanaKing",
      handle: "solanaking",
      bio: "SOL ecosystem specialist. Scalps and swings.",
      repScore: "87.2",
      tier: "GOLD",
      totalPnlUsd: "430000.00",
      winRate: "71.5",
      tradeCount: 289,
      followerCount: 3210,
    },
    {
      username: "EthDegenX",
      handle: "ethdegen_x",
      bio: "ETH perp trader. High leverage, high reward.",
      repScore: "81.0",
      tier: "GOLD",
      totalPnlUsd: "215000.00",
      winRate: "65.2",
      tradeCount: 178,
      followerCount: 1850,
    },
    {
      username: "ArbArbitrage",
      handle: "arb_arb",
      bio: "Arb and L2 specialist. Delta neutral strategies.",
      repScore: "76.4",
      tier: "SILVER",
      totalPnlUsd: "89000.00",
      winRate: "68.9",
      tradeCount: 521,
      followerCount: 940,
    },
    {
      username: "BNBBull",
      handle: "bnbbull",
      bio: "BNB chain native. Spot + perps.",
      repScore: "69.1",
      tier: "SILVER",
      totalPnlUsd: "42000.00",
      winRate: "61.3",
      tradeCount: 133,
      followerCount: 580,
    },
    {
      username: "OpTrader",
      handle: "optrader",
      bio: "OP stack ecosystem plays. Long-term thesis.",
      repScore: "58.7",
      tier: "BRONZE",
      totalPnlUsd: "18500.00",
      winRate: "55.0",
      tradeCount: 67,
      followerCount: 210,
    },
  ]).returning();

  const now = new Date();
  const h = (hrs: number) => new Date(now.getTime() - hrs * 3600000);

  await db.insert(tradesTable).values([
    { traderId: traders[0].id, asset: "BTC/USDT", side: "LONG", entryPrice: "61200.00", exitPrice: "68450.00", pnlUsd: "84350.00", pnlPct: "11.84", positionSize: "10.0", leverage: 5, isVerified: true, likeCount: 842, comment: "Held through the dip. Diamond hands.", closedAt: h(2), createdAt: h(2) },
    { traderId: traders[0].id, asset: "ETH/USDT", side: "LONG", entryPrice: "3100.00", exitPrice: "3890.00", pnlUsd: "23700.00", pnlPct: "25.48", positionSize: "30.0", leverage: 3, isVerified: true, likeCount: 511, comment: "ETH breakout confirmed. Took profits.", closedAt: h(18), createdAt: h(18) },
    { traderId: traders[1].id, asset: "SOL/USDT", side: "LONG", entryPrice: "142.00", exitPrice: "189.50", pnlUsd: "47500.00", pnlPct: "33.45", positionSize: "1000.0", leverage: 2, isVerified: true, likeCount: 398, comment: "SOL ecosystem breakout. Held 3 weeks.", closedAt: h(5), createdAt: h(5) },
    { traderId: traders[2].id, asset: "ETH/USDT", side: "SHORT", entryPrice: "3950.00", exitPrice: "3420.00", pnlUsd: "31800.00", pnlPct: "13.42", positionSize: "60.0", leverage: 8, isVerified: true, likeCount: 276, comment: "Predicted the reversal. Clean short.", closedAt: h(12), createdAt: h(12) },
    { traderId: traders[3].id, asset: "ARB/USDT", side: "LONG", entryPrice: "0.85", exitPrice: "1.24", pnlUsd: "9750.00", pnlPct: "45.88", positionSize: "25000.0", leverage: 1, isVerified: true, likeCount: 189, comment: "Arbitrum airdrop play. No leverage needed.", closedAt: h(48), createdAt: h(48) },
    { traderId: traders[4].id, asset: "BNB/USDT", side: "LONG", entryPrice: "385.00", exitPrice: "442.00", pnlUsd: "5700.00", pnlPct: "14.81", positionSize: "100.0", leverage: 2, isVerified: false, likeCount: 94, comment: "BNB consolidation break.", closedAt: h(72), createdAt: h(72) },
    { traderId: traders[0].id, asset: "BTC/USDT", side: "SHORT", entryPrice: "72100.00", exitPrice: "68900.00", pnlUsd: "16000.00", pnlPct: "4.44", positionSize: "5.0", leverage: 10, isVerified: true, likeCount: 620, comment: "Market was overextended. Perfect short.", closedAt: h(96), createdAt: h(96) },
    { traderId: traders[1].id, asset: "SOL/USDT", side: "SHORT", entryPrice: "205.00", exitPrice: "171.50", pnlUsd: "16750.00", pnlPct: "16.34", positionSize: "500.0", leverage: 4, isVerified: true, likeCount: 231, comment: "SOL corrected as expected.", closedAt: h(120), createdAt: h(120) },
  ]);

  await db.insert(signalsTable).values([
    { traderId: traders[0].id, asset: "BTC/USDT", side: "LONG", entryPrice: "65800.00", targetPrice: "72000.00", stopLoss: "63200.00", confidence: 88, reasoning: "BTC forming higher lows on 4H. Accumulation pattern. Target ATH retest.", likeCount: 724 },
    { traderId: traders[1].id, asset: "SOL/USDT", side: "LONG", entryPrice: "168.00", targetPrice: "210.00", stopLoss: "155.00", confidence: 82, reasoning: "SOL breaking out of 3-week consolidation. Volume confirms.", likeCount: 389 },
    { traderId: traders[2].id, asset: "ETH/USDT", side: "SHORT", entryPrice: "3750.00", targetPrice: "3200.00", stopLoss: "3900.00", confidence: 74, reasoning: "ETH facing resistance at 3800. Bearish divergence on RSI. Expecting correction.", likeCount: 218 },
    { traderId: traders[3].id, asset: "ARB/USDT", side: "LONG", entryPrice: "0.95", targetPrice: "1.40", stopLoss: "0.88", confidence: 71, reasoning: "ARB ecosystem activity picking up. Undervalued vs OP.", likeCount: 142 },
    { traderId: traders[4].id, asset: "BNB/USDT", side: "LONG", entryPrice: "402.00", targetPrice: "460.00", stopLoss: "385.00", confidence: 68, reasoning: "BNB holding key support. Potential breakout incoming.", likeCount: 87 },
  ]);

  await db.insert(copyConfigsTable).values([
    { followerId: traders[3].id, leaderId: traders[0].id, isActive: true, maxPositionSizeUsd: "500", maxLeverage: 5, stopLossPct: "8" },
    { followerId: traders[4].id, leaderId: traders[0].id, isActive: true, maxPositionSizeUsd: "200", maxLeverage: 3, stopLossPct: "10" },
    { followerId: traders[5].id, leaderId: traders[1].id, isActive: false, maxPositionSizeUsd: "100", maxLeverage: 2, stopLossPct: "15" },
  ]);

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
