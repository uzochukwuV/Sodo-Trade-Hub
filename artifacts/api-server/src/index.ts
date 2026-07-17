import app from "./app";
import { logger } from "./lib/logger";
import { getSodexWs } from "./services/sodex-ws";
import { loadSymbolMeta } from "./services/sodex-rest";
import {
  warmupMarketSnapshot,
  startMarketWsSubscriptions,
  startSymbolFillSubscriptions,
  startMarketRefresh,
  knownSymbols,
} from "./services/market-activity";
import { startTelegramBot } from "./services/telegram";
import { startHighImpactTradeIndexer } from "./services/high-impact-trade-indexer";
import { bootstrapWatchlistWalletSubs } from "./services/wallet-subs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const enableIndexers = process.env["ENABLE_INDEXERS"] !== "0";

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Realtime ingest stack — order matters but each step is fire-and-forget so
  // a Sodex outage doesn't block server boot.
  //  1. Open the shared WS connection (lazy singleton; this is the trigger).
  //  2. Cache symbol metadata (tick size etc.) for the verify path.
  //  3. Warm up the market snapshot from REST so /markets/activity has data
  //     before the first WS frame, then register live WS subscriptions on top.
  //  4. Bootstrap account subscriptions for every already-tracked wallet.
  getSodexWs();
  loadSymbolMeta().catch(err => logger.warn({ err }, "symbol meta load failed"));
  startMarketWsSubscriptions();
  warmupMarketSnapshot()
    .then(() => startSymbolFillSubscriptions(knownSymbols()))
    .catch(err => logger.warn({ err }, "market warmup failed"));
  startMarketRefresh(60_000);
  if (enableIndexers) {
    startHighImpactTradeIndexer(60_000);
    bootstrapWatchlistWalletSubs().catch(err => logger.warn({ err }, "watchlist wallet subs bootstrap failed"));
  } else {
    logger.info("high-impact trade indexer disabled; using live SoDEX leaderboard analysis");
  }

  startTelegramBot();                  // Telegram alerts for notable trades (DIAMOND/GOLD tier)
});
