import { z } from "zod";

export const ExecutionModeSchema = z.enum(["ADVISORY", "APPROVAL_REQUIRED", "AUTOMATIC", "FULLY_AUTOMATIC"]);
export const AllowedActionSchema = z.enum(["NOTIFY", "MOVE_STOP", "MODIFY_TAKE_PROFIT", "PARTIAL_CLOSE", "FULL_CLOSE", "ADD_TO_POSITION", "OPEN_HEDGE"]);
export const ConditionKindSchema = z.enum([
  "BREAKEVEN_ON_TRIGGER", "VOLATILITY_ADAPTIVE_STOP", "THESIS_INVALIDATION_EXIT", "CORRELATED_MARKET_STOP",
  "TIME_STOP", "MAX_DRAWDOWN_CIRCUIT_BREAKER", "SCALE_OUT_LADDER", "MOMENTUM_AWARE_TAKE_PROFIT",
  "FUNDING_DRIVEN_EXIT", "ADD_ON_CONFIRMATION", "HEDGE_INSTEAD_OF_CLOSE", "AUTO_REDUCE_ON_LEVERAGE_CREEP",
  "WALLET_MIRRORING", "CLUSTER_EXIT_RESPONSE", "CONSENSUS_REQUIREMENT", "EXPOSURE_CAPPING",
  "CORRELATION_NETTING", "HEALTH_ALERT", "CUSTOM",
]);

export const AutomationRuleSchema = z.object({
  ruleId: z.string(),
  kind: ConditionKindSchema,
  condition: z.string(),
  action: AllowedActionSchema,
  actionParams: z.record(z.string(), z.unknown()).default({}),
  deterministic: z.boolean().default(false),
  requiresAi: z.boolean().default(false),
  priority: z.number().int().min(1).max(100).default(50),
});

export const TradeMandateSchema = z.object({
  tradeId: z.string(),
  userId: z.string(),
  automationId: z.string(),
  accountId: z.number().int().nonnegative(),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  symbol: z.string(),
  symbolId: z.number().int().positive().optional(),
  objective: z.enum(["PROTECT", "MAXIMIZE_PROFIT", "FOLLOW_WALLET", "CUSTOM"]).default("PROTECT"),
  mode: ExecutionModeSchema.default("ADVISORY"),
  monitoring: z.object({
    price: z.boolean().default(true),
    funding: z.boolean().default(true),
    openInterest: z.boolean().default(true),
    walletActivity: z.boolean().default(false),
    blockClusters: z.boolean().default(false),
    volatility: z.boolean().default(true),
    portfolioExposure: z.boolean().default(false),
  }).default({}),
  allowedActions: z.array(AllowedActionSchema).default(["NOTIFY"]),
  constraints: z.object({
    maxLeverage: z.number().positive().max(100).default(20),
    maxLossUsd: z.number().positive().optional(),
    maxLossPercent: z.number().positive().max(100).optional(),
    maxAddPercent: z.number().positive().max(100).default(25),
    maxHedgePercent: z.number().positive().max(100).default(50),
    minPositionRemainingPercent: z.number().min(0).max(100).default(0),
    maxActionsPerHour: z.number().int().min(1).max(20).default(6),
    cooldownSeconds: z.number().int().min(0).max(86400).default(60),
  }).default({}),
  rules: z.array(AutomationRuleSchema).default([]),
  userInstructions: z.string().default(""),
  policyVersion: z.number().int().positive().default(1),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export const TradeStateSchema = z.object({
  tradeId: z.string(),
  accountId: z.number().int().nonnegative(),
  symbol: z.string(),
  symbolId: z.number().int().positive().optional(),
  positionSide: z.enum(["LONG", "SHORT"]),
  size: z.number(),
  entryPrice: z.number().positive(),
  markPrice: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  liquidationPrice: z.number().positive().optional(),
  unrealizedPnlUsd: z.number().default(0),
  unrealizedPnlPercent: z.number().default(0),
  accountEquityUsd: z.number().positive().optional(),
  effectiveLeverage: z.number().positive().optional(),
  fundingRate: z.number().optional(),
  openInterestChange1h: z.number().optional(),
  realizedVolatility1h: z.number().optional(),
  heldSince: z.string().optional(),
  lastActionAt: z.string().optional(),
  actionsInLastHour: z.number().int().min(0).default(0),
  healthScore: z.number().int().min(0).max(100).default(100),
  marketContext: z.record(z.string(), z.unknown()).default({}),
  walletContext: z.record(z.string(), z.unknown()).default({}),
  blockContext: z.record(z.string(), z.unknown()).default({}),
});

export const ProposedActionSchema = z.object({
  actionId: z.string(),
  tradeId: z.string(),
  action: AllowedActionSchema,
  actionParams: z.record(z.string(), z.unknown()).default({}),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  healthScore: z.number().int().min(0).max(100),
  source: z.enum(["DETERMINISTIC", "AI", "HUMAN"]).default("AI"),
  requiresApproval: z.boolean().default(false),
  status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "EXECUTED", "FAILED"]).default("PROPOSED"),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type AllowedAction = z.infer<typeof AllowedActionSchema>;
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
export type TradeMandate = z.infer<typeof TradeMandateSchema>;
export type TradeState = z.infer<typeof TradeStateSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
