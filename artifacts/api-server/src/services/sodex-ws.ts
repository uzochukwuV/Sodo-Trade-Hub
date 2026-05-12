import WebSocket from "ws";
import { logger } from "../lib/logger";

/**
 * Singleton Sodex WS client: 25s ping, exp-backoff reconnect, sub registry
 * replayed on reconnect, typed dispatcher. Stream names follow Sodex schema
 * (allMiniTicker, allMarkPrice, trade@SYM, accountUpdate@addr, accountTrade@addr).
 */

type Handler = (msg: unknown) => void;

/** Pull a 0x… wallet address from an account event payload. Lowercase or null. */
function extractWalletAddress(m: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    m["a"], m["address"], m["account"], m["wallet"], m["walletAddress"], m["user"],
  ];
  // Some gateways nest under `data` / `o` (order) / `u` (account snapshot).
  for (const k of ["data", "o", "u"] as const) {
    const v = m[k];
    if (v && typeof v === "object") {
      const inner = v as Record<string, unknown>;
      candidates.push(inner["a"], inner["address"], inner["account"], inner["wallet"], inner["walletAddress"]);
    }
  }
  for (const c of candidates) {
    if (typeof c === "string" && /^0x[0-9a-fA-F]{40}$/.test(c)) return c.toLowerCase();
  }
  return null;
}

export type WsHealth = {
  connected: boolean;
  lastMessageAt: number | null;
  lastConnectedAt: number | null;
  subscriptionCount: number;
  reconnectCount: number;
  lastError: string | null;
};

export class SodexWsClient {
  private url: string;
  private ws: WebSocket | null = null;
  private subs = new Map<string, Set<Handler>>();
  private msgId = 1;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1_000;
  private closing = false;

  health: WsHealth = {
    connected: false,
    lastMessageAt: null,
    lastConnectedAt: null,
    subscriptionCount: 0,
    reconnectCount: 0,
    lastError: null,
  };

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws || this.closing) return;
    try {
      const ws = new WebSocket(this.url, {
        headers: { Origin: "https://sodex.com" },
        handshakeTimeout: 10_000,
      });
      this.ws = ws;
      logger.info({ event: "ws.connecting", url: this.url }, "sodex ws connecting");

      ws.on("open", () => {
        this.health.connected = true;
        this.health.lastConnectedAt = Date.now();
        this.health.lastError = null;
        this.backoffMs = 1_000;
        logger.info({ event: "ws.open", url: this.url, subs: this.subs.size }, "sodex ws open");
        const streams = [...this.subs.keys()];
        if (streams.length > 0) this.send({ method: "SUBSCRIBE", params: streams, id: this.msgId++ });
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          try { ws.ping(); } catch (err) {
            logger.debug({ event: "ws.ping_fail", err: String(err) }, "ping send failed");
          }
        }, 25_000);
      });

      ws.on("message", (raw) => {
        this.health.lastMessageAt = Date.now();
        let msg: unknown;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        this.dispatch(msg);
      });

      ws.on("pong", () => { this.health.lastMessageAt = Date.now(); });

      ws.on("error", (err) => {
        this.health.lastError = String(err?.message ?? err);
        logger.warn({ event: "ws.error", err: this.health.lastError }, "sodex ws error");
      });

      ws.on("close", (code, reason) => {
        this.health.connected = false;
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
        this.ws = null;
        logger.warn({ event: "ws.close", code, reason: reason?.toString() }, "sodex ws closed");
        if (!this.closing) this.scheduleReconnect();
      });
    } catch (err) {
      this.health.lastError = String(err);
      logger.warn({ event: "ws.connect_fail", err: String(err) }, "sodex ws connect failed");
      this.scheduleReconnect();
    }
  }

  close() {
    this.closing = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    try { this.ws?.close(); } catch (err) {
      logger.debug({ event: "ws.close_fail", err: String(err) }, "ws close threw");
    }
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.closing) return;
    const delay = this.backoffMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.health.reconnectCount++;
      this.connect();
    }, delay);
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
  }

  private send(payload: object) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(payload)); } catch (err) {
      logger.warn({ event: "ws.send_fail", err: String(err) }, "sodex ws send failed");
    }
  }

  /**
   * Register a handler for a stream name. If we're already connected, the
   * SUBSCRIBE frame is sent immediately; otherwise it is replayed on the
   * next open. Returns an unsub function.
   */
  subscribe(stream: string, handler: Handler): () => void {
    let set = this.subs.get(stream);
    const isNew = !set;
    if (!set) { set = new Set(); this.subs.set(stream, set); }
    set.add(handler);
    this.health.subscriptionCount = this.subs.size;
    if (isNew && this.ws?.readyState === WebSocket.OPEN) {
      this.send({ method: "SUBSCRIBE", params: [stream], id: this.msgId++ });
    }
    return () => this.unsubscribe(stream, handler);
  }

  unsubscribe(stream: string, handler: Handler) {
    const set = this.subs.get(stream);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.subs.delete(stream);
      this.health.subscriptionCount = this.subs.size;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.msgId++ });
      }
    }
  }

  /**
   * Route inbound frame to handlers. Tries `{stream,data}` wrapper first,
   * then falls back to `e`/`s` envelopes. Account events fan out to both
   * the generic key and the wallet-keyed key (derived from the payload).
   */
  private dispatch(msg: unknown) {
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;

    // {stream:"...", data:{...}}
    if (typeof m["stream"] === "string") {
      this.fanout(m["stream"] as string, m["data"]);
      return;
    }

    // {e:"trade", s:"BTC-USD", ...} → trade@BTC-USD
    if (typeof m["e"] === "string" && typeof m["s"] === "string") {
      this.fanout(`${m["e"] as string}@${m["s"] as string}`, m);
    }

    // {e:"24hrMiniTicker", data:[...]} → allMiniTicker
    if (m["e"] === "24hrMiniTicker" || m["e"] === "miniTicker") this.fanout("allMiniTicker", m);
    if (m["e"] === "markPriceUpdate") this.fanout("allMarkPrice", m);

    // Account events: fanout generic + wallet-keyed.
    const isAcctUpdate = m["e"] === "accountUpdate" || m["e"] === "ACCOUNT_UPDATE";
    const isAcctTrade  = m["e"] === "accountTrade"  || m["e"] === "ORDER_TRADE_UPDATE";
    if (isAcctUpdate || isAcctTrade) {
      const base = isAcctUpdate ? "accountUpdate" : "accountTrade";
      this.fanout(base, m);
      const addr = extractWalletAddress(m);
      if (addr) this.fanout(`${base}@${addr}`, m);
    }

    // Subscription ack: {result: null, id: N} — ignore.
  }

  private fanout(stream: string, data: unknown) {
    const set = this.subs.get(stream);
    if (!set) return;
    for (const h of set) {
      try { h(data); } catch (err) {
        logger.warn({ event: "ws.handler_err", stream, err: String(err) }, "ws handler threw");
      }
    }
  }
}

const SODEX_WS_URL = process.env["SODEX_WS_URL"] ?? "wss://mainnet-gw.sodex.dev/ws/perps";

let _client: SodexWsClient | null = null;

/** Lazy singleton. First caller wins; subsequent callers share the connection. */
export function getSodexWs(): SodexWsClient {
  if (!_client) {
    _client = new SodexWsClient(SODEX_WS_URL);
    _client.connect();
  }
  return _client;
}

export function getWsHealth(): WsHealth {
  return _client?.health ?? {
    connected: false, lastMessageAt: null, lastConnectedAt: null,
    subscriptionCount: 0, reconnectCount: 0, lastError: "not initialized",
  };
}
