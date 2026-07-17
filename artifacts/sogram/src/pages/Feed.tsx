import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api";

type HighImpactTrade = {
  id: string;
  walletAddress: string;
  accountId: number;
  rank: number;
  windowType: string;
  leaderboardPnlUsd: number;
  symbol: string;
  side: string;
  leverage: number;
  pnlUsd: number;
  pnlPct: number | null;
  notionalUsd: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  openedAt: string | null;
  closedAt: string | null;
  sodexPositionId: string;
  impact: "profit" | "loss";
};

type HighImpactResponse = {
  items: HighImpactTrade[];
  total: number;
  scannedWallets: number;
  thresholds: {
    minProfitUsd: number;
    minLossUsd: number;
  };
  window: string;
};

const FEED_URL = "/api/feed/high-impact?window=7D&leaderboardSize=20&limit=30&minProfitUsd=500&minLossUsd=500";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function thresholdMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "$0";
  return `$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function numberFmt(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "UNKNOWN";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-[10px] font-black tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className="text-2xl font-black text-white font-mono tracking-tight">{value}</div>
    </div>
  );
}

function TradeCard({ trade }: { trade: HighImpactTrade }) {
  const isProfit = trade.impact === "profit";
  const walletHref = `/wallets/${trade.walletAddress}?accountId=${trade.accountId}`;

  return (
    <Link href={walletHref} className="block">
      <div className={`border p-5 bg-card hover:bg-card/80 transition-colors ${
        isProfit ? "border-accent/35" : "border-destructive/35"
      }`}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-[10px] font-black tracking-widest px-2 py-1 border ${
                isProfit ? "text-accent border-accent/60 bg-accent/5" : "text-destructive border-destructive/60 bg-destructive/5"
              }`}>
                {isProfit ? "GOOD PROFIT" : "BAD LOSS"}
              </span>
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">RANK #{trade.rank}</span>
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{timeAgo(trade.closedAt)}</span>
            </div>
            <div className="text-white text-lg font-black tracking-wide">{trade.symbol}</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {shortAddress(trade.walletAddress)} / ACCOUNT {trade.accountId}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-black font-mono tracking-tight ${
              isProfit ? "text-accent" : "text-destructive"
            }`}>
              {money(trade.pnlUsd)}
            </div>
            <div className={`text-sm font-bold font-mono ${isProfit ? "text-accent/80" : "text-destructive/80"}`}>
              {trade.pnlPct === null ? "-" : `${trade.pnlPct > 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["SIDE", trade.side],
            ["LEVERAGE", `${trade.leverage}x`],
            ["NOTIONAL", money(trade.notionalUsd)],
            ["ENTRY", numberFmt(trade.entryPrice)],
            ["EXIT", numberFmt(trade.exitPrice)],
          ].map(([label, value]) => (
            <div key={label} className="border border-border/60 p-3 bg-background/40">
              <div className="text-[9px] font-black tracking-widest text-muted-foreground mb-1">{label}</div>
              <div className="text-sm text-white font-bold font-mono">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-bold tracking-widest text-muted-foreground">
          <span>SODEX POSITION {trade.sodexPositionId}</span>
          <span className="text-white">VIEW WALLET</span>
        </div>
      </div>
    </Link>
  );
}

export default function Feed() {
  const [data, setData] = useState<HighImpactResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchJson<HighImpactResponse>(FEED_URL);
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    const winners = items.filter(item => item.impact === "profit");
    const losses = items.filter(item => item.impact === "loss");
    const net = items.reduce((sum, item) => sum + item.pnlUsd, 0);
    return { winners: winners.length, losses: losses.length, net };
  }, [data]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl">
      <div className="mb-8">
        <div className="text-[10px] font-black tracking-[0.28em] text-accent mb-3">LIVE SODEX FEED</div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-3">
          High-impact trades only.
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          Recent closed positions from leaderboard wallets, filtered to large profits and large losses.
          Use this feed to find wallets worth reviewing, not to browse noise.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="TRADES SHOWN" value={String(data?.items.length ?? 0)} />
        <StatCard label="WINNERS" value={String(stats.winners)} />
        <StatCard label="LOSSES" value={String(stats.losses)} />
        <StatCard label="NET PNL" value={money(stats.net)} />
      </div>

      <div className="flex items-center justify-between gap-4 border-y border-border py-3 mb-5">
        <div className="text-[10px] font-black tracking-widest text-muted-foreground">
          WINDOW {data?.window ?? "7D"} / SCANNED {data?.scannedWallets ?? 0} WALLETS
        </div>
        <div className="text-[10px] font-black tracking-widest text-muted-foreground">
          FILTER +{thresholdMoney(data?.thresholds.minProfitUsd ?? 500)} / -{thresholdMoney(data?.thresholds.minLossUsd ?? 500)}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : error ? (
        <div className="border border-destructive/40 bg-destructive/5 p-5 text-destructive text-sm font-bold">
          {error}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="border border-border bg-card p-8 text-center">
          <div className="text-white font-black text-lg mb-2">No high-impact trades returned.</div>
          <p className="text-muted-foreground text-sm">
            SoDEX may not be returning position history for current leaderboard wallets, or the threshold is too strict.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.items.map(trade => <TradeCard key={trade.id} trade={trade} />)}
        </div>
      )}
    </div>
  );
}
