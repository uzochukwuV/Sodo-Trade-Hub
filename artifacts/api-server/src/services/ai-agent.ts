/**
 * SOGRAM_AI — autonomous trading agent.
 *
 * Runs every 15 minutes, reads live market data + SoSoValue news,
 * calls OpenRouter (OpenAI-compatible) to generate trade setups, then
 * inserts them as both `signals` and `trade_intents` under a special
 * SOGRAM_AI trader row so the community can vote and track accuracy.
 */

import OpenAI from "openai";
import { db, tradersTable, signalsTable, tradeIntentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMarketPrices, getMarketVibeSummary } from "./market";
import { getNews } from "./market";
import { logger } from "../lib/logger";

// ── OpenRouter client (OpenAI-compatible) ────────────────────────────────────
// Lazy singleton — only instantiated when OPENROUTER_API_KEY is present so the
// server can boot without the key (AI features will simply be skipped).
let _openrouter: OpenAI | null = null;
function getOpenRouter(): OpenAI {
  if (!_openrouter) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set — AI agent disabled");
    _openrouter = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://sogram.app",
        "X-Title": "Sogram AI Agent",
      },
    });
  }
  return _openrouter;
}

const AI_MODEL = "openai/gpt-4o-mini";
const AI_USERNAME = "SOGRAM_AI";
const AI_HANDLE = "sogram_ai";

// ── State ────────────────────────────────────────────────────────────────────
export const agentState = {
  lastRunAt: null as Date | null,
  lastError: null as string | null,
  intentsPosted: 0,
  signalsPosted: 0,
  isRunning: false,
};

// ── Ensure SOGRAM_AI trader row exists ───────────────────────────────────────
async function ensureAiTrader(): Promise<number> {
  const existing = await db
    .select({ id: tradersTable.id })
    .from(tradersTable)
    .where(eq(tradersTable.handle, AI_HANDLE))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db.insert(tradersTable).values({
    username: AI_USERNAME,
    handle: AI_HANDLE,
    bio: "AI-powered market analyst. Scans live prices, news and on-chain data to post trade setups for community validation.",
    repScore: "72.00",
    tier: "SILVER",
    totalPnlUsd: "0",
    winRate: "0",
    signalAccuracy: "0",
    validationAccuracy: "0",
    mentorScore: "0",
  }).returning({ id: tradersTable.id });

  logger.info({ id: created.id }, "ai_agent.trader_created");
  return created.id;
}

// ── Prompt & response types ──────────────────────────────────────────────────
interface AiSetup {
  asset: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  leverage: number;
  confidence: number;
  reasoning: string;
}

function buildPrompt(
  prices: Awaited<ReturnType<typeof getMarketPrices>>,
  news: Awaited<ReturnType<typeof getNews>>,
  vibe: string,
): string {
  const priceLines = prices
    .slice(0, 10)
    .map(p =>
      `${p.symbol}: $${p.price.toLocaleString()} (${p.change24h > 0 ? "+" : ""}${p.change24h.toFixed(2)}% 24h, FR: ${(p.fundingRate * 100).toFixed(4)}%)`
    )
    .join("\n");

  const newsLines = news
    .slice(0, 5)
    .map(n => `- ${n.title} [${n.coins?.join(",")}]`)
    .join("\n");

  return `You are SOGRAM_AI, an expert crypto derivatives trader on the Sodex perpetuals exchange.

CURRENT MARKET DATA:
${priceLines}

MARKET VIBE: ${vibe}

RECENT NEWS:
${newsLines}

Generate exactly 3 high-conviction trade setups for the community to vote on. Each setup must be a real, executable perp trade.

Respond ONLY with a JSON array of 3 objects, no other text:
[
  {
    "asset": "BTC/USDT",
    "side": "LONG",
    "entryPrice": 67500,
    "targetPrice": 71000,
    "stopLoss": 65800,
    "leverage": 5,
    "confidence": 78,
    "reasoning": "1-2 sentence technical + news-driven reasoning"
  }
]

Rules:
- asset must be one of: BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, ARB/USDT, OP/USDT, AVAX/USDT
- entryPrice must be very close to the current price shown above
- targetPrice must be realistic (1-8% move from entry)
- stopLoss must give at least 1:1.5 R:R
- leverage between 2 and 20
- confidence between 55 and 90
- reasoning must reference actual news or price action`;
}

