import { useState } from "react";
import {
  useGetAnalyticsSummary,
  useGetWhaleActivity,
  useGetWhaleWallets,
  useScanValueChain,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { IndexerPanel } from "@/components/IndexerPanel";

function fmtNum(n: number) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

function truncAddr(addr: string) {
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

function timeAgoFromIso(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const WHALES_KEY = ["whaleWallets"];

function ValueChainPanel() {
  const qc = useQueryClient();
  const [addressInput, setAddressInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [isAutoScanning, setIsAutoScanning] = useState(false);

  const { data: walletsData, isLoading } = useGetWhaleWallets(
    { limit: 20 },
    { query: { queryKey: WHALES_KEY } }
  );

  const { mutate: scanChain, isPending: isScanning } = useScanValueChain({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: WHALES_KEY });
        if (isAutoScanning) {
          setScanMsg(`Auto-scan: found ${data.newFound} new wallet${data.newFound !== 1 ? "s" : ""} from ${data.scanned} interactions`);
          setIsAutoScanning(false);
        } else {
          setScanMsg(data.newFound > 0 ? `Added new wallet` : "Wallet already tracked or no Sodex activity found");
          setAddressInput("");
          setLabelInput("");
        }
        setTimeout(() => setScanMsg(null), 4000);
      },
      onError: () => {
        setScanMsg("Scan failed — check address format");
        setIsAutoScanning(false);
        setTimeout(() => setScanMsg(null), 3000);
      },
    },
  });

  const handleScanAddress = () => {
    if (!addressInput.trim() || isScanning) return;
    scanChain({ data: { address: addressInput.trim(), label: labelInput.trim() || undefined } });
  };

  const handleAutoScan = () => {
    setIsAutoScanning(true);
    scanChain({ data: {} });
  };

  const wallets = walletsData?.wallets ?? [];

  return (
    <div className="border border-border bg-card p-6 mt-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-black text-[13px] tracking-wider text-white mb-1">VALUECHAIN WHALE SCANNER</div>
          <div className="text-muted-foreground text-[11px] tracking-wider uppercase">
            On-chain wallet discovery via Sodex contract interactions
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-blue-400 text-[10px] font-extrabold tracking-widest">VALUECHAIN</span>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          value={addressInput}
          onChange={e => setAddressInput(e.target.value)}
          placeholder="0x... wallet address"
          className="flex-1 bg-background border border-border px-3 py-2 text-[12px] text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 font-mono"
        />
        <input
          value={labelInput}
          onChange={e => setLabelInput(e.target.value)}
          placeholder="Label (optional)"
          className="w-36 bg-background border border-border px-3 py-2 text-[12px] text-white placeholder:text-muted-foreground focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={handleScanAddress}
          disabled={!addressInput.trim() || isScanning}
          className="bg-accent text-background px-4 py-2 text-[10px] font-black tracking-wider cursor-pointer hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-none"
        >
          SCAN
        </button>
        <button
          onClick={handleAutoScan}
          disabled={isScanning}
          className="bg-transparent border border-border text-muted-foreground px-4 py-2 text-[10px] font-black tracking-wider cursor-pointer hover:text-white hover:border-white/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          AUTO-DISCOVER
        </button>
      </div>

      {scanMsg && (
        <div className="mb-4 px-3 py-2 border border-accent/30 bg-accent/5 text-accent text-[11px] font-bold tracking-wide">
          {scanMsg}
        </div>
      )}

      {isScanning && (
        <div className="mb-4 px-3 py-2 border border-border text-muted-foreground text-[11px] font-bold tracking-wide flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Scanning ValueChain (EVM 286623)...
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : wallets.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 text-sm tracking-wider font-bold border border-dashed border-border">
          NO WALLETS TRACKED YET — SCAN AN ADDRESS OR AUTO-DISCOVER
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          <div className="grid grid-cols-5 gap-3 px-3 py-2 border-b border-border mb-1">
            {["ADDRESS", "LABEL", "TX COUNT", "LAST SEEN", "STATUS"].map(h => (
              <div key={h} className="text-[9px] font-extrabold tracking-widest text-muted-foreground">{h}</div>
            ))}
          </div>
          {wallets.map((w, i) => (
            <div key={w.id} className={`grid grid-cols-5 gap-3 px-3 py-3 items-center ${i < wallets.length - 1 ? "border-b border-border/40" : ""} hover:bg-white/[0.02] transition-colors`}>
              <div className="font-mono text-[11px] text-accent/80">{truncAddr(w.address)}</div>
              <div className="text-[11px] text-muted-foreground font-bold">
                {w.label || <span className="italic opacity-50">unlabeled</span>}
              </div>
              <div className="font-mono text-white font-black text-[13px]">{(w.txCount ?? 0).toLocaleString()}</div>
              <div className="text-muted-foreground text-[10px] font-mono">{timeAgoFromIso(w.lastSeenAt ?? undefined)}</div>
              <div>
                {w.isProfiled ? (
                  <span className="text-[9px] font-black tracking-wider border border-accent/50 text-accent px-2 py-0.5">PROFILED</span>
                ) : (
                  <span className="text-[9px] font-black tracking-wider border border-border text-muted-foreground px-2 py-0.5">WATCHING</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-muted-foreground text-[10px] leading-relaxed">
          <span className="text-accent font-bold">ValueChain</span> is the EVM network (Chain ID 286623) underpinning Sodex.
          Wallets are discovered by scanning interactions with Sodex perp contracts.
          Bot address <span className="font-mono text-[9px]">0x7ce7a7...1f80a</span> is excluded.
        </p>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary({ query: { queryKey: ["analyticsSummary"] } });
  const { data: whalesData, isLoading: isLoadingWhales } = useGetWhaleActivity({ query: { queryKey: ["whaleActivity"] } });

  const macroStats = summary ? [
    { label: "TOTAL TRADERS", value: (summary.totalTraders ?? summary.activeTraders ?? 0).toString(), note: "ACTIVE ON PLATFORM", direction: "up" as const },
    { label: "AVG WIN RATE", value: `${(summary.avgWinRate ?? 0).toFixed(1)}%`, note: "PLATFORM AVERAGE", direction: "up" as const },
    { label: "TOTAL TRADES", value: (summary.totalTrades ?? 0).toLocaleString(), note: "ALL TIME", direction: null },
    { label: "TOTAL PNL", value: fmtNum(Number(summary.totalPnl ?? 0)), note: "NET REALIZED", direction: Number(summary.totalPnl ?? 0) >= 0 ? "up" as const : "down" as const },
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
          <div className="text-muted-foreground text-[11px] mb-5 uppercase tracking-wider">BY OPEN INTEREST · {summary?.totalTraders ?? summary?.activeTraders ?? "—"} TRADERS</div>

          {isLoadingSummary ? (
            <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="flex flex-col gap-4">
              {(summary?.pairAnalytics ?? summary?.crowdPositions ?? []).map(row => (
                <div key={row.pair}>
                  <div className="flex justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-extrabold text-xs tracking-wide text-white">{row.pair}</span>
                      <span className="text-muted-foreground text-[11px] font-mono">{fmtNum(Number(row.volume))}</span>
                    </div>
                    <div className="flex gap-2.5 items-center">
                      <span className="text-accent text-[11px] font-mono font-bold">{(row.longsPct ?? (row as {longPct?: number}).longPct ?? 0)}%L</span>
                      <span className="text-destructive text-[11px] font-mono font-bold">{(row.shortsPct ?? (row as {shortPct?: number}).shortPct ?? 0)}%S</span>
                    </div>
                  </div>
                  <div className="h-[3px] flex overflow-hidden bg-border">
                    <div className="bg-accent/70" style={{ width: `${row.longsPct ?? (row as {longPct?: number}).longPct ?? 0}%` }} />
                    <div className="bg-destructive/50 flex-1" />
                  </div>
                </div>
              ))}
              {(!(summary?.pairAnalytics ?? summary?.crowdPositions) || (summary?.pairAnalytics ?? summary?.crowdPositions ?? []).length === 0) && (
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

      <IndexerPanel />

      <ValueChainPanel />
    </div>
  );
}
