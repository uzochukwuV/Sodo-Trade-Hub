import { useParams } from "wouter";
import {
  useGetTrader,
  useGetTraderTrades,
  getGetTraderQueryKey,
  getGetTraderTradesQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";

function StatBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="border border-border p-4 flex-1 bg-card">
      <div className="text-muted-foreground text-[10px] font-extrabold tracking-wider mb-2.5">{label}</div>
      <div className={`text-[26px] font-black font-mono tracking-tighter ${accent ? "text-accent" : "text-white"}`}>{value}</div>
      {sub && <div className="text-muted-foreground text-[11px] mt-1">{sub}</div>}
    </div>
  );
}

function RepCircle({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = (score / 100) * 0.75;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={90} height={90} viewBox="0 0 90 90">
        <circle cx={45} cy={45} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={4}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 45 45)" />
        <circle cx={45} cy={45} r={r} fill="none" stroke="hsl(var(--accent))" strokeWidth={4}
          strokeDasharray={`${circ * pct} ${circ}`}
          strokeDashoffset={-circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 45 45)" />
        <text x={45} y={47} textAnchor="middle" fill="hsl(var(--accent))" fontSize={22} fontWeight={900} fontFamily="JetBrains Mono">{score.toFixed(0)}</text>
        <text x={45} y={61} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8} fontWeight={700} letterSpacing={1}>REP</text>
      </svg>
      <span className="text-muted-foreground text-[10px] font-extrabold tracking-wider">{score >= 90 ? "DIAMOND" : score >= 75 ? "GOLD" : "SILVER"} TIER</span>
    </div>
  );
}

function fmtPnl(usd: string) {
  const n = Number(usd);
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

export default function TraderProfile() {
  const params = useParams();
  const id = parseInt(params.id || "1", 10);

  const { data: trader, isLoading: isLoadingTrader } = useGetTrader(id, {
    query: { enabled: !!id, queryKey: getGetTraderQueryKey(id) },
  });
  const { data: tradesData, isLoading: isLoadingTrades } = useGetTraderTrades(id, {}, {
    query: { enabled: !!id, queryKey: getGetTraderTradesQueryKey(id) },
  });

  if (isLoadingTrader) return (
    <div className="p-8 max-w-[1000px] w-full">
      <Skeleton className="h-48 w-full mb-5" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
  if (!trader) return <div className="p-8 text-white font-bold tracking-wider">TRADER NOT FOUND.</div>;

  const trades = tradesData?.trades ?? [];
  const chartData = trades.slice().reverse().reduce<{ index: number; value: number }[]>((acc, t) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
    acc.push({ index: acc.length, value: prev + Number(t.pnlUsd) });
    return acc;
  }, []);

  return (
    <div className="px-8 pb-10 max-w-[1000px] w-full pt-8">
      <div className="border border-border p-7 mb-5 bg-card">
        <div className="flex items-start gap-6 mb-7">
          <div className="w-16 h-16 rounded-full border-2 border-accent flex items-center justify-center text-[22px] font-black text-accent shrink-0">
            {trader.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <span className="text-2xl font-black tracking-wide text-white">{trader.username}</span>
              <span className="bg-accent text-background text-[9px] px-2 py-0.5 font-black tracking-wider">VERIFIED</span>
              <span className="border border-border text-muted-foreground text-[9px] px-2 py-0.5 font-extrabold tracking-wider">{trader.tier}</span>
            </div>
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-3 max-w-md">
              {trader.bio || "No bio provided."}
            </p>
            <div className="flex gap-6 text-xs">
              {[
                [trader.followerCount.toLocaleString(), "FOLLOWERS"],
                [trader.tradeCount.toLocaleString(), "TRADES"],
              ].map(([v, l]) => (
                <div key={l}>
                  <span className="text-white font-black font-mono mr-1.5">{v}</span>
                  <span className="text-muted-foreground font-bold tracking-wider">{l}</span>
                </div>
              ))}
            </div>
          </div>
          <RepCircle score={Number(trader.repScore)} />
          <div className="flex flex-col gap-2 ml-4">
            <button
              data-testid="button-copy-trade"
              className="bg-accent text-background border-none px-6 py-2.5 font-black text-xs tracking-wider cursor-pointer hover:bg-accent/90 transition-colors"
            >
              COPY TRADE
            </button>
            <button className="bg-transparent text-muted-foreground border border-border px-6 py-2.5 font-bold text-xs tracking-wider cursor-pointer hover:text-white transition-colors">
              FOLLOW
            </button>
          </div>
        </div>

        <div className="flex gap-0">
          <StatBox label="TOTAL PNL" value={fmtPnl(trader.totalPnlUsd)} sub="Net realized" accent />
          <StatBox label="WIN RATE" value={`${Number(trader.winRate).toFixed(1)}%`} sub="All trades" accent />
          <StatBox label="REP SCORE" value={Number(trader.repScore).toFixed(1)} sub="Platform score" />
          <StatBox label="TRADES" value={trader.tradeCount.toLocaleString()} sub="All time" />
          <StatBox label="FOLLOWERS" value={trader.followerCount.toLocaleString()} sub="On platform" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border border-border p-6 bg-card flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <span className="font-black text-sm tracking-wide text-white">PNL CURVE</span>
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider">CUMULATIVE</span>
          </div>

          {isLoadingTrades ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 0 }}
                    itemStyle={{ color: "hsl(var(--accent))", fontFamily: "JetBrains Mono", fontSize: 11 }}
                    formatter={(v: number) => ["$" + v.toLocaleString(), "PNL"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={1.5} fillOpacity={1} fill="url(#pnlGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex gap-6 pt-4 border-t border-border mt-4">
            <div>
              <div className="text-muted-foreground text-[10px] font-extrabold tracking-wider mb-1.5">TOTAL RETURN</div>
              <div className="text-accent text-2xl font-black font-mono">{fmtPnl(trader.totalPnlUsd)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] font-extrabold tracking-wider mb-1.5">WIN RATE</div>
              <div className="text-white text-2xl font-black font-mono">{Number(trader.winRate).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className="border border-border p-6 bg-card">
          <div className="font-black text-sm tracking-wide text-white mb-5">RECENT TRADES</div>
          {isLoadingTrades ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="flex flex-col">
              {trades.slice(0, 8).map((t, i) => {
                const isLong = t.side === "LONG";
                const isWin = Number(t.pnlUsd) >= 0;
                return (
                  <div
                    key={`trade-row-${t.id}`}
                    className={`flex items-center gap-3 py-2.5 ${i < trades.slice(0, 8).length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isWin ? "bg-accent" : "bg-destructive"}`} />
                    <span className="font-bold text-xs flex-1 tracking-wide text-white">{t.asset}</span>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 tracking-wider border ${
                      isLong ? "border-accent/50 text-accent" : "border-destructive/50 text-destructive"
                    }`}>{t.side}</span>
                    <span className={`text-[13px] font-mono font-bold ${isWin ? "text-accent" : "text-destructive"}`}>
                      {isWin ? "+" : ""}${Math.abs(Number(t.pnlUsd)).toLocaleString()}
                    </span>
                    <span className={`text-[11px] font-mono ${isWin ? "text-accent" : "text-destructive"}`}>
                      {isWin ? "+" : ""}{Number(t.pnlPct).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
              {trades.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm tracking-wider font-bold">NO TRADES YET</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
