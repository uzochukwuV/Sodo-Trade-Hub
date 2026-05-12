import { useEffect, useState } from "react";
import { useFeedStream } from "@/lib/sse";

type MarketActivity = {
  symbol: string;
  displaySymbol: string;
  markPrice: number;
  indexPrice: number;
  changePct24h: number;
  volume24hUsd: number;
  openInterestUsd: number;
  fundingRate: number;
  fillCount15m: number;
  buyRatio15m: number;
  netFlow15mUsd: number;
  lastFillTs: number;
};

type MarketSummary = {
  totalVolume24hUsd: number;
  totalOpenInterestUsd: number;
  hottestSymbol: string;
  topGainer: { symbol: string; changePct: number };
  topLoser: { symbol: string; changePct: number };
  bullishCount: number;
  bearishCount: number;
  netFlow15mUsd: number;
};

function fmtUsd(n: number, compact = true) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (!compact) return sign + "$" + a.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(1) + "K";
  return sign + "$" + a.toFixed(2);
}

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(6);
}

export default function Markets() {
  const [activity, setActivity] = useState<MarketActivity[]>([]);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"volume" | "change" | "fills" | "oi" | "flow">("volume");

  async function load() {
    try {
      const r = await fetch("/api/markets/activity");
      const j = await r.json();
      if (j.activity) {
        setActivity(j.activity);
        setSummary(j.summary);
        setFetchedAt(j.fetchedAt);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // Slow REST refresh as a safety net; live updates come via SSE below.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Live price ticks from the SSE stream patch the in-memory snapshot in
  // place — no re-fetch, no flicker, ~1Hz per symbol.
  useFeedStream({
    onPriceTick: (e) => {
      setActivity(prev => {
        const idx = prev.findIndex(a => a.symbol === e.symbol);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = { ...next[idx], markPrice: e.markPrice, changePct24h: e.changePct24h };
        return next;
      });
      setFetchedAt(new Date(e.ts).toISOString());
    },
  });

  const sorted = [...activity].sort((a, b) => {
    switch (sortBy) {
      case "change": return Math.abs(b.changePct24h) - Math.abs(a.changePct24h);
      case "fills":  return b.fillCount15m - a.fillCount15m;
      case "oi":     return b.openInterestUsd - a.openInterestUsd;
      case "flow":   return Math.abs(b.netFlow15mUsd) - Math.abs(a.netFlow15mUsd);
      default:       return b.volume24hUsd - a.volume24hUsd;
    }
  });

  return (
    <div className="px-8 pb-10 max-w-[1100px] w-full pt-8">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-wide text-white">PERP MARKET ACTIVITY</h1>
          <div className="text-muted-foreground text-[11px] font-bold tracking-wider mt-1">
            LIVE FROM SODEX · 30S CACHE · {activity.length} MARKETS
          </div>
        </div>
        <div className="text-muted-foreground text-[10px] font-mono">
          {fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : "—"}
        </div>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-6 gap-0 mb-5 border border-border bg-card">
          <SumTile label="24H VOLUME" value={fmtUsd(summary.totalVolume24hUsd)} accent />
          <SumTile label="OPEN INTEREST" value={fmtUsd(summary.totalOpenInterestUsd)} />
          <SumTile label="HOTTEST" value={summary.hottestSymbol} accent />
          <SumTile label="TOP GAINER" value={`${summary.topGainer.symbol} ${summary.topGainer.changePct >= 0 ? "+" : ""}${summary.topGainer.changePct.toFixed(2)}%`} positive />
          <SumTile label="TOP LOSER" value={`${summary.topLoser.symbol} ${summary.topLoser.changePct.toFixed(2)}%`} negative />
          <SumTile label="15M NET FLOW" value={fmtUsd(summary.netFlow15mUsd)} positive={summary.netFlow15mUsd >= 0} negative={summary.netFlow15mUsd < 0} />
        </div>
      )}

      {/* Sentiment bar */}
      {summary && (
        <div className="border border-border bg-card p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold tracking-widest text-muted-foreground">24H MARKET SENTIMENT</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              <span className="text-accent">{summary.bullishCount} bullish</span> / <span className="text-destructive">{summary.bearishCount} bearish</span>
            </span>
          </div>
          <div className="h-2 bg-border flex overflow-hidden">
            <div className="bg-accent h-full" style={{ width: `${(summary.bullishCount / (summary.bullishCount + summary.bearishCount || 1)) * 100}%` }} />
            <div className="bg-destructive h-full" style={{ width: `${(summary.bearishCount / (summary.bullishCount + summary.bearishCount || 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Sort tabs */}
      <div className="flex gap-2 mb-3">
        {(["volume","change","fills","oi","flow"] as const).map(k => (
          <button
            key={k}
            onClick={() => setSortBy(k)}
            className={`px-3 py-1.5 text-[10px] font-extrabold tracking-wider border transition-colors ${
              sortBy === k ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground hover:text-white hover:border-white/40"
            }`}
          >
            SORT: {k.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Market table */}
      <div className="border border-border bg-card">
        <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_1fr_0.8fr_1fr_1fr] gap-2 px-4 py-3 border-b border-border text-[9px] font-extrabold tracking-widest text-muted-foreground">
          <div>MARKET</div>
          <div className="text-right">MARK PRICE</div>
          <div className="text-right">24H</div>
          <div className="text-right">VOLUME 24H</div>
          <div className="text-right">OPEN INTEREST</div>
          <div className="text-right">FUNDING</div>
          <div className="text-right">15M FILLS · BUY %</div>
          <div className="text-right">15M NET FLOW</div>
        </div>
        {loading && activity.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-xs tracking-wider font-bold">LOADING…</div>
        ) : (
          sorted.map(m => {
            const up = m.changePct24h >= 0;
            const buyDom = m.buyRatio15m >= 0.5;
            const flowUp = m.netFlow15mUsd >= 0;
            const fundPos = m.fundingRate >= 0;
            return (
              <div key={m.symbol} className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_1fr_0.8fr_1fr_1fr] gap-2 px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-background/40 transition-colors items-center">
                <div className="font-black text-xs text-white tracking-wide">{m.displaySymbol}<span className="text-muted-foreground font-bold">-USD</span></div>
                <div className="text-right font-mono text-xs text-white">${fmtPrice(m.markPrice)}</div>
                <div className={`text-right font-mono text-xs font-bold ${up ? "text-accent" : "text-destructive"}`}>
                  {up ? "+" : ""}{m.changePct24h.toFixed(2)}%
                </div>
                <div className="text-right font-mono text-xs text-white/90">{fmtUsd(m.volume24hUsd)}</div>
                <div className="text-right font-mono text-xs text-white/90">{fmtUsd(m.openInterestUsd)}</div>
                <div className={`text-right font-mono text-[11px] ${fundPos ? "text-accent/80" : "text-destructive/80"}`}>
                  {(m.fundingRate * 100).toFixed(4)}%
                </div>
                <div className="text-right font-mono text-[11px]">
                  <span className="text-white/70">{m.fillCount15m}</span>
                  <span className={`ml-1.5 font-bold ${buyDom ? "text-accent" : "text-destructive"}`}>
                    {(m.buyRatio15m * 100).toFixed(0)}%
                  </span>
                </div>
                <div className={`text-right font-mono text-xs font-bold ${flowUp ? "text-accent" : "text-destructive"}`}>
                  {flowUp ? "+" : ""}{fmtUsd(m.netFlow15mUsd)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SumTile({ label, value, accent, positive, negative }: { label: string; value: string; accent?: boolean; positive?: boolean; negative?: boolean }) {
  const color = accent ? "text-accent" : positive ? "text-accent" : negative ? "text-destructive" : "text-white";
  return (
    <div className="border-r border-border last:border-r-0 px-4 py-3.5">
      <div className="text-muted-foreground text-[9px] font-extrabold tracking-widest mb-1.5">{label}</div>
      <div className={`font-black font-mono text-sm tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
