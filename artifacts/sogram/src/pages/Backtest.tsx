import { useState } from "react";
import { fetchJson } from "@/lib/api";

type BacktestResult = {
  walletAddress: string;
  windowDays: number;
  startDate: string;
  startingBalanceUsd: number;
  tradeSizeUsd: number;
  endingBalanceUsd: number;
  copyPnlUsd: number;
  copyReturnPct: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  winRate: number;
  tradeCount: number;
  bestSymbol: string | null;
  worstSymbol: string | null;
  avgHoldMinutes: number;
  longestLosingStreak: number;
  worstMonth: { month: string; pnlUsd: number; returnPct: number } | null;
  sharpe: number;
  monthlyReturns: Array<{ month: string; pnlUsd: number; returnPct: number }>;
  equityCurve: Array<{ timestamp: string; equity: number; pnlUsd: number; symbol: string; side: string }>;
  symbolAttribution: Array<{ symbol: string; pnlUsd: number; returnPct: number }>;
};

type CloneResult = BacktestResult & {
  label: string;
  accountId?: string;
};

function parseWalletLine(line: string, index: number) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [left, maybeAccount] = trimmed.split(",").map(part => part.trim());
  const urlLike = left.includes("?") ? new URL(left, "https://local") : null;
  const walletAddress = (urlLike ? urlLike.pathname.replace("/", "") : left).toLowerCase();
  const accountId = maybeAccount || urlLike?.searchParams.get("accountId") || undefined;
  if (!/^0x[0-9a-f]{40}$/.test(walletAddress)) return null;
  return {
    label: `Wallet ${String.fromCharCode(65 + index)}`,
    walletAddress,
    accountId,
  };
}