// ── Core run ─────────────────────────────────────────────────────────────────
export async function runAiAgent(): Promise<{ intentsPosted: number; signalsPosted: number }> {
  if (agentState.isRunning) {
    logger.warn("ai_agent.already_running");
    return { intentsPosted: 0, signalsPosted: 0 };
  }

  agentState.isRunning = true;
  agentState.lastError = null;

  try {
    const traderId = await ensureAiTrader();

    const [prices, news] = await Promise.all([
      getMarketPrices(),
      getNews(6),
    ]);

    if (prices.length === 0) {
      logger.warn("ai_agent.no_prices");
      return { intentsPosted: 0, signalsPosted: 0 };
    }

    const vibe = getMarketVibeSummary(prices, news);
    const prompt = buildPrompt(prices, news, vibe);

    logger.info({ model: AI_MODEL }, "ai_agent.calling_openrouter");

    const completion = await getOpenRouter().chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    logger.info({ raw: raw.slice(0, 200) }, "ai_agent.raw_response");

    // Extract JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error(`No JSON array found in response: ${raw.slice(0, 100)}`);

    const setups: AiSetup[] = JSON.parse(jsonMatch[0]);

    let intentsPosted = 0;
    let signalsPosted = 0;

    for (const s of setups) {
      if (!s.asset || !s.side || !s.entryPrice || !s.targetPrice || !s.stopLoss) continue;

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Insert trade intent
      try {
        await db.insert(tradeIntentsTable).values({
          traderId,
          asset: s.asset,
          side: s.side,
          entryPrice: String(s.entryPrice),
          targetPrice: String(s.targetPrice),
          stopLoss: String(s.stopLoss),
          leverage: Math.min(Math.max(Number(s.leverage) || 3, 1), 20),
          reasoning: s.reasoning ?? "AI-generated setup based on live market data.",
          expiresAt,
        });
        intentsPosted++;
      } catch (err) {
        logger.warn({ err, asset: s.asset }, "ai_agent.intent_insert_failed");
      }

      // Insert signal
      try {
        await db.insert(signalsTable).values({
          traderId,
          asset: s.asset,
          side: s.side,
          entryPrice: String(s.entryPrice),
          targetPrice: String(s.targetPrice),
          stopLoss: String(s.stopLoss),
          confidence: Math.min(Math.max(Number(s.confidence) || 70, 50), 95),
          reasoning: s.reasoning ?? "AI-generated signal based on live market data.",
        });
        signalsPosted++;
      } catch (err) {
        logger.warn({ err, asset: s.asset }, "ai_agent.signal_insert_failed");
      }
    }

    agentState.intentsPosted += intentsPosted;
    agentState.signalsPosted += signalsPosted;
    agentState.lastRunAt = new Date();

    logger.info({ intentsPosted, signalsPosted }, "ai_agent.run_complete");
    return { intentsPosted, signalsPosted };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agentState.lastError = msg;
    logger.error({ err }, "ai_agent.run_failed");
    return { intentsPosted: 0, signalsPosted: 0 };
  } finally {
    agentState.isRunning = false;
  }
}

// ── Scheduler: run every 15 min ──────────────────────────────────────────────
export function startAiAgent(intervalMs = 15 * 60_000): void {
  logger.info({ intervalMs }, "ai_agent.started");

  // First run immediately after 30s boot delay
  setTimeout(() => {
    runAiAgent().catch(err => logger.error({ err }, "ai_agent.initial_run_failed"));
  }, 30_000);

  setInterval(() => {
    runAiAgent().catch(err => logger.error({ err }, "ai_agent.scheduled_run_failed"));
  }, intervalMs);
}
