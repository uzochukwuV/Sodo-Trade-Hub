import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { WalletConnectButton } from "@/components/WalletConnectButton";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { label: "FEED", path: "/" },
    { label: "MARKETS", path: "/markets" },
    { label: "SIGNALS", path: "/signals" },
    { label: "PAIN ROOM", path: "/pain-room" },
    { label: "INTENTS", path: "/intents" },
    { label: "COPY", path: "/copy" },
    { label: "ANALYTICS", path: "/analytics", pro: true },
    { label: "TRADERS", path: "/traders" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <div className="h-14 border-b border-border px-8 flex items-center sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2 mr-10">
          <div className="w-7 h-7 border-[1.5px] border-accent rounded-full flex items-center justify-center text-[13px] font-black text-accent">
            S
          </div>
          <span className="font-black text-base tracking-widest text-white">
            SOGRAM
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 ml-6">
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase">Powered by</span>
          <a href="https://sodex.com" target="_blank" rel="noopener noreferrer"
            className="text-[9px] font-black tracking-widest px-2 py-0.5 border border-accent/30 text-accent/70 hover:text-accent hover:border-accent/60 transition-colors"
          >SODEX</a>
          <span className="text-border">·</span>
          <a href="https://sosovalue.com" target="_blank" rel="noopener noreferrer"
            className="text-[9px] font-black tracking-widest px-2 py-0.5 border border-white/10 text-muted-foreground hover:text-white hover:border-white/30 transition-colors"
          >SOSOVALUE</a>
        </div>
        <div className="ml-auto">
          <WalletConnectButton />
        </div>
      </div>

      <div className="flex max-w-[1200px] w-full mx-auto flex-1">
        <div className="w-[200px] px-6 py-8 border-r border-border shrink-0 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link key={item.label} href={item.path} className="block">
              <div
                className={`flex items-center justify-between py-2.5 text-xs tracking-wider border-b border-border ${
                  location === item.path
                    ? "text-accent font-extrabold"
                    : "text-muted-foreground font-semibold hover:text-white transition-colors"
                }`}
              >
                <span>{item.label}</span>
                {item.pro && (
                  <span className="bg-accent text-background text-[8px] px-1.5 py-0.5 font-black tracking-wider">
                    PRO
                  </span>
                )}
              </div>
            </Link>
          ))}

          <div className="mt-auto pt-8 flex flex-col gap-3">
            <div className="text-[8px] font-bold tracking-widest text-muted-foreground/40 uppercase">Data Sources</div>
            <a href="https://sodex.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 group"
            >
              <div className="w-4 h-4 border border-accent/40 rounded-sm flex items-center justify-center text-[8px] font-black text-accent/70 group-hover:border-accent group-hover:text-accent transition-colors">S</div>
              <span className="text-[9px] font-bold tracking-wider text-muted-foreground/60 group-hover:text-white transition-colors">SODEX</span>
              <span className="ml-auto text-[7px] text-accent/50 font-mono">LIVE</span>
            </a>
            <a href="https://sosovalue.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 group"
            >
              <div className="w-4 h-4 border border-white/20 rounded-sm flex items-center justify-center text-[8px] font-black text-white/40 group-hover:border-white/50 group-hover:text-white/70 transition-colors">S</div>
              <span className="text-[9px] font-bold tracking-wider text-muted-foreground/60 group-hover:text-white transition-colors">SOSOVALUE</span>
              <span className="ml-auto text-[7px] text-muted-foreground/40 font-mono">NEWS</span>
            </a>
          </div>
        </div>

        <div className="flex-1 overflow-x-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
