import { useState } from "react";
import { useListCopyConfigs, useListTraders, useUpsertCopyConfig } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`w-[38px] h-[22px] relative cursor-pointer transition-colors shrink-0 ${value ? "bg-accent" : "bg-border"}`}
      data-testid="toggle-active"
    >
      <div className={`absolute top-[3px] w-4 h-4 transition-all ${value ? "left-[19px] bg-background" : "left-[3px] bg-muted-foreground"}`} />
    </div>
  );
}

function Slider({ value, onChange, min = 0, max = 100, accent = false }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; accent?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const trackColor = accent ? "bg-accent" : "bg-muted-foreground";
  return (
    <div className="relative h-5 flex items-center">
      <div className="relative flex-1 h-[3px] bg-border">
        <div className={`h-full ${trackColor}`} style={{ width: `${pct}%` }} />
        <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer m-0 z-10" />
        <div className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-background rounded-full pointer-events-none ${trackColor}`}
          style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtPnl(usd: string) {
  const n = Number(usd);
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

const MY_FOLLOWER_ID = 999;

export default function CopyTrading() {
  const { toast } = useToast();
  const [selectedLeaderId, setSelectedLeaderId] = useState<number | null>(null);
  const [maxSize, setMaxSize] = useState(500);
  const [maxLeverage, setMaxLeverage] = useState(5);
  const [stopLoss, setStopLoss] = useState(10);
  const [active, setActive] = useState(true);

  const { data: configsData } = useListCopyConfigs(
    { followerId: MY_FOLLOWER_ID },
    { query: { queryKey: ["copyConfigs"] } }
  );
  const { data: tradersData, isLoading: isLoadingTraders } = useListTraders(
    { limit: 6 },
    { query: { queryKey: ["tradersList"] } }
  );
  const { mutate: upsertConfig, isPending } = useUpsertCopyConfig();

  const leaders = tradersData?.traders ?? [];
  const leader = leaders.find(l => l.id === selectedLeaderId) ?? leaders[0] ?? null;

  const handleActivate = () => {
    if (!leader) return;
    upsertConfig({
      data: {
        followerId: MY_FOLLOWER_ID,
        leaderId: leader.id,
        isActive: active,
        maxPositionSizeUsd: maxSize,
        maxLeverage,
        stopLossPct: stopLoss,
      },
    }, {
      onSuccess: () => {
        toast({ title: active ? "Copy trading activated" : "Copy trading paused", description: `Linked to ${leader.username}` });
      },
    });
  };

  if (isLoadingTraders) return (
    <div className="p-8 max-w-[1000px] w-full">
      <Skeleton className="h-64 w-full" />
    </div>
  );

  return (
    <div className="px-8 pb-10 max-w-[1000px] w-full pt-8">
      <div className="grid grid-cols-[300px_1fr] gap-5">
        <div>
          <div className="text-[10px] font-extrabold tracking-widest text-muted-foreground mb-3.5 uppercase">SELECT LEADER</div>
          <div className="flex flex-col gap-2 mb-5">
            {leaders.map((l) => {
              const isSelected = (selectedLeaderId === null ? l.id === leader?.id : selectedLeaderId === l.id);
              return (
                <div
                  key={l.id}
                  onClick={() => setSelectedLeaderId(l.id)}
                  data-testid={`select-leader-${l.id}`}
                  className={`border p-3.5 cursor-pointer transition-colors ${
                    isSelected ? "border-accent bg-accent/5" : "border-border bg-card hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center text-[11px] font-black ${
                      isSelected ? "border-accent text-accent" : "border-border text-muted-foreground"
                    }`}>{l.username.slice(0, 2).toUpperCase()}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-extrabold text-xs tracking-wide text-white">{l.username}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 font-black tracking-wider ${
                          l.tier === "DIAMOND" ? "bg-accent text-background" : "border border-border text-muted-foreground bg-transparent"
                        }`}>{l.tier}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px] font-mono">@{l.handle}</span>
                    </div>
                    {isSelected && <span className="text-accent text-sm font-black">✓</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-muted-foreground text-[9px] font-extrabold tracking-wider mb-1">TOTAL PNL</div>
                      <div className="text-accent text-sm font-black font-mono">{fmtPnl(l.totalPnlUsd)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[9px] font-extrabold tracking-wider mb-1">WIN RATE</div>
                      <div className="text-white text-sm font-black font-mono">{Number(l.winRate).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[9px] font-extrabold tracking-wider mb-1">FOLLOWERS</div>
                      <div className="text-white text-sm font-black font-mono">{l.followerCount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {leader ? (
          <div className="flex flex-col gap-3.5">
            <div className="border border-border p-6 bg-card">
              <div className="font-black text-sm tracking-wide text-white mb-6 uppercase">COPY SETTINGS — {leader.username}</div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between mb-2.5">
                    <span className="text-muted-foreground text-[11px] font-bold tracking-wider">MAX PER TRADE</span>
                    <span className="text-accent font-black text-[15px] font-mono">${maxSize}</span>
                  </div>
                  <Slider value={maxSize} onChange={setMaxSize} min={100} max={5000} accent />
                  <div className="text-muted-foreground text-[11px] mt-2">Cap any single copied position</div>
                </div>
                <div>
                  <div className="flex justify-between mb-2.5">
                    <span className="text-muted-foreground text-[11px] font-bold tracking-wider">MAX LEVERAGE</span>
                    <span className="text-white font-black text-[15px] font-mono">{maxLeverage}×</span>
                  </div>
                  <Slider value={maxLeverage} onChange={setMaxLeverage} min={1} max={20} />
                  <div className="text-muted-foreground text-[11px] mt-2">Cap leverage on copied trades</div>
                </div>
                <div>
                  <div className="flex justify-between mb-2.5">
                    <span className="text-muted-foreground text-[11px] font-bold tracking-wider">AUTO STOP-COPY</span>
                    <span className="text-destructive font-black text-[15px] font-mono">-{stopLoss}%</span>
                  </div>
                  <Slider value={stopLoss} onChange={setStopLoss} min={5} max={50} />
                  <div className="text-muted-foreground text-[11px] mt-2">Stop copying if drawdown exceeds this</div>
                </div>
                <div className="flex items-center gap-4 border border-border p-4">
                  <div className="flex-1">
                    <div className="font-bold text-[13px] tracking-wide text-white mb-1">COPY STATUS</div>
                    <div className="text-muted-foreground text-[11px]">{active ? "Actively mirroring trades" : "Copying paused"}</div>
                  </div>
                  <Toggle value={active} onChange={setActive} />
                </div>
              </div>
            </div>

            <div className={`border p-4 flex items-center gap-3.5 transition-colors ${active ? "border-accent/40 bg-accent/5" : "border-border bg-transparent"}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-accent animate-pulse" : "bg-muted-foreground"}`} />
              <div className="flex-1">
                <div className={`font-extrabold text-[13px] tracking-wide ${active ? "text-accent" : "text-muted-foreground"}`}>
                  {active ? `COPYING ${leader.username} — LIVE SYNC` : "COPY PAUSED"}
                </div>
                <div className="text-muted-foreground text-[11px] mt-1">
                  MAX ${maxSize} / TRADE · MAX {maxLeverage}× LEVERAGE · STOP AT -{stopLoss}%
                </div>
              </div>
            </div>

            <button
              data-testid="button-activate-copy"
              onClick={handleActivate}
              disabled={isPending}
              className="bg-accent text-background border-none p-4 font-black text-sm cursor-pointer tracking-widest w-full hover:bg-accent/90 transition-colors uppercase disabled:opacity-50"
            >
              {isPending ? "SAVING..." : active ? "ACTIVATE COPY TRADING" : "PAUSE COPY TRADING"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center border border-border bg-card text-muted-foreground font-bold tracking-wider text-sm">
            SELECT A LEADER TO CONFIGURE COPY SETTINGS
          </div>
        )}
      </div>

      {configsData?.configs && configsData.configs.length > 0 && (
        <div className="mt-8 border border-border bg-card p-6">
          <div className="font-black text-sm tracking-wide text-white mb-5">ACTIVE COPY CONFIGS</div>
          <div className="flex flex-col gap-0">
            {configsData.configs.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-4 py-3.5 ${i < configsData.configs.length - 1 ? "border-b border-border/50" : ""}`}>
                <div className={`w-2 h-2 rounded-full ${c.isActive ? "bg-accent" : "bg-muted-foreground"}`} />
                <span className="text-white font-bold text-xs tracking-wide flex-1">{c.leaderUsername ?? `TRADER #${c.leaderId}`}</span>
                <span className="text-muted-foreground text-[10px] font-mono">MAX ${c.maxPositionSizeUsd}</span>
                <span className="text-muted-foreground text-[10px] font-mono">{c.maxLeverage}× LEV</span>
                <span className="text-muted-foreground text-[10px] font-mono">-{c.stopLossPct}% STOP</span>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 border tracking-wider ${
                  c.isActive ? "border-accent/50 text-accent" : "border-border text-muted-foreground"
                }`}>{c.isActive ? "ACTIVE" : "PAUSED"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
