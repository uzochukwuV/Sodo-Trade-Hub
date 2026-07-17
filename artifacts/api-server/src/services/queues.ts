import { logger } from "../lib/logger";

type JobName = "leaderboard-sync" | "wallet-score-refresh" | "wallet-backtest" | "notification-dispatch" | "alert-outcome-resolver";

type LocalJob = {
  name: JobName;
  payload: Record<string, unknown>;
};

const localJobs: LocalJob[] = [];
let bullQueuePromise: Promise<unknown> | null = null;

function redisUrl(): string | null {
  const raw = process.env["REDIS_URL"]?.trim();
  if (!raw) return null;
  const match = raw.match(/(rediss?:\/\/\S+)/);
  return match?.[1] ?? raw;
}

async function getBullQueue() {
  const url = redisUrl();
  if (!url) return null;
  if (!bullQueuePromise) {
    bullQueuePromise = import("bullmq").then(({ Queue }) => new Queue("sogram-mvp", {
      connection: { url },
    }));
  }
  return bullQueuePromise as Promise<{ add: (name: string, data: unknown, opts?: unknown) => Promise<unknown> }>;
}

export async function enqueueJob(name: JobName, payload: Record<string, unknown>, opts: { jobId?: string } = {}) {
  const queue = await getBullQueue().catch(err => {
    logger.warn({ err }, "queue.bull_init_failed");
    return null;
  });
  if (queue) {
    await queue.add(name, payload, {
      jobId: opts.jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 500,
      removeOnFail: 200,
    });
    return;
  }
  localJobs.push({ name, payload });
  logger.debug({ name, queued: localJobs.length }, "queue.local_enqueued");
}

export function drainLocalJobs() {
  return localJobs.splice(0, localJobs.length);
}
