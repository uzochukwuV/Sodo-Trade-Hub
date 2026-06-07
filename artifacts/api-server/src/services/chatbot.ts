/**
 * SOGRAM chat agent
 * Uses @langchain/openai (ChatOpenAI) + @langchain/core tools only.
 * Implements the tool-calling loop manually — no langchain/agents dependency.
 */

import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages/tool";
import { z } from "zod";
import { db, tradersTable, signalsTable, tradeIntentsTable, tradesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getMarketPrices, getNews, getMarketVibeSummary } from "./market";
import { logger } from "../lib/logger";

// ── Model ─────────────────────────────────────────────────────────────────────
// Lazy singleton — only instantiated when OPENROUTER_API_KEY is present.
let _model: ChatOpenAI | null = null;
function getModel(): ChatOpenAI {
  if (!_model) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set — chat disabled");
    _model = new ChatOpenAI({
      apiKey,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://sogram.app",
          "X-Title": "Sogram Chat Agent",
        },
      },
      modelName: "openai/gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 600,
    });
  }
  return _model;
}

// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  new DynamicStructuredTool({
    name: "get_market_prices",
    description: "Get live Sodex perpetuals market prices including 24h price change, funding rate, and open interest.",
    schema: z.object({}),
    func: async () => {
      const prices = await getMarketPrices();
      return JSON.stringify(
        prices.slice(0, 15).map(p => ({
          symbol: p.symbol,
          price: p.price,
          change24h: `${p.change24h.toFixed(2)}%`,
          fundingRate: `${(p.fundingRate * 100).toFixed(4)}%`,
        }))
      );
    },
  }),

  new DynamicStructuredTool({
    name: "get_market_news",
    description: "Get recent crypto market news and narratives from SoSoValue. Use this to understand current market sentiment.",
    schema: z.object({}),
    func: async () => {
      const news = await getNews(8);
      return JSON.stringify(news.map(n => ({ title: n.title, coins: n.coins, date: n.date })));
    },
  }),

  new DynamicStructuredTool({
    name: "get_market_vibe",
    description: "Get a concise summary of current market conditions — overall sentiment, movers, and direction.",
    schema: z.object({}),
    func: async () => {
      const [prices, news] = await Promise.all([getMarketPrices(), getNews(6)]);
      return getMarketVibeSummary(prices, news);
    },
  }),

  new DynamicStructuredTool({
    name: "get_top_traders",
    description: "Get the top performing traders on Sogram ranked by total PnL, with win rate and tier.",
    schema: z.object({
      limit: z.number().min(1).max(10).default(5).describe("Number of traders to return"),
    }),
    func: async ({ limit }) => {
      const traders = await db
        .select({
          username: tradersTable.username,
          tier: tradersTable.tier,
          totalPnlUsd: tradersTable.totalPnlUsd,
          winRate: tradersTable.winRate,
          repScore: tradersTable.repScore,
          signalAccuracy: tradersTable.signalAccuracy,
        })
        .from(tradersTable)
        .orderBy(desc(tradersTable.totalPnlUsd))
        .limit(limit);
      return JSON.stringify(traders);
    },
  }),

  new DynamicStructuredTool({
    name: "get_open_signals",
    description: "Get currently open trade signals posted by traders on Sogram.",
    schema: z.object({
      asset: z.string().optional().describe("Filter by asset e.g. BTC/USDT"),
      limit: z.number().min(1).max(10).default(5),
    }),
    func: async ({ asset, limit }) => {
      const filters: ReturnType<typeof eq>[] = [eq(signalsTable.status, "open")];
      if (asset) filters.push(eq(signalsTable.asset, asset));
      const signals = await db
        .select({
          asset: signalsTable.asset,
          side: signalsTable.side,
          entryPrice: signalsTable.entryPrice,
          targetPrice: signalsTable.targetPrice,
          stopLoss: signalsTable.stopLoss,
          confidence: signalsTable.confidence,
          reasoning: signalsTable.reasoning,
        })
        .from(signalsTable)
        .where(and(...filters))
        .orderBy(desc(signalsTable.createdAt))
        .limit(limit);
      return JSON.stringify(signals);
    },
  }),

  new DynamicStructuredTool({
    name: "get_open_intents",
    description: "Get open trade intents that the community is currently voting on.",
    schema: z.object({
      limit: z.number().min(1).max(10).default(5),
    }),
    func: async ({ limit }) => {
      const intents = await db
        .select({
          asset: tradeIntentsTable.asset,
          side: tradeIntentsTable.side,
          entryPrice: tradeIntentsTable.entryPrice,
          targetPrice: tradeIntentsTable.targetPrice,
          stopLoss: tradeIntentsTable.stopLoss,
          leverage: tradeIntentsTable.leverage,
          reasoning: tradeIntentsTable.reasoning,
          votesValid: tradeIntentsTable.votesValid,
          votesInvalid: tradeIntentsTable.votesInvalid,
          validPct: tradeIntentsTable.validPct,
        })
        .from(tradeIntentsTable)
        .where(eq(tradeIntentsTable.status, "open"))
        .orderBy(desc(tradeIntentsTable.createdAt))
        .limit(limit);
      return JSON.stringify(intents);
    },
  }),

  new DynamicStructuredTool({
    name: "get_recent_trades",
    description: "Get recently closed trades from the Sogram feed with PnL data.",
    schema: z.object({
      limit: z.number().min(1).max(10).default(5),
    }),
    func: async ({ limit }) => {
      const trades = await db
        .select({
          asset: tradesTable.asset,
          side: tradesTable.side,
          pnlUsd: tradesTable.pnlUsd,
          pnlPct: tradesTable.pnlPct,
          leverage: tradesTable.leverage,
          isOnChainVerified: tradesTable.isOnChainVerified,
        })
        .from(tradesTable)
        .orderBy(desc(tradesTable.closedAt))
        .limit(limit);
      return JSON.stringify(trades);
    },
  }),
];

