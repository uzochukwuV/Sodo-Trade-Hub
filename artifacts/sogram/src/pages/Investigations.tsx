import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";

type WalletActivity = {
  address: string;
  trades: unknown[];
  positions: unknown[];
  orders: unknown[];
  fundings: unknown[];
};

type AnalysisCluster = {
  type: "deposit_to_position" | "synchronized_entry";
  severity: "low" | "medium" | "high";
  title: string;
  walletAddresses: string[];
  symbol?: string;
  side?: string;
  blockNumbers: number[];
  evidence: Record<string, unknown>;
};

type BlockFacts = {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  txCount: number;
  candidateAddresses: string[];
  candidateSources: Array<{ address: string; sources: string[]; txHashes: string[]; hasNativeValue: boolean }>;
  sodexWallets: WalletActivity[];
  clusters: AnalysisCluster[];
  cacheHit: boolean;
};

type RangeResult = {
  input: { startBlock: number; blockCount: number; endBlock: number };
  summary: {
    blocksRequested: number;
    cacheHits: number;
    newlyAnalyzed: number;
    txCount: number;
    candidateAddressCount: number;
    sodexWalletCount: number;
    tradeCount: number;
    positionCount: number;
    clusterCount: number;
    depositToPositionClusters: number;
    synchronizedEntryClusters: number;
    topWallets: Array<{ address: string; trades: number; positions: number; orders: number; fundings: number }>;
  };
  blocks: BlockFacts[];
  rangeClusters: AnalysisCluster[];
};

type SavedInvestigation = {
  id: number;
  title: string;
  startBlock: number;
  blockCount: number;
  endBlock: number;
  summary: RangeResult["summary"];
  createdAt: string;
};

function shortHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString();
}

