import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { fetchJson } from "@/lib/api";

type WalletProfileResponse = {
  profile: {
    walletAddress: string;
    displayName: string | null;
    handle: string | null;
    traderId: number | null;
    status: string;
    isAutoDiscovered: boolean;
    isVerified: boolean;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    notes: string | null;
  };
  score: {
    compositeScore: string;
    qualityScore: string;
    consistencyScore: string;
    timingScore: string;
    specializationScore: string;
    tier: string;
  } | null;
  summary: {
    walletAddress: string;
    profileId: number;
    score: number;
    tier: string;
    tradeCount: number;
    totalPnlUsd: number;
    winRate: number;
    avgLeverage: number;
    traderId: number | null;
    updatedAt: string;
  } | null;
  explanation: {
    headline: string;
    strengths: string[];
    risks: string[];
    behavior: string[];
    recentTrades: Array<{ id: number; text: string; outcome: "win" | "loss" | "open" }>;
  };
  positions: Array<{
    id: number;
    symbol: string;
    side: string;
    status: string;
    leverage: number;
    openedAt: string | null;
    closedAt: string | null;
    pnlUsd: string | null;
    pnlPct: string | null;
    notionalUsd: string | null;
  }>;
  orders?: Array<Record<string, unknown>>;
  trades?: Array<Record<string, unknown>>;
  fundings?: Array<Record<string, unknown>>;
  thesis?: {
    wallet: string;
    score: number;
    headline: string;
    whyThisMatters: string[];
    confidence: number;
    historicalSimilarity: {
      sampleSize: number;
      averageReturnPct: number;
      averageMaxDrawdownPct: number;
      basis: string;
    };
    suggestedAction: {
      summary: string;
      idealEntryZone: string;
      risk: string;
      invalidation: string;
    };
    caveats: string[];
  };
};

function value(item: Record<string, unknown>, key: string) {
  const raw = item[key];
  if (raw === undefined || raw === null || raw === "") return "-";
  return String(raw);
}

function timeValue(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Date(n).toLocaleString();
}

