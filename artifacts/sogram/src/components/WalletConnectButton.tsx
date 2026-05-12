import { useMe, useSignIn, useLogout } from "@/hooks/useAuth";
import { hasWallet, WalletError } from "@/lib/wallet";
import { useToast } from "@/hooks/use-toast";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function WalletConnectButton() {
  const { data: me, isLoading } = useMe();
  const { mutate: signIn, isPending: isSigningIn } = useSignIn();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="px-3 py-1.5 border border-border text-muted-foreground text-[10px] font-extrabold tracking-widest">
        …
      </div>
    );
  }

  if (me) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-end leading-tight">
          <span className="text-white text-[11px] font-black tracking-wider font-mono">
            {shortAddr(me.walletAddress)}
          </span>
          {me.traderId && (
            <span className="text-accent text-[8px] font-extrabold tracking-widest">LINKED · #{me.traderId}</span>
          )}
        </div>
        <button
          onClick={() => logout()}
          disabled={isLoggingOut}
          data-testid="button-logout"
          className="px-3 py-1.5 border border-border text-muted-foreground text-[10px] font-extrabold tracking-widest hover:text-white hover:border-white/40 transition-colors disabled:opacity-50"
        >
          {isLoggingOut ? "…" : "DISCONNECT"}
        </button>
      </div>
    );
  }

  const handleConnect = () => {
    if (!hasWallet()) {
      toast({
        title: "No wallet detected",
        description: "Install MetaMask or another EVM wallet to sign in.",
        variant: "destructive",
      });
      return;
    }
    signIn(undefined, {
      onError: (err: unknown) => {
        const msg = err instanceof WalletError ? err.message : "Failed to sign in";
        toast({ title: "Sign-in failed", description: msg, variant: "destructive" });
      },
    });
  };

  return (
    <button
      onClick={handleConnect}
      disabled={isSigningIn}
      data-testid="button-connect-wallet"
      className="px-4 py-1.5 bg-accent text-background text-[10px] font-black tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-60"
    >
      {isSigningIn ? "SIGNING…" : "CONNECT WALLET"}
    </button>
  );
}
