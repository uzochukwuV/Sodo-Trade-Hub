import { useRef, useState } from "react";
import { useListIntents, useVoteIntent } from "@workspace/api-client-react";
import type { TradeIntent } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedStream } from "@/lib/sse";
import { useMyId } from "@/hooks/useAuth";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function fmt(val: string) {
  const n = Number(val);
  if (n >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return "$" + n.toFixed(2);
}

const TIER_COLORS: Record<string, string> = {
  DIAMOND: "#00D4FF",
  GOLD: "#D4FF00",
  SILVER: "#9CA3AF",
  BRONZE: "#F97316",
};

function IntentCard({ intent }: { intent: TradeIntent }) {
  const { mutate: vote } = useVoteIntent();
  const myId = useMyId();
  const [myVote, setMyVote] = useState<"valid" | "invalid" | null>(null);
  const [votes, setVotes] = useState({ valid: intent.votesValid, invalid: intent.votesInvalid, pct: intent.validPct });

  const isLong = intent.side === "LONG";
  const isOpen = intent.status === "open";
  const statusLabel =
    intent.status === "open" ? null :
    intent.status === "closed_hit" ? "HIT ✓" :
    intent.status === "closed_miss" ? "MISSED" : "EXPIRED";

  const entryN = Number(intent.entryPrice);
  const targetN = Number(intent.targetPrice);
  const stopN = Number(intent.stopLoss);
  const rr = entryN && targetN && stopN && entryN > stopN
    ? ((targetN - entryN) / (entryN - stopN)).toFixed(1)
    : "—";

  const isSelf = myId !== null && intent.traderId === myId;
  const canVote = isOpen && !myVote && myId !== null && !isSelf;

  function handleVote(v: "valid" | "invalid") {
    if (!canVote || myId === null) return;
    setMyVote(v);
    const newValid = votes.valid + (v === "valid" ? 1 : 0);
    const newInvalid = votes.invalid + (v === "invalid" ? 1 : 0);
    const total = newValid + newInvalid;
    setVotes({ valid: newValid, invalid: newInvalid, pct: total > 0 ? Math.round((newValid / total) * 100) : 50 });
    vote({ intentId: intent.id, data: { vote: v, voterId: myId } });
  }

  return (
    <div className={`border bg-card mb-4 ${
      intent.status === "closed_hit" ? "border-accent/40" :
      intent.status === "closed_miss" ? "border-destructive/40" :
      "border-border"
    }`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 border-[1.5px] flex items-center justify-center text-sm font-black shrink-0"
            style={{ borderColor: TIER_COLORS[intent.traderTier] ?? "#555", color: TIER_COLORS[intent.traderTier] ?? "#555" }}
          >
            {Number(intent.traderRepScore).toFixed(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-extrabold text-sm tracking-wide">{intent.traderUsername}</span>
              <span className="text-muted-foreground text-xs font-mono">@{intent.traderHandle}</span>
              <span className="text-[8px] px-1.5 py-0.5 font-black tracking-wider border" style={{ borderColor: `${TIER_COLORS[intent.traderTier]}44`, color: TIER_COLORS[intent.traderTier] }}>
                {intent.traderTier}
              </span>
            </div>
            <div className="text-muted-foreground text-[10px] font-bold tracking-wider mt-0.5">
              VALIDATION ACC: {Number(intent.traderValidationAccuracy).toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusLabel && (
            <span className={`text-[10px] px-2 py-1 font-black tracking-wider border ${
              intent.status === "closed_hit" ? "border-accent/40 text-accent bg-accent/10" :
              intent.status === "closed_miss" ? "border-destructive/40 text-destructive bg-destructive/10" :
              "border-border text-muted-foreground"
            }`}>{statusLabel}</span>
          )}
          {isOpen && (
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider">
              {timeLeft(intent.expiresAt)}
            </span>
          )}
          <span className="text-muted-foreground text-[10px]">{timeAgo(intent.createdAt)}</span>
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Asset + setup grid */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-white font-black text-xl">{intent.asset}</span>
          <span className={`text-[10px] px-2 py-1 font-black tracking-wider border ${
            isLong ? "border-accent/60 text-accent" : "border-destructive/60 text-destructive"
          }`}>{intent.side}</span>
          <span className="text-muted-foreground text-[10px] font-bold border border-border px-2 py-1">{intent.leverage}×</span>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {([
            ["ENTRY", fmt(intent.entryPrice)],
            ["TARGET", fmt(intent.targetPrice), "text-accent"],
            ["STOP", fmt(intent.stopLoss), "text-destructive"],
            ["R:R", `${rr}:1`],
          ] as [string, string, string?][]).map(([l, v, color]) => (
            <div key={l} className="border border-border p-2.5 bg-background">
              <div className="text-muted-foreground text-[9px] font-bold tracking-widest mb-1">{l}</div>
              <div className={`font-black text-sm font-mono ${color ?? "text-white"}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* Reasoning */}
        <p className="text-muted-foreground text-[13px] leading-relaxed mb-4 border-l-2 border-border pl-3">
          {intent.reasoning}
        </p>

        {/* Vote bars */}
        <div className="mb-3">
          <div className="flex justify-between text-[9px] font-extrabold tracking-widest mb-1.5">
            <span className="text-accent">VALID {votes.pct}%</span>
            <span className="text-muted-foreground">{votes.valid + votes.invalid} VOTES</span>
            <span className="text-destructive">INVALID {100 - votes.pct}%</span>
          </div>
          <div className="h-2 flex overflow-hidden bg-border">
            <div
              className="bg-accent/70 transition-all duration-500"
              style={{ width: `${votes.pct}%` }}
            />
            <div className="bg-destructive/50 flex-1" />
          </div>
        </div>

        {/* Vote buttons */}
        {isOpen && (
          <div className="flex gap-2">
            <button
              onClick={() => handleVote("valid")}
              disabled={!canVote}
              title={myId === null ? "Connect wallet to vote" : isSelf ? "Cannot vote on your own intent" : undefined}
              className={`flex-1 py-2 text-[10px] font-black tracking-wider border transition-colors ${
                myVote === "valid"
                  ? "bg-accent text-background border-accent"
                  : "bg-transparent border-accent/50 text-accent hover:bg-accent/10"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {myVote === "valid" ? "✓ VOTED VALID" : "VALID SETUP"}
            </button>
            <button
              onClick={() => handleVote("invalid")}
              disabled={!canVote}
              title={myId === null ? "Connect wallet to vote" : isSelf ? "Cannot vote on your own intent" : undefined}
              className={`flex-1 py-2 text-[10px] font-black tracking-wider border transition-colors ${
                myVote === "invalid"
                  ? "bg-destructive text-white border-destructive"
                  : "bg-transparent border-destructive/50 text-destructive hover:bg-destructive/10"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {myVote === "invalid" ? "✗ VOTED INVALID" : "SKIP IT"}
            </button>
          </div>
        )}
        {!isOpen && intent.status !== "expired" && (
          <div className={`text-center text-[10px] font-black tracking-wider py-2 border ${
            intent.status === "closed_hit" ? "border-accent/30 text-accent" : "border-destructive/30 text-destructive"
          }`}>
            {intent.status === "closed_hit" ? "COMMUNITY CALLED IT — TRADE HIT TARGET" : "TRADE STOPPED OUT"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Intents() {
  const [statusFilter, setStatusFilter] = useState<"open" | "closed_hit" | "closed_miss" | "all">("open");

  const { data, isLoading } = useListIntents(
    statusFilter !== "all" ? { status: statusFilter, limit: 30 } : { limit: 30 },
    { query: { queryKey: ["intents", statusFilter] } }
  );

  // Live SSE — debounced invalidation when new trades/signals fire,
  // since trade outcomes resolve open intents server-side.
  const qc = useQueryClient();
  const invalidateTimer = useRef<number | null>(null);
  const scheduleInvalidate = () => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = window.setTimeout(() => {
      invalidateTimer.current = null;
      qc.invalidateQueries({ queryKey: ["intents"] });
    }, 1000);
  };
  useFeedStream({ onNewTrade: scheduleInvalidate, onNewSignal: scheduleInvalidate });

  const tabs: [string, typeof statusFilter][] = [
    ["OPEN", "open"],
    ["HIT", "closed_hit"],
    ["MISSED", "closed_miss"],
    ["ALL", "all"],
  ];

  return (
    <div className="px-8 pb-10 pt-6 max-w-[800px] w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="font-black text-xl tracking-wide text-white mb-1">INTENT VALIDATION</div>
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Pre-trade setups posted before execution. Vote VALID or SKIP IT — your accuracy is tracked and feeds your reputation score.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        {tabs.map(([label, value]) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`px-4 py-2.5 text-[10px] font-extrabold tracking-widest border-b-2 transition-colors ${
              statusFilter === value
                ? "text-accent border-accent"
                : "text-muted-foreground border-transparent hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : (data?.intents ?? []).length === 0 ? (
        <div className="border border-border bg-card p-12 text-center">
          <div className="text-muted-foreground text-[10px] font-extrabold tracking-widest mb-2">NO INTENTS</div>
          <p className="text-muted-foreground text-sm">No {statusFilter} setups right now.</p>
        </div>
      ) : (
        (data?.intents ?? []).map(intent => (
          <IntentCard key={intent.id} intent={intent} />
        ))
      )}
    </div>
  );
}