export default function WalletProfile() {
  const params = useParams();
  const address = String(params.address ?? "");
  const [data, setData] = useState<WalletProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const search = typeof window !== "undefined" ? window.location.search : "";
      try {
        const json = await fetchJson<WalletProfileResponse>(`/api/wallets/${address}${search}`);
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [address]);

  if (loading) {
    return <div className="px-8 pt-8 text-muted-foreground">Loading wallet profile...</div>;
  }

  if (error) {
    return <div className="px-8 pt-8 text-destructive font-bold">{error}</div>;
  }

  if (!data) {
    return <div className="px-8 pt-8 text-muted-foreground">Wallet not found.</div>;
  }

  const score = data.summary?.score ?? Number(data.score?.compositeScore ?? 0);

  return (
    <div className="px-8 pb-10 max-w-[1200px] w-full pt-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-wide text-white">{data.profile.displayName ?? data.profile.handle ?? "WALLET PROFILE"}</h1>
          <div className="text-muted-foreground text-[11px] font-mono mt-1">{data.profile.walletAddress}</div>
        </div>
        <div className="text-right">
          <div className="text-accent text-4xl font-black font-mono">{score.toFixed(1)}</div>
          <div className="text-[9px] font-black tracking-widest text-muted-foreground">{data.summary?.tier ?? data.score?.tier ?? "BRONZE"}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-0 border border-border bg-card mb-6">
        <Stat label="TRADES" value={String(data.summary?.tradeCount ?? 0)} />
        <Stat label="WIN RATE" value={`${(data.summary?.winRate ?? 0).toFixed(1)}%`} />
        <Stat label="PNL" value={`$${(data.summary?.totalPnlUsd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <Stat label="AVG LEV" value={`${(data.summary?.avgLeverage ?? 0).toFixed(1)}x`} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Info label="QUALITY" value={data.score?.qualityScore ?? "0"} />
        <Info label="CONSISTENCY" value={data.score?.consistencyScore ?? "0"} />
        <Info label="TIMING" value={data.score?.timingScore ?? "0"} />
        <Info label="SPECIALIZATION" value={data.score?.specializationScore ?? "0"} />
      </div>

      {data.thesis && <TradeThesis thesis={data.thesis} />}

      <div className="border border-border bg-card mb-6">
        <div className="px-4 py-3 border-b border-border text-[11px] font-black tracking-widest text-white">READABLE TRADER HISTORY</div>
        <div className="p-4">
          <div className="text-white font-bold mb-4">{data.explanation.headline}</div>
          <div className="grid grid-cols-3 gap-4">
            <ListBlock title="STRENGTHS" items={data.explanation.strengths} tone="good" />
            <ListBlock title="RISKS" items={data.explanation.risks} tone="bad" />
            <ListBlock title="BEHAVIOR" items={data.explanation.behavior} tone="neutral" />
          </div>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="px-4 py-3 border-b border-border text-[11px] font-black tracking-widest text-white">RECENT POSITIONS</div>
        <div className="divide-y divide-border">
          {data.positions.map(pos => (
            <div key={pos.id} className="grid grid-cols-6 gap-3 px-4 py-3 items-center">
              <div className="font-black text-white">{pos.symbol}</div>
              <div className={`text-[10px] font-black tracking-wider ${pos.side === "LONG" ? "text-accent" : "text-destructive"}`}>{pos.side}</div>
              <div className="text-[11px] text-muted-foreground">{pos.status}</div>
              <div className="font-mono text-[11px] text-white">{pos.leverage}x</div>
              <div className={`font-mono text-[11px] ${Number(pos.pnlUsd ?? 0) >= 0 ? "text-accent" : "text-destructive"}`}>{pos.pnlUsd ?? "0"}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{pos.closedAt ? new Date(pos.closedAt).toLocaleString() : "OPEN"}</div>
            </div>
          ))}
          {data.positions.length === 0 && (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm tracking-wider font-bold">NO RECENT POSITIONS</div>
          )}
        </div>
      </div>

      <HistoryBlock
        title="ORDER HISTORY"
        items={data.orders ?? []}
        columns={[
          ["SYMBOL", "symbol"],
          ["SIDE", "side"],
          ["TYPE", "type"],
          ["STATUS", "status"],
          ["PRICE", "price"],
          ["QTY", "origQty"],
          ["TIME", "updatedAt"],
        ]}
      />

      <HistoryBlock
        title="TRADE EXECUTIONS"
        items={data.trades ?? []}
        columns={[
          ["SYMBOL", "symbol"],
          ["SIDE", "side"],
          ["PRICE", "price"],
          ["QTY", "quantity"],
          ["FEE", "fee"],
          ["ORDER", "orderID"],
          ["TIME", "time"],
        ]}
      />

      <HistoryBlock
        title="FUNDING HISTORY"
        items={data.fundings ?? []}
        columns={[
          ["SYMBOL", "symbol"],
          ["SIDE", "positionSide"],
          ["POSITION", "positionID"],
          ["FEE", "fundingFee"],
          ["COIN", "feeCoin"],
          ["TIME", "timestamp"],
        ]}
      />
    </div>
  );
}

function TradeThesis({ thesis }: { thesis: NonNullable<WalletProfileResponse["thesis"]> }) {
  return (
    <div className="border border-accent/40 bg-card mb-6">
      <div className="px-5 py-4 border-b border-accent/20 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black tracking-[0.22em] text-accent mb-2">AI TRADE THESIS</div>
          <div className="text-white text-xl font-black tracking-tight">{thesis.headline}</div>
          <div className="text-muted-foreground text-[11px] font-mono mt-1">{thesis.wallet}</div>
        </div>
        <div className="text-right">
          <div className="text-accent text-4xl font-black font-mono">{thesis.score}</div>
          <div className="text-[9px] font-black tracking-widest text-muted-foreground">/100 SCORE</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.85fr] gap-0">
        <div className="p-5 border-b lg:border-b-0 lg:border-r border-border">
          <div className="text-[10px] font-black tracking-widest text-white mb-3">WHY THIS MATTERS</div>
          <div className="space-y-2">
            {thesis.whyThisMatters.map(item => (
              <div key={item} className="text-[13px] text-muted-foreground leading-relaxed border border-border/70 bg-background/30 px-3 py-2">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniMetric label="CONFIDENCE" value={`${thesis.confidence.toFixed(1)}/10`} tone="accent" />
            <MiniMetric label="SIMILAR ENTRIES" value={String(thesis.historicalSimilarity.sampleSize)} />
            <MiniMetric label="AVG RETURN" value={`${thesis.historicalSimilarity.averageReturnPct > 0 ? "+" : ""}${thesis.historicalSimilarity.averageReturnPct.toFixed(1)}%`} tone="accent" />
            <MiniMetric label="AVG DRAWDOWN" value={`${thesis.historicalSimilarity.averageMaxDrawdownPct.toFixed(1)}%`} tone="danger" />
          </div>

          <div className="border border-border bg-background/30 p-4 mb-3">
            <div className="text-[9px] font-black tracking-widest text-muted-foreground mb-2">HISTORICAL SIMILARITY</div>
            <div className="text-[12px] text-muted-foreground leading-relaxed">{thesis.historicalSimilarity.basis}</div>
          </div>

          <div className="border border-accent/25 bg-accent/5 p-4">
            <div className="text-[9px] font-black tracking-widest text-accent mb-2">SUGGESTED ACTION</div>
            <div className="text-white text-sm font-bold mb-3">{thesis.suggestedAction.summary}</div>
            <div className="grid grid-cols-1 gap-2 text-[12px] text-muted-foreground">
              <div><span className="text-white font-bold">Ideal entry zone:</span> {thesis.suggestedAction.idealEntryZone}</div>
              <div><span className="text-white font-bold">Risk:</span> {thesis.suggestedAction.risk}</div>
              <div><span className="text-white font-bold">Invalidation:</span> {thesis.suggestedAction.invalidation}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border flex flex-wrap gap-2">
        {thesis.caveats.map(item => (
          <span key={item} className="text-[9px] font-bold tracking-wider text-muted-foreground border border-border px-2 py-1">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: "accent" | "danger" }) {
  const color = tone === "accent" ? "text-accent" : tone === "danger" ? "text-destructive" : "text-white";
  return (
    <div className="border border-border bg-background/30 p-3">
      <div className="text-[8px] font-black tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-black font-mono ${color}`}>{value}</div>
    </div>
  );
}

