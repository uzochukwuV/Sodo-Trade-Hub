import app from "./app";
import { logger } from "./lib/logger";
import { startSignalResolver } from "./scripts/signal-resolver";
import { startTrackerPoller } from "./services/leaderboard-tracker";
import { startSignalPoller } from "./services/signal-poller";

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
  startSignalResolver(60_000);
  startTrackerPoller(60 * 60_000);   // refresh leaderboard hourly (matches Sodex cadence)
  startSignalPoller(30_000);          // poll each tracked trader's positions every 30s (no Sodex WS available)
});
