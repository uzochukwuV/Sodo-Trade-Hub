import { useState } from "react";

const C = {
  bg: "#0A0A0A",
  surface: "#111111",
  card: "#161616",
  border: "#242424",
  borderLight: "#1E1E1E",
  accent: "#D4FF00",
  accentDim: "#D4FF0014",
  white: "#FFFFFF",
  gray: "#888888",
  muted: "#444444",
  red: "#FF3B3B",
  redDim: "#FF3B3B14",
  green: "#22C55E",
};

const FONT_DISPLAY = "'DM Sans', 'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Mono', monospace";

const posts = [
  {
    id: 1,
    type: "win",
    user: { name: "0XVEGA", handle: "@vega", rep: 94 },
    asset: "BTC-USD",
    side: "LONG",
    entry: 63420,
    exit: 68150,
    pnl: "+$4,318",
    pnlPct: "+7.45%",
    size: "$58,000",
    leverage: "10×",
    duration: "2d 4h",
    ts: "3H AGO",
    likes: 312,
    copies: 87,
    comments: 42,
    caption: "Rode the breakout from the $63k support perfectly. ETF inflow data confirmed institutional momentum before entry.",
    tags: ["BTC", "LONG", "BREAKOUT"],
  },
  {
    id: 2,
    type: "signal",
    user: { name: "QUANTKING", handle: "@qking", rep: 88 },
    asset: "ETH-USD",
    side: "LONG",
    entry: "3,180–3,220",
    target: "3,550",
    stop: "3,080",
    rr: "3.2:1",
    ts: "5H AGO",
    likes: 198,
    copies: 54,
    comments: 29,
    caption: "ETH accumulation pattern. Macro calendar clear this week — momentum setup is clean.",
    confidence: 82,
    tags: ["ETH", "SIGNAL"],
  },
  {
    id: 3,
    type: "win",
    user: { name: "ARCADIAFI", handle: "@arcadia", rep: 76 },
    asset: "HYPE-USD",
    side: "SHORT",
    entry: 41.8,
    exit: 38.2,
    pnl: "+$2,160",
    pnlPct: "+8.61%",
    size: "$25,000",
    leverage: "5×",
    duration: "18h",
    ts: "1D AGO",
    likes: 143,
    copies: 31,
    comments: 17,
    caption: "HYPE overextended. Faded the wick perfectly on perps.",
    tags: ["HYPE", "SHORT"],
  },
];

