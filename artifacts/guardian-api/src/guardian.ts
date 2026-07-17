import { createHash, randomBytes } from "node:crypto";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { AllowedActionSchema, AutomationRuleSchema, ProposedActionSchema, TradeMandateSchema, TradeStateSchema, type AutomationRule, type ProposedAction, type TradeMandate, type TradeState } from "./models.js";
import type { Store } from "./store.js";

function id(prefix: string) { return `${prefix}_${randomBytes(8).toString("hex")}`; }
function stable(parts: unknown[]) { return `act_${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 20)}`; }
function percent(text: string, fallback: number) { return Number(/(\d+(?:\.\d+)?)\s*%/.exec(text)?.[1] ?? fallback); }

const CompileInputSchema = z.object({
  userId: z.string(),
  tradeId: z.string().optional(),
  automationId: z.string().optional(),
  accountId: z.number().int().nonnegative(),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  symbol: z.string(),
  symbolId: z.number().int().positive().optional(),
  prompt: z.string(),
  mode: z.enum(["ADVISORY", "APPROVAL_REQUIRED", "AUTOMATIC", "FULLY_AUTOMATIC"]).default("ADVISORY"),
});
export type CompileInput = z.infer<typeof CompileInputSchema>;

const JsonValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const LlmAutomationRuleSchema = z.object({
  ruleId: z.string(),
  kind: AutomationRuleSchema.shape.kind,
  condition: z.string(),
  action: AllowedActionSchema,
  actionParams: z.record(z.string(), JsonValueSchema),
  deterministic: z.boolean(),
  requiresAi: z.boolean(),
  priority: z.number().int().min(1).max(100),
});
const LlmConstraintsSchema = z.object({
  maxLeverage: z.number().positive().max(100),
  maxLossUsd: z.number().positive().nullable(),
  maxLossPercent: z.number().positive().max(100).nullable(),
  maxAddPercent: z.number().positive().max(100),
  maxHedgePercent: z.number().positive().max(100),
  minPositionRemainingPercent: z.number().min(0).max(100),
  maxActionsPerHour: z.number().int().min(1).max(20),
  cooldownSeconds: z.number().int().min(0).max(86400),
});
const CompiledSchema = z.object({
  objective: z.enum(["PROTECT", "MAXIMIZE_PROFIT", "FOLLOW_WALLET", "CUSTOM"]),
  monitoring: z.object({
    price: z.boolean(), funding: z.boolean(), openInterest: z.boolean(), walletActivity: z.boolean(),
    blockClusters: z.boolean(), volatility: z.boolean(), portfolioExposure: z.boolean(),
  }),
  allowedActions: z.array(AllowedActionSchema),
  constraints: LlmConstraintsSchema,
  rules: z.array(LlmAutomationRuleSchema),
  warnings: z.array(z.string()),
});

const AiDecisionSchema = z.object({
  actions: z.array(z.object({
    action: AllowedActionSchema,
    actionParams: z.record(z.string(), JsonValueSchema),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
    healthScore: z.number().int().min(0).max(100),
  })).max(3),
  noActionReason: z.string().nullable(),
});