// Build a lookup map for execution
const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]));

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are SOGRAM, an expert crypto trading AI assistant on the Sogram social trading platform.

You have live access to Sodex perpetuals market data, real trader performance, community signals, and trade intents.
Use your tools to give accurate, data-driven answers. Be concise, direct, and confident.

Platform context:
- Sogram tracks real Sodex perps traders on-chain. All data is live.
- Traders earn reputation through win rate, signal accuracy, and community validation
- SOGRAM_AI (you) posts trade setups every 15 minutes based on live data
- Users can vote VALID/SKIP on trade intents to build their validation accuracy score

When responding:
- Use your tools before answering market/trader questions — don't guess
- Format numbers clearly ($1,234 not 1234), percentages with 1 decimal
- Be conversational but sharp — 2-4 sentences is the right length unless data demands more
- Never mention tool names in your response`;

// ── Public API ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runChat(messages: ChatMessage[]): Promise<string> {
  try {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") {
      return "I didn't catch that. What would you like to know?";
    }

    // Build message history for LangChain
    const lcMessages = [
      new SystemMessage(SYSTEM),
      ...messages.slice(0, -1).map(m =>
        m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
      ),
      new HumanMessage(last.content),
    ];

    // Tool-calling loop (max 4 iterations)
    for (let i = 0; i < 4; i++) {
      const response = await getModel().bindTools(TOOLS).invoke(lcMessages);

      // If no tool calls → final answer
      const toolCalls = response.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const content = typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
            ? response.content.map((c: any) => c.text ?? "").join("")
            : "";
        return content || "I couldn't generate a response. Please try again.";
      }

      // Add assistant response to messages
      lcMessages.push(response);

      // Execute each tool call and add results
      for (const call of toolCalls) {
        const tool = TOOL_MAP[call.name];
        let result: string;
        try {
          result = tool ? await tool.invoke(call.args as Record<string, unknown>) : `Unknown tool: ${call.name}`;
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : "unknown"}`;
        }
        lcMessages.push(new ToolMessage({ content: result, tool_call_id: call.id ?? call.name }));
      }
    }

    return "I couldn't complete that request in time. Please try again.";
  } catch (err) {
    logger.error({ err }, "chatbot.run_failed");
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}
