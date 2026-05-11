import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WalletBadge } from "./WalletBadge";

type Status = {
  lastBlock: number;
  walletsDiscovered: number;
  lastRunAt: string | null;
  isRunning: boolean;
  lastError: string | null;
  totalAutoDiscovered: number;
};

type Tracked = {
  id: number;
  username: string;
  handle: string;
  walletAddress: string | null;
  tier: string;
  repScore: string;
  totalPnlUsd: string;
  winRate: string;
  tradeCount: number;
  volumeUsd: string;
  avgLeverage: string;
  leaderboardRank: number | null;
  leaderboardWindow: string | null;
  contractsTouched: number;
  bio: string | null;
  lastSyncedAt: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtUsd(s: string | number) {
  const n = typeof s === "string" ? Number(s) : s;
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

export function IndexerPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [running, setRunning] = useState(false);

  async function load() {
    const [s, d] = await Promise.all([
      fetch("/api/indexer/status").then(r => r.json()),
      fetch("/api/indexer/discovered?limit=12").then(r => r.json()),
    ]);
    setStatus(s);
    setTracked(d.traders ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/indexer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ window: "ALL_TIME", pageSize: 50 }),
      });
      await load();
      qc.invalidateQueries();
    } finally {
      setRunning(false);
    }
  }

  async function pollNow() {
    await fetch("/api/indexer/poll", { method: "POST" });
    await load();
    qc.invalidateQueries();
  }

  return (
    <div className="border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-black text-sm tracking-wide text-white">SODEX LEADERBOARD TRACKER</div>
          <div className="text-muted-foreground text-[10px] font-bold tracking-wider mt-0.5">
            AUTO-IMPORTS TOP TRADERS · POLLS POSITIONS EVERY 60S FOR LIVE SIGNALS
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider">
            <span className={`w-1.5 h-1.5 rounded-full ${status?.isRunning ? "bg-accent animate-pulse" : "bg-green-400"}`} />
            <span className={status?.isRunning ? "text-accent" : "text-green-400"}>
              {status?.isRunning ? "TRACKING" : "IDLE"}
            </span>
          </span>
          <button
            onClick={pollNow}
            className="px-3 py-1.5 text-[10px] font-extrabold tracking-wider border border-border text-muted-foreground hover:text-white hover:border-white/40 transition-colors"
          >
            POLL POSITIONS
          </button>
          <button
            onClick={runNow}
            disabled={running || status?.isRunning}
            className="px-3 py-1.5 text-[10px] font-extrabold tracking-wider border border-accent text-accent hover:bg-accent hover:text-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {running ? "SYNCING…" : "SYNC LEADERBOARD"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5 pb-5 border-b border-border">
        <Stat label="TRACKED TRADERS" value={status?.totalAutoDiscovered?.toString() ?? "0"} mono accent />
        <Stat label="LAST IMPORTED" value={status?.walletsDiscovered?.toString() ?? "0"} mono />
        <Stat label="LAST SYNC" value={timeAgo(status?.lastRunAt ?? null)} />
        <Stat label="STATUS" value={status?.lastError ? "ERROR" : "OK"} accent={!status?.lastError} />
      </div>

      <div className="font-extrabold text-[11px] tracking-widest text-muted-foreground mb-3">
        TRACKED · TOP {tracked.length} BY REALIZED PNL
      </div>
      {tracked.length === 0 ? (
        <div className="text-muted-foreground text-xs text-center py-8 tracking-wider font-bold">
          NO TRADERS TRACKED YET — TRIGGER A SYNC ABOVE
        </div>
      ) : (
        <div className="space-y-2">
          {tracked.map(t => {
            const pnl = Number(t.totalPnlUsd);
            const pnlPositive = pnl >= 0;
            return (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border border-border/60 bg-background hover:border-accent/30 transition-colors">
                <div className="w-8 h-8 rounded-full border-[1.5px] border-border flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                  {t.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-extrabold text-xs tracking-wide">{t.username}</span>
                    <span className={`border text-[8px] px-1.5 py-0.5 font-black tracking-wider ${
                      t.tier === "DIAMOND" ? "border-accent text-accent" :
                      t.tier === "GOLD" ? "border-yellow-400/60 text-yellow-400" :
                      t.tier === "SILVER" ? "border-white/30 text-white/70" :
                      "border-border text-muted-foreground"
                    }`}>{t.tier}</span>
                    {t.leaderboardRank && (
                      <span className="border border-accent/40 text-accent text-[8px] px-1.5 py-0.5 font-black tracking-wider">
                        #{t.leaderboardRank} {t.leaderboardWindow}
                      </span>
                    )}
                    {t.walletAddress && <WalletBadge address={t.walletAddress} compact />}
                  </div>
                  <div className="text-muted-foreground text-[9px] font-mono mt-0.5">
                    {t.tradeCount} closed · {t.contractsTouched} symbols · {Number(t.avgLeverage).toFixed(0)}x avg lev · synced {timeAgo(t.lastSyncedAt)}
                  </div>
                </div>
                <div className="text-right shrink-0 w-20">
                  <div className={`font-black font-mono text-xs ${pnlPositive ? "text-accent" : "text-destructive"}`}>
                    {pnlPositive ? "+" : ""}{fmtUsd(pnl)}
                  </div>
                  <div className="text-muted-foreground text-[8px] font-bold tracking-wider">REALIZED PNL</div>
                </div>
                <div className="text-right shrink-0 w-14">
                  <div className="text-white font-black font-mono text-xs">{Number(t.winRate).toFixed(0)}%</div>
                  <div className="text-muted-foreground text-[8px] font-bold tracking-wider">WIN RATE</div>
                </div>
                <div className="text-right shrink-0 w-16">
                  <div className="text-white font-black font-mono text-xs">{fmtUsd(t.volumeUsd)}</div>
                  <div className="text-muted-foreground text-[8px] font-bold tracking-wider">VOLUME</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-[9px] font-extrabold tracking-widest mb-1">{label}</div>
      <div className={`font-black ${mono ? "font-mono" : ""} text-base ${accent ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
