import { logger } from "../lib/logger";
import { runSignalPollerOnce } from "./signal-poller";
import { runTrackerOnce } from "./leaderboard-tracker";
import { recomputeAllWalletRollups } from "./analytics-rollups";
import { enqueueJob } from "./queues";

type TimerHandle = ReturnType<typeof setInterval>;

const handles: TimerHandle[] = [];

function startTask(name: string, intervalMs: number, fn: () => Promise<void>) {
  const kick = () => fn().catch(err => logger.warn({ err, job: name }, "automation task failed"));
  void kick();
  const handle = setInterval(kick, intervalMs);
  handles.push(handle);
  logger.info({ job: name, intervalMs }, "automation task scheduled");
}

export function startAutomationWorker() {
  if (handles.length > 0) return;

  startTask("wallet_rollups", 10 * 60_000, async () => {
    await recomputeAllWalletRollups(200);
  });

  startTask("leaderboard_refresh", 30 * 60_000, async () => {
    if (process.env["REDIS_URL"]) {
      await enqueueJob("leaderboard-sync", { window: "7D", pageSize: 50 }, { jobId: `leaderboard-7d-${Math.floor(Date.now() / 1_800_000)}` });
      return;
    }
    await runTrackerOnce({ window: "7D", pageSize: 20 });
  });

  startTask("signal_poll", 5 * 60_000, async () => {
    await runSignalPollerOnce();
  });
}

export function stopAutomationWorker() {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) clearInterval(handle);
  }
}
