import { useState } from "react";
import { useListSignals, useLikeSignal } from "@workspace/api-client-react";
import type { SignalFull } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}M AGO`;
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

function calcRR(entry: string, target: string, stop: string, side: string): string {
  const e = Number(entry), t = Number(target), s = Number(stop);
  if (side === "LONG" && e > s && t > e) {
    return ((t - e) / (e - s)).toFixed(1);
  }
  if (side === "SHORT" && e > t && s > e) {
    return ((e - t) / (s - e)).toFixed(1);
  }
  return "—";
}

const ASSETS = ["All", "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ARB/USDT"];
const SIDES = ["All", "LONG", "SHORT"] as const;
const STATUSES = ["all", "open", "hit", "stopped"] as const;

type StatusFilter = typeof STATUSES[number];
type SideFilter = typeof SIDES[number];

function StatusBadge({ status }: { status: SignalFull["status"] }) {
  if (status === "open") return (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      <span className="text-accent text-[9px] font-extrabold tracking-widest">OPEN</span>
    </span>
  );
  if (status === "hit") return (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
      <span className="text-green-400 text-[9px] font-extrabold tracking-widest">TARGET HIT</span>
    </span>
  );
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
      <span className="text-destructive text-[9px] font-extrabold tracking-widest">STOPPED</span>
    </span>
  );
}

function SignalCard({ signal }: { signal: SignalFull }) {
  const { mutate: likeSignal } = useLikeSignal();
  const [liked, setLiked] = useState(false);
  const isLong = signal.side === "LONG";
  const rr = calcRR(signal.entryPrice, signal.targetPrice, signal.stopLoss, signal.side);

  const handleLike = () => {
    if (liked) return;
    likeSignal({ signalId: signal.id });
    setLiked(true);
  };

  return (
    <div className="border border-border bg-card hover:border-accent/30 transition-colors">
      <div className="p-5 border-b border-border/50">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full border-[1.5px] border-border flex items-center justify-center text-[11px] font-black text-muted-foreground shrink-0">
              {signal.traderUsername.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-extrabold text-xs tracking-wide text-white">{signal.traderUsername}</span>
                <span className={`border text-[8px] px-1.5 py-0.5 font-black tracking-wider ${
                  signal.traderTier === "DIAMOND" ? "border-accent text-accent" :
                  signal.traderTier === "GOLD" ? "border-yellow-400/60 text-yellow-400" :
                  "border-border text-muted-foreground"
                }`}>{signal.traderTier}</span>
              </div>
              <div className="text-muted-foreground text-[10px] font-mono">@{signal.traderHandle} · REP {signal.traderRepScore.toFixed(0)}</div>
            </div>
          </div>
          <div className="text-right">
            <StatusBadge status={signal.status} />
            <div className="text-muted-foreground text-[10px] mt-1.5">{timeAgo(signal.createdAt)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-white font-black text-lg tracking-wide">{signal.asset}</span>
          <span className={`px-2 py-0.5 text-[10px] font-black tracking-wider ${
            isLong ? "bg-accent text-background" : "bg-transparent border border-destructive text-destructive"
          }`}>{signal.side}</span>
        </div>

        <div className="w-full h-1.5 bg-border mb-3 overflow-hidden">
          <div
            className={`h-full transition-all ${
              signal.confidence >= 80 ? "bg-accent" : signal.confidence >= 65 ? "bg-yellow-400" : "bg-muted-foreground"
            }`}
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <div className="flex justify-between items-center mb-3.5">
          <span className="text-muted-foreground text-[10px] font-bold tracking-wider">CONFIDENCE</span>
          <span className={`font-black text-sm font-mono ${
            signal.confidence >= 80 ? "text-accent" : signal.confidence >= 65 ? "text-yellow-400" : "text-muted-foreground"
          }`}>{signal.confidence}%</span>
        </div>

        {signal.reasoning && (
          <p className="text-muted-foreground text-[12px] leading-relaxed border-t border-border/40 pt-3">{signal.reasoning}</p>
        )}
      </div>

      <div className="grid grid-cols-4 divide-x divide-border">
        {([
          ["ENTRY", signal.entryPrice, "text-white"],
          ["TARGET", signal.targetPrice, "text-accent"],
          ["STOP", signal.stopLoss, "text-destructive"],
          ["R:R", `${rr}:1`, "text-white"],
        ] as [string, string, string][]).map(([label, value, color]) => (
          <div key={label} className="p-3 text-center">
            <div className="text-muted-foreground text-[9px] font-extrabold tracking-widest mb-1">{label}</div>
            <div className={`${color} font-black text-[13px] font-mono`}>
              {label === "R:R" ? value : `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}`}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 flex items-center gap-4 border-t border-border/50">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-xs font-semibold ${
            liked ? "text-accent" : "text-muted-foreground hover:text-white"
          }`}
        >
          ♥ {signal.likeCount + (liked ? 1 : 0)}
        </button>
        <button className="ml-auto bg-transparent border border-accent/50 text-accent px-4 py-1.5 text-[10px] font-extrabold cursor-pointer tracking-wider hover:bg-accent hover:text-background transition-colors">
          FOLLOW SIGNAL →
        </button>
      </div>
    </div>
  );
}

