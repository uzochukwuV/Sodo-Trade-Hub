import { db, tradersTable, watchlistItemsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { logger } from "./../lib/logger";
import { getSodexWs } from "./sodex-ws";
import { ingestPosition } from "./position-ingest";
import { fetchPositions, type SodexPosition } from "./leaderboard-tracker";
import { evaluateAlertEvent } from "./alert-engine";

const _registeredTraderWallets = new Set<string>();
const _registeredWatchlistWallets = new Set<string>();
const _alertDedupe = new Map<string, number>();
const ALERT_DEDUPE_MS = 10 * 60_000;

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

function payloadToOpenOrder(m: Record<string, unknown>) {
  const inner: Record<string, unknown> =
    (m["o"] && typeof m["o"] === "object" ? m["o"] as Record<string, unknown> : undefined) ??
    (m["data"] && typeof m["data"] === "object" ? m["data"] as Record<string, unknown> : undefined) ??
    m;

  const symbol = (inner["s"] ?? inner["symbol"]) as string | undefined;
  const rawStatus = String(inner["X"] ?? inner["status"] ?? inner["orderStatus"] ?? "").toUpperCase();
  const rawType = String(inner["o"] ?? inner["type"] ?? inner["orderType"] ?? "").toUpperCase();
  const orderId = inner["i"] ?? inner["orderID"] ?? inner["orderId"] ?? inner["id"] ?? inner["clientOrderId"] ?? inner["clOrdID"];
  if (!symbol || orderId === undefined || orderId === null) return null;

  const isOpenPlacement = ["NEW", "PARTIALLY_FILLED", "OPEN"].includes(rawStatus)
    || (!rawStatus && ["LIMIT", "MARKET", "STOP", "STOP_MARKET"].includes(rawType));
  if (!isOpenPlacement) return null;

  const rawSide = String(inner["S"] ?? inner["side"] ?? "").toUpperCase();
  const rawPositionSide = String(inner["ps"] ?? inner["positionSide"] ?? rawSide).toUpperCase();
  const side: "LONG" | "SHORT" = rawPositionSide === "SHORT" || rawSide === "SELL" ? "SHORT" : "LONG";
  const price = Number(inner["p"] ?? inner["price"] ?? inner["avgPrice"] ?? 0);
  const quantity = Number(inner["q"] ?? inner["origQty"] ?? inner["quantity"] ?? inner["executedQty"] ?? 0);
  const leverage = Number(inner["l"] ?? inner["leverage"] ?? 0);
  const notionalUsd = price > 0 && quantity > 0 ? price * quantity : undefined;

  return {
    orderId: String(orderId),
    symbol: symbol.replace("-USD", "/USDT"),
    side,
    price: Number.isFinite(price) ? price : undefined,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : undefined,
    notionalUsd,
    status: rawStatus || "OPEN",
    orderType: rawType || "ORDER",
    raw: inner,
  };
}

function shouldSendAlert(key: string) {
  const now = Date.now();
  for (const [k, expiresAt] of _alertDedupe) {
    if (expiresAt <= now) _alertDedupe.delete(k);
  }
  const existing = _alertDedupe.get(key);
  if (existing && existing > now) return false;
  _alertDedupe.set(key, now + ALERT_DEDUPE_MS);
  return true;
}

async function emitWatchedWalletOpenAlert(walletAddress: string, event: ReturnType<typeof payloadToOpenOrder>) {
  if (!event) return;
  const dedupeKey = `${walletAddress}:open_order:${event.orderId}`;
  if (!shouldSendAlert(dedupeKey)) return;

  await evaluateAlertEvent({
    eventType: "open_position",
    subjectType: "wallet",
    subjectId: `${walletAddress}:${event.orderId}`,
    walletAddress,
    asset: event.symbol,
    side: event.side,
    leverage: event.leverage,
    notionalUsd: event.notionalUsd,
    title: `Watchlist wallet opened ${event.side} ${event.symbol}`,
    body: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} placed a ${event.orderType} ${event.side} order on ${event.symbol}${event.price ? ` near ${event.price}` : ""}.`,
    payload: {
      source: "sodex_ws",
      kind: "open_order",
      walletAddress,
      orderId: event.orderId,
      symbol: event.symbol,
      side: event.side,
      price: event.price,
      quantity: event.quantity,
      leverage: event.leverage,
      notionalUsd: event.notionalUsd,
      status: event.status,
      orderType: event.orderType,
      raw: event.raw,
    },
  });
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
  if (_registeredTraderWallets.has(key)) return;
  _registeredTraderWallets.add(key);
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

/** Register WS subscriptions for a watchlist wallet. Does not require trader/profile rows. */
export function subscribeWatchedWallet(walletAddress: string) {
  const key = walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(key)) return;
  if (_registeredWatchlistWallets.has(key)) return;
  _registeredWatchlistWallets.add(key);
  const ws = getSodexWs();

  const handle = (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const m = data as Record<string, unknown>;
    const order = payloadToOpenOrder(m);
    if (order) {
      _parseFails.set(key, 0);
      emitWatchedWalletOpenAlert(key, order).catch(err =>
        logger.warn({ event: "watchlist_ws.alert_fail", wallet: key, err: String(err) }, "watched wallet alert failed"),
      );
      return;
    }

    const pos = payloadToPosition(m);
    if (pos?.active) {
      _parseFails.set(key, 0);
      emitWatchedWalletOpenAlert(key, {
        orderId: String(pos.id),
        symbol: pos.symbol.replace("-USD", "/USDT"),
        side: pos.positionSide,
        price: Number(pos.avgEntryPrice || 0),
        quantity: Number(pos.size || 0),
        leverage: pos.leverage,
        notionalUsd: Number(pos.avgEntryPrice || 0) * Number(pos.size || 0),
        status: "OPEN",
        orderType: "POSITION",
        raw: pos as unknown as Record<string, unknown>,
      }).catch(err =>
        logger.warn({ event: "watchlist_ws.position_alert_fail", wallet: key, err: String(err) }, "watched wallet position alert failed"),
      );
      return;
    }
  };

  ws.subscribe(`accountUpdate@${key}`, handle);
  ws.subscribe(`accountTrade@${key}`, handle);
  logger.info({ event: "watchlist_ws.registered", wallet: key }, "watchlist ws account subs registered");
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

/** Subscribe to every raw wallet currently saved in user watchlists. */
export async function bootstrapWatchlistWalletSubs(): Promise<number> {
  const rows = await db.select({
    walletAddress: watchlistItemsTable.walletAddress,
  })
    .from(watchlistItemsTable)
    .where(isNotNull(watchlistItemsTable.walletAddress))
    .groupBy(watchlistItemsTable.walletAddress);

  let count = 0;
  for (const row of rows) {
    if (!row.walletAddress) continue;
    subscribeWatchedWallet(row.walletAddress);
    count++;
  }
  logger.info({ event: "watchlist_ws.bootstrap", count }, "watchlist wallet subs bootstrapped");
  return count;
}