function openRouterModel(temperature: number) {
  return new ChatOpenAI({
    apiKey: process.env["OPENROUTER_API_KEY"],
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://sogram.app",
        "X-Title": "SoDEX Trade Guardian",
      },
    },
    modelName: process.env["GUARDIAN_OPENROUTER_MODEL"] ?? "tencent/hy3:free",
    temperature,
    maxTokens: 1800,
  });
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text);
    return "";
  }).join("");
  return String(content ?? "");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = /```(?:json)?\\s*([\\s\\S]*?)```/i.exec(trimmed)?.[1];
  if (fenced) return JSON.parse(fenced);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("model_response_did_not_contain_json");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timed_out_after_${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function rule(input: Omit<AutomationRule, "ruleId" | "priority"> & { priority?: number }): AutomationRule {
  return AutomationRuleSchema.parse({ ruleId: id("rule"), priority: input.priority ?? 50, ...input });
}

function fallbackCompile(input: CompileInput): z.infer<typeof CompiledSchema> {
  const text = input.prompt.toLowerCase();
  const rules: AutomationRule[] = [];
  if (text.includes("breakeven") || text.includes("break even")) rules.push(rule({ kind: "BREAKEVEN_ON_TRIGGER", condition: "Move stop to breakeven once profit trigger is reached.", action: "MOVE_STOP", actionParams: { triggerPnlPercent: percent(text, 2), stopPrice: "entry" }, deterministic: true, requiresAi: false, priority: 90 }));
  if (text.includes("trail") || text.includes("volatility")) rules.push(rule({ kind: "VOLATILITY_ADAPTIVE_STOP", condition: "Adapt stop based on volatility and momentum.", action: "MOVE_STOP", actionParams: { trailPercent: percent(text, 2), volatilityAware: true }, deterministic: false, requiresAi: true, priority: 75 }));
  if (text.includes("funding")) rules.push(rule({ kind: "FUNDING_DRIVEN_EXIT", condition: "Scale out or notify when funding becomes crowded.", action: text.includes("scale") || text.includes("close") ? "PARTIAL_CLOSE" : "NOTIFY", actionParams: { fundingThreshold: 0.0005, pct: 25 }, deterministic: false, requiresAi: true, priority: 65 }));
  if (text.includes("wallet") || text.includes("copy")) rules.push(rule({ kind: "WALLET_MIRRORING", condition: "React to followed wallet reductions or exits.", action: text.includes("close") ? "FULL_CLOSE" : "NOTIFY", actionParams: { mirror: true }, deterministic: false, requiresAi: true, priority: 80 }));
  if (text.includes("cluster") || text.includes("block")) rules.push(rule({ kind: "CLUSTER_EXIT_RESPONSE", condition: "Tighten stop on exit cluster.", action: "MOVE_STOP", actionParams: { stopDistancePercent: 1 }, deterministic: false, requiresAi: true, priority: 80 }));
  if (text.includes("add ") || text.includes("pyramid")) rules.push(rule({ kind: "ADD_ON_CONFIRMATION", condition: "Add only after confirmation signals.", action: "ADD_TO_POSITION", actionParams: { addPercent: Math.min(percent(text, 20), 25) }, deterministic: false, requiresAi: true }));
  if (text.includes("hedge")) rules.push(rule({ kind: "HEDGE_INSTEAD_OF_CLOSE", condition: "Open a smaller hedge when risk spikes.", action: "OPEN_HEDGE", actionParams: { hedgePercent: Math.min(percent(text, 25), 50) }, deterministic: false, requiresAi: true }));
  if (rules.length === 0) rules.push(rule({ kind: "HEALTH_ALERT", condition: "Notify when health drops below 50.", action: "NOTIFY", actionParams: { healthBelow: 50 }, deterministic: true, requiresAi: false }));
  return CompiledSchema.parse({
    objective: text.includes("profit") ? "MAXIMIZE_PROFIT" : "PROTECT",
    monitoring: { price: true, funding: text.includes("funding"), openInterest: text.includes("oi") || text.includes("momentum"), walletActivity: text.includes("wallet"), blockClusters: text.includes("cluster") || text.includes("block"), volatility: text.includes("trail") || text.includes("volatility") || text.includes("stop"), portfolioExposure: text.includes("portfolio") || text.includes("exposure") },
    allowedActions: [...new Set(["NOTIFY", ...rules.map(r => r.action)])],
    constraints: { maxLeverage: 20, maxLossUsd: null, maxLossPercent: text.includes("3%") ? 3 : null, maxAddPercent: 25, maxHedgePercent: 50, minPositionRemainingPercent: 0, maxActionsPerHour: 6, cooldownSeconds: 60 },
    rules,
    warnings: ["Compiled with deterministic fallback because OPENROUTER_API_KEY is not configured."],
  });
}

async function compile(input: CompileInput): Promise<{ mandate: TradeMandate; warnings: string[] }> {
  const parsed = CompileInputSchema.parse(input);
  let compiled: z.infer<typeof CompiledSchema>;
  if (process.env["OPENROUTER_API_KEY"]) {
    try {
      const model = openRouterModel(0.1);
      const response = await withTimeout(model.invoke([
        new SystemMessage([
          "Compile natural-language trade automation into structured SoDEX Guardian rules.",
          "Return only minified valid JSON. No markdown. No prose.",
          "Required JSON shape:",
          JSON.stringify({
            objective: "PROTECT",
            monitoring: { price: true, funding: true, openInterest: true, walletActivity: false, blockClusters: false, volatility: true, portfolioExposure: false },
            allowedActions: ["NOTIFY", "MOVE_STOP"],
            constraints: { maxLeverage: 20, maxLossUsd: null, maxLossPercent: null, maxAddPercent: 25, maxHedgePercent: 50, minPositionRemainingPercent: 0, maxActionsPerHour: 6, cooldownSeconds: 60 },
            rules: [{ ruleId: "rule_1", kind: "HEALTH_ALERT", condition: "Notify when health drops below 50.", action: "NOTIFY", actionParams: { healthBelow: 50 }, deterministic: true, requiresAi: false, priority: 50 }],
            warnings: [],
          }),
          "Allowed objectives: PROTECT, MAXIMIZE_PROFIT, FOLLOW_WALLET, CUSTOM.",
          "Allowed actions: NOTIFY, MOVE_STOP, MODIFY_TAKE_PROFIT, PARTIAL_CLOSE, FULL_CLOSE, ADD_TO_POSITION, OPEN_HEDGE.",
          "Use null for absent maxLossUsd or maxLossPercent.",
        ].join("\n")),
        new HumanMessage(JSON.stringify(parsed)),
      ]), 20_000, "ai_compile");
      compiled = CompiledSchema.parse(extractJson(messageText(response.content)));
    } catch (err) {
      compiled = fallbackCompile(parsed);
      compiled.warnings.push(`AI compile failed; used deterministic fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    compiled = fallbackCompile(parsed);
  }
  const constraints = Object.fromEntries(Object.entries(compiled.constraints).filter(([, value]) => value !== null));
  return { mandate: TradeMandateSchema.parse({ tradeId: parsed.tradeId ?? id("trade"), userId: parsed.userId, automationId: parsed.automationId ?? id("auto"), accountId: parsed.accountId, walletAddress: parsed.walletAddress, symbol: parsed.symbol, symbolId: parsed.symbolId, objective: compiled.objective, mode: parsed.mode, monitoring: compiled.monitoring, allowedActions: compiled.allowedActions, constraints, rules: compiled.rules, userInstructions: parsed.prompt }), warnings: compiled.warnings };
}

function action(rule: AutomationRule, mandate: TradeMandate, state: TradeState, reason: string, source: "DETERMINISTIC" | "AI" = "DETERMINISTIC"): ProposedAction {
  return ProposedActionSchema.parse({ actionId: stable([mandate.tradeId, rule.ruleId, rule.action, rule.actionParams, Math.floor(Date.now() / 30000)]), tradeId: mandate.tradeId, action: rule.action, actionParams: rule.actionParams, reason, confidence: source === "DETERMINISTIC" ? 1 : 0.55, healthScore: state.healthScore, source, requiresApproval: mandate.mode === "ADVISORY" || mandate.mode === "APPROVAL_REQUIRED" });
}

function deterministic(mandate: TradeMandate, state: TradeState): ProposedAction[] {
  const out: ProposedAction[] = [];
  if ((mandate.constraints.maxLossUsd && state.unrealizedPnlUsd <= -Math.abs(mandate.constraints.maxLossUsd)) || (mandate.constraints.maxLossPercent && state.unrealizedPnlPercent <= -Math.abs(mandate.constraints.maxLossPercent))) {
    if (mandate.allowedActions.includes("FULL_CLOSE")) out.push(ProposedActionSchema.parse({ actionId: stable([mandate.tradeId, "max-loss", Math.floor(Date.now() / 30000)]), tradeId: mandate.tradeId, action: "FULL_CLOSE", actionParams: { pct: 100 }, reason: "Deterministic max-loss protection triggered.", confidence: 1, healthScore: 0, source: "DETERMINISTIC", requiresApproval: mandate.mode !== "FULLY_AUTOMATIC" }));
  }
  for (const r of mandate.rules.filter(r => r.deterministic)) {
    if (r.kind === "BREAKEVEN_ON_TRIGGER" && state.unrealizedPnlPercent >= Number(r.actionParams["triggerPnlPercent"] ?? 2) && (!state.stopLoss || state.stopLoss < state.entryPrice)) out.push(action({ ...r, actionParams: { ...r.actionParams, stopPrice: state.entryPrice } }, mandate, state, `PnL is ${state.unrealizedPnlPercent.toFixed(2)}%, above breakeven trigger.`));
    if (r.kind === "HEALTH_ALERT" && state.healthScore < Number(r.actionParams["healthBelow"] ?? 50)) out.push(action(r, mandate, state, `Health score ${state.healthScore} is below threshold.`));
  }
  return out;
}

function aiFallback(mandate: TradeMandate, state: TradeState): ProposedAction[] {
  if (!mandate.rules.some(r => r.requiresAi)) return [];
  return [ProposedActionSchema.parse({ actionId: stable([mandate.tradeId, "ai-fallback", Math.floor(Date.now() / 30000)]), tradeId: mandate.tradeId, action: "NOTIFY", actionParams: { healthScore: state.healthScore }, reason: "Contextual AI rules exist, but OPENROUTER_API_KEY is not configured. Notify only.", confidence: 0.5, healthScore: state.healthScore, source: "AI", requiresApproval: mandate.mode !== "FULLY_AUTOMATIC" })];
}

async function contextualAi(mandate: TradeMandate, state: TradeState): Promise<ProposedAction[]> {
  const aiRules = mandate.rules.filter(r => r.requiresAi);
  if (aiRules.length === 0) return [];
  if (!process.env["OPENROUTER_API_KEY"]) return aiFallback(mandate, state);

  let decision: z.infer<typeof AiDecisionSchema>;
  try {
    const model = openRouterModel(0.2);
    const response = await withTimeout(model.invoke([
      new SystemMessage([
        "You are the contextual reasoning layer for a SoDEX live-trade automation system.",
        "You may only propose actions allowed by the mandate.",
        "A policy engine will reject unauthorized actions, so be precise.",
        "Prefer NOTIFY when evidence is weak.",
        "Never invent market data. Use only the provided trade state, user policy rules, marketContext, walletContext, and blockContext.",
        "Return only minified valid JSON. No markdown. No prose.",
        "Required JSON shape:",
        JSON.stringify({
          actions: [{ action: "NOTIFY", actionParams: {}, reason: "string", confidence: 0.5, healthScore: 90 }],
          noActionReason: null,
        }),
      ].join("\n")),
      new HumanMessage(JSON.stringify({
        mandate,
        state,
        userPolicyRules: aiRules,
      })),
    ]), 20_000, "ai_decision");
    decision = AiDecisionSchema.parse(extractJson(messageText(response.content)));
  } catch (err) {
    return [ProposedActionSchema.parse({
      actionId: stable([mandate.tradeId, "ai-error", Math.floor(Date.now() / 30000)]),
      tradeId: mandate.tradeId,
      action: "NOTIFY",
      actionParams: { error: err instanceof Error ? err.message : String(err) },
      reason: "AI contextual evaluation failed; fail-closed to notification only.",
      confidence: 0.4,
      healthScore: state.healthScore,
      source: "AI",
      requiresApproval: mandate.mode !== "FULLY_AUTOMATIC",
    })];
  }

  return decision.actions.map(a => ProposedActionSchema.parse({
    actionId: stable([mandate.tradeId, "ai", a.action, a.actionParams, Math.floor(Date.now() / 30000)]),
    tradeId: mandate.tradeId,
    action: a.action,
    actionParams: a.actionParams,
    reason: a.reason,
    confidence: a.confidence,
    healthScore: a.healthScore,
    source: "AI",
    requiresApproval: mandate.mode !== "FULLY_AUTOMATIC",
  }));
}

function validate(a: ProposedAction, m: TradeMandate, s: TradeState) {
  if (!m.allowedActions.includes(a.action)) throw new Error(`${a.action} is not allowed`);
  if (m.mode === "ADVISORY" && a.action !== "NOTIFY") throw new Error("ADVISORY mode can only notify");
  if (m.mode === "AUTOMATIC" && ["PARTIAL_CLOSE", "FULL_CLOSE", "ADD_TO_POSITION", "OPEN_HEDGE"].includes(a.action)) throw new Error("position-size changes require FULLY_AUTOMATIC");
  if (s.actionsInLastHour >= m.constraints.maxActionsPerHour) throw new Error("hourly action limit reached");
  if (a.action === "PARTIAL_CLOSE") { const pct = Number(a.actionParams["pct"]); if (!(pct > 0 && pct < 100)) throw new Error("invalid partial close pct"); }
  if (a.action === "ADD_TO_POSITION" && Number(a.actionParams["addPercent"] ?? 0) > m.constraints.maxAddPercent) throw new Error("add exceeds maxAddPercent");
  if (a.action === "OPEN_HEDGE" && Number(a.actionParams["hedgePercent"] ?? 0) > m.constraints.maxHedgePercent) throw new Error("hedge exceeds maxHedgePercent");
}

function executionIntent(a: ProposedAction, m: TradeMandate, s: TradeState) {
  const closeSide = s.positionSide === "LONG" ? "SELL" : "BUY";
  const openSide = s.positionSide === "LONG" ? "BUY" : "SELL";
  const hedgeSide = s.positionSide === "LONG" ? "SELL" : "BUY";
  if (a.action === "MOVE_STOP") return { type: "MODIFY_STOP", accountId: m.accountId, symbol: m.symbol, symbolId: m.symbolId, stopPrice: a.actionParams["stopPrice"], stopDistancePercent: a.actionParams["stopDistancePercent"] };
  if (a.action === "PARTIAL_CLOSE") return { type: "REDUCE_ONLY_MARKET", accountId: m.accountId, symbol: m.symbol, side: closeSide, quantity: Math.abs(s.size) * (Number(a.actionParams["pct"] ?? 25) / 100), reduceOnly: true };
  if (a.action === "FULL_CLOSE") return { type: "REDUCE_ONLY_MARKET", accountId: m.accountId, symbol: m.symbol, side: closeSide, quantity: Math.abs(s.size), reduceOnly: true };
  if (a.action === "ADD_TO_POSITION") return { type: "MARKET_ADD", accountId: m.accountId, symbol: m.symbol, side: openSide, quantity: Math.abs(s.size) * (Number(a.actionParams["addPercent"] ?? 10) / 100), reduceOnly: false };
  if (a.action === "OPEN_HEDGE") return { type: "MARKET_HEDGE", accountId: m.accountId, symbol: m.symbol, side: hedgeSide, quantity: Math.abs(s.size) * (Number(a.actionParams["hedgePercent"] ?? 25) / 100), reduceOnly: false };
  return undefined;
}

export class Guardian {
  constructor(private readonly store: Store) {}
  compile(input: CompileInput) { return compile(input); }
  async create(input: CompileInput & { state?: unknown }) { const c = await compile(input); await this.store.saveMandate(c.mandate); if (input.state) await this.store.saveState(TradeStateSchema.parse({ ...(input.state as object), tradeId: c.mandate.tradeId, accountId: c.mandate.accountId, symbol: c.mandate.symbol, symbolId: c.mandate.symbolId })); return c; }
  async state(raw: unknown) { const state = TradeStateSchema.parse(raw); await this.store.saveState(state); return state; }
  list() { return this.store.listMandates(); }
  async get(tradeId: string) { return { mandate: await this.store.getMandate(tradeId), state: await this.store.getState(tradeId), actions: await this.store.listActions(tradeId) }; }
  async evaluate(tradeId: string) {
    const mandate = await this.store.getMandate(tradeId); const state = await this.store.getState(tradeId);
    if (!mandate) throw new Error("mandate_not_found"); if (!state) throw new Error("state_not_found");
    const accepted: ProposedAction[] = []; const rejected: Array<{ action: ProposedAction; reason: string }> = [];
    for (const a of [...deterministic(mandate, state), ...await contextualAi(mandate, state)]) {
      if (!await this.store.claim(`${tradeId}:${a.action}:${JSON.stringify(a.actionParams)}`, 60)) continue;
      try { validate(a, mandate, state); await this.store.saveAction(a); accepted.push(a); } catch (e) { rejected.push({ action: a, reason: e instanceof Error ? e.message : String(e) }); }
    }
    return { tradeId, resolution: accepted.length ? "PROPOSED_ACTIONS" : "NO_ACTION", accepted, rejected };
  }
  async approve(actionId: string) { const a = await this.store.getAction(actionId); if (!a) throw new Error("action_not_found"); const approved = ProposedActionSchema.parse({ ...a, status: "APPROVED", requiresApproval: false }); await this.store.saveAction(approved); return approved; }
  async execute(actionId: string) { const a = await this.store.getAction(actionId); if (!a) throw new Error("action_not_found"); const m = await this.store.getMandate(a.tradeId); const s = await this.store.getState(a.tradeId); if (!m || !s) throw new Error("trade_not_found"); if (a.requiresApproval && a.status !== "APPROVED") throw new Error("approval_required"); validate(a, m, s); return { dryRun: process.env["GUARDIAN_EXECUTION_ENABLED"] !== "1", actionId, tradeId: a.tradeId, action: a.action, status: a.action === "NOTIFY" ? "SKIPPED" : "READY", reason: process.env["GUARDIAN_EXECUTION_ENABLED"] === "1" ? "Signed executor is not implemented yet." : "Execution disabled; returning order intent only.", orderIntent: executionIntent(a, m, s) }; }
  async addPolicyRule(tradeId: string, raw: unknown) {
    const mandate = await this.store.getMandate(tradeId);
    if (!mandate) throw new Error("mandate_not_found");
    const body = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
    const rule = AutomationRuleSchema.parse({ ruleId: id("rule"), priority: 50, ...body });
    const rules = [...mandate.rules, rule].sort((a, b) => b.priority - a.priority);
    const allowedActions = [...new Set([...mandate.allowedActions, rule.action])];
    const updated = TradeMandateSchema.parse({ ...mandate, rules, allowedActions, policyVersion: mandate.policyVersion + 1 });
    await this.store.saveMandate(updated);
    return { mandate: updated, rule };
  }
  async replacePolicyRules(tradeId: string, raw: unknown) {
    const mandate = await this.store.getMandate(tradeId);
    if (!mandate) throw new Error("mandate_not_found");
    const rules = z.array(AutomationRuleSchema).parse(raw).sort((a, b) => b.priority - a.priority);
    const allowedActions = [...new Set(["NOTIFY", ...rules.map(r => r.action)])];
    const updated = TradeMandateSchema.parse({ ...mandate, rules, allowedActions, policyVersion: mandate.policyVersion + 1 });
    await this.store.saveMandate(updated);
    return updated;
  }
}
