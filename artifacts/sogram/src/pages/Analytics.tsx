import { useGetAnalyticsSummary, useGetWhaleActivity } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

function fmtNum(n: number) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

export default function Analytics() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary({ query: { queryKey: ["analyticsSummary"] } });
  const { data: whalesData, isLoading: isLoadingWhales } = useGetWhaleActivity({ query: { queryKey: ["whaleActivity"] } });

  const macroStats = summary ? [
    { label: "TOTAL TRADERS", value: summary.totalTraders.toString(), note: "ACTIVE ON PLATFORM", direction: "up" as const },
    { label: "AVG WIN RATE", value: `${summary.avgWinRate.toFixed(1)}%`, note: "PLATFORM AVERAGE", direction: "up" as const },
    { label: "TOTAL TRADES", value: summary.totalTrades.toLocaleString(), note: "ALL TIME", direction: null },
    { label: "TOTAL PNL", value: fmtNum(Number(summary.totalPnl)), note: "NET REALIZED", direction: Number(summary.totalPnl) >= 0 ? "up" as const : "down" as const },
  ] : [];

  return (
    <div className="px-8 pb-10 max-w-[1100px] w-full pt-8">
      {isLoadingSummary ? (
        <Skeleton className="h-24 w-full mb-5" />
      ) : (
        <div className="grid grid-cols-4 gap-0 mb-5 border border-border bg-card">
          {macroStats.map((s, i) => (
            <div key={s.label} className={`p-5 ${i < 3 ? "border-r border-border" : ""}`}>
              <div className="text-muted-foreground text-[9px] font-extrabold tracking-widest mb-3 uppercase">{s.label}</div>
              <div className={`text-3xl font-black font-mono tracking-tighter mb-1 ${
                s.direction === "up" ? "text-accent" : s.direction === "down" ? "text-destructive" : "text-white"
              }`}>{s.value}</div>
              <div className="text-muted-foreground text-[10px] font-bold tracking-wider">{s.note}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-border p-6 bg-card">
          <div className="font-black text-[13px] tracking-wider text-white mb-1">CROWD POSITIONS</div>
          <div className="text-muted-foreground text-[11px] mb-5 uppercase tracking-wider">BY OPEN INTEREST · {summary?.totalTraders ?? "—"} TRADERS</div>

          {isLoadingSummary ? (
            <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="flex flex-col gap-4">
              {summary?.pairAnalytics?.map(row => (
                <div key={row.pair}>
                  <div className="flex justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-extrabold text-xs tracking-wide text-white">{row.pair}</span>
                      <span className="text-muted-foreground text-[11px] font-mono">{fmtNum(Number(row.volume))}</span>
                    </div>
                    <div className="flex gap-2.5 items-center">
                      <span className="text-accent text-[11px] font-mono font-bold">{row.longPct}%L</span>
                      <span className="text-destructive text-[11px] font-mono font-bold">{row.shortPct}%S</span>
                    </div>
                  </div>
                  <div className="h-[3px] flex overflow-hidden bg-border">
                    <div className="bg-accent/70" style={{ width: `${row.longPct}%` }} />
                    <div className="bg-destructive/50 flex-1" />
                  </div>
                </div>
              ))}
              {(!summary?.pairAnalytics || summary.pairAnalytics.length === 0) && (
                <div className="text-muted-foreground text-sm font-bold tracking-wider text-center py-6">NO DATA</div>
              )}
            </div>
          )}
        </div>

        <div className="border border-border p-6 bg-card flex flex-col">
          <div className="font-black text-[13px] tracking-wider text-white mb-1">PLATFORM STATS</div>
          <div className="text-muted-foreground text-[11px] mb-6 tracking-wider">AGGREGATE PERFORMANCE METRICS</div>

          {isLoadingSummary ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="flex flex-col gap-4 flex-1">
              {[
                ["TOTAL VOLUME", fmtNum(Number(summary?.totalVolume ?? 0))],
                ["TOTAL TRADERS", (summary?.totalTraders ?? 0).toString()],
                ["AVG REP SCORE", (summary?.avgRepScore ?? 0).toFixed(1)],
                ["AVG WIN RATE", `${(summary?.avgWinRate ?? 0).toFixed(1)}%`],
                ["TOTAL TRADES", (summary?.totalTrades ?? 0).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <span className="text-muted-foreground text-[11px] font-extrabold tracking-wider">{label}</span>
                  <span className="text-white font-black text-[15px] font-mono">{value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border">
            <div className="font-black text-xs tracking-wider text-white mb-3">TOP TRADERS BY PNL</div>
            {summary?.topTraders?.slice(0, 3).map((t, i) => (
              <div key={t.id} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[10px] font-mono w-4">{i + 1}</span>
                  <span className="text-white text-xs font-bold tracking-wide">{t.username}</span>
                  <span className="border border-accent/50 text-accent text-[8px] px-1.5 font-black tracking-wider">{t.tier}</span>
                </div>
                <span className="text-accent text-xs font-black font-mono">{fmtNum(Number(t.totalPnlUsd))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-border p-6 bg-card">
        <div className="flex justify-between items-center mb-5">
          <div>
            <div className="font-black text-[13px] tracking-wider text-white mb-1">WHALE ACTIVITY</div>
            <div className="text-muted-foreground text-[11px] tracking-wider uppercase">LARGE POSITIONS IN LAST 24H</div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-accent text-[10px] font-extrabold tracking-widest">LIVE</span>
          </div>
        </div>

        {isLoadingWhales ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {whalesData?.whales?.slice(0, 8).map((w, i) => (
              <div key={i} className="border border-border p-3.5 flex items-center gap-3.5 bg-background" data-testid={`whale-${i}`}>
                <div className="w-9 h-9 border-[1.5px] border-border flex items-center justify-center text-xs font-black text-muted-foreground shrink-0">
                  {w.traderUsername.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-extrabold text-xs tracking-wide text-white">{w.traderUsername}</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 tracking-wider border ${
                      w.side === "LONG" ? "border-accent/60 text-accent" : "border-destructive/60 text-destructive"
                    }`}>{w.side} {w.leverage}×</span>
                    <span className="font-bold text-xs text-muted-foreground font-mono">{w.pair}</span>
                  </div>
                  <div className="text-muted-foreground text-[10px] font-bold">
                    {fmtNum(Number(w.positionSizeUsd))} · {w.timeAgo}
                  </div>
                </div>
                <button className="bg-transparent border border-accent/50 text-accent px-3 py-1.5 text-[10px] font-extrabold cursor-pointer tracking-wider hover:bg-accent hover:text-background transition-colors">
                  COPY →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
