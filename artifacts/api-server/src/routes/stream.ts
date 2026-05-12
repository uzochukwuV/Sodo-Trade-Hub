import { Router, type IRouter } from "express";
import { z } from "zod";
import { onPriceTick, onNewTrade, onNewSignal } from "../services/event-bus";

const router: IRouter = Router();

/** SSE handshake — optional symbol filter + optional client ID for log correlation. */
const streamHandshakeSchema = z.object({
  symbols: z.string().regex(/^[A-Z0-9\-,]*$/).max(512).optional(),
  clientId: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/).optional(),
}).strict();

/** GET /stream/feed — emits price_tick, new_trade, new_signal; 25s keep-alive. */
router.get("/stream/feed", (req, res) => {
  const parsed = streamHandshakeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid handshake", issues: parsed.error.issues });
    return;
  }
  const { symbols, clientId } = parsed.data;
  const symbolFilter = symbols
    ? new Set(symbols.split(",").map((s: string) => s.trim()).filter(Boolean))
    : null;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Initial hello so the client can confirm the stream is open.
  res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now(), clientId: clientId ?? null })}\n\n`);

  let torn = false;
  const send = (event: string, payload: unknown) => {
    if (torn) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }
    catch (err) {
      torn = true;
      req.log?.debug({ event: "sse.write_fail", err: String(err) }, "SSE write failed; client likely gone");
    }
  };

  const offTick   = onPriceTick(t => {
    if (symbolFilter && !symbolFilter.has(t.symbol)) return;
    send("price_tick", t);
  });
  const offTrade  = onNewTrade(t  => send("new_trade", t));
  const offSignal = onNewSignal(s => send("new_signal", s));

  const keepalive = setInterval(() => {
    if (torn) return;
    try { res.write(`: keep-alive ${Date.now()}\n\n`); }
    catch (err) {
      torn = true;
      req.log?.debug({ event: "sse.keepalive_fail", err: String(err) }, "SSE keepalive failed");
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepalive);
    offTick(); offTrade(); offSignal();
  });
});

export default router;
