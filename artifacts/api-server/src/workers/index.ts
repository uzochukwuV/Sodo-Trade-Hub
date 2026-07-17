import { logger } from "../lib/logger";
import { runTrackerOnce } from "../services/leaderboard-tracker";
import { runWalletBacktest } from "../services/wallet-backtest";

function redisUrl(): string | null {
  const raw = process.env["REDIS_URL"]?.trim();
  if (!raw) return null;
  const match = raw.match(/(rediss?:\/\/\S+)/);
  return match?.[1] ?? raw;
}

async function startBullWorker() {
  const url = redisUrl();
  if (!url) {
    logger.info("worker.redis_missing");
    return null;
  }
  const { Worker } = await import("bullmq");
  return new Worker("sogram-mvp", async job => {
    if (job.name === "leaderboard-sync") {
      await runTrackerOnce({
        window: (job.data?.window ?? "7D") as "24H" | "7D" | "30D" | "ALL_TIME",
        pageSize: Number(job.data?.pageSize ?? 50),
      });
      return;
    }
    if (job.name === "wallet-backtest") {
      await runWalletBacktest({
        walletAddress: String(job.data?.walletAddress),
        windowDays: Number(job.data?.windowDays ?? 30),
        startingBalanceUsd: Number(job.data?.startingBalanceUsd ?? 1000),
        tradeSizeUsd: Number(job.data?.tradeSizeUsd ?? 100),
      });
    }
  }, {
    connection: { url },
    concurrency: Number(process.env["WORKER_CONCURRENCY"] ?? 4),
  });
}

startBullWorker()
  .then(worker => {
    if (!worker) return;
    logger.info("worker.started");
    worker.on("failed", (job, err) => logger.warn({ job: job?.name, err }, "worker.job_failed"));
  })
  .catch(err => {
    logger.error({ err }, "worker.start_failed");
    process.exit(1);
  });
