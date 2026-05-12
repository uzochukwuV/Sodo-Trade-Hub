/**
 * One-shot Sodex WS smoke test.
 *
 * Connects to the Sodex perps WS gateway, subscribes to allMiniTicker plus
 * (optionally) one wallet's accountUpdate stream, prints the first few
 * messages, and exits. Useful for sanity checks and CI.
 *
 * Usage:
 *   tsx scripts/src/sodex-ws-smoke.ts                 # market only
 *   tsx scripts/src/sodex-ws-smoke.ts 0xabc...        # market + one wallet
 */
import WebSocket from "ws";

const URL = process.env.SODEX_WS_URL ?? "wss://mainnet-gw.sodex.dev/ws/perps";
const WALLET = process.argv[2]?.toLowerCase();
const MAX_MSGS = 5;
const TIMEOUT_MS = 15_000;

const streams = ["allMiniTicker"];
if (WALLET) streams.push(`accountUpdate@${WALLET}`);

console.log(`[smoke] connecting → ${URL}`);
console.log(`[smoke] subscribing → ${streams.join(", ")}`);

const ws = new WebSocket(URL, { headers: { Origin: "https://sodex.com" } });
let received = 0;
const timer = setTimeout(() => {
  console.error(`[smoke] timed out after ${TIMEOUT_MS}ms (received ${received})`);
  process.exit(received > 0 ? 0 : 2);
}, TIMEOUT_MS);

ws.on("open", () => {
  console.log("[smoke] open");
  ws.send(JSON.stringify({ method: "SUBSCRIBE", params: streams, id: 1 }));
});

ws.on("message", (raw) => {
  received++;
  const text = raw.toString();
  console.log(`[smoke] msg #${received}: ${text.slice(0, 240)}${text.length > 240 ? "…" : ""}`);
  if (received >= MAX_MSGS) {
    clearTimeout(timer);
    ws.close();
    process.exit(0);
  }
});

ws.on("error", (err) => {
  console.error(`[smoke] error: ${err.message}`);
  clearTimeout(timer);
  process.exit(1);
});

ws.on("close", (code, reason) => {
  console.log(`[smoke] closed code=${code} reason=${reason?.toString() || ""}`);
});
