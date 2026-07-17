import { useEffect, useState } from "react";

type AlertItem = {
  id: number;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
};

type Rule = {
  id: number;
  name: string;
  scope: string;
  eventType: string;
  filters: Record<string, unknown>;
  isEnabled: boolean;
};

type Outcome = {
  id: number;
  status: string;
  walletAddress: string | null;
  sodexPositionId: string | null;
  finalPnlUsd: string | null;
  createdAt: string;
};

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleName, setRuleName] = useState("");
  const [ruleScope, setRuleScope] = useState("wallet");
  const [ruleEventType, setRuleEventType] = useState("open_position");
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  async function load() {
    const [alertsRes, rulesRes, outcomesRes] = await Promise.all([
      fetch("/api/alerts?limit=50", { credentials: "include" }),
      fetch("/api/alerts/rules", { credentials: "include" }),
      fetch("/api/alerts/outcomes?limit=30", { credentials: "include" }),
    ]);
    const alertsJson = await alertsRes.json();
    const rulesJson = await rulesRes.json();
    const outcomesJson = await outcomesRes.json();
    setAlerts(alertsJson.alerts ?? []);
    setRules(rulesJson.rules ?? []);
    setOutcomes(outcomesJson.outcomes ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const createRule = async () => {
    if (!ruleName.trim()) return;
    await fetch("/api/alerts/rules", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ruleName.trim(),
        scope: ruleScope,
        eventType: ruleEventType,
        filters: {},
      }),
    });
    setRuleName("");
    void load();
  };

  return (
    <div className="px-8 pb-10 max-w-[1200px] w-full pt-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-wide text-white">ALERTS</h1>
          <div className="text-muted-foreground text-[11px] font-bold tracking-wider mt-1">Inbox, rules, and delivery surfaces</div>
        </div>
        <button onClick={async () => { await fetch("/api/alerts/read-all", { method: "POST", credentials: "include" }); await load(); }} className="px-4 py-2 border border-border text-[10px] font-black tracking-widest text-muted-foreground hover:text-white">MARK ALL READ</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-border bg-card">
          <div className="px-4 py-3 border-b border-border text-[11px] font-black tracking-widest text-white">RULES</div>
          <div className="p-4 border-b border-border grid grid-cols-3 gap-2">
            <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="RULE NAME" className="bg-background border border-border px-3 py-2 text-[11px] font-mono text-white" />
            <select value={ruleScope} onChange={e => setRuleScope(e.target.value)} className="bg-background border border-border px-3 py-2 text-[11px] text-white">
              <option value="wallet">wallet</option>
              <option value="market">market</option>
              <option value="copy">copy</option>
              <option value="leaderboard">leaderboard</option>
            </select>
            <button onClick={createRule} className="bg-accent text-background px-3 py-2 text-[10px] font-black tracking-widest">ADD RULE</button>
            <select value={ruleEventType} onChange={e => setRuleEventType(e.target.value)} className="bg-background border border-border px-3 py-2 text-[11px] text-white col-span-3">
              <option value="open_position">open_position</option>
              <option value="close_position">close_position</option>
              <option value="big_pnl">big_pnl</option>
              <option value="whale">whale</option>
              <option value="leaderboard_shift">leaderboard_shift</option>
              <option value="price_move">price_move</option>
              <option value="trade_context">trade_context</option>
              <option value="signal">signal</option>
            </select>
          </div>
          <div className="divide-y divide-border">
            {rules.map(rule => (
              <div key={rule.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-white font-bold text-sm">{rule.name}</div>
                  <div className="text-[9px] font-black tracking-widest text-accent">{rule.eventType}</div>
                </div>
                <div className="text-muted-foreground text-[10px] mt-1">{rule.scope}</div>
              </div>
            ))}
            {rules.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground text-sm">NO RULES YET</div>}
          </div>
        </div>

        <div className="border border-border bg-card">
          <div className="px-4 py-3 border-b border-border text-[11px] font-black tracking-widest text-white">INBOX</div>
          <div className="divide-y divide-border">
            {alerts.map(alert => (
              <div key={alert.id} className={`px-4 py-3 ${alert.isRead ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-white font-bold text-sm">{alert.title}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">{new Date(alert.createdAt).toLocaleTimeString()}</div>
                </div>
                <div className="text-muted-foreground text-[11px] mt-1">{alert.body}</div>
              </div>
            ))}
            {alerts.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground text-sm">NO ALERTS</div>}
          </div>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="px-4 py-3 border-b border-border text-[11px] font-black tracking-widest text-white">ALERT OUTCOMES</div>
        <div className="divide-y divide-border">
          {outcomes.map(outcome => (
            <div key={outcome.id} className="grid grid-cols-[90px_1fr_120px_120px] gap-3 px-4 py-3 items-center">
              <div className={`text-[10px] font-black tracking-widest ${outcome.status === "won" ? "text-accent" : outcome.status === "lost" ? "text-destructive" : "text-muted-foreground"}`}>{outcome.status}</div>
              <div className="font-mono text-[11px] text-muted-foreground truncate">{outcome.walletAddress ?? "N/A"}</div>
              <div className="font-mono text-[11px] text-white">{outcome.finalPnlUsd ? `$${Number(outcome.finalPnlUsd).toFixed(0)}` : "OPEN"}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{new Date(outcome.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
          {outcomes.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground text-sm">NO OUTCOMES YET</div>}
        </div>
      </div>
    </div>
  );
}
