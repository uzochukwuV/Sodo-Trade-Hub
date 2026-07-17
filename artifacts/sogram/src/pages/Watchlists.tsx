import { useEffect, useState } from "react";

type Watchlist = {
  id: number;
  name: string;
  kind: string;
  isDefault: boolean;
  updatedAt: string;
  items: Array<{
    id: number;
    walletProfileId: number | null;
    walletAddress: string | null;
    symbol: string | null;
    tag: string | null;
  }>;
};

export default function Watchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("my_wallets");
  const [itemDrafts, setItemDrafts] = useState<Record<number, { walletAddress: string; symbol: string; tag: string }>>({});

  async function load() {
    const res = await fetch("/api/watchlists", { credentials: "include" });
    const json = await res.json();
    setWatchlists(json.watchlists ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const createWatchlist = async () => {
    if (!name.trim()) return;
    await fetch("/api/watchlists", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), kind }),
    });
    setName("");
    void load();
  };

  const addItem = async (watchlistId: number) => {
    const draft = itemDrafts[watchlistId] ?? { walletAddress: "", symbol: "", tag: "" };
    if (!draft.walletAddress.trim() && !draft.symbol.trim()) return;
    await fetch(`/api/watchlists/${watchlistId}/items`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: draft.walletAddress.trim() || undefined,
        symbol: draft.symbol.trim() || undefined,
        tag: draft.tag.trim() || undefined,
      }),
    });
    setItemDrafts(prev => ({ ...prev, [watchlistId]: { walletAddress: "", symbol: "", tag: "" } }));
    void load();
  };

  return (
    <div className="px-8 pb-10 max-w-[1100px] w-full pt-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-wide text-white">WATCHLISTS</h1>
          <div className="text-muted-foreground text-[11px] font-bold tracking-wider mt-1">Saved wallet and market filters</div>
        </div>
      </div>

      <div className="border border-border bg-card p-4 mb-6 flex gap-2 items-center">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="NEW WATCHLIST NAME" className="flex-1 bg-background border border-border px-3 py-2 text-[12px] text-white font-mono" />
        <select value={kind} onChange={e => setKind(e.target.value)} className="bg-background border border-border px-3 py-2 text-[12px] text-white">
          <option value="my_wallets">my_wallets</option>
          <option value="my_market">my_market</option>
          <option value="copy_candidates">copy_candidates</option>
          <option value="top_performers">top_performers</option>
        </select>
        <button onClick={createWatchlist} className="bg-accent text-background px-4 py-2 text-[10px] font-black tracking-widest">CREATE</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {watchlists.map(w => (
          <div key={w.id} className="border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-white font-black tracking-wide">{w.name}</div>
                <div className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">{w.kind} · {w.items.length} items</div>
              </div>
              <div className="text-[10px] font-black tracking-widest text-muted-foreground">{w.isDefault ? "DEFAULT" : "CUSTOM"}</div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {w.items.map(item => (
                <div key={item.id} className="flex items-center justify-between border border-border px-3 py-2">
                  <div className="text-[11px] text-white font-mono">{item.walletAddress ?? item.symbol ?? item.walletProfileId ?? "ITEM"}</div>
                  <div className="text-[10px] text-muted-foreground">{item.tag ?? "UNTAGGED"}</div>
                </div>
              ))}
              {w.items.length === 0 && <div className="text-muted-foreground text-sm py-6 text-center">NO ITEMS YET</div>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <input
                value={itemDrafts[w.id]?.walletAddress ?? ""}
                onChange={e => setItemDrafts(prev => ({ ...prev, [w.id]: { walletAddress: e.target.value, symbol: prev[w.id]?.symbol ?? "", tag: prev[w.id]?.tag ?? "" } }))}
                placeholder="0x wallet"
                className="bg-background border border-border px-3 py-2 text-[11px] font-mono text-white"
              />
              <input
                value={itemDrafts[w.id]?.symbol ?? ""}
                onChange={e => setItemDrafts(prev => ({ ...prev, [w.id]: { walletAddress: prev[w.id]?.walletAddress ?? "", symbol: e.target.value, tag: prev[w.id]?.tag ?? "" } }))}
                placeholder="symbol / USDT"
                className="bg-background border border-border px-3 py-2 text-[11px] font-mono text-white"
              />
              <button onClick={() => addItem(w.id)} className="bg-accent text-background px-3 py-2 text-[10px] font-black tracking-widest">ADD</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
