import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { analyzeValuechainRange } from "./valuechain-block-analyzer";
import { analyzeLiveWallet, backtestNormalizedPositions, getLiveLeaderboard } from "./live-sodex-intel";
import { getMarketPrices, getMarketVibeSummary, getNews } from "./market";
import { logger } from "../lib/logger";

const MODEL_NAME = process.env["AI_ANALYST_MODEL"] ?? "openai/gpt-4o-mini";
const MAX_TOOL_CALLS = 4;

type AnalystToolName =
  | "get_market_context"
  | "get_leaderboard_wallets"
  | "analyze_wallet"
  | "backtest_wallet"
  | "analyze_valuechain_blocks";

const AnalystPlanSchema = z.object({
  objective: z.string(),
  toolCalls: z.array(z.object({
    name: z.enum([
      "get_market_context",
      "get_leaderboard_wallets",
      "analyze_wallet",
      "backtest_wallet",
      "analyze_valuechain_blocks",
    ]),
    reason: z.string(),
    args: z.record(z.string(), z.unknown()).default({}),
  })).max(MAX_TOOL_CALLS),
});

const TradeRecommendationSchema = z.object({
  asset: z.string(),
  side: z.enum(["LONG", "SHORT", "WAIT"]),
  confidence: z.number().min(0).max(10),
  timeHorizon: z.string(),
  entryZone: z.string(),
  targetZone: z.string(),
  stopLoss: z.string(),
  invalidation: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  thesis: z.string(),
  evidence: z.array(z.string()).max(8),
  cautions: z.array(z.string()).max(6),
  nextActions: z.array(z.string()).max(6),
});

export const AnalystOutputSchema = z.object({
  headline: z.string(),
  marketRegime: z.string(),
  recommendations: z.array(TradeRecommendationSchema).max(5),
  watchlist: z.array(z.object({
    walletAddress: z.string(),
    reason: z.string(),
    confidence: z.number().min(0).max(10),
  })).max(10),
  alertIdeas: z.array(z.object({
    condition: z.string(),
    whyItMatters: z.string(),
    severity: z.enum(["low", "medium", "high"]),
  })).max(8),
  evidenceSummary: z.array(z.string()).max(10),
  limitations: z.array(z.string()).max(8),
  disclaimer: z.string(),
});

export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

type AnalystState = {
  question: string;
  startBlock?: number;
  blockCount?: number;
  wallets: Array<{ address: string; accountId?: string }>;
  plan?: z.infer<typeof AnalystPlanSchema>;
  evidence: Array<{ tool: AnalystToolName; reason: string; output: unknown }>;
  output?: AnalystOutput;
};

const State = Annotation.Root({
  question: Annotation<string>(),
  startBlock: Annotation<number | undefined>(),
  blockCount: Annotation<number | undefined>(),
  wallets: Annotation<Array<{ address: string; accountId?: string }>>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  plan: Annotation<z.infer<typeof AnalystPlanSchema> | undefined>(),
  evidence: Annotation<Array<{ tool: AnalystToolName; reason: string; output: unknown }>>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  output: Annotation<AnalystOutput | undefined>(),
});

let _model: ChatOpenAI | null = null;

function getModel(): ChatOpenAI {
  if (!_model) {
    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
    _model = new ChatOpenAI({
      apiKey,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://sogram.app",
          "X-Title": "Sogram AI Trade Analyst",
        },
      },
      modelName: MODEL_NAME,
      temperature: 0.25,
      maxTokens: 1800,
    });
  }
  return _model;
}

function compact(value: unknown, maxChars = 9_000): string {
  const json = JSON.stringify(value);
  return json.length > maxChars ? `${json.slice(0, maxChars)}...TRUNCATED` : json;
}

function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(value);
}

function extractWallets(text: string): Array<{ address: string }> {
  const matches = text.match(/0x[0-9a-fA-F]{40}/g) ?? [];
  return [...new Set(matches.map((item) => item.toLowerCase()))].slice(0, 5).map((address) => ({ address }));
}

function sanitizeToolArgs(name: AnalystToolName, raw: Record<string, unknown>, state: AnalystState): Record<string, unknown> {
  if (name === "analyze_valuechain_blocks") {
    const startBlock = Number(raw["startBlock"] ?? state.startBlock);
    const blockCount = Math.min(Math.max(1, Number(raw["blockCount"] ?? state.blockCount ?? 10)), 20);
    return { startBlock, blockCount };
  }
  if (name === "analyze_wallet" || name === "backtest_wallet") {
    const fallback = state.wallets[0];
    const address = String(raw["walletAddress"] ?? fallback?.address ?? "").toLowerCase();
    const accountId = raw["accountId"] ?? fallback?.accountId;
    return {
      walletAddress: isWalletAddress(address) ? address : "",
      accountId: accountId === undefined || accountId === null ? undefined : String(accountId),
      limit: Math.min(Math.max(20, Number(raw["limit"] ?? 200)), 500),
    };
  }
  if (name === "get_leaderboard_wallets") {
    return {
      window: ["24H", "7D", "30D", "ALL_TIME"].includes(String(raw["window"])) ? String(raw["window"]) : "7D",
      pageSize: Math.min(Math.max(10, Number(raw["pageSize"] ?? 20)), 50),
    };
  }
  return {};
}

