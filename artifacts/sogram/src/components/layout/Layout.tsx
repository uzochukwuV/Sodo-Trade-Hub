import { ReactNode } from "react";
import { Link, useLocation } from "wouter";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { label: "FEED", path: "/" },
    { label: "MARKETS", path: "/markets", hot: true },
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
                {(item as any).hot && (
                  <span className="text-[8px] px-1.5 py-0.5 font-black tracking-wider" style={{ background: "#FF3B3B22", color: "#FF3B3B", border: "1px solid #FF3B3B44" }}>
                    NEW
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>

        <div className="flex-1 overflow-x-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