function RepCircle({ score }: { score: number }) {
  const color = score >= 90 ? C.accent : C.white;
  return (
    <div style={{
      width: 40, height: 40,
      borderRadius: "50%",
      border: `1.5px solid ${color}50`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{ color, fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: -0.5 }}>{score}</span>
    </div>
  );
}

function Tag({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span style={{
      background: accent ? C.accent : "transparent",
      color: accent ? C.bg : C.muted,
      border: `1px solid ${accent ? C.accent : C.border}`,
      borderRadius: 2,
      padding: "2px 7px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.8,
      fontFamily: FONT_DISPLAY,
    }}>{label}</span>
  );
}

function WinPost({ post }: { post: typeof posts[0] }) {
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`,
      padding: "24px 0",
    }}>
      <div style={{ display: "flex", gap: 16 }}>
        <RepCircle score={post.user.rep} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 14, fontFamily: FONT_DISPLAY, letterSpacing: 0.5 }}>{post.user.name}</span>
            <span style={{ color: C.muted, fontSize: 12, fontFamily: FONT_MONO }}>{post.user.handle}</span>
            <span style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>{post.ts}</span>
          </div>
          <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.6, marginBottom: 16, fontFamily: FONT_DISPLAY }}>{post.caption}</p>

          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: "16px 18px",
            marginBottom: 14,
            background: C.card,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: C.white, fontWeight: 900, fontSize: 17, fontFamily: FONT_DISPLAY, letterSpacing: 0.5 }}>{post.asset}</span>
                <Tag label={post.side} accent={isLong} />
                <Tag label={post.leverage ?? ""} />
                <Tag label="ON-CHAIN" />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.accent, fontWeight: 900, fontSize: 22, fontFamily: FONT_MONO, letterSpacing: -1 }}>{post.pnl}</div>
                <div style={{ color: C.accent, fontSize: 13, fontFamily: FONT_MONO }}>{post.pnlPct}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                ["ENTRY", `$${post.entry?.toLocaleString()}`],
                ["EXIT", `$${(post as any).exit?.toLocaleString()}`],
                ["SIZE", post.size],
                ["HELD", post.duration],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4, fontFamily: FONT_DISPLAY }}>{l}</div>
                  <div style={{ color: C.white, fontWeight: 700, fontSize: 13, fontFamily: FONT_MONO }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {post.tags?.map(t => <Tag key={t} label={t} />)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button onClick={() => setLiked(!liked)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: liked ? C.accent : C.gray, fontSize: 12,
              display: "flex", alignItems: "center", gap: 5, fontFamily: FONT_DISPLAY, fontWeight: 600,
            }}>♥ {post.likes + (liked ? 1 : 0)}</button>
            <span style={{ color: C.gray, fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600 }}>✦ {post.comments}</span>
            <span style={{ color: C.gray, fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600, marginLeft: "auto" }}>{post.copies} COPIED</span>
            <button style={{
              background: C.accent,
              color: C.bg,
              border: "none",
              borderRadius: 3,
              padding: "7px 18px",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: 0.5,
              fontFamily: FONT_DISPLAY,
            }}>COPY TRADE</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalPost({ post }: { post: typeof posts[1] }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: "24px 0" }}>
      <div style={{ display: "flex", gap: 16 }}>
        <RepCircle score={post.user.rep} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 14, fontFamily: FONT_DISPLAY, letterSpacing: 0.5 }}>{post.user.name}</span>
            <span style={{ color: C.muted, fontSize: 12, fontFamily: FONT_MONO }}>{post.user.handle}</span>
            <span style={{
              background: "transparent",
              border: `1px solid ${C.accent}60`,
              color: C.accent,
              borderRadius: 2,
              padding: "2px 7px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
            }}>SIGNAL</span>
            <span style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>{post.ts}</span>
          </div>
          <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.6, marginBottom: 16, fontFamily: FONT_DISPLAY }}>{post.caption}</p>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px 18px", marginBottom: 14, background: C.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: C.white, fontWeight: 900, fontSize: 17, fontFamily: FONT_DISPLAY }}>{post.asset}</span>
                <Tag label={post.side} accent />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>CONFIDENCE</span>
                <div style={{ width: 80, height: 3, background: C.border, borderRadius: 2 }}>
                  <div style={{ width: `${post.confidence}%`, height: "100%", background: C.accent, borderRadius: 2 }} />
                </div>
                <span style={{ color: C.accent, fontSize: 13, fontWeight: 800, fontFamily: FONT_MONO }}>{post.confidence}%</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                ["ENTRY ZONE", post.entry],
                ["TARGET", `$${post.target}`],
                ["STOP", `$${post.stop}`],
                ["R:R", post.rr],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4, fontFamily: FONT_DISPLAY }}>{l}</div>
                  <div style={{ color: l === "TARGET" ? C.accent : l === "STOP" ? C.red : C.white, fontWeight: 700, fontSize: 13, fontFamily: FONT_MONO }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ color: C.gray, fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600 }}>♥ {post.likes}</span>
            <span style={{ color: C.gray, fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600 }}>✦ {post.comments}</span>
            <span style={{ color: C.gray, fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 600, marginLeft: "auto" }}>{post.copies} FOLLOWING</span>
            <button style={{
              background: "transparent",
              color: C.accent,
              border: `1px solid ${C.accent}`,
              borderRadius: 3,
              padding: "7px 18px",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: 0.5,
              fontFamily: FONT_DISPLAY,
            }}>FOLLOW SIGNAL</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Feed() {
  const [tab, setTab] = useState<"ALL" | "WINS" | "SIGNALS">("ALL");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_DISPLAY, color: C.white }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
        display: "flex", alignItems: "center",
        height: 56,
        position: "sticky", top: 0, background: C.bg, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 40 }}>
          <div style={{
            width: 28, height: 28,
            border: `1.5px solid ${C.accent}`,
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: C.accent,
          }}>S</div>
          <span style={{ color: C.white, fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>SOGRAM</span>
        </div>

        <div style={{ display: "flex", gap: 0, marginRight: "auto" }}>
          {(["ALL", "WINS", "SIGNALS"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none",
              color: tab === t ? C.accent : C.gray,
              border: "none",
              borderBottom: `2px solid ${tab === t ? C.accent : "transparent"}`,
              padding: "0 16px",
              height: 56,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: 0.8,
              fontFamily: FONT_DISPLAY,
            }}>{t}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: C.muted, fontSize: 13 }}>BTC $68,142</span>
          <span style={{ color: C.accent, fontSize: 13, fontFamily: FONT_MONO }}>+2.31%</span>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.gray, fontSize: 12, fontWeight: 700 }}>ME</div>
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ width: 200, padding: "32px 24px", borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
          {[
            ["FEED", true],
            ["SIGNALS"],
            ["COPY"],
            ["ANALYTICS", false, true],
            ["LEADERBOARD"],
            ["PROFILE"],
          ].map(([label, active, pro]) => (
            <div key={label as string} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0",
              color: active ? C.accent : C.gray,
              fontSize: 12,
              fontWeight: active ? 800 : 600,
              letterSpacing: 0.8,
              cursor: "pointer",
              borderBottom: `1px solid ${C.borderLight}`,
            }}>
              <span>{label as string}</span>
              {pro && <span style={{ background: C.accent, color: C.bg, fontSize: 8, padding: "1px 5px", fontWeight: 900, letterSpacing: 0.5 }}>PRO</span>}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: "0 32px", maxHeight: "calc(100vh - 56px)", overflow: "auto" }}>
          <div style={{
            padding: "20px 0",
            borderBottom: `1px solid ${C.border}`,
            marginBottom: 4,
            display: "flex", gap: 14, alignItems: "center",
          }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11, fontWeight: 700 }}>ME</div>
            <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 3, padding: "9px 14px", color: C.muted, fontSize: 13 }}>
              Share a verified trade or signal...
            </div>
            <button style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 3, padding: "9px 20px", fontWeight: 800, fontSize: 12, cursor: "pointer", letterSpacing: 0.5 }}>POST</button>
          </div>

          {posts.map(p =>
            p.type === "win"
              ? <WinPost key={p.id} post={p as any} />
              : <SignalPost key={p.id} post={p as any} />
          )}
        </div>

        <div style={{ width: 220, padding: "32px 20px", borderLeft: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: C.muted, marginBottom: 16 }}>MARKET PULSE</div>
          {[
            { asset: "BTC", price: "68,142", chg: "+2.31%", up: true },
            { asset: "ETH", price: "3,215", chg: "+1.87%", up: true },
            { asset: "XRP", price: "1.42", chg: "-0.78%", up: false },
            { asset: "HYPE", price: "41.37", chg: "-3.21%", up: false },
          ].map(m => (
            <div key={m.asset} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ color: C.gray, fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{m.asset}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.white, fontSize: 12, fontFamily: FONT_MONO }}>${m.price}</div>
                <div style={{ color: m.up ? C.accent : C.red, fontSize: 11, fontFamily: FONT_MONO }}>{m.chg}</div>
              </div>
            </div>
          ))}

          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: C.muted, marginTop: 28, marginBottom: 16 }}>TOP TRADERS</div>
          {[
            { name: "0XVEGA", pnl: "+$48.2K", rep: 94 },
            { name: "QUANTKING", pnl: "+$31.5K", rep: 88 },
            { name: "ARCADIAFI", pnl: "+$19.1K", rep: 76 },
          ].map((t, i) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ color: C.muted, fontSize: 11, fontFamily: FONT_MONO, width: 14 }}>#{i + 1}</span>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: C.gray, fontWeight: 700 }}>{t.name.slice(0, 2)}</div>
              <span style={{ color: C.white, fontSize: 11, fontWeight: 700, flex: 1, letterSpacing: 0.3 }}>{t.name}</span>
              <span style={{ color: C.accent, fontSize: 11, fontFamily: FONT_MONO, fontWeight: 700 }}>{t.pnl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
