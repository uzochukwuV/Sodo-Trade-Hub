import Redis from "ioredis";
import type { ProposedAction, TradeMandate, TradeState } from "./models.js";

export interface Store {
  saveMandate(mandate: TradeMandate): Promise<void>;
  getMandate(tradeId: string): Promise<TradeMandate | null>;
  listMandates(): Promise<TradeMandate[]>;
  saveState(state: TradeState): Promise<void>;
  getState(tradeId: string): Promise<TradeState | null>;
  saveAction(action: ProposedAction): Promise<void>;
  getAction(actionId: string): Promise<ProposedAction | null>;
  listActions(tradeId: string): Promise<ProposedAction[]>;
  claim(key: string, ttlSeconds: number): Promise<boolean>;
}

export class MemoryStore implements Store {
  private mandates = new Map<string, TradeMandate>();
  private states = new Map<string, TradeState>();
  private actions = new Map<string, ProposedAction>();
  private claims = new Map<string, number>();
  async saveMandate(mandate: TradeMandate) { this.mandates.set(mandate.tradeId, mandate); }
  async getMandate(tradeId: string) { return this.mandates.get(tradeId) ?? null; }
  async listMandates() { return [...this.mandates.values()]; }
  async saveState(state: TradeState) { this.states.set(state.tradeId, state); }
  async getState(tradeId: string) { return this.states.get(tradeId) ?? null; }
  async saveAction(action: ProposedAction) { this.actions.set(action.actionId, action); }
  async getAction(actionId: string) { return this.actions.get(actionId) ?? null; }
  async listActions(tradeId: string) { return [...this.actions.values()].filter(a => a.tradeId === tradeId); }
  async claim(key: string, ttlSeconds: number) {
    const now = Date.now();
    const expires = this.claims.get(key);
    if (expires && expires > now) return false;
    this.claims.set(key, now + ttlSeconds * 1000);
    return true;
  }
}

export class RedisStore implements Store {
  constructor(private readonly redis: Redis) {}
  async saveMandate(mandate: TradeMandate) {
    await this.redis.set(`guardian:mandate:${mandate.tradeId}`, JSON.stringify(mandate));
    await this.redis.sadd("guardian:mandates", mandate.tradeId);
  }
  async getMandate(tradeId: string) {
    const raw = await this.redis.get(`guardian:mandate:${tradeId}`);
    return raw ? JSON.parse(raw) as TradeMandate : null;
  }
  async listMandates() {
    const ids = await this.redis.smembers("guardian:mandates");
    const rows = await Promise.all(ids.map(id => this.getMandate(id)));
    return rows.filter((row): row is TradeMandate => Boolean(row));
  }
  async saveState(state: TradeState) { await this.redis.set(`guardian:state:${state.tradeId}`, JSON.stringify(state)); }
  async getState(tradeId: string) {
    const raw = await this.redis.get(`guardian:state:${tradeId}`);
    return raw ? JSON.parse(raw) as TradeState : null;
  }
  async saveAction(action: ProposedAction) {
    await this.redis.set(`guardian:action:${action.actionId}`, JSON.stringify(action));
    await this.redis.sadd(`guardian:actions:${action.tradeId}`, action.actionId);
  }
  async getAction(actionId: string) {
    const raw = await this.redis.get(`guardian:action:${actionId}`);
    return raw ? JSON.parse(raw) as ProposedAction : null;
  }
  async listActions(tradeId: string) {
    const ids = await this.redis.smembers(`guardian:actions:${tradeId}`);
    const rows = await Promise.all(ids.map(id => this.getAction(id)));
    return rows.filter((row): row is ProposedAction => Boolean(row));
  }
  async claim(key: string, ttlSeconds: number) {
    return await this.redis.set(`guardian:claim:${key}`, "1", "EX", ttlSeconds, "NX") === "OK";
  }
}

export function createStore(): Store {
  const url = process.env["REDIS_URL"];
  if (!url) return new MemoryStore();
  try {
    const parsed = new URL(url);
    if (!["redis:", "rediss:"].includes(parsed.protocol)) return new MemoryStore();
    return new RedisStore(new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 }));
  } catch {
    return new MemoryStore();
  }
}