function money(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function hold(value: number) {
  if (value >= 1440) return `${(value / 1440).toFixed(1)}d`;
  if (value >= 60) return `${(value / 60).toFixed(1)}h`;
  return `${value.toFixed(0)}m`;
}

export default function Backtest() {
  const [walletsText, setWalletsText] = useState("");
  const [windowDays, setWindowDays] = useState(180);
  const [tradeSizeUsd, setTradeSizeUsd] = useState(100);
  const [startingBalanceUsd, setStartingBalanceUsd] = useState(1000);
  const [startDate, setStartDate] = useState(`${new Date().getUTCFullYear()}-01-01`);
  const [results, setResults] = useState<CloneResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    const wallets = walletsText.split("\n").map(parseWalletLine).filter(Boolean) as Array<ReturnType<typeof parseWalletLine> & {}>;
    if (wallets.length === 0) {
      setError("Enter at least one wallet address.");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    try {
      const next = await Promise.all(wallets.slice(0, 5).map(async wallet => {
        const json = await fetchJson<{ result: BacktestResult }>(`/api/wallets/${wallet.walletAddress}/backtest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            windowDays,
            tradeSizeUsd,
            startingBalanceUsd,
            startDate,
            accountId: wallet.accountId,
          }),
        });
        return { ...json.result, label: wallet.label, accountId: wallet.accountId };
      }));
      setResults(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const winner = [...results].sort((a, b) => b.copyReturnPct - a.copyReturnPct)[0] ?? null;

  return (
    <div className="px-8 pb-10 max-w-[1200px] w-full pt-8">
      <div className="mb-6">
        <div className="text-[10px] font-black tracking-[0.24em] text-accent mb-2">PORTFOLIO CLONE SIMULATOR</div>
        <h1 className="text-3xl font-black tracking-wide text-white">Before copying a wallet, simulate it.</h1>
        <div className="text-muted-foreground text-[12px] font-bold tracking-wider mt-2">
          Compare Wallet A vs Wallet B vs Wallet C using live SoDEX position history.
        </div>
      </div>

      <div className="border border-border bg-card p-4 mb-6 grid grid-cols-1 lg:grid-cols-[1fr_120px_140px_160px_150px_120px] gap-3 items-end">
        <Field label="WALLETS">
          <textarea
            value={walletsText}
            onChange={e => setWalletsText(e.target.value)}
            placeholder={"0x... ?accountId=123\n0x...,456\n0x..."}
            rows={4}
            className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white resize-none"
          />
        </Field>
        <Field label="DAYS">
          <input type="number" value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white" />
        </Field>
        <Field label="TRADE SIZE">
          <input type="number" value={tradeSizeUsd} onChange={e => setTradeSizeUsd(Number(e.target.value))} className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white" />
        </Field>
        <Field label="START BALANCE">
          <input type="number" value={startingBalanceUsd} onChange={e => setStartingBalanceUsd(Number(e.target.value))} className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white" />
        </Field>
        <Field label="START DATE">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white" />
        </Field>
        <button onClick={run} disabled={loading} className="bg-accent text-background px-4 py-2 text-[10px] font-black tracking-widest disabled:opacity-50">
          {loading ? "RUNNING" : "SIMULATE"}
        </button>
      </div>

      {error && <div className="border border-destructive text-destructive px-4 py-3 text-sm mb-6">{error}</div>}

      {winner && (
        <div className="border border-accent/40 bg-accent/5 p-5 mb-6">
          <div className="text-[10px] font-black tracking-widest text-accent mb-2">BEST CLONE RESULT</div>
          <div className="text-white text-xl font-black">
            {winner.label} would turn ${startingBalanceUsd.toLocaleString()} into ${winner.endingBalanceUsd.toLocaleString()}.
          </div>
          <div className="text-muted-foreground text-sm mt-2">
            Return {winner.copyReturnPct.toFixed(2)}%, max drawdown {winner.maxDrawdownPct.toFixed(2)}%, Sharpe {winner.sharpe.toFixed(2)}.
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
            {results.map(result => <CloneCard key={result.walletAddress} result={result} />)}
          </div>

          <div className="border border-border bg-card overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-10 gap-3 px-4 py-3 border-b border-border text-[9px] font-black tracking-widest text-muted-foreground">
                <div>WALLET</div>
                <div>ENDING</div>
                <div>PNL</div>
                <div>RETURN</div>
                <div>DRAWDOWN</div>
                <div>LOSING STREAK</div>
                <div>WORST MONTH</div>
                <div>SHARPE</div>
                <div>WIN RATE</div>
                <div>AVG HOLD</div>
              </div>
              {results.map(result => (
                <div key={result.walletAddress} className="grid grid-cols-10 gap-3 px-4 py-4 border-b border-border last:border-b-0 text-[12px] font-mono text-white">
                  <div className="truncate">{result.label}</div>
                  <div>{money(result.endingBalanceUsd)}</div>
                  <div className={result.copyPnlUsd >= 0 ? "text-accent" : "text-destructive"}>{money(result.copyPnlUsd)}</div>
                  <div className={result.copyReturnPct >= 0 ? "text-accent" : "text-destructive"}>{result.copyReturnPct.toFixed(2)}%</div>
                  <div>{result.maxDrawdownPct.toFixed(2)}%</div>
                  <div>{result.longestLosingStreak}</div>
                  <div>{result.worstMonth ? `${result.worstMonth.month} ${result.worstMonth.returnPct.toFixed(1)}%` : "N/A"}</div>
                  <div>{result.sharpe.toFixed(2)}</div>
                  <div>{result.winRate.toFixed(1)}%</div>
                  <div>{hold(result.avgHoldMinutes)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CloneCard({ result }: { result: CloneResult }) {
  return (
    <div className="border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-white font-black">{result.label}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[240px]">{result.walletAddress}</div>
        </div>
        <div className={`text-2xl font-black font-mono ${result.copyPnlUsd >= 0 ? "text-accent" : "text-destructive"}`}>
          {result.copyReturnPct.toFixed(1)}%
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="ENDING" value={money(result.endingBalanceUsd)} />
        <Metric label="COPY PNL" value={money(result.copyPnlUsd)} good={result.copyPnlUsd >= 0} />
        <Metric label="MAX DD" value={`${result.maxDrawdownPct.toFixed(1)}%`} />
        <Metric label="SHARPE" value={result.sharpe.toFixed(2)} />
        <Metric label="WIN RATE" value={`${result.winRate.toFixed(1)}%`} />
        <Metric label="TRADES" value={String(result.tradeCount)} />
        <Metric label="LOSS STREAK" value={String(result.longestLosingStreak)} />
        <Metric label="AVG HOLD" value={hold(result.avgHoldMinutes)} />
      </div>
      <div className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
        Worst month: <span className="text-white">{result.worstMonth ? `${result.worstMonth.month} (${result.worstMonth.returnPct.toFixed(1)}%)` : "N/A"}</span>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        Best symbol: <span className="text-white">{result.bestSymbol ?? "N/A"}</span> / Worst: <span className="text-white">{result.worstSymbol ?? "N/A"}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={label === "WALLETS" ? "lg:row-span-2" : ""}>
      <div className="text-[9px] font-black tracking-widest text-muted-foreground mb-2">{label}</div>
      {children}
    </label>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const valueClass = good === undefined ? "text-white" : good ? "text-accent" : "text-destructive";
  return (
    <div className="border border-border bg-background/40 p-3">
      <div className="text-[8px] font-black tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={`font-black font-mono text-lg ${valueClass}`}>{value}</div>
    </div>
  );
}