const TOOLS = {
  get_market_context: new DynamicStructuredTool({
    name: "get_market_context",
    description: "Returns constrained market context: SoDEX prices, recent SoSoValue news, and a market vibe summary.",
    schema: z.object({}),
    func: async () => {
      const [prices, news] = await Promise.all([getMarketPrices(), getNews(8)]);
      return JSON.stringify({
        vibe: getMarketVibeSummary(prices, news),
        prices: prices.slice(0, 15).map((item) => ({
          symbol: item.symbol,
          price: item.price,
          change24h: item.change24h,
          fundingRate: item.fundingRate,
          openInterest: item.openInterest,
        })),
        news: news.slice(0, 8).map((item) => ({
          title: item.title,
          coins: item.coins,
          publishedAt: item.publishedAt,
        })),
      });
    },
  }),

  get_leaderboard_wallets: new DynamicStructuredTool({
    name: "get_leaderboard_wallets",
    description: "Returns top SoDEX leaderboard wallets from our constrained leaderboard service.",
    schema: z.object({
      window: z.enum(["24H", "7D", "30D", "ALL_TIME"]).default("7D"),
      pageSize: z.number().min(10).max(50).default(20),
    }),
    func: async ({ window, pageSize }) => {
      const wallets = await getLiveLeaderboard({ window, pageSize });
      return JSON.stringify(wallets.slice(0, pageSize));
    },
  }),

  analyze_wallet: new DynamicStructuredTool({
    name: "analyze_wallet",
    description: "Returns constrained wallet score, readable thesis, recent SoDEX positions, orders, trades, and funding.",
    schema: z.object({
      walletAddress: z.string(),
      accountId: z.string().optional(),
      limit: z.number().min(20).max(500).default(200),
    }),
    func: async ({ walletAddress, accountId, limit }) => {
      if (!isWalletAddress(walletAddress)) return JSON.stringify({ error: "invalid_wallet" });
      const analysis = await analyzeLiveWallet(walletAddress, limit, accountId);
      return JSON.stringify({
        summary: analysis.summary,
        score: analysis.score,
        thesis: analysis.thesis,
        explanation: analysis.explanation,
        positions: analysis.positions.slice(0, 30),
        orders: analysis.orders.slice(0, 30),
        trades: analysis.trades.slice(0, 30),
        fundings: analysis.fundings.slice(0, 20),
      });
    },
  }),

  backtest_wallet: new DynamicStructuredTool({
    name: "backtest_wallet",
    description: "Runs a constrained clone backtest on a wallet using live SoDEX position history.",
    schema: z.object({
      walletAddress: z.string(),
      accountId: z.string().optional(),
      limit: z.number().min(20).max(500).default(300),
      startingBalanceUsd: z.number().min(100).max(1_000_000).default(1000),
      tradeSizeUsd: z.number().min(10).max(100_000).default(100),
      windowDays: z.number().min(7).max(730).default(180),
    }),
    func: async ({ walletAddress, accountId, limit, startingBalanceUsd, tradeSizeUsd, windowDays }) => {
      if (!isWalletAddress(walletAddress)) return JSON.stringify({ error: "invalid_wallet" });
      const analysis = await analyzeLiveWallet(walletAddress, limit, accountId);
      const result = backtestNormalizedPositions(analysis.positions, {
        startingBalanceUsd,
        tradeSizeUsd,
        windowDays,
      });
      return JSON.stringify({ walletAddress, accountId, result });
    },
  }),

  analyze_valuechain_blocks: new DynamicStructuredTool({
    name: "analyze_valuechain_blocks",
    description: "Runs the constrained ValueChain calldata investigation service over max 20 blocks.",
    schema: z.object({
      startBlock: z.number().int().nonnegative(),
      blockCount: z.number().int().min(1).max(20),
    }),
    func: async ({ startBlock, blockCount }) => {
      const result = await analyzeValuechainRange({ startBlock, blockCount });
      return JSON.stringify({
        input: result.input,
        summary: result.summary,
        rangeClusters: result.rangeClusters,
        blocks: result.blocks.map((block) => ({
          blockNumber: block.blockNumber,
          cacheHit: block.cacheHit,
          txCount: block.txCount,
          candidates: block.candidateAddresses.length,
          sodexWallets: block.sodexWallets.map((wallet) => ({
            address: wallet.address,
            trades: wallet.trades.length,
            positions: wallet.positions.length,
            orders: wallet.orders.length,
          })),
          clusters: block.clusters,
        })),
      });
    },
  }),
} satisfies Record<AnalystToolName, DynamicStructuredTool>;

const TOOL_NAMES = Object.keys(TOOLS) as AnalystToolName[];

