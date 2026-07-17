import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchJson } from "@/lib/api";

type Candidate = {
  walletAddress: string;
  accountId?: number;
  displayName: string | null;
  score: number;
  grade: string;
  confidence: number;
  totalPnlUsd: number;
  winRate: number;
  tradeCount: number;
  avgLeverage: number;
  maxDrawdownUsd: number;
  bestSymbol: string | null;
  volumeUsd?: number;
  reason: string;
};

export default function Wallets() {
  const [, navigate] = useLocation();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const j = await fetchJson<{ candidates?: Candidate[] }>("/api/wallets/rankings/copy?limit=75");
        if (!cancelled) {
          setCandidates(j.candidates ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setCandidates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="px-8 pb-10 max-w-[1200px] w-full pt-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-wide text-white">LIVE SODEX LEADERBOARD</h1>
          <div className="text-muted-foreground text-[11px] font-bold tracking-wider mt-1">Fetched live from SoDEX. Open a wallet to run immediate scoring and readable trade analysis.</div>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">{candidates.length} WALLETS</div>
      </div>

      <div className="border border-border bg-card">
        <div className="grid grid-cols-[70px_1fr_120px_120px_120px] gap-3 px-4 py-3 border-b border-border text-[9px] font-black tracking-widest text-muted-foreground">
          <div>RANK</div>
          <div>WALLET</div>
          <div>PNL</div>
          <div>VOLUME</div>
          <div>ANALYSIS</div>
        </div>
        {loading ? (
          <div className="p-8 text-muted-foreground text-sm">Loading candidates...</div>
        ) : error ? (
          <div className="p-8 text-destructive text-sm font-bold">{error}</div>
        ) : (
          <div className="divide-y divide-border">
            {candidates.map((w, index) => (
              <button
                key={w.walletAddress}
                onClick={() => navigate(`/wallets/${w.walletAddress}?accountId=${w.accountId ?? ""}`)}
                className="grid grid-cols-[70px_1fr_120px_120px_120px] gap-3 px-4 py-4 text-left items-center hover:bg-background/50 transition-colors w-full"
              >
                <div className="text-white font-black font-mono">#{index + 1}</div>
                <div className="min-w-0">
                  <div className="text-white font-black truncate">{w.displayName ?? `${w.walletAddress.slice(0, 8)}...${w.walletAddress.slice(-6)}`}</div>
                  <div className="text-muted-foreground text-[10px] font-mono truncate">{w.reason}</div>
                </div>
                <div className={`font-mono text-sm ${w.totalPnlUsd >= 0 ? "text-accent" : "text-destructive"}`}>${w.totalPnlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="font-mono text-white text-sm">${Number(w.volumeUsd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="text-[10px] font-black tracking-widest text-accent">RUN LIVE</div>
              </button>
            ))}
            {candidates.length === 0 && <div className="p-10 text-center text-muted-foreground text-sm">No SoDEX leaderboard wallets returned for this window.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