function HistoryBlock({ title, items, columns }: {
  title: string;
  items: Array<Record<string, unknown>>;
  columns: Array<[string, string]>;
}) {
  return (
    <div className="border border-border bg-card mt-6">
      <div className="px-4 py-3 border-b border-border text-[11px] font-black tracking-widest text-white">
        {title} <span className="text-muted-foreground">({items.length})</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid gap-3 px-4 py-2 border-b border-border text-[9px] font-black tracking-widest text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(90px, 1fr))` }}>
            {columns.map(([label]) => <div key={label}>{label}</div>)}
          </div>
          <div className="divide-y divide-border">
            {items.slice(0, 20).map((item, index) => (
              <div key={index} className="grid gap-3 px-4 py-3 text-[11px] font-mono text-white"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(90px, 1fr))` }}>
                {columns.map(([label, key]) => (
                  <div key={label} className="truncate">
                    {["time", "timestamp", "createdAt", "updatedAt"].includes(key) ? timeValue(item[key]) : value(item, key)}
                  </div>
                ))}
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm tracking-wider font-bold">NO DATA RETURNED</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-accent" : tone === "bad" ? "text-destructive" : "text-muted-foreground";
  return (
    <div>
      <div className={`text-[9px] font-black tracking-widest mb-2 ${color}`}>{title}</div>
      <div className="space-y-2">
        {items.map(item => <div key={item} className="text-[12px] text-muted-foreground leading-relaxed">{item}</div>)}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 border-r border-border last:border-r-0">
      <div className="text-[9px] font-black tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className="text-white font-black text-2xl font-mono">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-[9px] font-black tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className="text-accent font-black text-xl font-mono">{value}</div>
    </div>
  );
}
