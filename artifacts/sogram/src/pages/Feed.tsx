import { useState } from "react";
import {
  useGetFeed, useLikeTrade, useLikeSignal,
  useGetComments, useAddComment,
} from "@workspace/api-client-react";
import type { FeedItem } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { WalletBadge } from "@/components/WalletBadge";
import { useFeedStream } from "@/lib/sse";
import { useRef } from "react";

import { useMyId } from "@/hooks/useAuth";

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
  const myId = useMyId();
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
    if (myId === null) return;
    addComment({ postType, postId, data: { traderId: myId, content: draft.trim() } });
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
              placeholder={myId === null ? "Connect wallet to comment..." : "Add a comment..."}
              disabled={myId === null}
              maxLength={500}
              className="flex-1 bg-card border border-border px-3 py-2 text-[12px] text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 font-mono disabled:opacity-50"
            />
            <button
              onClick={submit}
              disabled={!draft.trim() || isPending || myId === null}
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
  const [, navigate] = useLocation();
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";
  const pnlNum = Number(post.pnlUsd);
  const pnlPctNum = Number(post.pnlPct);
  const isWin = pnlNum >= 0;
  const profileHref = `/traders/${post.traderId}?highlightTradeId=${post.id}`;

  return (
    <div role="link" tabIndex={0} onClick={() => navigate(profileHref)}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(profileHref); }}
      className="border-t border-border py-6 hover:bg-card/30 transition-colors cursor-pointer" data-testid={`feed-trade-${post.id}`}>
      <div className="flex gap-4">
        <RepCircle score={post.traderRepScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="text-white font-extrabold text-sm tracking-wide">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            <Tag label="WIN" accent={isWin} danger={!isWin} />
            {post.isOnChainVerified && <Tag label="ON-CHAIN ✓" accent />}
            {post.traderIsAutoDiscovered && (
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

          {(post.txHash || post.traderWalletAddress) && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 border border-accent/15 bg-accent/[0.03]">
              <WalletBadge
                address={post.traderWalletAddress ?? undefined}
                txHash={post.txHash ?? undefined}
              />
              <span className="text-muted-foreground text-[9px] ml-auto font-bold tracking-wider">VALUECHAIN VERIFIED</span>
            </div>
          )}
          {post.sodexTradeId && (
            <div className="flex items-center gap-2 mb-3 px-3 py-1.5 border border-accent/30 bg-accent/8"
              style={{ background: "rgba(212,255,0,0.04)", borderColor: "rgba(212,255,0,0.25)" }}>
              <span className="text-accent text-[9px] font-extrabold tracking-widest">SODEX</span>
              <span className="text-accent/60 font-mono text-[10px]">
                #{String(post.sodexTradeId).slice(0, 8)}...
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
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); likeTrade({ tradeId: post.id }); setLiked(true); }}
              className={`bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${liked ? "text-accent" : "text-muted-foreground"}`}
            >
              ♥ {(post.likes ?? post.likeCount ?? 0) + (liked ? 1 : 0)}
            </button>
            <Button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="ml-auto bg-accent text-background hover:bg-accent/90 px-4 py-1.5 font-extrabold text-xs tracking-wide h-auto">
              COPY TRADE
            </Button>
          </div>
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <CommentSection postType="trade" postId={post.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalPost({ post, moderate = false }: { post: NonNullable<FeedItem["signal"]>; moderate?: boolean }) {
  const [, navigate] = useLocation();
  const { mutate: likeSignal } = useLikeSignal();
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";
  const entryN = Number(post.entryPrice);
  const targetN = Number(post.targetPrice);
  const stopN = Number(post.stopLoss);
  const rr = entryN && targetN && stopN && entryN > stopN
    ? ((targetN - entryN) / (entryN - stopN)).toFixed(1)
    : "—";

  const profileHref = `/traders/${post.traderId}?highlightSignalId=${post.id}`;
  // "moderate" — signal from a non-elite trader, surfaced on the Feed (not
  // the Signals page). Renders with neutral border + clear MODERATE badge so
  // users can tell the difference between elite-grade and crowd signals.

  return (
    <div role="link" tabIndex={0} onClick={() => navigate(profileHref)}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(profileHref); }}
      className={`border-t py-6 cursor-pointer transition-colors ${
      moderate ? "border-border/60 hover:bg-card/30 bg-muted/[0.02]" : "border-border hover:bg-card/30"
    }`} data-testid={`feed-${moderate ? "moderate-signal" : "signal"}-${post.id}`}>
      <div className="flex gap-4">
        <RepCircle score={post.traderRepScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="text-white font-extrabold text-sm tracking-wide">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            {moderate ? (
              <span className="bg-transparent border border-muted-foreground/50 text-muted-foreground px-2 py-0.5 text-[10px] font-bold tracking-wider"
                title="Signal from a non-elite trader. Promoted to the Signals page once the trader hits DIAMOND/GOLD or 30d PnL ≥ $5K.">
                MODERATE SIGNAL
              </span>
            ) : (
              <span className="bg-transparent border border-accent/60 text-accent px-2 py-0.5 text-[10px] font-bold tracking-wider">SIGNAL</span>
            )}
            <span className={`border px-1.5 py-0.5 text-[9px] font-black tracking-wider ${
              post.traderTier === "DIAMOND" ? "border-accent text-accent" :
              post.traderTier === "GOLD" ? "border-yellow-400/60 text-yellow-400" :
              "border-border text-muted-foreground"
            }`}>{post.traderTier}</span>
            {post.traderIsAutoDiscovered && (
              <span className="bg-blue-500/15 text-blue-400 border border-blue-400/40 px-1.5 py-0.5 text-[9px] font-black tracking-wider">DISCOVERED</span>
            )}
            <span className="text-muted-foreground text-[11px] ml-auto">{timeAgo(post.createdAt ?? "")}</span>
          </div>
          {(post.traderWalletAddress || post.txHash) && (
            <div className="mb-3"><WalletBadge address={post.traderWalletAddress ?? undefined} txHash={post.txHash ?? undefined} /></div>
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
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); likeSignal({ signalId: post.id }); setLiked(true); }}
              className={`bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${liked ? "text-accent" : "text-muted-foreground"}`}
            >
              ♥ {post.likeCount + (liked ? 1 : 0)}
            </button>
            <Button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              variant="outline"
              className="ml-auto border-accent text-accent hover:bg-accent hover:text-background px-4 py-1.5 font-extrabold text-xs tracking-wide h-auto">
              {moderate ? "ANALYZE TRADER" : "FOLLOW SIGNAL"}
            </Button>
          </div>
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <CommentSection postType="signal" postId={post.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LossPost({ post }: { post: NonNullable<FeedItem["loss"]> }) {
  const [, navigate] = useLocation();
  const pnlNum = Number(post.pnlUsd);
  const pnlPctNum = Number(post.pnlPct);
  const isAnon = post.isAnonymous;
  // Every feed card drills into the trader profile. Anonymity is just a UI
  // affordance on the card itself (masked username + rep) — the public
  // trader profile is the canonical drill-down for every post type. We don't
  // pass a highlight query param because TraderProfile only highlights
  // trade/signal rows — losses surface on the Pain Room.
  const targetHref = `/traders/${post.traderId}`;
  const linkProps = {
    role: "link",
    tabIndex: 0,
    onClick: () => navigate(targetHref),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") navigate(targetHref); },
  };

  return (
    <div {...linkProps} className="border-t border-destructive/20 py-6 bg-destructive/[0.02] hover:bg-destructive/[0.04] cursor-pointer transition-colors">
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
            <Link href="/pain-room" onClick={(e) => e.stopPropagation()}>
              <button className="ml-auto text-[10px] font-extrabold tracking-wider border border-destructive/40 text-destructive px-4 py-1.5 hover:bg-destructive/10 transition-colors bg-transparent cursor-pointer">
                {post.isResolved ? "VIEW BREAKDOWN" : "GIVE BREAKDOWN"}
              </button>
            </Link>
          </div>
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <CommentSection postType="pain_room" postId={post.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function WhalePost({ post }: { post: NonNullable<FeedItem["whale"]> }) {
  const [, navigate] = useLocation();
  const sizeNum = Number(post.positionSizeUsd);
  const isLong = post.side === "LONG";
  const sizeFmt = sizeNum >= 1000000
    ? `$${(sizeNum / 1000000).toFixed(1)}M`
    : `$${(sizeNum / 1000).toFixed(0)}K`;

  const traderId = post.traderId;
  const tradeId = post.tradeId;
  const profileHref = traderId
    ? `/traders/${traderId}${tradeId ? `?highlightTradeId=${tradeId}` : ""}`
    : null;
  return (
    <div
      {...(profileHref ? {
        role: "link", tabIndex: 0,
        onClick: () => navigate(profileHref),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") navigate(profileHref); },
      } : {})}
      className={`border-t border-border py-5 ${profileHref ? "hover:bg-card/30 transition-colors cursor-pointer" : ""}`}>
      <div className="flex gap-4 items-center">
        <div className="w-10 h-10 border-[1.5px] border-border flex items-center justify-center shrink-0">
          <span className="text-muted-foreground text-[10px] font-black">🐋</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <span className="text-white font-extrabold text-sm">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            <span className="bg-transparent border border-border text-muted-foreground px-2 py-0.5 text-[10px] font-bold tracking-wider">WHALE</span>
            {post.traderWalletAddress && (
              <WalletBadge address={post.traderWalletAddress} compact />
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

interface IntelligenceItem {
  id: string;
  category: number;
  title: string | null;
  content: string;
  url: string;
  publishedAt: string;
  author: string;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  isVerified: boolean;
  likes: number;
  replies: number;
  retweets: number;
  impressions: number;
  matchedCoins: Array<{ symbol: string; name: string }>;
  tags: string[];
  imageUrl: string | null;
}
interface IntelligenceData {
  news: IntelligenceItem[];
  kolViews: IntelligenceItem[];
  alerts: IntelligenceItem[];
  fetchedAt: string;
}

function intelTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function CoinTag({ symbol }: { symbol: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
      padding: "1px 5px", border: "1px solid rgba(212,255,0,0.35)",
      color: "#D4FF00", background: "rgba(212,255,0,0.07)",
    }}>
      ${symbol}
    </span>
  );
}

function NewsCard({ item }: { item: IntelligenceItem }) {
  const label = item.title || item.content.slice(0, 100);
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      style={{ display: "block", textDecoration: "none", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ color: "#D4FF00", fontSize: 8, fontWeight: 900, marginTop: 3, flexShrink: 0 }}>▸</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#ddd", fontWeight: 600, lineHeight: 1.5 }}>{label}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {item.authorDisplayName || item.author}
            </span>
            <span style={{ fontSize: 9, color: "#444" }}>·</span>
            <span style={{ fontSize: 9, color: "#444", fontFamily: "JetBrains Mono, monospace" }}>{intelTimeAgo(item.publishedAt)}</span>
            {item.matchedCoins.slice(0, 3).map(c => <CoinTag key={c.symbol} symbol={c.symbol} />)}
          </div>
        </div>
      </div>
    </a>
  );
}

function KolCard({ item }: { item: IntelligenceItem }) {
  const text = item.content.slice(0, 180) + (item.content.length > 180 ? "…" : "");
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      style={{ display: "block", textDecoration: "none", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        {item.authorAvatar ? (
          <img src={item.authorAvatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#666", fontWeight: 800 }}>
            {(item.authorDisplayName || item.author || "?")[0].toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>{item.authorDisplayName || item.author}</span>
            {item.isVerified && (
              <span style={{ fontSize: 8, background: "#1d9bf0", color: "#fff", padding: "1px 4px", fontWeight: 900, letterSpacing: "0.05em" }}>✓ CT</span>
            )}
            <span style={{ fontSize: 9, color: "#555", marginLeft: "auto" }}>{intelTimeAgo(item.publishedAt)}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#bbb", lineHeight: 1.5, fontWeight: 400 }}>{text}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            {item.matchedCoins.slice(0, 3).map(c => <CoinTag key={c.symbol} symbol={c.symbol} />)}
            {item.likes > 0 && (
              <span style={{ fontSize: 9, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>♥ {item.likes}</span>
            )}
            {item.retweets > 0 && (
              <span style={{ fontSize: 9, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>↺ {item.retweets}</span>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

function AlertCard({ item }: { item: IntelligenceItem }) {
  const text = (item.title || item.content).slice(0, 160) + ((item.title || item.content).length > 160 ? "…" : "");
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      style={{ display: "block", textDecoration: "none", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚡</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#e0c97f", fontWeight: 600, lineHeight: 1.5 }}>{text}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#555", fontWeight: 700 }}>{item.authorDisplayName || item.author}</span>
            <span style={{ fontSize: 9, color: "#444" }}>·</span>
            <span style={{ fontSize: 9, color: "#444", fontFamily: "JetBrains Mono, monospace" }}>{intelTimeAgo(item.publishedAt)}</span>
            {item.tags.slice(0, 3).map(t => (
              <span key={t} style={{ fontSize: 9, color: "#666", padding: "1px 4px", border: "1px solid rgba(255,255,255,0.1)" }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </a>
  );
}

type IntelTab = "news" | "kol" | "alerts";

function SoSoValueIntelligence() {
  const [tab, setTab] = useState<IntelTab>("news");

  const { data, isLoading } = useQuery<IntelligenceData>({
    queryKey: ["soso-intelligence"],
    queryFn: async () => {
      const res = await fetch("/api/market/intelligence");
      if (!res.ok) throw new Error("Failed to fetch intelligence");
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const tabs: { key: IntelTab; label: string; count: number }[] = [
    { key: "news",   label: "NEWS",     count: data?.news?.length ?? 0 },
    { key: "kol",    label: "KOL VIEWS", count: data?.kolViews?.length ?? 0 },
    { key: "alerts", label: "ALERTS",   count: data?.alerts?.length ?? 0 },
  ];

  const items = tab === "news" ? data?.news : tab === "kol" ? data?.kolViews : data?.alerts;

  return (
    <div style={{
      border: "1px solid rgba(212,255,0,0.18)",
      background: "linear-gradient(160deg, rgba(212,255,0,0.025) 0%, rgba(0,0,0,0) 60%)",
      marginBottom: 6,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#D4FF00" }} />
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "#D4FF00" }}>SOSOVALUE INTELLIGENCE</span>
        <span style={{
          marginLeft: "auto", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
          color: "#444", padding: "2px 6px", border: "1px solid rgba(255,255,255,0.08)",
        }}>POWERED BY SOSOVALUE</span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: "7px 14px", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em",
            color: tab === t.key ? "#D4FF00" : "#555",
            borderBottom: tab === t.key ? "2px solid #D4FF00" : "2px solid transparent",
            transition: "color 0.15s",
          }}>
            {t.label}{t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "0 14px", maxHeight: 320, overflowY: "auto" }}>
        {isLoading && (
          <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 48, background: "rgba(255,255,255,0.03)", borderRadius: 2 }} />
            ))}
          </div>
        )}
        {!isLoading && (!items || items.length === 0) && (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, color: "#444", fontWeight: 600, letterSpacing: "0.08em" }}>
            NO DATA AVAILABLE
          </div>
        )}
        {!isLoading && items && items.map(item =>
          tab === "news" ? <NewsCard key={item.id} item={item} /> :
          tab === "kol"  ? <KolCard  key={item.id} item={item} /> :
                           <AlertCard key={item.id} item={item} />
        )}
      </div>
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

      {/* SoSoValue Intelligence */}
      <SoSoValueIntelligence />

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
            if (item.type === "moderate_signal") {
              const mod = item.moderateSignal ?? item.signal;
              if (mod) {
                return <SignalPost key={`mod-signal-${mod.id ?? idx}`} post={mod} moderate />;
              }
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
