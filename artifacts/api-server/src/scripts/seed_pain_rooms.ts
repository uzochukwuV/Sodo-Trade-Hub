import { db, painRoomsTable, breakdownsTable, tradersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function seed() {
  const traders = await db.select().from(tradersTable).limit(10);
  if (traders.length < 3) {
    console.error("Need at least 3 traders. Run main seed first.");
    process.exit(1);
  }

  await db.execute(sql`TRUNCATE breakdowns, pain_rooms RESTART IDENTITY CASCADE`);

  const painRooms = await db.insert(painRoomsTable).values([
    {
      traderId: traders[0].id,
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
    },
    {
      traderId: traders[1].id,
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
    },
    {
      traderId: traders[2].id,
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
    },
  ]).returning();

  const breakdowns = await db.insert(breakdownsTable).values([
    {
      painRoomId: painRooms[0].id,
      responderId: traders[4].id,
      whatFailed: "thesis",
      dataShowed: "Your thesis was directionally fine — ETH was in an uptrend. The problem is you didn't account for macro event risk. Powell's FOMC statement was scheduled 2 hours after your entry. The 4H RSI being fine doesn't help you if there's a scheduled binary event that can move the entire market 5-8% in minutes.",
      doDifferently: "Before any entry, check the economic calendar. If there's a Fed speech, CPI print, or major macro event within 6 hours, either wait until after or cut your position size by 75%. Event risk is the one thing technical analysis cannot protect you from.",
    },
    {
      painRoomId: painRooms[0].id,
      responderId: traders[5].id,
      whatFailed: "risk_management",
      dataShowed: "Your stop was fine in theory, but 5x leverage on a volatile asset during high-impact news = margin call risk even with a stop. At 5x, a 20% adverse move wipes you regardless of where your stop is set, because price can gap through it during the Powell spike.",
      doDifferently: "During event risk periods, drop to 1-2x max. Your trade idea was actually correct — ETH recovered 3 days later. The leverage killed you, not the thesis.",
    },
    {
      painRoomId: painRooms[1].id,
      responderId: traders[6].id,
      whatFailed: "sizing",
      dataShowed: "10x on a short near a major support level is extremely aggressive. BTC at 61k has been a historically strong demand zone — multiple bounces going back 8 months. Even if your short thesis was correct, the risk of a short squeeze through your stop at 10x is enormous. Your winners at this level were probably 1-2% moves, your loser was a 4%+ rip.",
      doDifferently: "Short into resistance, not support, unless you're scalping with very tight stops. If you want to short near demand zones, use 2-3x maximum and widen your stop. Alternatively, wait for the level to break first, then short the retest — much cleaner.",
    },
    {
      painRoomId: painRooms[1].id,
      responderId: traders[7].id,
      whatFailed: "entry_timing",
      dataShowed: "The rejection you saw at 61k was a local one, not a structural one. Looking at the weekly chart, BTC was in a clear higher-highs pattern. You were fighting the higher timeframe trend with a lower timeframe signal. That's a low probability trade regardless of execution.",
      doDifferently: "Always check if your trade direction aligns with the H4 and daily trend. If you're shorting, the daily should be showing lower highs. BTC wasn't — it was still making higher lows on the daily. That's a yellow flag.",
    },
    {
      painRoomId: painRooms[2].id,
      responderId: traders[8].id,
      whatFailed: "exit_timing",
      dataShowed: "The 3am liquidation cascade you experienced is a well-known phenomenon — low liquidity hours see outsized moves when large positions get liquidated. SOL is especially prone to this because its futures open interest is dominated by a few large players. Your stop placement was actually correct in normal conditions.",
      doDifferently: "For SOL positions held overnight, either close before 11pm UTC or place your stop 8-10% wider than normal to survive the low-liquidity window, then tighten it again at open. Alternatively, size down to 1x for overnight holds to remove liquidation risk entirely.",
    },
    {
      painRoomId: painRooms[3].id,
      responderId: traders[9].id,
      whatFailed: "thesis",
      dataShowed: "L2 ecosystem plays like ARB are highly correlated to ETH's price and overall market risk appetite. When macro tightens or BTC corrects, altcoins like ARB get hit 2-3x harder. The TVL growth and fee metrics were real — but they don't matter in a risk-off environment. Fundamentals only drive price in bull markets.",
      doDifferently: "If you're holding L2 ecosystem plays, hedge with a small ETH or BTC short to neutralize macro exposure. Or simply have a time-based stop: if your thesis hasn't played out in X weeks, exit regardless of conviction. Cutting at 1.10 would have saved 65% of this loss.",
    },
  ]).returning();

  await db.update(painRoomsTable)
    .set({ breakdownCount: 2 })
    .where(sql`id IN (${painRooms[0].id}, ${painRooms[1].id})`);
  await db.update(painRoomsTable)
    .set({ breakdownCount: 1 })
    .where(sql`id IN (${painRooms[2].id}, ${painRooms[3].id})`);

  await db.update(breakdownsTable)
    .set({ likeCount: 47 })
    .where(sql`id = ${breakdowns[0].id}`);
  await db.update(breakdownsTable)
    .set({ likeCount: 31 })
    .where(sql`id = ${breakdowns[1].id}`);
  await db.update(breakdownsTable)
    .set({ likeCount: 58 })
    .where(sql`id = ${breakdowns[2].id}`);
  await db.update(breakdownsTable)
    .set({ likeCount: 22 })
    .where(sql`id = ${breakdowns[3].id}`);
  await db.update(breakdownsTable)
    .set({ likeCount: 19, isMarkedHelpful: true })
    .where(sql`id = ${breakdowns[4].id}`);
  await db.update(breakdownsTable)
    .set({ likeCount: 35 })
    .where(sql`id = ${breakdowns[5].id}`);

  await db.update(painRoomsTable)
    .set({ isResolved: true, resolvedBreakdownId: breakdowns[4].id, likeCount: 34 })
    .where(sql`id = ${painRooms[2].id}`);
  await db.update(painRoomsTable)
    .set({ likeCount: 89 })
    .where(sql`id = ${painRooms[0].id}`);
  await db.update(painRoomsTable)
    .set({ likeCount: 67 })
    .where(sql`id = ${painRooms[1].id}`);
  await db.update(painRoomsTable)
    .set({ likeCount: 21 })
    .where(sql`id = ${painRooms[3].id}`);

  console.log(`Seeded ${painRooms.length} pain rooms and ${breakdowns.length} breakdowns.`);
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
