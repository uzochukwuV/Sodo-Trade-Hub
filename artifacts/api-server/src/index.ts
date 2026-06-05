import app from "./app";
import { logger } from "./lib/logger";
import { startSignalResolver } from "./scripts/signal-resolver";
import { startTrackerPoller } from "./services/leaderboard-tracker";
import { startSignalPoller } from "./services/signal-poller";
import { getSodexWs } from "./services/sodex-ws";
import { loadSymbolMeta } from "./services/sodex-rest";
import {
  warmupMarketSnapshot,
  startMarketWsSubscriptions,
  startSymbolFillSubscriptions,
  startMarketRefresh,
  knownSymbols,
} from "./services/market-activity";
import { bootstrapWalletSubs } from "./services/wallet-subs";
import { startAiAgent } from "./services/ai-agent";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

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
  bootstrapWalletSubs().catch(err => logger.warn({ err }, "wallet subs bootstrap failed"));

  startSignalResolver(60_000);
  startTrackerPoller(60 * 60_000);    // hourly leaderboard refresh
  startSignalPoller(5 * 60_000);      // 5-min REST safety net (WS is primary)
  startAiAgent(15 * 60_000);          // AI agent: post intents + signals every 15 min
});
