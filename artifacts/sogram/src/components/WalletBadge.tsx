type Props = {
  address?: string | null;
  txHash?: string | null;
  compact?: boolean;
  // When the proof we have is a Sodex off-chain trade/position id (no on-chain
  // tx hash), pass it here. The wallet link is scoped to that Sodex id via a
  // hash anchor + descriptive title, and the trade/position id is rendered
  // alongside as a SODEX badge.
  sodexId?: number | string | null;
  sodexKind?: "trade" | "position";
};

export function WalletBadge({ address, txHash, compact = false, sodexId, sodexKind = "trade" }: Props) {
  if (!address && !txHash) return null;
  const explorer = "https://main-scan.valuechain.xyz";
  const sodexAnchor = sodexId != null
    ? `#sodex-${sodexKind}-${String(sodexId)}`
    : "";
  const sodexTitle = sodexId != null
    ? `Wallet — Sodex ${sodexKind} #${String(sodexId)}`
    : (address ?? "");

  return (
    <div className={`flex items-center gap-2 ${compact ? "text-[9px]" : "text-[10px]"}`}>
      {address && (
        <a
          href={`${explorer}/address/${address}${sodexAnchor}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-1.5 py-0.5 border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors font-mono uppercase tracking-wider text-accent"
          title={sodexTitle}
        >
          <span className="w-1 h-1 rounded-full bg-accent"></span>
          {address.slice(0, 6)}…{address.slice(-4)}
        </a>
      )}
      {address && sodexId != null && (
        <a
          href={`${explorer}/address/${address}${sodexAnchor}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-1.5 py-0.5 border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors font-mono uppercase tracking-wider text-accent font-extrabold"
          title={sodexTitle}
        >
          SODEX {sodexKind === "position" ? "POS" : "#"}{String(sodexId).slice(0, 6)}
        </a>
      )}
      {txHash && (
        <a
          href={`${explorer}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-1.5 py-0.5 border border-white/15 bg-white/5 hover:bg-white/10 transition-colors font-mono uppercase tracking-wider text-white/70 hover:text-white"
          title={txHash}
        >
          TX {txHash.slice(0, 6)}…{txHash.slice(-4)} ↗
        </a>
      )}
    </div>
  );
}

export function explorerUrl(kind: "address" | "tx", value: string) {
  return `https://main-scan.valuechain.xyz/${kind}/${value}`;
}
