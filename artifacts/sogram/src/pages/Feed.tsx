import { useState } from "react";
import {
  useGetFeed, useLikeTrade, useLikeSignal, useGetMarketVibe,
  useGetComments, useAddComment,
} from "@workspace/api-client-react";
import type { FeedItem } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { WalletBadge } from "@/components/WalletBadge";
import { useFeedStream } from "@/lib/sse";
import { useRef } from "react";

const MY_COMMENTER_ID = 37;

function RepCircle({ score }: { score: number }) {
  const color = score >= 90 ? "text-accent border-accent/50" : "text-white border-white/20";
  return (
    <div className={`w-10 h-10 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${color}`}>
      <span className="text-[11px] font-bold font-mono tracking-tighter">{score.toFixed(0)}</span>
    </div>
  );
}

function Tag({ label, accent, danger, dim }: { label: string; accent?: boolean; danger?: boolean; dim?: boolean }) {
  return (
    <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 border ${
      accent ? "bg-accent text-background border-accent" :
      danger ? "bg-transparent text-destructive border-destructive/60" :
      dim ? "bg-transparent text-muted-foreground border-border/50" :
      "bg-transparent text-muted-foreground border-border"
    }`}>
      {label}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}M AGO`;
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

function fmt(n: number) {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return "$" + n.toFixed(2);
}

type PostType = "trade" | "signal" | "pain_room" | "intent";

function CommentSection({ postType, postId }: { postType: PostType; postId: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();
  const commentsKey = ["comments", postType, postId];

  const { data: commentsData, isLoading } = useGetComments(postType, postId, {}, {
    query: { enabled: open, queryKey: commentsKey },
  });

  const { mutate: addComment, isPending } = useAddComment({
    mutation: {
      onSuccess: () => {
        setDraft("");
        qc.invalidateQueries({ queryKey: commentsKey });
      },
    },
  });

  const comments = commentsData?.comments ?? [];
  const total = commentsData?.total ?? 0;

  const submit = () => {
    if (!draft.trim() || isPending) return;
    addComment({ postType, postId, data: { traderId: MY_COMMENTER_ID, content: draft.trim() } });
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-transparent border-none text-muted-foreground text-xs font-semibold cursor-pointer flex items-center gap-1.5 hover:text-white transition-colors"
      >
        💬 {open ? `${total} comment${total !== 1 ? "s" : ""}` : `${total > 0 ? total : ""} COMMENT${total !== 1 ? "S" : ""}`}
      </button>

      {open && (
        <div className="mt-3 border-t border-border/40 pt-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 mb-3">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2.5 items-start">
                  <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-[9px] font-black text-muted-foreground shrink-0">
                    {c.traderHandle.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white text-[11px] font-bold tracking-wide">{c.traderUsername}</span>
                      <span className="text-muted-foreground text-[9px] font-mono">@{c.traderHandle}</span>
                      <span className="text-muted-foreground text-[9px] ml-auto">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="text-muted-foreground text-[12px] leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-muted-foreground text-[11px] font-bold tracking-wider text-center py-2">NO COMMENTS YET — BE FIRST</p>
              )}
            </div>
          )}

          <div className="flex gap-2 items-center">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Add a comment..."
              maxLength={500}
              className="flex-1 bg-card border border-border px-3 py-2 text-[12px] text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 font-mono"
            />
            <button
              onClick={submit}
              disabled={!draft.trim() || isPending}
              className="bg-accent text-background px-3 py-2 text-[10px] font-black tracking-wider cursor-pointer hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-none"
            >
              POST
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WinPost({ post }: { post: NonNullable<FeedItem["trade"]> }) {
  const { mutate: likeTrade } = useLikeTrade();
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";
  const pnlNum = Number(post.pnlUsd);
  const pnlPctNum = Number(post.pnlPct);
  const isWin = pnlNum >= 0;

  return (
    <div className="border-t border-border py-6" data-testid={`feed-trade-${post.id}`}>
      <div className="flex gap-4">
        <RepCircle score={post.traderRepScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="text-white font-extrabold text-sm tracking-wide">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            <Tag label="WIN" accent={isWin} danger={!isWin} />
            {post.isOnChainVerified && <Tag label="ON-CHAIN ✓" accent />}
            {(post as any).traderIsAutoDiscovered && (
              <span className="bg-blue-500/15 text-blue-400 border border-blue-400/40 px-1.5 py-0.5 text-[9px] font-black tracking-wider">DISCOVERED</span>
            )}
            <span className="text-muted-foreground text-[11px] ml-auto">{timeAgo(post.createdAt)}</span>
          </div>

          {post.caption && (
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-4">{post.caption}</p>
          )}

          <div className="border border-border p-4 mb-3.5 bg-card">
            <div className="flex justify-between items-start mb-3.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-white font-black text-[17px] tracking-wide">{post.asset}</span>
                <Tag label={post.side} accent={isLong} danger={!isLong} />
                <Tag label={`${post.leverage}×`} />
              </div>
              <div className="text-right">
                <div className={`font-black text-[22px] font-mono tracking-tighter ${isWin ? "text-accent" : "text-destructive"}`}>
                  {isWin ? "+" : ""}{fmt(pnlNum)}
                </div>
                <div className={`text-[13px] font-mono ${isWin ? "text-accent" : "text-destructive"}`}>
                  {isWin ? "+" : ""}{pnlPctNum.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {([
                ["ENTRY", fmt(post.entryPrice)],
                ["EXIT", fmt(post.exitPrice)],
                ["SIZE", "$" + Number(post.positionSize).toLocaleString()],
                ["LEVERAGE", `${post.leverage}×`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l}>
                  <div className="text-muted-foreground text-[10px] font-bold tracking-wider mb-1">{l}</div>
                  <div className="text-white font-bold text-[13px] font-mono">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {((post as any).txHash || (post as any).traderWalletAddress) && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 border border-accent/15 bg-accent/[0.03]">
              <WalletBadge
                address={(post as any).traderWalletAddress}
                txHash={(post as any).txHash}
              />
              <span className="text-muted-foreground text-[9px] ml-auto font-bold tracking-wider">VALUECHAIN VERIFIED</span>
            </div>
          )}
          {(post as any).sodexTradeId && (
            <div className="flex items-center gap-2 mb-3 px-3 py-1.5 border border-accent/30 bg-accent/8"
              style={{ background: "rgba(212,255,0,0.04)", borderColor: "rgba(212,255,0,0.25)" }}>
              <span className="text-accent text-[9px] font-extrabold tracking-widest">SODEX</span>
              <span className="text-accent/60 font-mono text-[10px]">
                #{String((post as any).sodexTradeId).slice(0, 8)}...
              </span>
              <span className="text-[9px] font-extrabold tracking-wider ml-auto"
                style={{ color: "#D4FF00" }}>
                ✓ SODEX VERIFIED
              </span>
            </div>
          )}

          <div className="flex items-center gap-5 mb-2">
            <button
              data-testid={`like-trade-${post.id}`}
              onClick={() => { likeTrade({ tradeId: post.id }); setLiked(true); }}
              className={`bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${liked ? "text-accent" : "text-muted-foreground"}`}
            >
              ♥ {(post.likes ?? post.likeCount ?? 0) + (liked ? 1 : 0)}
            </button>
            <Button className="ml-auto bg-accent text-background hover:bg-accent/90 px-4 py-1.5 font-extrabold text-xs tracking-wide h-auto">
              COPY TRADE
            </Button>
          </div>
          <CommentSection postType="trade" postId={post.id} />
        </div>
      </div>
    </div>
  );
}

function SignalPost({ post }: { post: NonNullable<FeedItem["signal"]> }) {
  const { mutate: likeSignal } = useLikeSignal();
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";
  const entryN = Number(post.entryPrice);
  const targetN = Number(post.targetPrice);
  const stopN = Number(post.stopLoss);
  const rr = entryN && targetN && stopN && entryN > stopN
    ? ((targetN - entryN) / (entryN - stopN)).toFixed(1)
    : "—";

  return (
    <div className="border-t border-border py-6" data-testid={`feed-signal-${post.id}`}>
      <div className="flex gap-4">
        <RepCircle score={post.traderRepScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="text-white font-extrabold text-sm tracking-wide">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            <span className="bg-transparent border border-accent/60 text-accent px-2 py-0.5 text-[10px] font-bold tracking-wider">SIGNAL</span>
            {(post as any).traderIsAutoDiscovered && (
              <span className="bg-blue-500/15 text-blue-400 border border-blue-400/40 px-1.5 py-0.5 text-[9px] font-black tracking-wider">DISCOVERED</span>
            )}
            <span className="text-muted-foreground text-[11px] ml-auto">{timeAgo(post.createdAt ?? "")}</span>
          </div>
          {((post as any).traderWalletAddress || (post as any).txHash) && (
            <div className="mb-3"><WalletBadge address={(post as any).traderWalletAddress} txHash={(post as any).txHash} /></div>
          )}

          {post.reasoning && (
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-4">{post.reasoning}</p>
          )}

          <div className="border border-border p-4 mb-3.5 bg-card">
            <div className="flex justify-between items-center mb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-white font-black text-[17px]">{post.asset}</span>
                <Tag label={post.side} accent={isLong} danger={!isLong} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px] font-bold tracking-wide">CONFIDENCE</span>
                <div className="w-20 h-[3px] bg-border overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${post.confidence}%` }} />
                </div>
                <span className="text-accent text-[13px] font-extrabold font-mono">{post.confidence}%</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {([
                ["ENTRY", fmt(Number(post.entryPrice))],
                ["TARGET", fmt(Number(post.targetPrice))],
                ["STOP", fmt(Number(post.stopLoss))],
                ["R:R", `${rr}:1`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l}>
                  <div className="text-muted-foreground text-[10px] font-bold tracking-wider mb-1">{l}</div>
                  <div className={`font-bold text-[13px] font-mono ${l === "TARGET" ? "text-accent" : l === "STOP" ? "text-destructive" : "text-white"}`}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5 mb-2">
            <button
              data-testid={`like-signal-${post.id}`}
              onClick={() => { likeSignal({ signalId: post.id }); setLiked(true); }}
              className={`bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${liked ? "text-accent" : "text-muted-foreground"}`}
            >
              ♥ {post.likeCount + (liked ? 1 : 0)}
            </button>
            <Button variant="outline" className="ml-auto border-accent text-accent hover:bg-accent hover:text-background px-4 py-1.5 font-extrabold text-xs tracking-wide h-auto">
              FOLLOW SIGNAL
            </Button>
          </div>
          <CommentSection postType="signal" postId={post.id} />
        </div>
      </div>
    </div>
  );
}

function LossPost({ post }: { post: NonNullable<FeedItem["loss"]> }) {
  const pnlNum = Number(post.pnlUsd);
  const pnlPctNum = Number(post.pnlPct);
  const isAnon = post.isAnonymous;

  return (
    <div className="border-t border-destructive/20 py-6 bg-destructive/[0.02]">
      <div className="flex gap-4">
        <div className="w-10 h-10 rounded-full border-[1.5px] border-destructive/40 flex items-center justify-center shrink-0">
          <span className="text-destructive text-[11px] font-bold font-mono">
            {isAnon ? "?" : post.traderRepScore.toFixed(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className={`font-extrabold text-sm tracking-wide ${isAnon ? "text-muted-foreground italic" : "text-white"}`}>
              {isAnon ? "Anonymous" : post.traderUsername}
            </span>
            {!isAnon && <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>}
            <span className="bg-transparent border border-destructive/60 text-destructive px-2 py-0.5 text-[10px] font-bold tracking-wider">LOSS</span>
            {post.isResolved && <span className="bg-transparent border border-accent/40 text-accent px-2 py-0.5 text-[10px] font-bold tracking-wider">RESOLVED</span>}
            <span className="text-muted-foreground text-[11px] ml-auto">{timeAgo(post.createdAt)}</span>
          </div>

          {post.comment && (
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-4 border-l-2 border-destructive/30 pl-3">
              {post.comment}
            </p>
          )}

          <div className="border border-destructive/25 p-4 mb-3.5 bg-card">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-white font-black text-[17px] tracking-wide">{post.asset}</span>
                <Tag label={post.side} danger={post.side === "LONG"} accent={post.side === "SHORT"} />
                <Tag label={`${post.leverage}×`} />
              </div>
              <div className="text-right">
                <div className="font-black text-[22px] font-mono tracking-tighter text-destructive">
                  {fmt(pnlNum)}
                </div>
                <div className="text-[13px] font-mono text-destructive">
                  {pnlPctNum.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-2">
            <span className="text-muted-foreground text-[11px] font-bold">
              💬 {post.breakdownCount} breakdown{post.breakdownCount !== 1 ? "s" : ""}
            </span>
            <Link href="/pain-room">
              <button className="ml-auto text-[10px] font-extrabold tracking-wider border border-destructive/40 text-destructive px-4 py-1.5 hover:bg-destructive/10 transition-colors bg-transparent cursor-pointer">
                {post.isResolved ? "VIEW BREAKDOWN" : "GIVE BREAKDOWN"}
              </button>
            </Link>
          </div>
          <CommentSection postType="pain_room" postId={post.id} />
        </div>
      </div>
    </div>
  );
}

function WhalePost({ post }: { post: NonNullable<FeedItem["whale"]> }) {
  const sizeNum = Number(post.positionSizeUsd);
  const isLong = post.side === "LONG";
  const sizeFmt = sizeNum >= 1000000
    ? `$${(sizeNum / 1000000).toFixed(1)}M`
    : `$${(sizeNum / 1000).toFixed(0)}K`;

  return (
    <div className="border-t border-border py-5">
      <div className="flex gap-4 items-center">
        <div className="w-10 h-10 border-[1.5px] border-border flex items-center justify-center shrink-0">
          <span className="text-muted-foreground text-[10px] font-black">🐋</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <span className="text-white font-extrabold text-sm">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            <span className="bg-transparent border border-border text-muted-foreground px-2 py-0.5 text-[10px] font-bold tracking-wider">WHALE</span>
            {(post as any).traderWalletAddress && (
              <WalletBadge address={(post as any).traderWalletAddress} compact />
            )}
            <span className="text-muted-foreground text-[11px] ml-auto">{post.timeAgo}</span>
          </div>

          <div className="border border-border p-3 bg-card flex items-center gap-4">
            <div>
              <div className="text-muted-foreground text-[9px] font-bold tracking-widest mb-0.5">PAIR</div>
              <div className="text-white font-black text-base">{post.pair}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[9px] font-bold tracking-widest mb-0.5">SIDE</div>
              <div className={`font-black text-sm ${isLong ? "text-accent" : "text-destructive"}`}>{post.side}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[9px] font-bold tracking-widest mb-0.5">SIZE</div>
              <div className="text-white font-black text-base font-mono">{sizeFmt}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[9px] font-bold tracking-widest mb-0.5">LEV</div>
              <div className="text-white font-bold text-sm font-mono">{post.leverage}×</div>
            </div>
            <div className="ml-auto">
              <div className="text-muted-foreground text-[9px] font-bold tracking-widest mb-0.5">NOTIONAL</div>
              <div className={`font-black text-lg font-mono ${isLong ? "text-accent" : "text-destructive"}`}>{sizeFmt}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketVibe() {
  const { data, isLoading } = useGetMarketVibe({
    query: { queryKey: ["market-vibe"], staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 },
  });

  if (isLoading || !data) return null;

  return (
    <div style={{
      border: "1px solid rgba(212,255,0,0.2)",
      background: "linear-gradient(135deg, rgba(212,255,0,0.04) 0%, rgba(0,0,0,0) 100%)",
      padding: "14px 16px",
      marginBottom: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4FF00", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", color: "#D4FF00" }}>AI MARKET VIBE</span>
        <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
          {(data.prices ?? []).slice(0, 3).map(p => (
            <span key={p.symbol} style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
              <span style={{ color: "#555" }}>{p.symbol.split("/")[0]} </span>
              <span style={{ color: p.change24h >= 0 ? "#22C55E" : "#FF3B3B" }}>
                ${p.price < 100 ? p.price.toFixed(2) : p.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </span>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
        {data.summary}
      </p>
      {(data.news ?? []).length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {(data.news ?? []).slice(0, 2).map(n => (
            <div key={n.id} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <span style={{ color: "#D4FF00", fontSize: 9, fontWeight: 900, marginTop: 1, flexShrink: 0 }}>▸</span>
              <a href={n.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: "#ccc", fontWeight: 600, textDecoration: "none", lineHeight: 1.4 }}
                onMouseOver={e => (e.currentTarget.style.color = "#D4FF00")}
                onMouseOut={e => (e.currentTarget.style.color = "#ccc")}
              >
                {n.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type FeedTab = "all" | "wins" | "signals" | "losses" | "whales";

const TABS: { label: string; value: FeedTab }[] = [
  { label: "ALL", value: "all" },
  { label: "WINS", value: "wins" },
  { label: "SIGNALS", value: "signals" },
  { label: "LOSSES", value: "losses" },
  { label: "WHALES", value: "whales" },
];

export default function Feed() {
  const [tab, setTab] = useState<FeedTab>("all");
  const qc = useQueryClient();

  const { data: feedData, isLoading } = useGetFeed(
    { filter: tab, limit: 20, offset: 0 },
    { query: { queryKey: ["feed", tab] } }
  );

  // Live SSE: invalidate the feed (debounced ~1s) on every new trade/signal
  // so the page reflects activity within ~1s of the on-chain fill instead of
  // waiting on a polling interval.
  const invalidateTimer = useRef<number | null>(null);
  const scheduleInvalidate = () => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = window.setTimeout(() => {
      invalidateTimer.current = null;
      qc.invalidateQueries({ queryKey: ["feed"] });
    }, 1_000);
  };
  useFeedStream({
    onNewTrade: scheduleInvalidate,
    onNewSignal: scheduleInvalidate,
  });

  return (
    <div className="px-8 pb-10 max-w-[800px] w-full">
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border sticky top-0 bg-background z-10 -mx-8 px-8 mb-4">
        {TABS.map(({ label, value }) => (
          <button
            key={value}
            data-testid={`tab-${value}`}
            onClick={() => setTab(value)}
            className={`bg-transparent border-none border-b-2 px-4 h-14 font-bold text-xs tracking-wider cursor-pointer uppercase transition-colors ${
              tab === value ? "text-accent border-accent" : "text-muted-foreground border-transparent hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Market Vibe */}
      <MarketVibe />

      {/* Composer */}
      <div className="py-5 border-b border-border mb-1 flex gap-3.5 items-center">
        <div className="w-7 h-7 rounded-full border-[1.5px] border-border flex items-center justify-center text-muted-foreground text-[11px] font-bold">
          ME
        </div>
        <div className="flex-1 border border-border px-3.5 py-2.5 text-muted-foreground text-[13px] bg-card">
          Share a verified trade or signal...
        </div>
        <Button className="bg-accent text-background hover:bg-accent/90 px-5 py-2 font-extrabold text-xs tracking-wide h-auto">
          POST
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-8 mt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 border-t border-border pt-6">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {(feedData?.items ?? []).map((item, idx) => {
            if (item.type === "trade" && item.trade) {
              return <WinPost key={`trade-${item.trade.id ?? idx}`} post={item.trade} />;
            }
            if (item.type === "signal" && item.signal) {
              return <SignalPost key={`signal-${item.signal.id ?? idx}`} post={item.signal} />;
            }
            if (item.type === "loss" && item.loss) {
              return <LossPost key={`loss-${item.loss.id ?? idx}`} post={item.loss} />;
            }
            if (item.type === "whale" && item.whale) {
              return <WhalePost key={`whale-${item.whale.traderId}-${item.whale.pair}-${idx}`} post={item.whale} />;
            }
            return null;
          })}
          {(feedData?.items ?? []).length === 0 && (
            <div className="text-center text-muted-foreground py-16 text-sm tracking-wider font-bold">
              NO POSTS YET
            </div>
          )}
        </div>
      )}
    </div>
  );
}
