import { useRef, useState } from "react";
import { useListIntents, useVoteIntent } from "@workspace/api-client-react";
import type { TradeIntent } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedStream } from "@/lib/sse";
import { useMyId } from "@/hooks/useAuth";

const MY_VOTER_ID = 37;

const ASSETS = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","ARB/USDT","OP/USDT","AVAX/USDT","SUI/USDT","DOGE/USDT","PEPE/USDT"];

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

// ── Post Intent Modal ─────────────────────────────────────────────────────────
interface PostIntentModalProps {
  onClose: () => void;
  onPosted: () => void;
}

function PostIntentModal({ onClose, onPosted }: PostIntentModalProps) {
  const [asset, setAsset] = useState("BTC/USDT");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [entry, setEntry] = useState("");
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryN = Number(entry);
  const targetN = Number(target);
  const stopN = Number(stop);
  const rr = entryN && targetN && stopN && Math.abs(entryN - stopN) > 0
    ? Math.abs((targetN - entryN) / (entryN - stopN)).toFixed(2)
    : null;

  async function handleSubmit() {
    setError(null);
    if (!entry || !target || !stop || !reasoning.trim()) {
      setError("All fields are required.");
      return;
    }
    if (reasoning.trim().length < 20) {
      setError("Reasoning must be at least 20 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traderId: MY_VOTER_ID,
          asset,
          side,
          entryPrice: Number(entry),
          targetPrice: Number(target),
          stopLoss: Number(stop),
          leverage,
          reasoning: reasoning.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onPosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post intent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border w-full max-w-[520px] mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="font-black text-sm tracking-widest text-white uppercase">POST INTENT</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Asset + Side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-extrabold tracking-widest text-muted-foreground block mb-1.5">ASSET</label>
              <select
                value={asset}
                onChange={e => setAsset(e.target.value)}
                className="w-full bg-background border border-border text-white text-xs font-bold p-2.5 focus:outline-none focus:border-accent"
              >
                {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-extrabold tracking-widest text-muted-foreground block mb-1.5">DIRECTION</label>
              <div className="flex h-[38px]">
                <button
                  onClick={() => setSide("LONG")}
                  className={`flex-1 text-[10px] font-black tracking-widest border transition-colors ${
                    side === "LONG" ? "bg-accent/10 border-accent text-accent" : "bg-background border-border text-muted-foreground hover:text-white"
                  }`}
                >LONG</button>
                <button
                  onClick={() => setSide("SHORT")}
                  className={`flex-1 text-[10px] font-black tracking-widest border-t border-b border-r transition-colors ${
                    side === "SHORT" ? "bg-destructive/10 border-destructive text-destructive" : "bg-background border-border text-muted-foreground hover:text-white"
                  }`}
                >SHORT</button>
              </div>
            </div>
          </div>

          {/* Price levels */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "ENTRY PRICE", val: entry, set: setEntry, color: "" },
              { label: "TARGET PRICE", val: target, set: setTarget, color: "focus:border-accent" },
              { label: "STOP LOSS", val: stop, set: setStop, color: "focus:border-destructive" },
            ].map(({ label, val, set, color }) => (
              <div key={label}>
                <label className="text-[9px] font-extrabold tracking-widest text-muted-foreground block mb-1.5">{label}</label>
                <input
                  type="number"
                  value={val}
                  onChange={e => set(e.target.value)}
                  placeholder="0.00"
                  className={`w-full bg-background border border-border text-white text-xs font-mono p-2.5 focus:outline-none ${color || "focus:border-accent"}`}
                />
              </div>
            ))}
          </div>

          {/* R:R indicator */}
          {rr && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-extrabold tracking-widest text-muted-foreground">R:R</span>
              <span className={`text-sm font-black font-mono ${Number(rr) >= 1.5 ? "text-accent" : Number(rr) >= 1 ? "text-yellow-400" : "text-destructive"}`}>
                {rr}:1
              </span>
              {Number(rr) < 1 && <span className="text-destructive text-[9px] font-bold">— poor risk/reward</span>}
            </div>
          )}

          {/* Leverage */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-[9px] font-extrabold tracking-widest text-muted-foreground">LEVERAGE</label>
              <span className="text-accent font-black text-xs font-mono">{leverage}×</span>
            </div>
            <input
              type="range" min={1} max={20} value={leverage}
              onChange={e => setLeverage(Number(e.target.value))}
              className="w-full accent-[#D4FF00] h-1 cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
              <span>1×</span><span>10×</span><span>20×</span>
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <label className="text-[9px] font-extrabold tracking-widest text-muted-foreground block mb-1.5">REASONING</label>
            <textarea
              value={reasoning}
              onChange={e => setReasoning(e.target.value)}
              placeholder="Why are you taking this trade? What's your thesis?"
              rows={3}
              className="w-full bg-background border border-border text-white text-xs p-2.5 focus:outline-none focus:border-accent resize-none leading-relaxed"
            />
            <div className="text-[9px] text-muted-foreground mt-1">{reasoning.length} chars (min 20)</div>
          </div>

          {error && (
            <div className="border border-destructive/50 bg-destructive/10 text-destructive text-[11px] font-bold px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-accent text-background font-black text-xs tracking-widest py-3 w-full hover:bg-accent/90 transition-colors uppercase disabled:opacity-50"
          >
            {submitting ? "POSTING..." : "POST INTENT FOR COMMUNITY VOTE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Intent card ───────────────────────────────────────────────────────────────
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
  const rr = entryN && targetN && stopN && Math.abs(entryN - stopN) > 0
    ? (Math.abs(targetN - entryN) / Math.abs(entryN - stopN)).toFixed(1)
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

  const isAI = intent.traderHandle === "sogram_ai";

  return (
    <div className={`border bg-card mb-4 ${
      intent.status === "closed_hit" ? "border-accent/40" :
      intent.status === "closed_miss" ? "border-destructive/40" :
      isAI ? "border-blue-500/30" :
      "border-border"
    }`}>
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 border-[1.5px] flex items-center justify-center text-sm font-black shrink-0"
            style={{ borderColor: isAI ? "#3b82f6" : (TIER_COLORS[intent.traderTier] ?? "#555"), color: isAI ? "#3b82f6" : (TIER_COLORS[intent.traderTier] ?? "#555") }}
          >
            {isAI ? "AI" : Number(intent.traderRepScore).toFixed(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-extrabold text-sm tracking-wide">{intent.traderUsername}</span>
              <span className="text-muted-foreground text-xs font-mono">@{intent.traderHandle}</span>
              {isAI ? (
                <span className="text-[8px] px-1.5 py-0.5 font-black tracking-wider border border-blue-500/40 text-blue-400">AI AGENT</span>
              ) : (
                <span className="text-[8px] px-1.5 py-0.5 font-black tracking-wider border" style={{ borderColor: `${TIER_COLORS[intent.traderTier]}44`, color: TIER_COLORS[intent.traderTier] }}>
                  {intent.traderTier}
                </span>
              )}
            </div>
            <div className="text-muted-foreground text-[10px] font-bold tracking-wider mt-0.5">
              {isAI ? "AI-generated setup · live market analysis" : `VALIDATION ACC: ${Number(intent.traderValidationAccuracy).toFixed(1)}%`}
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

        <p className="text-muted-foreground text-[13px] leading-relaxed mb-4 border-l-2 border-border pl-3">
          {intent.reasoning}
        </p>

        <div className="mb-3">
          <div className="flex justify-between text-[9px] font-extrabold tracking-widest mb-1.5">
            <span className="text-accent">VALID {votes.pct}%</span>
            <span className="text-muted-foreground">{votes.valid + votes.invalid} VOTES</span>
            <span className="text-destructive">INVALID {100 - votes.pct}%</span>
          </div>
          <div className="h-2 flex overflow-hidden bg-border">
            <div className="bg-accent/70 transition-all duration-500" style={{ width: `${votes.pct}%` }} />
            <div className="bg-destructive/50 flex-1" />
          </div>
        </div>

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Intents() {
  const [statusFilter, setStatusFilter] = useState<"open" | "closed_hit" | "closed_miss" | "all">("open");
  const [showModal, setShowModal] = useState(false);
  const [allIntents, setAllIntents] = useState<TradeIntent[]>([]);
  const [intentOffset, setIntentOffset] = useState(0);
  const [hasMoreIntents, setHasMoreIntents] = useState(true);
  const [isLoadingMoreIntents, setIsLoadingMoreIntents] = useState(false);

  const { data, isLoading, refetch } = useListIntents(
    statusFilter !== "all" ? { status: statusFilter, limit: 20 } : { limit: 20 },
    { query: { queryKey: ["intents", statusFilter] } }
  );

  // Reset when filter changes
  useEffect(() => {
    setAllIntents([]);
    setIntentOffset(0);
    setHasMoreIntents(true);
  }, [statusFilter]);

  // Sync initial data (page 0) into accumulated list
  useEffect(() => {
    if (data?.intents) {
      setAllIntents(data.intents);
      setHasMoreIntents((data.intents.length ?? 0) >= 20);
      setIntentOffset(0);
    }
  }, [data]);

  const loadMoreIntents = async () => {
    if (isLoadingMoreIntents || !hasMoreIntents) return;
    setIsLoadingMoreIntents(true);
    try {
      const newOffset = intentOffset + 20;
      const params = new URLSearchParams({ limit: "20", offset: String(newOffset) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/intents?${params}`);
      const d = await res.json();
      const newIntents: TradeIntent[] = d.intents ?? [];
      setAllIntents(prev => [...prev, ...newIntents]);
      setIntentOffset(newOffset);
      setHasMoreIntents(newIntents.length >= 20);
    } catch {
      // silently ignore
    } finally {
      setIsLoadingMoreIntents(false);
    }
  };

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
      {showModal && (
        <PostIntentModal
          onClose={() => setShowModal(false)}
          onPosted={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["intents"] });
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="font-black text-xl tracking-wide text-white mb-1">INTENT VALIDATION</div>
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            Pre-trade setups posted before execution. Vote VALID or SKIP IT — your accuracy is tracked and feeds your reputation score.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="shrink-0 border border-accent text-accent font-black text-[10px] tracking-widest px-4 py-2.5 hover:bg-accent/10 transition-colors uppercase"
        >
          + POST INTENT
        </button>
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
      ) : allIntents.length === 0 ? (
        <div className="border border-border bg-card p-12 text-center">
          <div className="text-muted-foreground text-[10px] font-extrabold tracking-widest mb-2">NO INTENTS</div>
          <p className="text-muted-foreground text-sm mb-4">No {statusFilter} setups right now.</p>
          {statusFilter === "open" && (
            <button
              onClick={() => setShowModal(true)}
              className="border border-accent text-accent font-black text-[10px] tracking-widest px-4 py-2.5 hover:bg-accent/10 transition-colors uppercase"
            >
              BE THE FIRST — POST AN INTENT
            </button>
          )}
        </div>
      ) : (
        <>
          {allIntents.map(intent => (
            <IntentCard key={intent.id} intent={intent} />
          ))}
          {hasMoreIntents && (
            <button
              onClick={loadMoreIntents}
              disabled={isLoadingMoreIntents}
              className="mt-4 w-full py-3 border border-border text-muted-foreground text-[11px] font-extrabold tracking-widest hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-40"
            >
              {isLoadingMoreIntents ? "LOADING..." : "LOAD MORE"}
            </button>
          )}
          {!hasMoreIntents && allIntents.length > 0 && (
            <div className="mt-4 py-3 text-center text-muted-foreground text-[10px] font-bold tracking-widest border-t border-border/30">
              ALL INTENTS LOADED
            </div>
          )}
        </>
      )}
    </div>
  );
}
