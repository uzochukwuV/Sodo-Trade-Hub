import { db, tradersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { onNewTrade, onNewSignal, type NewTradeEvent, type NewSignalEvent } from "./event-bus";

const BOT_TOKEN   = process.env["TELEGRAM_BOT_TOKEN"]  ?? "";
const CHAT_ID     = process.env["TELEGRAM_CHAT_ID"]    ?? "";
const APP_URL     = process.env["APP_URL"]             ?? "https://sogram.replit.app";

const NOTABLE_TIERS = new Set(["DIAMOND", "GOLD"]);
const WHALE_NOTIONAL_USD = 50_000;

// Rate-limit: one alert per trader per 5 minutes to avoid flooding.
const lastAlerted = new Map<number, number>();
const COOLDOWN_MS = 5 * 60_000;

function canAlert(traderId: number): boolean {
  const last = lastAlerted.get(traderId) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return false;
  lastAlerted.set(traderId, Date.now());
  return true;
}

async function sendMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ event: "telegram.send_failed", status: res.status, body }, "Telegram API error");
    } else {
      logger.info({ event: "telegram.sent" }, "Telegram alert sent");
    }
  } catch (err) {
    logger.warn({ event: "telegram.send_error", err }, "Telegram send threw");
  }
}

function tierEmoji(tier: string): string {
  if (tier === "DIAMOND") return "💎";
  if (tier === "GOLD")    return "🥇";
  if (tier === "SILVER")  return "🥈";
  return "🔵";
}

function fmtPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${Math.abs(pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

async function handleNewTrade(e: NewTradeEvent): Promise<void> {
  try {
    const rows = await db
      .select({ tier: tradersTable.tier, walletAddress: tradersTable.walletAddress, repScore: tradersTable.repScore })
      .from(tradersTable)
      .where(eq(tradersTable.id, e.traderId))
      .limit(1);

    const trader = rows[0];
    if (!trader) return;

    const tier = trader.tier ?? "BRONZE";
    const notional = Math.abs(e.pnlUsd) * 10; // rough estimate from pnl alone
    const isNotable = NOTABLE_TIERS.has(tier) || Math.abs(e.pnlUsd) >= WHALE_NOTIONAL_USD;
    if (!isNotable) return;
    if (!canAlert(e.traderId)) return;

    const sideIcon = e.side === "LONG" ? "📈" : "📉";
    const resultIcon = e.pnlUsd >= 0 ? "✅" : "🔴";
    const pnlLine = e.pnlUsd >= 0
      ? `💰 <b>PnL: ${fmtPnl(e.pnlUsd)}</b> ✅ WIN`
      : `💸 <b>PnL: ${fmtPnl(e.pnlUsd)}</b> 🔴 LOSS`;

    const walletShort = trader.walletAddress
      ? `${trader.walletAddress.slice(0, 6)}…${trader.walletAddress.slice(-4)}`
      : null;

    const lines = [
      `${resultIcon} <b>SOGRAM · NOTABLE TRADE CLOSED</b>`,
      ``,
      `${tierEmoji(tier)} <b>${e.username}</b>  <i>${tier}</i>`,
      `${sideIcon} ${e.side} <b>${e.asset}</b> · ${e.leverage}× leverage`,
      pnlLine,
      `🔒 On-chain verified via Sodex`,
      ``,
      ...(walletShort ? [`👛 <code>${walletShort}</code>`] : []),
      `🔗 <a href="${APP_URL}/traders/${e.traderId}">View Trader on Sogram</a>`,
      ``,
      `<i>Powered by Sogram · Sodex perps data</i>`,
    ];

    await sendMessage(lines.join("\n"));
  } catch (err) {
    logger.warn({ event: "telegram.trade_handler_error", err }, "handleNewTrade threw");
  }
}

async function handleNewSignal(e: NewSignalEvent): Promise<void> {
  try {
    const rows = await db
      .select({ tier: tradersTable.tier, walletAddress: tradersTable.walletAddress })
      .from(tradersTable)
      .where(eq(tradersTable.id, e.traderId))
      .limit(1);

    const trader = rows[0];
    if (!trader) return;

    const tier = trader.tier ?? "BRONZE";
    if (!NOTABLE_TIERS.has(tier)) return;
    if (!canAlert(e.traderId)) return;

    const sideIcon = e.side === "LONG" ? "📈" : "📉";
    const walletShort = trader.walletAddress
      ? `${trader.walletAddress.slice(0, 6)}…${trader.walletAddress.slice(-4)}`
      : null;

    const lines = [
      `⚡ <b>SOGRAM · LIVE SIGNAL DETECTED</b>`,
      ``,
      `${tierEmoji(tier)} <b>${e.username}</b>  <i>${tier}</i>`,
      `${sideIcon} ${e.side} <b>${e.asset}</b> · ${e.leverage}× leverage`,
      `🎯 Entry: <b>$${Number(e.entryPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}</b>`,
      `📡 Live entry from Sodex perps wallet`,
      ``,
      ...(walletShort ? [`👛 <code>${walletShort}</code>`] : []),
      `🔗 <a href="${APP_URL}/signals">View Signals on Sogram</a>`,
      ``,
      `<i>Powered by Sogram · Sodex perps data</i>`,
    ];

    await sendMessage(lines.join("\n"));
  } catch (err) {
    logger.warn({ event: "telegram.signal_handler_error", err }, "handleNewSignal threw");
  }
}

export function startTelegramBot(): void {
  if (!BOT_TOKEN || !CHAT_ID) {
    logger.info({ event: "telegram.disabled" }, "Telegram bot disabled — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return;
  }

  onNewTrade(handleNewTrade);
  onNewSignal(handleNewSignal);
  logger.info({ event: "telegram.started", chatId: CHAT_ID }, "Telegram bot started — listening for notable trades");
}

export async function getTelegramStatus(): Promise<{
  configured: boolean;
  chatId: string | null;
  botUsername: string | null;
  error: string | null;
}> {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { configured: false, chatId: null, botUsername: null, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { configured: true, chatId: CHAT_ID, botUsername: null, error: `Bot API error ${res.status}: ${body}` };
    }
    const json = await res.json() as { ok: boolean; result?: { username?: string } };
    return {
      configured: true,
      chatId: CHAT_ID,
      botUsername: json.result?.username ?? null,
      error: null,
    };
  } catch (err) {
    return { configured: true, chatId: CHAT_ID, botUsername: null, error: String(err) };
  }
}

export async function sendTestMessage(): Promise<{ ok: boolean; error: string | null }> {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }
  try {
    await sendMessage(
      `🤖 <b>Sogram Bot — Test Message</b>\n\nYour Telegram alerts are working correctly.\nElite trader activity will be posted here in real-time.\n\n<i>Powered by Sogram · Sodex perps data</i>`
    );
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
