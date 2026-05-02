import { useState } from "react";
import { useGetFeed, useLikeTrade, useLikeSignal } from "@workspace/api-client-react";
import type { FeedItem } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function RepCircle({ score }: { score: number }) {
  const color = score >= 90 ? "text-accent border-accent/50" : "text-white border-white/20";
  return (
    <div className={`w-10 h-10 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${color}`}>
      <span className="text-[11px] font-bold font-mono tracking-tighter">{score.toFixed(0)}</span>
    </div>
  );
}

function Tag({ label, accent, danger }: { label: string; accent?: boolean; danger?: boolean }) {
  return (
    <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 border ${
      accent ? "bg-accent text-background border-accent" :
      danger ? "bg-transparent text-destructive border-destructive/60" :
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
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function WinPost({ post }: { post: NonNullable<FeedItem["trade"]> }) {
  const { mutate: likeTrade } = useLikeTrade();
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";
  const pnlNum = Number(post.pnlUsd);
  const pnlPctNum = Number(post.pnlPct);
  const isWin = pnlNum >= 0;

  const handleLike = () => {
    likeTrade({ tradeId: post.id });
    setLiked(true);
  };

  return (
    <div className="border-t border-border py-6" data-testid={`feed-trade-${post.id}`}>
      <div className="flex gap-4">
        <RepCircle score={post.traderRepScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="text-white font-extrabold text-sm tracking-wide">{post.traderUsername}</span>
            <span className="text-muted-foreground text-xs font-mono">@{post.traderHandle}</span>
            <Tag label="WIN" accent={isWin} danger={!isWin} />
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
                {post.isOnChainVerified && <Tag label="VERIFIED" accent />}
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

          <div className="flex items-center gap-5">
            <button
              data-testid={`like-trade-${post.id}`}
              onClick={handleLike}
              className={`bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                liked ? "text-accent" : "text-muted-foreground"
              }`}
            >
              ♥ {post.likes + (liked ? 1 : 0)}
            </button>
            <Button className="ml-auto bg-accent text-background hover:bg-accent/90 px-4 py-1.5 font-extrabold text-xs tracking-wide h-auto">
              COPY TRADE
            </Button>
          </div>
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
            <span className="bg-transparent border border-accent/60 text-accent px-2 py-0.5 text-[10px] font-bold tracking-wider">
              SIGNAL
            </span>
            <span className="text-muted-foreground text-[11px] ml-auto">{timeAgo(post.createdAt ?? "")}</span>
          </div>

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
                  <div className={`font-bold text-[13px] font-mono ${
                    l === "TARGET" ? "text-accent" : l === "STOP" ? "text-destructive" : "text-white"
                  }`}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <button
              data-testid={`like-signal-${post.id}`}
              onClick={() => { likeSignal({ signalId: post.id }); setLiked(true); }}
              className={`bg-transparent border-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                liked ? "text-accent" : "text-muted-foreground"
              }`}
            >
              ♥ {post.likeCount + (liked ? 1 : 0)}
            </button>
            <Button variant="outline" className="ml-auto border-accent text-accent hover:bg-accent hover:text-background px-4 py-1.5 font-extrabold text-xs tracking-wide h-auto">
              FOLLOW SIGNAL
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Feed() {
  const [tab, setTab] = useState<"all" | "wins" | "signals">("all");

  const { data: feedData, isLoading } = useGetFeed(
    { filter: tab, limit: 20, offset: 0 },
    { query: { queryKey: ["feed", tab] } }
  );

  return (
    <div className="px-8 pb-10 max-w-[800px] w-full">
      <div className="flex items-center gap-0 border-b border-border sticky top-0 bg-background z-10 -mx-8 px-8 mb-4">
        {(["all", "wins", "signals"] as const).map((t) => (
          <button
            key={t}
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`bg-transparent border-none border-b-2 px-4 h-14 font-bold text-xs tracking-wider cursor-pointer uppercase ${
              tab === t ? "text-accent border-accent" : "text-muted-foreground border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

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
          {feedData?.items?.map((item, idx) =>
            item.type === "trade" && item.trade ? (
              <WinPost key={`trade-${item.trade.id ?? idx}`} post={item.trade} />
            ) : item.type === "signal" && item.signal ? (
              <SignalPost key={`signal-${item.signal.id ?? idx}`} post={item.signal} />
            ) : null
          )}
          {feedData?.items?.length === 0 && (
            <div className="text-center text-muted-foreground py-16 text-sm tracking-wider font-bold">
              NO POSTS YET
            </div>
          )}
        </div>
      )}
    </div>
  );
}
