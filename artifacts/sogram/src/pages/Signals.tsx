import { useState, useEffect, useRef } from "react";
import { useListSignals, useLikeSignal, useGetMarketPrices, useGetMarketKlines, useGetMarketFills } from "@workspace/api-client-react";
import type { SignalFull, LiveMarketPrice, SodexFill } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletBadge } from "@/components/WalletBadge";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}M AGO`;
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

function calcRR(entry: string, target: string, stop: string, side: string): string {
  const e = Number(entry), t = Number(target), s = Number(stop);
  if (side === "LONG" && e > s && t > e) return ((t - e) / (e - s)).toFixed(1);
  if (side === "SHORT" && e > t && s > e) return ((e - t) / (s - e)).toFixed(1);
  return "—";
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals > 0 ? decimals : 2 });
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

function Sparkline({ symbol, entryPrice, entryTime }: { symbol: string; entryPrice: string; entryTime: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const days = Math.min(Math.max(Math.ceil((Date.now() - new Date(entryTime).getTime()) / 86400000), 1), 7);
  const { data } = useGetMarketKlines(encodeURIComponent(symbol), { days }, {
    query: { queryKey: ["klines", symbol, days], staleTime: 5 * 60_000 }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const klines = data?.klines;
    if (!canvas || !klines || klines.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const entry = Number(entryPrice);
    const closes = klines.map(k => k.close);
    const min = Math.min(...closes, entry) * 0.998;
    const max = Math.max(...closes, entry) * 1.002;
    const range = max - min || 1;

    const toY = (v: number) => H - ((v - min) / range) * H;
    const toX = (i: number) => (i / (closes.length - 1)) * W;

    // Entry price line
    const entryY = toY(entry);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(212,255,0,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, entryY);
    ctx.lineTo(W, entryY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price line
    const lastClose = closes[closes.length - 1];
    const isUp = lastClose >= entry;
    const lineColor = isUp ? "#22C55E" : "#FF3B3B";

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, isUp ? "rgba(34,197,94,0.25)" : "rgba(255,59,59,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.beginPath();
    closes.forEach((c, i) => {
      i === 0 ? ctx.moveTo(toX(i), toY(c)) : ctx.lineTo(toX(i), toY(c));
    });
    const lastX = toX(closes.length - 1);
    ctx.lineTo(lastX, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    closes.forEach((c, i) => {
      i === 0 ? ctx.moveTo(toX(i), toY(c)) : ctx.lineTo(toX(i), toY(c));
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Current price dot
    ctx.beginPath();
    ctx.arc(lastX, toY(lastClose), 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }, [data, entryPrice]);

  if (!data?.klines?.length) return (
    <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="text-muted-foreground text-[9px] tracking-wider">LOADING CHART...</div>
    </div>
  );

  return <canvas ref={canvasRef} width={300} height={60} style={{ width: "100%", height: 60, display: "block" }} />;
}

function LivePriceStrip({ signal, livePrice }: { signal: SignalFull; livePrice: LiveMarketPrice | undefined }) {
  if (!livePrice) return null;

  const price = livePrice.price;
  const entry = Number(signal.entryPrice);
  const target = Number(signal.targetPrice);
  const stop = Number(signal.stopLoss);
  const isLong = signal.side === "LONG";

  const pnlPct = isLong
    ? ((price - entry) / entry) * 100
    : ((entry - price) / entry) * 100;

  const distToTarget = isLong
    ? ((target - price) / price) * 100
    : ((price - target) / price) * 100;
  const distToStop = isLong
    ? ((price - stop) / price) * 100
    : ((stop - price) / price) * 100;

  const isGreen = pnlPct >= 0;

  return (
    <div style={{
      background: isGreen ? "rgba(34,197,94,0.06)" : "rgba(255,59,59,0.06)",
      borderTop: `1px solid ${isGreen ? "rgba(34,197,94,0.2)" : "rgba(255,59,59,0.2)"}`,
      padding: "8px 20px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
    }}>
      <div>
        <div className="text-muted-foreground text-[8px] font-extrabold tracking-widest mb-0.5">LIVE PRICE</div>
        <div className={`font-black text-sm font-mono ${isGreen ? "text-green-400" : "text-destructive"}`}>
          ${price < 1 ? price.toFixed(4) : price < 100 ? price.toFixed(2) : fmt(price, 0)}
        </div>
        <div className={`text-[9px] font-bold font-mono ${livePrice.change24h >= 0 ? "text-green-400" : "text-destructive"}`}>
          {livePrice.change24h >= 0 ? "+" : ""}{livePrice.change24h.toFixed(2)}% 24H
        </div>
      </div>
      <div>
        <div className="text-muted-foreground text-[8px] font-extrabold tracking-widest mb-0.5">UNREAL P&L</div>
        <div className={`font-black text-sm font-mono ${isGreen ? "text-green-400" : "text-destructive"}`}>
          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
        </div>
        <div className="text-muted-foreground text-[9px]">from entry</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[8px] font-extrabold tracking-widest mb-0.5">TO TARGET</div>
        <div className={`font-black text-sm font-mono ${distToTarget > 0 ? "text-accent" : "text-muted-foreground"}`}>
          {distToTarget > 0 ? "+" : ""}{distToTarget.toFixed(2)}%
        </div>
        <div className="text-muted-foreground text-[9px]">${price < 1 ? target.toFixed(4) : fmt(target, 0)}</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[8px] font-extrabold tracking-widest mb-0.5">TO STOP</div>
        <div className={`font-black text-sm font-mono ${distToStop > 0 ? "text-green-400" : "text-destructive"}`}>
          -{Math.abs(distToStop).toFixed(2)}%
        </div>
        <div className="text-muted-foreground text-[9px]">${price < 1 ? stop.toFixed(4) : fmt(stop, 0)}</div>
      </div>
    </div>
  );
}

function SignalCard({ signal, livePrice }: { signal: SignalFull; livePrice: LiveMarketPrice | undefined }) {
  const { mutate: likeSignal } = useLikeSignal();
  const [liked, setLiked] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const isLong = signal.side === "LONG";
  const rr = calcRR(signal.entryPrice, signal.targetPrice, signal.stopLoss, signal.side);
  const isOpen = signal.status === "open";

  return (
    <div className="border border-border bg-card hover:border-accent/30 transition-colors">
      {/* Header */}
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
                {(signal as any).traderSignalAccuracy !== undefined && (
                  <span className="text-[8px] font-extrabold tracking-wider text-blue-400 border border-blue-400/40 px-1.5 py-0.5">
                    {Number((signal as any).traderSignalAccuracy).toFixed(0)}% SIG
                  </span>
                )}
                {(signal as any).traderStreakDays > 0 && (
                  <span className="text-[8px] font-extrabold tracking-wider text-accent border border-accent/40 px-1.5 py-0.5">
                    🔥 {(signal as any).traderStreakDays}D
                  </span>
                )}
              </div>
              <div className="text-muted-foreground text-[10px] font-mono">@{signal.traderHandle} · REP {signal.traderRepScore.toFixed(0)}</div>
              {((signal as any).traderWalletAddress || (signal as any).txHash) && (
                <div className="mt-1.5">
                  <WalletBadge
                    address={(signal as any).traderWalletAddress}
                    txHash={(signal as any).txHash}
                    compact
                  />
                </div>
              )}
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
          {livePrice && (
            <span className={`text-[10px] font-black font-mono ml-auto ${livePrice.change24h >= 0 ? "text-green-400" : "text-destructive"}`}>
              ${livePrice.price < 1 ? livePrice.price.toFixed(4) : livePrice.price < 100 ? livePrice.price.toFixed(2) : fmt(livePrice.price, 0)}
            </span>
          )}
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

      {/* Price levels */}
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

      {/* Live price strip (open signals only) */}
      {isOpen && <LivePriceStrip signal={signal} livePrice={livePrice} />}

      {/* Sparkline chart */}
      {showChart && (
        <div style={{ padding: "12px 12px 4px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0A0A0A" }}>
          <div className="text-muted-foreground text-[8px] font-extrabold tracking-widest mb-2">
            PRICE CHART · FROM SIGNAL DATE
          </div>
          <Sparkline symbol={signal.asset} entryPrice={signal.entryPrice} entryTime={signal.createdAt} />
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 flex items-center gap-4 border-t border-border/50">
        <button
          onClick={() => { if (!liked) { likeSignal({ signalId: signal.id }); setLiked(true); } }}
          className={`flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-xs font-semibold ${
            liked ? "text-accent" : "text-muted-foreground hover:text-white"
          }`}
        >
          ♥ {signal.likeCount + (liked ? 1 : 0)}
        </button>
        <button
          onClick={() => setShowChart(c => !c)}
          className="flex items-center gap-1 bg-transparent border border-border/50 text-muted-foreground px-3 py-1.5 text-[9px] font-extrabold cursor-pointer tracking-wider hover:border-accent/50 hover:text-accent transition-colors"
        >
          {showChart ? "▲ HIDE CHART" : "▼ SHOW CHART"}
        </button>
        <button className="ml-auto bg-transparent border border-accent/50 text-accent px-4 py-1.5 text-[10px] font-extrabold cursor-pointer tracking-wider hover:bg-accent hover:text-background transition-colors">
          FOLLOW SIGNAL →
        </button>
      </div>
    </div>
  );
}

interface TraderAccuracy {
  traderId?: number;
  traderUsername: string;
  traderHandle: string;
  traderTier: string;
  traderRepScore: number;
  signalAccuracy: number;
  hitCount: number;
  stoppedCount: number;
  openCount: number;
}

function SignalAccuracyCard({ signals }: { signals: SignalFull[] }) {
  const traderMap = new Map<string, TraderAccuracy>();
  for (const s of signals) {
    const key = s.traderHandle;
    const existing = traderMap.get(key);
    const acc = (s as any).traderSignalAccuracy ?? 0;
    if (!existing) {
      traderMap.set(key, {
        traderUsername: s.traderUsername,
        traderHandle: s.traderHandle,
        traderTier: s.traderTier,
        traderRepScore: s.traderRepScore,
        signalAccuracy: acc,
        hitCount: s.status === "hit" ? 1 : 0,
        stoppedCount: s.status === "stopped" ? 1 : 0,
        openCount: s.status === "open" ? 1 : 0,
      });
    } else {
      existing.hitCount += s.status === "hit" ? 1 : 0;
      existing.stoppedCount += s.status === "stopped" ? 1 : 0;
      existing.openCount += s.status === "open" ? 1 : 0;
    }
  }

  const traders = Array.from(traderMap.values())
    .sort((a, b) => b.signalAccuracy - a.signalAccuracy)
    .slice(0, 5);

  if (traders.length === 0) return null;

  const TIER_COLORS: Record<string, string> = {
    DIAMOND: "#00D4FF", GOLD: "#D4FF00", SILVER: "#9CA3AF", BRONZE: "#F97316",
  };

  return (
    <div className="border border-border bg-card mb-6">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <span className="text-[9px] font-extrabold tracking-widest text-muted-foreground">SIGNAL ACCURACY LEADERBOARD</span>
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse ml-auto" />
      </div>
      <div className="divide-y divide-border/50">
        {traders.map((t, i) => {
          const total = t.hitCount + t.stoppedCount;
          const accuracy = total > 0 ? Math.round((t.hitCount / total) * 100) : t.signalAccuracy;
          const tierColor = TIER_COLORS[t.traderTier] ?? "#555";
          return (
            <div key={t.traderHandle} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-muted-foreground text-[9px] font-black font-mono w-4 text-right">{i + 1}</span>
              <div className="w-6 h-6 border flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ borderColor: `${tierColor}66`, color: tierColor }}>
                {t.traderUsername.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-white text-[11px] font-extrabold truncate">{t.traderUsername}</span>
                  <span className="text-[8px] font-black tracking-wider shrink-0" style={{ color: tierColor }}>
                    {t.traderTier}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-border overflow-hidden">
                    <div className="h-full bg-accent transition-all" style={{ width: `${accuracy}%` }} />
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono shrink-0">
                    <span className="text-green-400">{t.hitCount}H</span>
                    <span className="text-destructive">{t.stoppedCount}S</span>
                    <span className="text-accent font-black">{accuracy}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SodexFillsStrip({ symbol }: { symbol: string }) {
  const { data } = useGetMarketFills(encodeURIComponent(symbol), { limit: 20 }, {
    query: { queryKey: ["fills", symbol], staleTime: 15_000, refetchInterval: 15_000 },
  });

  const fills: SodexFill[] = data?.fills ?? [];
  if (fills.length === 0) return null;

  const recentBuys = fills.filter(f => f.side === "BUY").length;
  const recentSells = fills.filter(f => f.side === "SELL").length;
  const total = fills.length;
  const buyPct = total > 0 ? Math.round((recentBuys / total) * 100) : 50;

  return (
    <div className="border border-border bg-card mb-4">
      <div className="px-4 py-2 border-b border-border flex items-center gap-3">
        <span className="text-[9px] font-extrabold tracking-widest text-muted-foreground">
          SODEX LIVE FILLS · {symbol.split("/")[0]}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-green-400 text-[9px] font-bold">{recentBuys}B</span>
          <div className="w-20 h-1 bg-destructive/40 overflow-hidden">
            <div className="h-full bg-green-400/70 transition-all" style={{ width: `${buyPct}%` }} />
          </div>
          <span className="text-destructive text-[9px] font-bold">{recentSells}S</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      </div>
      <div className="flex overflow-x-auto gap-0 divide-x divide-border/40 scrollbar-none">
        {fills.slice(0, 8).map((f) => {
          const isBuy = f.side === "BUY";
          const secAgo = Math.round((Date.now() - f.time) / 1000);
          const timeLabel = secAgo < 60 ? `${secAgo}s` : `${Math.round(secAgo / 60)}m`;
          return (
            <div key={f.tradeId} className="flex-shrink-0 px-3 py-2 min-w-[100px]">
              <div className={`text-[9px] font-extrabold tracking-widest mb-0.5 ${isBuy ? "text-green-400" : "text-destructive"}`}>
                {f.side}
              </div>
              <div className="text-white text-[11px] font-black font-mono">
                ${Number(f.price).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-muted-foreground text-[9px] font-mono">
                {Number(f.quantity).toFixed(4)} · {timeLabel} AGO
              </div>
              <div className="text-[8px] font-mono text-muted-foreground/50 mt-0.5 truncate">
                #{f.tradeId.slice(0, 6)}
              </div>
            </div>
          );
        })}
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

  const { data: marketData } = useGetMarketPrices({
    query: { queryKey: ["market-prices"], staleTime: 30_000, refetchInterval: 30_000 },
  });

  const priceMap = new Map<string, LiveMarketPrice>(
    (marketData?.prices ?? []).map(p => [p.symbol, p])
  );

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
        <div className="flex items-center gap-2">
          {marketData && (
            <div className="flex items-center gap-3 border border-border/40 px-3 py-1.5 bg-card/50">
              {(marketData.prices ?? []).slice(0, 3).map(p => (
                <div key={p.symbol} className="text-[9px] font-mono font-bold">
                  <span className="text-muted-foreground">{p.symbol.split("/")[0]} </span>
                  <span className={p.change24h >= 0 ? "text-green-400" : "text-destructive"}>
                    ${p.price < 100 ? p.price.toFixed(2) : fmt(p.price, 0)}
                  </span>
                </div>
              ))}
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Live Sodex" />
            </div>
          )}
          <div className="flex items-center gap-0 border border-border">
            {(["grid", "list"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3.5 py-2 text-[10px] font-extrabold tracking-wider cursor-pointer ${
                  view === v ? "bg-accent text-background" : "bg-transparent text-muted-foreground"
                }`}
              >
                {v === "grid" ? "⊞ GRID" : "≡ LIST"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {signals.length > 0 && <SignalAccuracyCard signals={signals} />}

      {asset !== "All" && <SodexFillsStrip symbol={asset} />}

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
              <button key={a} onClick={() => setAsset(a)}
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
              <button key={s} onClick={() => setSide(s)}
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
              <button key={s} onClick={() => setStatus(s)}
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
              <input type="range" min={0} max={100} step={5} value={minConfidence}
                onChange={e => setMinConfidence(Number(e.target.value))}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer m-0"
              />
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-background bg-accent rounded-full pointer-events-none"
                style={{ left: `${minConfidence}%` }}
              />
            </div>
          </div>
        </div>

        {(asset !== "All" || side !== "All" || status !== "all" || minConfidence > 0) && (
          <button onClick={() => { setAsset("All"); setSide("All"); setStatus("all"); setMinConfidence(0); }}
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
          <button onClick={() => { setAsset("All"); setSide("All"); setStatus("all"); setMinConfidence(0); }}
            className="mt-2 bg-transparent border border-accent/50 text-accent px-4 py-2 text-xs font-extrabold cursor-pointer tracking-wider hover:bg-accent hover:text-background transition-colors"
          >
            CLEAR FILTERS
          </button>
        </div>
      ) : (
        <div className={`grid gap-4 ${view === "grid" ? "grid-cols-2" : "grid-cols-1"}`}>
          {signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} livePrice={priceMap.get(signal.asset)} />
          ))}
        </div>
      )}
    </div>
  );
}
