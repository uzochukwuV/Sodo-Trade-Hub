type Props = {
  address?: string | null;
  txHash?: string | null;
  compact?: boolean;
};

export function WalletBadge({ address, txHash, compact = false }: Props) {
  if (!address && !txHash) return null;
  const explorer = "https://main-scan.valuechain.xyz";

  return (
    <div className={`flex items-center gap-2 ${compact ? "text-[9px]" : "text-[10px]"}`}>
      {address && (
        <a
          href={`${explorer}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-1.5 py-0.5 border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors font-mono uppercase tracking-wider text-accent"
          title={address}
        >
          <span className="w-1 h-1 rounded-full bg-accent"></span>
          {address.slice(0, 6)}…{address.slice(-4)}
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
