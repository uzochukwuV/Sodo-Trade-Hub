import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useSearch } from "wouter";
import {
  useGetTrader,
  useGetTraderTrades,
  useGetTraderReputation,
  useGetTraderFollowers,
  useFollowTrader,
  useUnfollowTrader,
  useListSignals,
  getGetTraderQueryKey,
  getGetTraderTradesQueryKey,
  getGetTraderReputationQueryKey,
  getListSignalsQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { WalletBadge } from "@/components/WalletBadge";
import { useMyId } from "@/hooks/useAuth";
import { useFeedStream } from "@/lib/sse";

function fmtPnl(usd: string) {
  const n = Number(usd);
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  trade_win:          { label: "TRADE WIN",        color: "text-accent" },
  trade_loss:         { label: "TRADE LOSS",        color: "text-destructive" },
  signal_hit:         { label: "SIGNAL HIT",        color: "text-accent" },
  signal_stopped:     { label: "SIGNAL STOPPED",    color: "text-destructive" },
  breakdown_given:    { label: "BREAKDOWN GIVEN",   color: "text-blue-400" },
  breakdown_helpful:  { label: "BREAKDOWN HELPFUL", color: "text-accent" },
  streak_extended:    { label: "STREAK EXTENDED",   color: "text-accent" },
  streak_broken:      { label: "STREAK BROKEN",     color: "text-destructive" },
  shield_earned:      { label: "SHIELD EARNED",     color: "text-yellow-400" },
  shield_used:        { label: "SHIELD USED",       color: "text-muted-foreground" },
};

function RepDimBar({ label, value, max = 100, color = "bg-accent" }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="text-[9px] font-extrabold tracking-wider text-muted-foreground w-[130px] shrink-0">{label}</div>
      <div className="flex-1 h-[3px] bg-border relative">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] font-mono font-bold text-white w-10 text-right">{value.toFixed(1)}{label.includes("STREAK") ? "d" : "%"}</div>
    </div>
  );
}

function StreakShields({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={`w-5 h-5 flex items-center justify-center text-[12px] ${i < count ? "text-yellow-400" : "text-border"}`}>
          ⬡
        </div>
      ))}
    </div>
  );
}

function StatBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="border border-border p-4 flex-1 bg-card">
      <div className="text-muted-foreground text-[10px] font-extrabold tracking-wider mb-2.5">{label}</div>
      <div className={`text-[26px] font-black font-mono tracking-tighter ${accent ? "text-accent" : "text-white"}`}>{value}</div>
      {sub && <div className="text-muted-foreground text-[11px] mt-1">{sub}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    DIAMOND: "bg-accent text-background",
    GOLD: "border border-yellow-500/50 text-yellow-400",
    SILVER: "border border-border text-muted-foreground",
    BRONZE: "border border-orange-800/50 text-orange-600",
  };
  return (
    <span className={`text-[9px] px-2 py-0.5 font-black tracking-wider ${styles[tier] ?? styles.BRONZE}`}>{tier}</span>
  );
}

function RepScoreRing({ score, tier }: { score: number; tier: string }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = (score / 100) * 0.75;
  const tierColor = tier === "DIAMOND" || tier === "GOLD" ? "hsl(var(--accent))" : tier === "SILVER" ? "#888" : "#a05020";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={90} height={90} viewBox="0 0 90 90">
        <circle cx={45} cy={45} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={4}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={circ * 0.125}
          strokeLinecap="round" transform="rotate(135 45 45)" />
        <circle cx={45} cy={45} r={r} fill="none" stroke={tierColor} strokeWidth={4}
          strokeDasharray={`${circ * pct} ${circ}`} strokeDashoffset={-circ * 0.125}
          strokeLinecap="round" transform="rotate(135 45 45)" />
        <text x={45} y={47} textAnchor="middle" fill={tierColor} fontSize={22} fontWeight={900} fontFamily="JetBrains Mono">{score.toFixed(0)}</text>
        <text x={45} y={61} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8} fontWeight={700} letterSpacing={1}>REP</text>
      </svg>
      <TierBadge tier={tier} />
    </div>
  );
}

