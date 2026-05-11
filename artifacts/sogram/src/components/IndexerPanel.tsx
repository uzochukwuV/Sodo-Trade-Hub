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

type Discovered = {
  id: number;
  username: string;
  handle: string;
  walletAddress: string | null;
  tier: string;
  repScore: string;
  onchainTxCount: number;
  onchainSuccessRate: string;
  contractsTouched: number;
  bio: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function IndexerPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [running, setRunning] = useState(false);

  async function load() {
    const [s, d] = await Promise.all([
      fetch("/api/indexer/status").then(r => r.json()),
      fetch("/api/indexer/discovered?limit=12").then(r => r.json()),
    ]);
    setStatus(s);
    setDiscovered(d.traders ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/indexer/run", { method: "POST" });
      await load();
      qc.invalidateQueries();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-black text-sm tracking-wide text-white">ON-CHAIN INDEXER</div>
          <div className="text-muted-foreground text-[10px] font-bold tracking-wider mt-0.5">
            AUTO-DISCOVERS REAL SODEX TRADERS FROM VALUECHAIN BLOCKS
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider">
            <span className={`w-1.5 h-1.5 rounded-full ${status?.isRunning ? "bg-accent animate-pulse" : "bg-green-400"}`} />
            <span className={status?.isRunning ? "text-accent" : "text-green-400"}>
              {status?.isRunning ? "SCANNING" : "IDLE"}
            </span>
          </span>
          <button
            onClick={runNow}
            disabled={running || status?.isRunning}
            className="px-3 py-1.5 text-[10px] font-extrabold tracking-wider border border-accent text-accent hover:bg-accent hover:text-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {running ? "RUNNING…" : "RUN NOW"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5 pb-5 border-b border-border">
        <Stat label="LAST BLOCK" value={status?.lastBlock?.toLocaleString() ?? "—"} mono accent />
        <Stat label="DISCOVERED" value={status?.totalAutoDiscovered?.toString() ?? "0"} mono accent />
        <Stat label="THIS RUN" value={status?.walletsDiscovered?.toString() ?? "0"} mono />
        <Stat label="LAST RUN" value={timeAgo(status?.lastRunAt ?? null)} />
      </div>

      <div className="font-extrabold text-[11px] tracking-widest text-muted-foreground mb-3">
        RECENTLY DISCOVERED · TOP {discovered.length}
      </div>
      {discovered.length === 0 ? (
        <div className="text-muted-foreground text-xs text-center py-8 tracking-wider font-bold">
          NO DISCOVERIES YET — TRIGGER A SCAN ABOVE
        </div>
      ) : (
        <div className="space-y-2">
          {discovered.map(t => (
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
                  {t.walletAddress && <WalletBadge address={t.walletAddress} compact />}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-accent font-black font-mono text-xs">{Number(t.repScore).toFixed(1)}</div>
                <div className="text-muted-foreground text-[8px] font-bold tracking-wider">REP</div>
              </div>
              <div className="text-right shrink-0 w-16">
                <div className="text-white font-black font-mono text-xs">{t.onchainTxCount.toLocaleString()}</div>
                <div className="text-muted-foreground text-[8px] font-bold tracking-wider">TXS</div>
              </div>
              <div className="text-right shrink-0 w-14">
                <div className="text-green-400 font-black font-mono text-xs">{Number(t.onchainSuccessRate).toFixed(0)}%</div>
                <div className="text-muted-foreground text-[8px] font-bold tracking-wider">OK</div>
              </div>
            </div>
          ))}
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