export default function Investigations() {
  const [startBlock, setStartBlock] = useState("10504201");
  const [blockCount, setBlockCount] = useState(20);
  const [title, setTitle] = useState("ValueChain calldata investigation");
  const [result, setResult] = useState<RangeResult | null>(null);
  const [saved, setSaved] = useState<SavedInvestigation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSaved() {
    const json = await fetchJson<{ investigations: SavedInvestigation[] }>("/api/valuechain/investigations?limit=10");
    setSaved(json.investigations);
  }

  useEffect(() => {
    loadSaved().catch(() => undefined);
  }, []);

  async function runAnalysis() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const json = await fetchJson<{ result: RangeResult }>("/api/valuechain/analyze-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startBlock: Number(startBlock),
          blockCount,
        }),
      });
      setResult(json.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveInvestigation() {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      await fetchJson<{ investigation: SavedInvestigation }>("/api/valuechain/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, result }),
      });
      await loadSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-8 pb-10 max-w-[1200px] w-full pt-8">
      <div className="mb-6">
        <div className="text-[10px] font-black tracking-[0.24em] text-accent mb-2">VALUECHAIN INVESTIGATIONS</div>
        <h1 className="text-3xl font-black tracking-wide text-white">Calldata-to-SoDEX block analysis.</h1>
        <div className="text-muted-foreground text-[12px] font-bold tracking-wider mt-2">
          Analyze up to 20 blocks on demand, cache each block permanently, and surface wallet activity clusters.
        </div>
      </div>

      <div className="border border-border bg-card p-4 mb-6 grid grid-cols-1 lg:grid-cols-[180px_140px_1fr_130px] gap-3 items-end">
        <Field label="START BLOCK">
          <input
            value={startBlock}
            onChange={e => setStartBlock(e.target.value)}
            className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white"
          />
        </Field>
        <Field label="BLOCK COUNT">
          <input
            type="number"
            min={1}
            max={20}
            value={blockCount}
            onChange={e => setBlockCount(Math.min(20, Math.max(1, Number(e.target.value))))}
            className="w-full bg-background border border-border px-3 py-2 text-[12px] font-mono text-white"
          />
        </Field>
        <Field label="SAVE TITLE">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-background border border-border px-3 py-2 text-[12px] text-white"
          />
        </Field>
        <button onClick={runAnalysis} disabled={loading} className="bg-accent text-background px-4 py-2 text-[10px] font-black tracking-widest disabled:opacity-50">
          {loading ? "ANALYZING" : "RUN"}
        </button>
      </div>

      {error && <div className="border border-destructive text-destructive px-4 py-3 text-sm mb-6">{error}</div>}

      {result && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
            <Metric label="BLOCKS" value={String(result.summary.blocksRequested)} />
            <Metric label="CACHE HITS" value={String(result.summary.cacheHits)} good={result.summary.cacheHits > 0} />
            <Metric label="NEW" value={String(result.summary.newlyAnalyzed)} />
            <Metric label="CANDIDATES" value={String(result.summary.candidateAddressCount)} />
            <Metric label="SODEX WALLETS" value={String(result.summary.sodexWalletCount)} good={result.summary.sodexWalletCount > 0} />
            <Metric label="CLUSTERS" value={String(result.summary.clusterCount)} good={result.summary.clusterCount > 0} />
          </div>

          <div className="border border-accent/40 bg-accent/5 p-5 mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black tracking-widest text-accent mb-2">RANGE SUMMARY</div>
              <div className="text-white text-xl font-black">
                Blocks {result.input.startBlock} to {result.input.endBlock}
              </div>
              <div className="text-muted-foreground text-sm mt-2">
                {result.summary.txCount} txs, {result.summary.tradeCount} SoDEX trades, {result.summary.positionCount} positions,
                {" "}{result.summary.depositToPositionClusters} deposit-to-position clusters, {result.summary.synchronizedEntryClusters} synchronized entries.
              </div>
            </div>
            <button onClick={saveInvestigation} disabled={saving} className="border border-accent text-accent px-4 py-2 text-[10px] font-black tracking-widest disabled:opacity-50">
              {saving ? "SAVING" : "SAVE"}
            </button>
          </div>

          {result.rangeClusters.length > 0 && (
            <div className="border border-border bg-card p-5 mb-6">
              <div className="text-[10px] font-black tracking-widest text-muted-foreground mb-4">DETECTED CLUSTERS</div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {result.rangeClusters.map((cluster, index) => (
                  <div key={`${cluster.type}-${index}`} className="border border-border bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-white font-black text-sm">{cluster.title}</div>
                      <span className={`text-[8px] font-black tracking-widest px-2 py-1 ${cluster.severity === "high" ? "bg-destructive text-white" : "bg-accent text-background"}`}>
                        {cluster.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {cluster.type.replaceAll("_", " ")} / blocks {cluster.blockNumbers.join(", ")}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cluster.walletAddresses.map(address => (
                        <span key={address} className="font-mono text-[10px] border border-border px-2 py-1 text-white">
                          {shortHash(address)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
            <div className="border border-border bg-card">
              <div className="px-4 py-3 border-b border-border text-[10px] font-black tracking-widest text-muted-foreground">BLOCK FACTS</div>
              {result.blocks.map(block => <BlockRow key={block.blockNumber} block={block} />)}
            </div>

            <div className="border border-border bg-card p-4 h-fit">
              <div className="text-[10px] font-black tracking-widest text-muted-foreground mb-4">TOP MATCHED WALLETS</div>
              {result.summary.topWallets.length === 0 ? (
                <div className="text-muted-foreground text-sm">No SoDEX wallet activity found in this range.</div>
              ) : result.summary.topWallets.map(wallet => (
                <div key={wallet.address} className="border-b border-border last:border-b-0 py-3">
                  <div className="font-mono text-[11px] text-white">{shortHash(wallet.address)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {wallet.trades} trades / {wallet.positions} positions / {wallet.orders} orders
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="border border-border bg-card p-5 mt-6">
        <div className="text-[10px] font-black tracking-widest text-muted-foreground mb-4">SAVED INVESTIGATIONS</div>
        {saved.length === 0 ? (
          <div className="text-muted-foreground text-sm">No saved investigations yet.</div>
        ) : saved.map(item => (
          <div key={item.id} className="border-b border-border last:border-b-0 py-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-white font-black text-sm">{item.title}</div>
              <div className="text-[10px] text-muted-foreground">
                Blocks {item.startBlock}-{item.endBlock} / {item.summary.sodexWalletCount} wallets / {item.summary.clusterCount} clusters
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">{new Date(item.createdAt).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockRow({ block }: { block: BlockFacts }) {
  return (
    <div className="px-4 py-4 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-white font-black">Block {block.blockNumber}</div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">{shortHash(block.blockHash)} / {fmtTime(block.timestamp)}</div>
        </div>
        <div className={`text-[8px] font-black tracking-widest px-2 py-1 ${block.cacheHit ? "bg-accent text-background" : "border border-border text-muted-foreground"}`}>
          {block.cacheHit ? "CACHE HIT" : "NEW"}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mt-4">
        <Mini label="TX" value={block.txCount} />
        <Mini label="ADDR" value={block.candidateAddresses.length} />
        <Mini label="WALLETS" value={block.sodexWallets.length} />
        <Mini label="CLUSTERS" value={block.clusters.length} />
      </div>
      {block.sodexWallets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {block.sodexWallets.map(wallet => (
            <span key={wallet.address} className="text-[10px] font-mono border border-border px-2 py-1 text-white">
              {shortHash(wallet.address)} · {wallet.trades.length}T/{wallet.positions.length}P
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div className="text-[9px] font-black tracking-widest text-muted-foreground mb-2">{label}</div>
      {children}
    </label>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const valueClass = good === undefined ? "text-white" : good ? "text-accent" : "text-muted-foreground";
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-[8px] font-black tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={`font-black font-mono text-2xl ${valueClass}`}>{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background/40 p-2">
      <div className="text-[8px] text-muted-foreground font-black tracking-widest">{label}</div>
      <div className="text-white font-mono font-black">{value}</div>
    </div>
  );
}