const PLANNER_SYSTEM = `You are a trading-research planner. Select only the minimum useful tools.

Allowed tools:
- get_market_context: broad market/news context
- get_leaderboard_wallets: top SoDEX leaderboard wallets
- analyze_wallet: wallet score, thesis, history
- backtest_wallet: clone simulator metrics for one wallet
- analyze_valuechain_blocks: calldata/block cluster analysis, max 20 blocks

Rules:
- Never request raw RPC or raw SoDEX endpoints.
- If the user gives startBlock/blockCount, include analyze_valuechain_blocks.
- If the user gives wallet addresses, analyze at most two wallets and optionally backtest one.
- If the user asks for trade suggestions, always include get_market_context.
- Return no more than ${MAX_TOOL_CALLS} tool calls.`;

const ANALYST_SYSTEM = `You are Sogram's AI trade analyst. You produce structured, cautious trading intelligence.

You are not allowed to invent data. Use only the evidence provided by constrained tools.
Recommendations must be actionable but not framed as guaranteed profit.
If evidence is weak, use side WAIT and say what would confirm the trade.
Always include risk, invalidation, and limitations.
The output must match the requested schema.`;

async function planNode(state: AnalystState): Promise<Partial<AnalystState>> {
  const model = getModel().withStructuredOutput(AnalystPlanSchema, { name: "analyst_plan" });
  const walletHint = state.wallets.map((wallet) => wallet.address).join(", ") || "none";
  const response = await model.invoke([
    new SystemMessage(PLANNER_SYSTEM),
    new HumanMessage([
      `Question: ${state.question}`,
      `Wallets detected/provided: ${walletHint}`,
      `Start block: ${state.startBlock ?? "none"}`,
      `Block count: ${state.blockCount ?? "none"}`,
    ].join("\n")),
  ]);

  const plan = AnalystPlanSchema.parse(response);
  return { plan };
}

async function toolsNode(state: AnalystState): Promise<Partial<AnalystState>> {
  const plan = state.plan;
  if (!plan) return { evidence: [] };

  const evidence: AnalystState["evidence"] = [];
  for (const call of plan.toolCalls.slice(0, MAX_TOOL_CALLS)) {
    const name = call.name as AnalystToolName;
    if (!TOOL_NAMES.includes(name)) continue;
    const tool = TOOLS[name];
    const args = sanitizeToolArgs(name, call.args, state);
    try {
      const output = await tool.invoke(args);
      evidence.push({
        tool: name,
        reason: call.reason,
        output: JSON.parse(String(output)),
      });
    } catch (err) {
      evidence.push({
        tool: name,
        reason: call.reason,
        output: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return { evidence };
}

async function analystNode(state: AnalystState): Promise<Partial<AnalystState>> {
  const model = getModel().withStructuredOutput(AnalystOutputSchema, { name: "trade_analyst_output" });
  const response = await model.invoke([
    new SystemMessage(ANALYST_SYSTEM),
    new HumanMessage([
      `User request: ${state.question}`,
      `Plan: ${compact(state.plan)}`,
      `Evidence: ${compact(state.evidence, 16_000)}`,
    ].join("\n\n")),
  ]);
  const output = AnalystOutputSchema.parse(response);
  return { output };
}

const analystGraph = new StateGraph(State)
  .addNode("plan", planNode)
  .addNode("tools", toolsNode)
  .addNode("analyst", analystNode)
  .addEdge(START, "plan")
  .addEdge("plan", "tools")
  .addEdge("tools", "analyst")
  .addEdge("analyst", END)
  .compile({ checkpointer: new MemorySaver() });

export async function runAiTradeAnalyst(input: {
  question: string;
  startBlock?: number;
  blockCount?: number;
  wallets?: Array<{ address: string; accountId?: string }>;
  threadId?: string;
}) {
  const question = String(input.question ?? "").trim();
  if (!question) throw new Error("question is required");

  const explicitWallets = (input.wallets ?? [])
    .filter((wallet) => isWalletAddress(wallet.address))
    .slice(0, 5)
    .map((wallet) => ({ address: wallet.address.toLowerCase(), accountId: wallet.accountId }));
  const inferredWallets = extractWallets(question);
  const wallets = explicitWallets.length > 0 ? explicitWallets : inferredWallets;

  const result = await analystGraph.invoke({
    question,
    startBlock: input.startBlock,
    blockCount: input.blockCount,
    wallets,
    evidence: [],
  }, {
    configurable: {
      thread_id: input.threadId ?? `analyst-${Date.now()}`,
    },
    recursionLimit: 8,
  });

  if (!result.output) throw new Error("analyst did not produce output");
  logger.info({
    tools: result.evidence.map((item) => item.tool),
    recommendations: result.output.recommendations.length,
  }, "ai_trade_analyst.completed");

  return {
    plan: result.plan,
    evidence: result.evidence.map((item) => ({
      tool: item.tool,
      reason: item.reason,
      preview: compact(item.output, 2_000),
    })),
    output: result.output,
  };
}
