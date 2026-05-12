import { db, tradersTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { logger } from "./../lib/logger";
import { getSodexWs } from "./sodex-ws";
import { ingestPosition } from "./position-ingest";
import { fetchPositions, type SodexPosition } from "./leaderboard-tracker";

const _registered = new Set<string>();

/** Map a raw account WS frame to a SodexPosition; null if dedup fields are missing. */
function payloadToPosition(m: Record<string, unknown>): SodexPosition | null {
  const inner: Record<string, unknown> =
    (m["o"] && typeof m["o"] === "object" ? m["o"] as Record<string, unknown> : undefined) ??
    (m["data"] && typeof m["data"] === "object" ? m["data"] as Record<string, unknown> : undefined) ??
    m;

  const symbol = (inner["s"] ?? inner["symbol"]) as string | undefined;
  const id     = inner["i"] ?? inner["t"] ?? inner["positionId"] ?? inner["id"] ?? inner["tradeId"];
  if (!symbol || id === undefined || id === null) return null;

  const side: "LONG" | "SHORT" = (() => {
    const raw = (inner["ps"] ?? inner["positionSide"] ?? inner["S"] ?? inner["side"]) as string | undefined;
    if (!raw) return "LONG";
    const u = raw.toUpperCase();
    if (u === "SELL" || u === "SHORT") return "SHORT";
    return "LONG";
  })();

  const num = (k: string, ...fallbacks: string[]) => {
    for (const key of [k, ...fallbacks]) {
      const v = inner[key];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "0";
  };

  const eventType = String(m["e"] ?? "");
  const isFill = eventType === "accountTrade" || eventType === "ORDER_TRADE_UPDATE";
  const realizedPnL = num("rp", "realizedPnL", "rpnl");
  const closedSize  = num("z", "cumClosedSize", "executedQty");
  const positionAmt = num("pa", "positionAmt", "size");

  const numericId = typeof id === "number" ? id : parseInt(String(id), 10);
  if (!Number.isFinite(numericId)) return null;

  return {
    id: numericId,
    symbol,
    positionSide: side,
    leverage: parseInt(num("l", "leverage"), 10) || 1,
    marginMode: (inner["mm"] ?? inner["marginMode"] ?? "CROSS") as string,
    size: positionAmt,
    avgEntryPrice: num("ap", "avgEntryPrice", "entryPrice", "p"),
    avgClosePrice: num("acp", "avgClosePrice", "closePrice"),
    realizedPnL,
    cumClosedSize: closedSize,
    active: isFill ? false : parseFloat(positionAmt) > 0,
    createdAt: Number(inner["ct"] ?? m["T"] ?? Date.now()),
    updatedAt: Number(m["T"] ?? m["E"] ?? Date.now()),
  };
}

/**
 * Bounded REST recovery: only triggered after PARSE_FAIL_THRESHOLD consecutive
 * parse failures for the same wallet, and at most once per RECOVERY_COOLDOWN_MS.
 * Prevents fallback storms if Sodex tweaks the account event envelope.
 */
const PARSE_FAIL_THRESHOLD = 5;
const RECOVERY_COOLDOWN_MS = 60_000;
const _parseFails = new Map<string, number>();
const _lastRecoverAt = new Map<string, number>();

async function recoverFromRest(traderId: number, walletAddress: string, username: string) {
  const now = Date.now();
  const last = _lastRecoverAt.get(walletAddress) ?? 0;
  if (now - last < RECOVERY_COOLDOWN_MS) return;
  _lastRecoverAt.set(walletAddress, now);

  let positions: SodexPosition[];
  try {
    positions = await fetchPositions(walletAddress, 10);
  } catch (err) {
    logger.warn({ event: "wallet_subs.recover_fail", username, err: String(err) }, "REST recovery failed");
    return;
  }
  for (const p of positions) {
    await ingestPosition({ id: traderId, username, walletAddress }, p);
  }
  _parseFails.set(walletAddress, 0);
}

/** Register WS subscriptions for one wallet. Idempotent — re-call safely. */
export function subscribeWallet(traderId: number, walletAddress: string, username: string) {
  const key = walletAddress.toLowerCase();
  if (_registered.has(key)) return;
  _registered.add(key);
  const ws = getSodexWs();
  const trader = { id: traderId, username, walletAddress: key };

  const handle = (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const m = data as Record<string, unknown>;
    const pos = payloadToPosition(m);
    if (pos) {
      _parseFails.set(key, 0);
      ingestPosition(trader, pos).catch(err =>
        logger.warn({ event: "wallet_subs.ingest_fail", username, err: String(err) }, "direct WS ingest failed"),
      );
      return;
    }
    const fails = (_parseFails.get(key) ?? 0) + 1;
    _parseFails.set(key, fails);
    if (fails >= PARSE_FAIL_THRESHOLD) {
      logger.warn({ event: "wallet_subs.parse_threshold", username, wallet: key, fails }, "triggering REST recovery");
      recoverFromRest(traderId, key, username).catch(err =>
        logger.warn({ event: "wallet_subs.recover_err", username, err: String(err) }, "recovery threw"),
      );
    }
  };

  ws.subscribe(`accountUpdate@${key}`, handle);
  ws.subscribe(`accountTrade@${key}`, handle);
  logger.info({ event: "wallet_subs.registered", username, wallet: key }, "ws account subs registered");
}

/** Subscribe to every already-imported tracked wallet. Called once at boot. */
export async function bootstrapWalletSubs(): Promise<number> {
  const traders = await db.select({
    id: tradersTable.id,
    username: tradersTable.username,
    walletAddress: tradersTable.walletAddress,
  }).from(tradersTable).where(and(eq(tradersTable.isAutoDiscovered, true), isNotNull(tradersTable.walletAddress)));
  for (const t of traders) {
    if (t.walletAddress) subscribeWallet(t.id, t.walletAddress, t.username);
  }
  logger.info({ event: "wallet_subs.bootstrap", count: traders.length }, "wallet subs bootstrapped");
  return traders.length;
}