export default function Signals() {
  const [asset, setAsset] = useState("All");
  const [side, setSide] = useState<SideFilter>("All");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");

  const params = {
    asset: asset !== "All" ? asset : undefined,
    side: side !== "All" ? (side as "LONG" | "SHORT") : undefined,
    status: status !== "all" ? status : undefined,
    minConfidence: minConfidence > 0 ? minConfidence : undefined,
    limit: 20,
    offset: 0,
  };

  const { data, isLoading } = useListSignals(params, {
    query: { queryKey: ["signals", params] },
  });

  const signals = data?.signals ?? [];
  const total = data?.total ?? 0;

  const openCount = signals.filter(s => s.status === "open").length;
  const hitCount = signals.filter(s => s.status === "hit").length;
  const stoppedCount = signals.filter(s => s.status === "stopped").length;
  const avgConfidence = signals.length > 0
    ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length)
    : 0;

  return (
    <div className="px-8 pb-10 max-w-[1200px] w-full pt-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-black tracking-wide text-white mb-1">SIGNALS</h1>
          <p className="text-muted-foreground text-xs tracking-wider">
            {total} SIGNAL{total !== 1 ? "S" : ""} · {openCount} OPEN · {hitCount} HIT · {stoppedCount} STOPPED
          </p>
        </div>
        <div className="flex items-center gap-0 border border-border">
          {(["grid", "list"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-2 text-[10px] font-extrabold tracking-wider cursor-pointer ${
                view === v ? "bg-accent text-background" : "bg-transparent text-muted-foreground"
              }`}
            >
              {v === "grid" ? "⊞ GRID" : "≡ LIST"}
            </button>
          ))}
        </div>
      </div>

      {signals.length > 0 && (
        <div className="grid grid-cols-4 gap-0 border border-border bg-card mb-6">
          {[
            ["OPEN", openCount, "text-accent"],
            ["TARGET HIT", hitCount, "text-green-400"],
            ["STOPPED", stoppedCount, "text-destructive"],
            ["AVG CONFIDENCE", `${avgConfidence}%`, "text-white"],
          ].map(([label, value, color], i) => (
            <div key={String(label)} className={`p-4 ${i < 3 ? "border-r border-border" : ""}`}>
              <div className="text-muted-foreground text-[9px] font-extrabold tracking-widest mb-2">{label}</div>
              <div className={`text-2xl font-black font-mono tracking-tighter ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6 p-4 border border-border bg-card/50">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[9px] font-extrabold tracking-widest">ASSET</span>
          <div className="flex gap-0 border border-border">
            {ASSETS.map(a => (
              <button
                key={a}
                onClick={() => setAsset(a)}
                className={`px-2.5 py-1.5 text-[10px] font-bold tracking-wider cursor-pointer border-r border-border last:border-r-0 ${
                  asset === a ? "bg-accent text-background" : "bg-transparent text-muted-foreground hover:text-white"
                }`}
              >
                {a === "All" ? "ALL" : a.split("/")[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[9px] font-extrabold tracking-widest">DIRECTION</span>
          <div className="flex gap-0 border border-border">
            {SIDES.map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-3 py-1.5 text-[10px] font-extrabold tracking-wider cursor-pointer border-r border-border last:border-r-0 ${
                  side === s
                    ? s === "LONG" ? "bg-accent text-background" : s === "SHORT" ? "bg-destructive text-white" : "bg-accent text-background"
                    : "bg-transparent text-muted-foreground hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[9px] font-extrabold tracking-widest">STATUS</span>
          <div className="flex gap-0 border border-border">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 text-[10px] font-extrabold tracking-wider cursor-pointer border-r border-border last:border-r-0 uppercase ${
                  status === s ? "bg-accent text-background" : "bg-transparent text-muted-foreground hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground text-[9px] font-extrabold tracking-widest">MIN CONFIDENCE</span>
            <span className={`text-[10px] font-black font-mono ${minConfidence > 0 ? "text-accent" : "text-muted-foreground"}`}>
              {minConfidence > 0 ? `≥${minConfidence}%` : "ANY"}
            </span>
          </div>
          <div className="relative h-6 flex items-center">
            <div className="relative flex-1 h-[3px] bg-border">
              <div className="h-full bg-accent" style={{ width: `${minConfidence}%` }} />
              <input
                type="range" min={0} max={100} step={5} value={minConfidence}
                onChange={e => setMinConfidence(Number(e.target.value))}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer m-0"
              />
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-background bg-accent rounded-full pointer-events-none"
                style={{ left: `${minConfidence}%` }}
              />
            </div>
          </div>
        </div>

        {(asset !== "All" || side !== "All" || status !== "all" || minConfidence > 0) && (
          <button
            onClick={() => { setAsset("All"); setSide("All"); setStatus("all"); setMinConfidence(0); }}
            className="self-end bg-transparent border border-border text-muted-foreground px-3 py-1.5 text-[10px] font-extrabold tracking-wider cursor-pointer hover:text-white hover:border-white transition-colors"
          >
            CLEAR FILTERS ×
          </button>
        )}
      </div>

      {isLoading ? (
        <div className={`grid gap-4 ${view === "grid" ? "grid-cols-2" : "grid-cols-1"}`}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : signals.length === 0 ? (
        <div className="border border-border bg-card flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-4xl font-black text-border">—</div>
          <div className="text-muted-foreground text-sm font-bold tracking-wider">NO SIGNALS MATCH YOUR FILTERS</div>
          <button
            onClick={() => { setAsset("All"); setSide("All"); setStatus("all"); setMinConfidence(0); }}
            className="mt-2 bg-transparent border border-accent/50 text-accent px-4 py-2 text-xs font-extrabold cursor-pointer tracking-wider hover:bg-accent hover:text-background transition-colors"
          >
            CLEAR FILTERS
          </button>
        </div>
      ) : (
        <div className={`grid gap-4 ${view === "grid" ? "grid-cols-2" : "grid-cols-1"}`}>
          {signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
