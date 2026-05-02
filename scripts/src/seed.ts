import { db, tradersTable, tradesTable, signalsTable, copyConfigsTable, painRoomsTable, breakdownsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  await db.delete(breakdownsTable);
  await db.delete(painRoomsTable);
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
    {
      username: "VolatilityVince",
      handle: "vol_vince",
      bio: "Options and perps. Vol plays only.",
      repScore: "72.1",
      tier: "SILVER",
      totalPnlUsd: "61000.00",
      winRate: "63.8",
      tradeCount: 244,
      followerCount: 720,
    },
    {
      username: "DeepValueDan",
      handle: "deepvaluedan",
      bio: "Fundamental analysis in a chart world. Long only.",
      repScore: "83.4",
      tier: "GOLD",
      totalPnlUsd: "178000.00",
      winRate: "69.2",
      tradeCount: 91,
      followerCount: 2100,
    },
    {
      username: "RiskMgr",
      handle: "riskmgr",
      bio: "Ex-TradFi risk desk. Position sizing is everything.",
      repScore: "91.0",
      tier: "DIAMOND",
      totalPnlUsd: "540000.00",
      winRate: "74.6",
      tradeCount: 318,
      followerCount: 5800,
    },
    {
      username: "MacroMike",
      handle: "macromike",
      bio: "Macro-driven crypto trader. Fed watcher.",
      repScore: "88.5",
      tier: "GOLD",
      totalPnlUsd: "320000.00",
      winRate: "72.1",
      tradeCount: 156,
      followerCount: 4200,
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

  // Pain rooms — verified community losses
  const painRooms = await db.insert(painRoomsTable).values([
    {
      traderId: traders[2].id,
      asset: "ETH/USDT",
      side: "LONG",
      entryPrice: "3800.00",
      exitPrice: "3210.00",
      pnlUsd: "-1182.00",
      pnlPct: "-15.58",
      leverage: 5,
      positionSize: "7590.00",
      comment: "I was so confident about the ETH breakout above 3800. Volume was there, RSI wasn't overbought, even had a news catalyst lined up. Didn't expect Powell to come out hawkish at exactly that moment. Got stopped out hard. I need someone to tell me what I missed.",
      isAnonymous: false,
      likeCount: 89,
    },
    {
      traderId: traders[4].id,
      asset: "BTC/USDT",
      side: "SHORT",
      entryPrice: "61200.00",
      exitPrice: "63800.00",
      pnlUsd: "-2080.00",
      pnlPct: "-26.00",
      leverage: 10,
      positionSize: "8000.00",
      comment: "Shorted BTC thinking the 61k rejection was real. Opened 10x, figured the stop at 62.5k was tight enough. Market ripped straight through it. I've shorted this level 3 times and won twice — this time was a disaster. Was I wrong on the level or wrong on the sizing?",
      isAnonymous: false,
      likeCount: 67,
    },
    {
      traderId: traders[1].id,
      asset: "SOL/USDT",
      side: "LONG",
      entryPrice: "172.00",
      exitPrice: "148.50",
      pnlUsd: "-587.50",
      pnlPct: "-13.66",
      leverage: 3,
      positionSize: "4305.00",
      comment: "SOL looked like it was coiling for a breakout. Went long at 172, set stop at 162. Woke up to a 148 candle. Stop was blown through during a 3am liquidation cascade. Not sure if there was anything I could have done differently or if this was just bad luck.",
      isAnonymous: false,
      isResolved: true,
      likeCount: 34,
    },
    {
      traderId: traders[3].id,
      asset: "ARB/USDT",
      side: "LONG",
      entryPrice: "1.24",
      exitPrice: "0.91",
      pnlUsd: "-825.00",
      pnlPct: "-26.61",
      leverage: 1,
      positionSize: "3100.00",
      comment: "No leverage, spot entry. I genuinely believed in the ARB ecosystem thesis — OP was pumping, fees were low, TVL growing. Held through the drop thinking it was temporary. Should have cut it at 1.10. Pride killed this trade.",
      isAnonymous: true,
      likeCount: 21,
    },
  ]).returning();

  const breakdowns = await db.insert(breakdownsTable).values([
    {
      painRoomId: painRooms[0].id,
      responderId: traders[9].id,
      whatFailed: "thesis" as const,
      dataShowed: "Your thesis was directionally fine — ETH was in an uptrend. The problem is you didn't account for macro event risk. Powell's FOMC statement was scheduled 2 hours after your entry. The 4H RSI being fine doesn't help you if there's a scheduled binary event that can move the entire market 5-8% in minutes.",
      doDifferently: "Before any entry, check the economic calendar. If there's a Fed speech, CPI print, or major macro event within 6 hours, either wait until after or cut your position size by 75%. Event risk is the one thing technical analysis cannot protect you from.",
      likeCount: 47,
    },
    {
      painRoomId: painRooms[0].id,
      responderId: traders[8].id,
      whatFailed: "risk_management" as const,
      dataShowed: "Your stop was fine in theory, but 5x leverage on a volatile asset during high-impact news = margin call risk even with a stop. At 5x, a 20% adverse move wipes you regardless of where your stop is set, because price can gap through it during the Powell spike.",
      doDifferently: "During event risk periods, drop to 1-2x max. Your trade idea was actually correct — ETH recovered 3 days later. The leverage killed you, not the thesis.",
      likeCount: 31,
    },
    {
      painRoomId: painRooms[1].id,
      responderId: traders[7].id,
      whatFailed: "sizing" as const,
      dataShowed: "10x on a short near a major support level is extremely aggressive. BTC at 61k has been a historically strong demand zone — multiple bounces going back 8 months. Even if your short thesis was correct, the risk of a short squeeze through your stop at 10x is enormous.",
      doDifferently: "Short into resistance, not support, unless you're scalping with very tight stops. If you want to short near demand zones, use 2-3x maximum. Alternatively, wait for the level to break first, then short the retest — much cleaner risk/reward.",
      likeCount: 58,
    },
    {
      painRoomId: painRooms[1].id,
      responderId: traders[6].id,
      whatFailed: "entry_timing" as const,
      dataShowed: "The rejection you saw at 61k was a local one, not a structural one. Looking at the weekly chart, BTC was in a clear higher-highs pattern. You were fighting the higher timeframe trend with a lower timeframe signal. That's a low probability trade regardless of execution.",
      doDifferently: "Always check if your trade direction aligns with the H4 and daily trend. If you're shorting, the daily should be showing lower highs. BTC wasn't — it was still making higher lows on the daily.",
      likeCount: 22,
    },
    {
      painRoomId: painRooms[2].id,
      responderId: traders[8].id,
      whatFailed: "exit_timing" as const,
      dataShowed: "The 3am liquidation cascade you experienced is a well-known phenomenon — low liquidity hours see outsized moves when large positions get liquidated. SOL is especially prone to this because its futures open interest is dominated by a few large players. Your stop placement was actually correct in normal conditions.",
      doDifferently: "For SOL positions held overnight, either close before 11pm UTC or place your stop 8-10% wider than normal to survive the low-liquidity window, then tighten it again at open. Alternatively, size down to 1x for overnight holds to remove liquidation risk entirely.",
      likeCount: 19,
      isMarkedHelpful: true,
    },
    {
      painRoomId: painRooms[3].id,
      responderId: traders[9].id,
      whatFailed: "thesis" as const,
      dataShowed: "L2 ecosystem plays like ARB are highly correlated to ETH's price and overall market risk appetite. When macro tightens or BTC corrects, altcoins like ARB get hit 2-3x harder. The TVL growth and fee metrics were real — but they don't matter in a risk-off environment.",
      doDifferently: "If you're holding L2 ecosystem plays, hedge with a small ETH short to neutralize macro exposure. Or simply have a time-based stop: if your thesis hasn't played out in X weeks, exit regardless of conviction. Cutting at 1.10 would have saved 65% of this loss.",
      likeCount: 35,
    },
  ]).returning();

  // Update breakdown counts and resolved states
  await db.execute(sql`UPDATE pain_rooms SET breakdown_count = 2 WHERE id IN (${painRooms[0].id}, ${painRooms[1].id})`);
  await db.execute(sql`UPDATE pain_rooms SET breakdown_count = 1 WHERE id IN (${painRooms[2].id}, ${painRooms[3].id})`);
  await db.execute(sql`UPDATE pain_rooms SET is_resolved = true, resolved_breakdown_id = ${breakdowns[4].id} WHERE id = ${painRooms[2].id}`);

  console.log(`Seed complete: ${traders.length} traders, ${painRooms.length} pain rooms, ${breakdowns.length} breakdowns.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