function FollowButton({ traderId }: { traderId: number }) {
  const qc = useQueryClient();
  const myId = useMyId();
  const followKey = ["traderFollowers", traderId, myId];

  const { data: followStats, isLoading: isLoadingFollow } = useGetTraderFollowers(
    traderId,
    { followerId: myId ?? 0 },
    { query: { queryKey: followKey, enabled: myId !== null } }
  );

  const { mutate: follow, isPending: isFollowing } = useFollowTrader({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: followKey }),
    },
  });
  const { mutate: unfollow, isPending: isUnfollowing } = useUnfollowTrader({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: followKey }),
    },
  });

  const isFollowingNow = followStats?.isFollowing ?? false;
  const followerCount = followStats?.followerCount ?? 0;
  const isPending = isFollowing || isUnfollowing || (myId !== null && isLoadingFollow);
  const isSelf = myId === traderId;
  const disabled = isPending || myId === null || isSelf;

  const handleClick = () => {
    if (disabled || myId === null) return;
    if (isFollowingNow) {
      unfollow({ traderId, data: { followerId: myId } });
    } else {
      follow({ traderId, data: { followerId: myId } });
    }
  };

  const label = myId === null
    ? "CONNECT TO FOLLOW"
    : isSelf
      ? "THIS IS YOU"
      : isFollowingNow ? "FOLLOWING ✓" : "FOLLOW";

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={handleClick}
        disabled={disabled}
        data-testid="follow-button"
        className={`px-6 py-2.5 font-black text-xs tracking-wider cursor-pointer transition-colors border ${
          isFollowingNow
            ? "bg-transparent text-accent border-accent hover:bg-accent/10"
            : "bg-transparent text-muted-foreground border-border hover:text-white hover:border-white/40"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {label}
      </button>
      <span className="text-[10px] font-mono text-muted-foreground">
        {followerCount.toLocaleString()} followers
      </span>
    </div>
  );
}

export default function TraderProfile() {
  const params = useParams();
  const id = parseInt(params.id || "1", 10);

  // Read deep-link highlights — set by Feed/Signals cards so we can scroll
  // straight to the relevant row and flash it.
  const search = useSearch();
  const { highlightTradeId, highlightSignalId } = useMemo(() => {
    const sp = new URLSearchParams(search);
    const t = sp.get("highlightTradeId");
    const s = sp.get("highlightSignalId");
    return {
      highlightTradeId: t ? Number(t) : null,
      highlightSignalId: s ? Number(s) : null,
    };
  }, [search]);

  const { data: trader, isLoading: isLoadingTrader } = useGetTrader(id, {
    query: { enabled: !!id, queryKey: getGetTraderQueryKey(id) },
  });
  const tradesParams = { limit: 50 };
  const { data: tradesData, isLoading: isLoadingTrades } = useGetTraderTrades(id, tradesParams, {
    query: { enabled: !!id, queryKey: getGetTraderTradesQueryKey(id, tradesParams) },
  });
  const { data: rep } = useGetTraderReputation(id, {
    query: { enabled: !!id, queryKey: getGetTraderReputationQueryKey(id) },
  });
  const qc = useQueryClient();

  // Open positions for this trader — eliteOnly is auto-bypassed when
  // traderId is set (see ListSignalsParams docs).
  const openSignalsParams = { traderId: id, status: "open" as const, limit: 25 };
  const { data: openSignalsData, isLoading: isLoadingOpen } = useListSignals(openSignalsParams, {
    query: { enabled: !!id, queryKey: getListSignalsQueryKey(openSignalsParams) },
  });
  const openSignals = openSignalsData?.signals ?? [];

  // Live SSE — when this trader's wallet posts a new trade or signal, the
  // Trade History table + Open Positions table need to refresh. We debounce
  // ~1s so a burst of fills doesn't trigger a refetch storm.
  const sseDebounce = useRef<number | null>(null);
  const refetchTraderData = () => {
    if (sseDebounce.current) return;
    sseDebounce.current = window.setTimeout(() => {
      sseDebounce.current = null;
      qc.invalidateQueries({ queryKey: getGetTraderTradesQueryKey(id, tradesParams) });
      qc.invalidateQueries({ queryKey: getListSignalsQueryKey(openSignalsParams) });
      qc.invalidateQueries({ queryKey: getGetTraderQueryKey(id) });
    }, 1000);
  };
  useFeedStream({
    onNewTrade:  (e) => { if (e.traderId === id) refetchTraderData(); },
    onNewSignal: (e) => { if (e.traderId === id) refetchTraderData(); },
  });

  // Scroll the highlighted row into view + add a 2.5s flash class. Wait one
  // tick so the table has rendered, and only run when the relevant data is in.
  const tradesReady = !!tradesData;
  const signalsReady = !!openSignalsData;
  useEffect(() => {
    const targetId = highlightTradeId ?? highlightSignalId;
    if (!targetId) return;
    if (highlightTradeId && !tradesReady) return;
    if (highlightSignalId && !signalsReady) return;
    const sel = highlightTradeId
      ? `[data-row-trade-id="${highlightTradeId}"]`
      : `[data-row-signal-id="${highlightSignalId}"]`;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-flash");
      setTimeout(() => el.classList.remove("row-flash"), 2500);
    }, 80);
    return () => clearTimeout(t);
  }, [highlightTradeId, highlightSignalId, tradesReady, signalsReady]);

  if (isLoadingTrader) return (
    <div className="p-8 max-w-[1100px] w-full">
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

  const repScore = rep ? rep.repScore : Number(trader.repScore);
  const tier = rep ? rep.tier : trader.tier;
  const winRate = rep ? rep.winRate : Number(trader.winRate);
  const signalAccuracy = rep ? rep.signalAccuracy : 0;
  const mentorScore = rep ? rep.mentorScore : 0;
  const streakDays = rep ? rep.streakDays : 0;
  const streakShields = rep ? rep.streakShields : 0;
  const recentEvents = rep?.recentEvents ?? [];

  return (
    <div className="px-8 pb-10 max-w-[1100px] w-full pt-8">
      {/* Header */}
      <div className="border border-border p-7 mb-5 bg-card">
        <div className="flex items-start gap-6 mb-7">
          <div className="w-16 h-16 rounded-full border-2 border-accent flex items-center justify-center text-[22px] font-black text-accent shrink-0">
            {trader.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <span className="text-2xl font-black tracking-wide text-white">{trader.username}</span>
              <span className="bg-accent text-background text-[9px] px-2 py-0.5 font-black tracking-wider">VERIFIED</span>
              <TierBadge tier={tier} />
            </div>
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-3 max-w-md">
              {trader.bio || "No bio provided."}
            </p>
            {trader.walletAddress && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <WalletBadge address={trader.walletAddress} />
                {trader.isAutoDiscovered && (
                  <span className="bg-blue-500/15 text-blue-400 border border-blue-400/40 px-2 py-0.5 text-[9px] font-black tracking-wider">AUTO-DISCOVERED</span>
                )}
                {trader.leaderboardRank != null && (
                  <span className="bg-accent/15 text-accent border border-accent/40 px-2 py-0.5 text-[9px] font-black tracking-wider">
                    SODEX RANK #{trader.leaderboardRank}{trader.leaderboardWindow ? ` · ${trader.leaderboardWindow}` : ""}
                  </span>
                )}
                {(trader.onchainTxCount ?? 0) > 0 && (
                  <span className="text-muted-foreground text-[10px] font-mono">
                    {(trader.onchainTxCount ?? 0).toLocaleString()} POSITIONS · {Number(trader.winRate ?? 0).toFixed(0)}% WIN RATE
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-6 text-xs">
              {[
                [(trader.followerCount ?? 0).toLocaleString(), "FOLLOWERS"],
                [(trader.tradeCount ?? 0).toLocaleString(), "TRADES"],
              ].map(([v, l]) => (
                <div key={String(l)}>
                  <span className="text-white font-black font-mono mr-1.5">{v}</span>
                  <span className="text-muted-foreground font-bold tracking-wider">{l}</span>
                </div>
              ))}
            </div>
          </div>
          <RepScoreRing score={repScore} tier={tier} />
          <div className="flex flex-col gap-2 ml-4">
            <button className="bg-accent text-background border-none px-6 py-2.5 font-black text-xs tracking-wider cursor-pointer hover:bg-accent/90 transition-colors">
              COPY TRADE
            </button>
            <FollowButton traderId={id} />
          </div>
        </div>

        <div className="flex gap-0 flex-wrap">
          <StatBox label="TOTAL PNL" value={fmtPnl(trader.totalPnlUsd ?? "0")} sub="Net realized" accent />
          <StatBox label="30D PNL" value={fmtPnl(String(trader.realized30dPnlUsd ?? 0))} sub="Last 30 days" accent={(trader.realized30dPnlUsd ?? 0) >= 0} />
          <StatBox label="WIN RATE" value={`${winRate.toFixed(1)}%`} sub="All trades" accent />
          <StatBox label="SIG ACCURACY" value={`${signalAccuracy.toFixed(0)}%`} sub="Signals hit" />
          <StatBox label="REP SCORE" value={repScore.toFixed(1)} sub="Composite" />
          <StatBox label="TRADES" value={(trader.tradeCount ?? 0).toLocaleString()} sub="All time" />
          <StatBox label="AVG LEV" value={`${Number(trader.avgLeverage ?? 0).toFixed(1)}×`} sub="Position avg" />
          <StatBox label="STREAK" value={`${streakDays}D`} sub={`${streakShields} shield${streakShields !== 1 ? "s" : ""}`} />
        </div>
      </div>

      {/* Reputation Engine Panel */}
      <div className="border border-border bg-card p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <span className="font-black text-sm tracking-wide text-white">REPUTATION ENGINE</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider">STREAK SHIELDS</span>
            <StreakShields count={streakShields} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-3">
          <RepDimBar label="WIN RATE" value={winRate} />
          <RepDimBar label="SIGNAL ACCURACY" value={signalAccuracy} color="bg-blue-400" />
          <RepDimBar label="MENTOR SCORE" value={mentorScore} color="bg-purple-400" />
          <RepDimBar label="VALIDATION ACCURACY" value={rep?.validationAccuracy ?? 0} color="bg-yellow-400" />
          <div className="col-span-2">
            <div className="flex items-center gap-3">
              <div className="text-[9px] font-extrabold tracking-wider text-muted-foreground w-[130px] shrink-0">CURRENT STREAK</div>
              <div className="flex-1 h-[3px] bg-border relative">
                <div className="h-full bg-accent/60" style={{ width: `${Math.min(100, streakDays * 5)}%` }} />
              </div>
              <div className="text-[11px] font-mono font-bold text-accent w-10 text-right">{streakDays}D</div>
            </div>
          </div>
        </div>

        {rep && (
          <div className="grid grid-cols-4 gap-0 mt-6 border-t border-border pt-5">
            {[
              { label: "SIGNALS TOTAL", value: rep.totalSignals, note: `${rep.signalsHit} hit / ${rep.signalsStopped} stopped` },
              { label: "BREAKDOWNS GIVEN", value: rep.totalBreakdownsGiven, note: "Pain Room help" },
              { label: "MARKED HELPFUL", value: rep.totalBreakdownsHelpful, note: "Community verified" },
              { label: "SHIELD STOCK", value: `${rep.streakShields}/3`, note: "Protection shields" },
            ].map(({ label, value, note }) => (
              <div key={label} className="border-r border-border last:border-r-0 px-4 first:pl-0 last:pr-0">
                <div className="text-muted-foreground text-[9px] font-extrabold tracking-wider mb-1.5">{label}</div>
                <div className="text-white text-xl font-black font-mono">{value}</div>
                <div className="text-muted-foreground text-[10px] mt-0.5">{note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* PNL Curve */}
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
              <div className="text-accent text-2xl font-black font-mono">{fmtPnl(trader.totalPnlUsd ?? "0")}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] font-extrabold tracking-wider mb-1.5">WIN RATE</div>
              <div className="text-white text-2xl font-black font-mono">{winRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Recent Trades — quick glance, full table below */}
        <div className="border border-border p-6 bg-card">
          <div className="font-black text-sm tracking-wide text-white mb-5">RECENT TRADES</div>
          {isLoadingTrades ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="flex flex-col">
              {trades.slice(0, 8).map((t, i) => {
                const isWin = Number(t.pnlUsd) >= 0;
                return (
                  <div key={`trade-${t.id}`} className={`flex items-center gap-3 py-2.5 ${i < trades.slice(0, 8).length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isWin ? "bg-accent" : "bg-destructive"}`} />
                    <span className="font-bold text-xs flex-1 tracking-wide text-white">{t.asset}</span>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 tracking-wider border ${
                      t.side === "LONG" ? "border-accent/50 text-accent" : "border-destructive/50 text-destructive"
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

      {/* Open Positions table — drilled-down from a Signal card on /signals */}
      <div className="border border-border bg-card mb-4">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <span className="font-black text-sm tracking-wide text-white">OPEN POSITIONS</span>
          <span className="text-muted-foreground text-[10px] font-bold tracking-wider">
            {openSignals.length} LIVE
          </span>
          {openSignals.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse ml-1" />
          )}
        </div>
        {isLoadingOpen ? (
          <div className="p-5 space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : openSignals.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-[11px] tracking-wider font-bold">
            NO OPEN POSITIONS
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="grid grid-cols-[1.1fr_70px_repeat(4,_1fr)_110px_140px] gap-3 px-5 py-2 text-muted-foreground text-[9px] font-extrabold tracking-widest border-b border-border/50">
              <div>ASSET</div>
              <div>SIDE</div>
              <div>ENTRY</div>
              <div>TARGET</div>
              <div>STOP</div>
              <div>CONFIDENCE</div>
              <div>OPENED</div>
              <div className="text-right">ON-CHAIN</div>
            </div>
            {openSignals.map((s) => {
              const isLong = s.side === "LONG";
              const isHighlighted = highlightSignalId === s.id;
              return (
                <div
                  key={`open-${s.id}`}
                  data-row-signal-id={s.id}
                  data-testid={`row-signal-${s.id}`}
                  className={`grid grid-cols-[1.1fr_70px_repeat(4,_1fr)_110px_140px] gap-3 px-5 py-3 items-center transition-colors ${
                    isHighlighted ? "bg-accent/[0.06] border-l-2 border-l-accent -ml-[2px]" : "hover:bg-card/60"
                  }`}
                >
                  <div className="text-white font-extrabold text-[12px] tracking-wide">{s.asset}</div>
                  <div className={`text-[9px] font-extrabold px-1.5 py-0.5 tracking-wider border w-fit ${
                    isLong ? "border-accent/50 text-accent" : "border-destructive/50 text-destructive"
                  }`}>{s.side}</div>
                  <div className="text-white font-mono text-[11px]">${Number(s.entryPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                  <div className="text-accent font-mono text-[11px]">${Number(s.targetPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                  <div className="text-destructive font-mono text-[11px]">${Number(s.stopLoss).toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[3px] bg-border overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${s.confidence}%` }} />
                    </div>
                    <span className="text-accent text-[10px] font-mono font-extrabold w-7 text-right">{s.confidence}%</span>
                  </div>
                  <div className="text-muted-foreground text-[10px] font-mono">{timeAgo(s.createdAt)}</div>
                  <div className="flex items-center justify-end">
                    {s.txHash ? (
                      <WalletBadge txHash={s.txHash} compact />
                    ) : s.sodexPositionId && trader.walletAddress ? (
                      <WalletBadge
                        address={trader.walletAddress}
                        sodexId={s.sodexPositionId}
                        sodexKind="position"
                        compact
                      />
                    ) : s.sodexPositionId ? (
                      <span className="text-accent/80 font-mono text-[10px] font-bold tracking-wider"
                        title={`Sodex position #${s.sodexPositionId}`}>
                        POS #{String(s.sodexPositionId).slice(0, 6)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-[10px] font-mono">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trade History — full table with on-chain links */}
      <div className="border border-border bg-card mb-4">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <span className="font-black text-sm tracking-wide text-white">TRADE HISTORY</span>
          <span className="text-muted-foreground text-[10px] font-bold tracking-wider">
            {trades.length} CLOSED
          </span>
        </div>
        {isLoadingTrades ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : trades.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-[11px] tracking-wider font-bold">
            NO CLOSED TRADES
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="grid grid-cols-[1.1fr_70px_60px_repeat(2,_1fr)_110px_110px_140px] gap-3 px-5 py-2 text-muted-foreground text-[9px] font-extrabold tracking-widest border-b border-border/50">
              <div>ASSET</div>
              <div>SIDE</div>
              <div>LEV</div>
              <div>ENTRY</div>
              <div>EXIT</div>
              <div className="text-right">PNL</div>
              <div>CLOSED</div>
              <div className="text-right">ON-CHAIN</div>
            </div>
            {trades.map((t) => {
              const isWin = Number(t.pnlUsd) >= 0;
              const isLong = t.side === "LONG";
              const isHighlighted = highlightTradeId === t.id;
              return (
                <div
                  key={`hist-${t.id}`}
                  data-row-trade-id={t.id}
                  data-testid={`row-trade-${t.id}`}
                  className={`grid grid-cols-[1.1fr_70px_60px_repeat(2,_1fr)_110px_110px_140px] gap-3 px-5 py-3 items-center transition-colors ${
                    isHighlighted ? "bg-accent/[0.06] border-l-2 border-l-accent -ml-[2px]" : "hover:bg-card/60"
                  }`}
                >
                  <div className="text-white font-extrabold text-[12px] tracking-wide">{t.asset}</div>
                  <div className={`text-[9px] font-extrabold px-1.5 py-0.5 tracking-wider border w-fit ${
                    isLong ? "border-accent/50 text-accent" : "border-destructive/50 text-destructive"
                  }`}>{t.side}</div>
                  <div className="text-muted-foreground font-mono text-[11px]">{t.leverage}×</div>
                  <div className="text-white font-mono text-[11px]">${Number(t.entryPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                  <div className="text-white font-mono text-[11px]">${Number(t.exitPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                  <div className={`text-right font-mono font-extrabold text-[12px] ${isWin ? "text-accent" : "text-destructive"}`}>
                    {isWin ? "+" : ""}${Math.abs(Number(t.pnlUsd)).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    <div className="text-[10px] font-bold opacity-80">
                      {isWin ? "+" : ""}{Number(t.pnlPct).toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-muted-foreground text-[10px] font-mono">
                    {t.closedAt ? timeAgo(t.closedAt) : timeAgo(t.createdAt)}
                  </div>
                  <div className="flex items-center justify-end">
                    {t.txHash ? (
                      <WalletBadge txHash={t.txHash} compact />
                    ) : t.sodexTradeId && trader.walletAddress ? (
                      <WalletBadge
                        address={trader.walletAddress}
                        sodexId={t.sodexTradeId}
                        sodexKind="trade"
                        compact
                      />
                    ) : t.sodexTradeId ? (
                      <span className="text-accent/80 font-mono text-[10px] font-bold tracking-wider"
                        title={`Sodex trade #${t.sodexTradeId}`}>
                        SODEX #{String(t.sodexTradeId).slice(0, 6)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-[10px] font-mono">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reputation Event Log */}
      {recentEvents.length > 0 && (
        <div className="border border-border bg-card p-6">
          <div className="font-black text-sm tracking-wide text-white mb-5">REPUTATION ACTIVITY</div>
          <div className="flex flex-col gap-0">
            {recentEvents.slice(0, 10).map((e, i) => {
              const ev = EVENT_LABELS[e.eventType] ?? { label: e.eventType.toUpperCase(), color: "text-muted-foreground" };
              const isPos = e.delta >= 0;
              return (
                <div key={e.id} className={`flex items-center gap-3 py-2.5 ${i < recentEvents.slice(0, 10).length - 1 ? "border-b border-border/50" : ""}`}>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPos ? "bg-accent" : "bg-destructive"}`} />
                  <span className={`text-[10px] font-extrabold tracking-wider ${ev.color} w-40`}>{ev.label}</span>
                  <span className="text-muted-foreground text-[11px] flex-1 font-mono">{e.meta || e.sourceType || "—"}</span>
                  <span className={`text-[11px] font-mono font-bold ${isPos ? "text-accent" : "text-destructive"}`}>
                    {isPos ? "+" : ""}{e.delta.toFixed(2)} REP
                  </span>
                  <span className="text-muted-foreground text-[10px] font-mono w-16 text-right">{timeAgo(e.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
