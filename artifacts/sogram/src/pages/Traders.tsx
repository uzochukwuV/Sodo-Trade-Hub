import { useState } from "react";
import { useListTraders } from "@workspace/api-client-react";
import { useLocation } from "wouter";

import { WalletBadge } from "@/components/WalletBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

function fmtPnl(usd: string) {
  const n = Number(usd);
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

type SortKey = "repScore" | "winRate" | "totalPnlUsd" | "tradeCount" | "followerCount";

export default function Traders() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("repScore");

  const { data: tradersData, isLoading } = useListTraders(
    { limit: 50 },
    { query: { queryKey: ["traders", search] } }
  );

  const allTraders = (tradersData?.traders ?? []).filter(t =>
    !search || t.username.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...allTraders].sort((a, b) => {
    if (sortBy === "repScore") return Number(b.repScore) - Number(a.repScore);
    if (sortBy === "winRate") return Number(b.winRate) - Number(a.winRate);
    if (sortBy === "totalPnlUsd") return Number(b.totalPnlUsd ?? 0) - Number(a.totalPnlUsd ?? 0);
    if (sortBy === "tradeCount") return (b.tradeCount ?? 0) - (a.tradeCount ?? 0);
    if (sortBy === "followerCount") return (b.followerCount ?? 0) - (a.followerCount ?? 0);
    return 0;
  });

  const sortOptions: [SortKey, string][] = [
    ["repScore", "REP"],
    ["totalPnlUsd", "PNL"],
    ["winRate", "WIN RATE"],
    ["tradeCount", "TRADES"],
    ["followerCount", "FOLLOWERS"],
  ];

  const [, navigate] = useLocation();

  return (
    <div className="px-8 pb-10 max-w-[1000px] w-full pt-8">
      <div className="mb-6 flex justify-between items-center gap-4">
        <h1 className="text-xl font-black tracking-wide text-white shrink-0">TRADERS DIRECTORY</h1>
        <Input
          data-testid="input-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH TRADERS..."
          className="max-w-[220px] h-8 text-xs font-bold tracking-wider bg-card border-border"
        />
        <div className="flex items-center gap-0 border border-border">
          {sortOptions.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1.5 text-[10px] font-extrabold tracking-wider cursor-pointer border-r border-border last:border-r-0 ${
                sortBy === key ? "bg-accent text-background" : "bg-transparent text-muted-foreground hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {sorted.map(trader => (
            <div
              key={trader.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/traders/${trader.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(`/traders/${trader.id}`); }}
              className="border border-border p-5 bg-card hover:border-accent/50 transition-colors cursor-pointer"
              data-testid={`card-trader-${trader.id}`}
            >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 rounded-full border-[1.5px] border-border flex items-center justify-center text-xs font-black text-muted-foreground">
                      {trader.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-extrabold text-sm tracking-wide">{trader.username}</span>
                        <span className={`border px-1.5 py-0.5 text-[8px] font-black tracking-wider ${
                          trader.tier === "DIAMOND" ? "border-accent text-accent" :
                          trader.tier === "GOLD" ? "border-yellow-400/60 text-yellow-400" :
                          "border-border text-muted-foreground"
                        }`}>
                          {trader.tier}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs font-mono">@{trader.handle}</div>
                      {(trader as any).walletAddress && (
                        <div className="mt-1.5"><WalletBadge address={(trader as any).walletAddress} compact /></div>
                      )}
                      {(trader as any).isAutoDiscovered && (
                        <span className="inline-block mt-1 bg-blue-500/15 text-blue-400 border border-blue-400/40 px-1.5 py-0.5 text-[8px] font-black tracking-wider">DISCOVERED</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-accent font-black text-lg font-mono tracking-tighter">{Number(trader.repScore).toFixed(1)}</div>
                    <div className="text-muted-foreground text-[8px] font-black tracking-widest mt-0.5">REP SCORE</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 border-t border-border pt-4">
                  <div>
                    <div className="text-muted-foreground text-[9px] font-bold tracking-wider mb-1">TOTAL PNL</div>
                    <div className="text-accent font-black text-sm font-mono">{fmtPnl(trader.totalPnlUsd ?? "0")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[9px] font-bold tracking-wider mb-1">WIN RATE</div>
                    <div className="text-white font-black text-sm font-mono">{Number(trader.winRate).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[9px] font-bold tracking-wider mb-1">TRADES</div>
                    <div className="text-white font-black text-sm font-mono">{trader.tradeCount ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[9px] font-bold tracking-wider mb-1">FOLLOWERS</div>
                    <div className="text-white font-black text-sm font-mono">{(trader.followerCount ?? 0).toLocaleString()}</div>
                  </div>
                </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className="col-span-2 text-center text-muted-foreground py-16 text-sm tracking-wider font-bold">
              NO TRADERS FOUND
            </div>
          )}
        </div>
      )}
    </div>
  );
}
