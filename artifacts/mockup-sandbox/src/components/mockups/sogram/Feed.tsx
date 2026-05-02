import { useState } from "react";

const BRAND = {
  bg: "#0A0B0F",
  surface: "#111218",
  card: "#16171F",
  border: "#22242E",
  accent: "#00E5A0",
  accentDim: "#00E5A015",
  purple: "#7B6EF6",
  purpleDim: "#7B6EF615",
  red: "#FF4757",
  redDim: "#FF475715",
  gold: "#FFB830",
  textPrimary: "#F2F3F7",
  textSecondary: "#7C7F96",
  textMuted: "#4A4C60",
};

const posts = [
  {
    id: 1,
    type: "win",
    user: { name: "0xVega", handle: "@vega", avatar: "VE", rep: 94, verified: true },
    asset: "BTC-USD",
    side: "LONG",
    entry: 63420,
    exit: 68150,
    pnl: "+$4,318",
    pnlPct: "+7.45%",
    size: "$58,000",
    leverage: "10x",
    duration: "2d 4h",
    timestamp: "3h ago",
    likes: 312,
    copies: 87,
    comments: 42,
    caption: "Rode the breakout from the $63k support perfectly. ETF inflow data from SosoValue confirmed institutional momentum before entry.",
    verified: true,
    tags: ["#BTCLong", "#BreakoutTrade"],
  },
  {
    id: 2,
    type: "signal",
    user: { name: "QuantKing", handle: "@qking", avatar: "QK", rep: 88, verified: true },
    asset: "ETH-USD",
    side: "LONG",
    entry: "3,180–3,220",
    target: "3,550",
    stop: "3,080",
    rr: "3.2:1",
    timestamp: "5h ago",
    likes: 198,
    copies: 54,
    comments: 29,
    caption: "ETH showing massive accumulation. Macro events calendar clear this week — clean setup for a momentum trade.",
    confidence: 82,
    tags: ["#ETH", "#Signal"],
  },
  {
    id: 3,
    type: "win",
    user: { name: "ArcadiaFi", handle: "@arcadia", avatar: "AF", rep: 76, verified: false },
    asset: "HYPE-USD",
    side: "SHORT",
    entry: 41.8,
    exit: 38.2,
    pnl: "+$2,160",
    pnlPct: "+8.61%",
    size: "$25,000",
    leverage: "5x",
    duration: "18h",
    timestamp: "1d ago",
    likes: 143,
    copies: 31,
    comments: 17,
    caption: "HYPE overextended. Faded the wick perfectly on perps. Tight execution.",
    verified: true,
    tags: ["#HYPEShort"],
  },
];

function Avatar({ initials, color, size = 40 }: { initials: string; color?: string; size?: number }) {
  const colors = ["#7B6EF6", "#00E5A0", "#FF4757", "#FFB830", "#4ECDC4"];
  const bg = color || colors[initials.charCodeAt(0) % colors.length];
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.35, fontWeight: 700, color: "#0A0B0F",
        flexShrink: 0,
        fontFamily: "Space Grotesk, sans-serif",
      }}
    >
      {initials}
    </div>
  );
}

function RepBadge({ score }: { score: number }) {
  const color = score >= 90 ? BRAND.gold : score >= 75 ? BRAND.accent : BRAND.purple;
  return (
    <span style={{
      background: color + "20",
      border: `1px solid ${color}50`,
      color,
      borderRadius: 4,
      padding: "1px 6px",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "JetBrains Mono, monospace",
    }}>
      REP {score}
    </span>
  );
}

function WinPost({ post }: { post: typeof posts[0] }) {
  const [liked, setLiked] = useState(false);
  const isLong = post.side === "LONG";
  const sideColor = isLong ? BRAND.accent : BRAND.red;
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 14,
      padding: 20,
      marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <Avatar initials={post.user.avatar} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: BRAND.textPrimary, fontWeight: 700, fontSize: 15 }}>{post.user.name}</span>
            {post.user.verified && (
              <span style={{ color: BRAND.accent, fontSize: 12 }}>✓</span>
            )}
            <span style={{ color: BRAND.textMuted, fontSize: 13 }}>{post.user.handle}</span>
            <RepBadge score={post.user.rep} />
            <span style={{ color: BRAND.textMuted, fontSize: 12, marginLeft: "auto" }}>{post.timestamp}</span>
          </div>
          <p style={{ color: BRAND.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{post.caption}</p>
        </div>
      </div>

      <div style={{
        background: BRAND.bg,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 14,
        border: `1px solid ${sideColor}30`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: BRAND.textPrimary, fontWeight: 800, fontSize: 16, fontFamily: "Space Grotesk, sans-serif" }}>{post.asset}</span>
            <span style={{
              background: sideColor + "20",
              color: sideColor,
              border: `1px solid ${sideColor}40`,
              borderRadius: 5,
              padding: "2px 8px",
              fontSize: 12,
              fontWeight: 700,
            }}>{post.side} {post.leverage}</span>
            {(post as any).verified && (
              <span style={{
                background: "#00E5A010",
                color: BRAND.accent,
                border: `1px solid ${BRAND.accent}30`,
                borderRadius: 5,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
              }}>ON-CHAIN VERIFIED</span>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: BRAND.accent, fontWeight: 800, fontSize: 20, fontFamily: "JetBrains Mono, monospace" }}>{post.pnl}</div>
            <div style={{ color: BRAND.accent, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>{post.pnlPct}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {[
            ["Entry", `$${post.entry?.toLocaleString()}`],
            ["Exit", `$${(post as any).exit?.toLocaleString()}`],
            ["Size", post.size],
            ["Duration", post.duration],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: BRAND.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</div>
              <div style={{ color: BRAND.textPrimary, fontWeight: 600, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {post.tags?.map(t => (
          <span key={t} style={{ color: BRAND.purple, fontSize: 12, background: BRAND.purpleDim, borderRadius: 5, padding: "2px 8px" }}>{t}</span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, paddingTop: 10, borderTop: `1px solid ${BRAND.border}` }}>
        <button onClick={() => setLiked(!liked)} style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          color: liked ? BRAND.red : BRAND.textSecondary, fontSize: 13,
        }}>
          ♥ {post.likes + (liked ? 1 : 0)}
        </button>
        <span style={{ color: BRAND.textSecondary, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          💬 {post.comments}
        </span>
        <span style={{ color: BRAND.textSecondary, fontSize: 13, marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          📋 {post.copies} copied
        </span>
        <button style={{
          background: BRAND.accent,
          color: "#0A0B0F",
          border: "none",
          borderRadius: 8,
          padding: "6px 16px",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}>Copy Trade</button>
      </div>
    </div>
  );
}

function SignalPost({ post }: { post: typeof posts[1] }) {
  const isLong = post.side === "LONG";
  const sideColor = isLong ? BRAND.accent : BRAND.red;
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.purple}40`,
      borderRadius: 14,
      padding: 20,
      marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <Avatar initials={post.user.avatar} color={BRAND.purple} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: BRAND.textPrimary, fontWeight: 700, fontSize: 15 }}>{post.user.name}</span>
            <span style={{ color: BRAND.textMuted, fontSize: 13 }}>{post.user.handle}</span>
            <RepBadge score={post.user.rep} />
            <span style={{
              background: BRAND.purpleDim,
              border: `1px solid ${BRAND.purple}50`,
              color: BRAND.purple,
              borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700,
            }}>SIGNAL</span>
            <span style={{ color: BRAND.textMuted, fontSize: 12, marginLeft: "auto" }}>{post.timestamp}</span>
          </div>
          <p style={{ color: BRAND.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{post.caption}</p>
        </div>
      </div>

      <div style={{
        background: BRAND.bg,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 14,
        border: `1px solid ${BRAND.purple}25`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: BRAND.textPrimary, fontWeight: 800, fontSize: 16 }}>{post.asset}</span>
            <span style={{
              background: sideColor + "20",
              color: sideColor,
              border: `1px solid ${sideColor}40`,
              borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700,
            }}>{post.side}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: BRAND.textSecondary, fontSize: 12 }}>Confidence</span>
            <div style={{ width: 80, height: 6, background: BRAND.border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${post.confidence}%`, height: "100%", background: BRAND.purple, borderRadius: 3 }} />
            </div>
            <span style={{ color: BRAND.purple, fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{post.confidence}%</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {[
            ["Entry Zone", post.entry],
            ["Target", `$${post.target}`],
            ["Stop Loss", `$${post.stop}`],
            ["R:R", post.rr],
          ].map(([label, val]) => (
            <div key={label as string}>
              <div style={{ color: BRAND.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</div>
              <div style={{ color: label === "Target" ? BRAND.accent : label === "Stop Loss" ? BRAND.red : BRAND.textPrimary, fontWeight: 600, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 10, borderTop: `1px solid ${BRAND.border}` }}>
        <span style={{ color: BRAND.textSecondary, fontSize: 13 }}>♥ {post.likes}</span>
        <span style={{ color: BRAND.textSecondary, fontSize: 13 }}>💬 {post.comments}</span>
        <span style={{ color: BRAND.textSecondary, fontSize: 13, marginLeft: "auto" }}>📡 {post.copies} following</span>
        <button style={{
          background: BRAND.purple,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "6px 16px",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}>Follow Signal</button>
      </div>
    </div>
  );
}

export function Feed() {
  const [tab, setTab] = useState<"all" | "wins" | "signals">("all");

  return (
    <div style={{
      minHeight: "100vh",
      background: BRAND.bg,
      fontFamily: "Inter, system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      <div style={{
        background: BRAND.surface,
        borderBottom: `1px solid ${BRAND.border}`,
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.purple})`,
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#0A0B0F",
            fontFamily: "Space Grotesk, sans-serif",
          }}>S</div>
          <span style={{ color: BRAND.textPrimary, fontWeight: 800, fontSize: 18, fontFamily: "Space Grotesk, sans-serif", letterSpacing: -0.5 }}>Sogram</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "wins", "signals"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? BRAND.accent : "transparent",
              color: tab === t ? "#0A0B0F" : BRAND.textSecondary,
              border: `1px solid ${tab === t ? BRAND.accent : BRAND.border}`,
              borderRadius: 8,
              padding: "6px 14px",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: "7px 14px",
            color: BRAND.textSecondary,
            fontSize: 13,
          }}>🔍 Search traders...</div>
          <Avatar initials="ME" size={32} />
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%", gap: 0 }}>
        <div style={{ width: 220, padding: "20px 16px", borderRight: `1px solid ${BRAND.border}`, flexShrink: 0 }}>
          {[
            ["🏠", "Feed", true],
            ["📡", "Signals"],
            ["📋", "Copy Trading"],
            ["📊", "Analytics", false, true],
            ["🏆", "Leaderboard"],
            ["👤", "Profile"],
          ].map(([icon, label, active, premium]) => (
            <div key={label as string} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 9,
              marginBottom: 2,
              background: active ? BRAND.accentDim : "transparent",
              color: active ? BRAND.accent : BRAND.textSecondary,
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}>
              <span>{icon as string}</span>
              <span>{label as string}</span>
              {premium && (
                <span style={{
                  marginLeft: "auto",
                  background: BRAND.gold + "20",
                  color: BRAND.gold,
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 3,
                  fontWeight: 700,
                }}>PRO</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: "20px 24px", overflow: "auto", maxHeight: "calc(100vh - 62px)" }}>
          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <Avatar initials="ME" size={36} />
            <div style={{
              flex: 1,
              background: BRAND.bg,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              color: BRAND.textMuted,
              fontSize: 14,
              cursor: "text",
            }}>Share a verified trade or signal...</div>
            <button style={{
              background: BRAND.accent,
              color: "#0A0B0F",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}>Post</button>
          </div>

          {posts.map(p =>
            p.type === "win"
              ? <WinPost key={p.id} post={p as any} />
              : <SignalPost key={p.id} post={p as any} />
          )}
        </div>

        <div style={{ width: 240, padding: "20px 16px", flexShrink: 0, borderLeft: `1px solid ${BRAND.border}` }}>
          <div style={{ color: BRAND.textSecondary, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>Market Pulse</div>
          {[
            { asset: "BTC-USD", price: "68,142", change: "+2.31%", up: true },
            { asset: "ETH-USD", price: "3,215", change: "+1.87%", up: true },
            { asset: "XRP-USD", price: "1.42", change: "-0.78%", up: false },
            { asset: "HYPE-USD", price: "41.37", change: "-3.21%", up: false },
          ].map(m => (
            <div key={m.asset} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: `1px solid ${BRAND.border}`,
            }}>
              <span style={{ color: BRAND.textPrimary, fontSize: 13, fontWeight: 600 }}>{m.asset}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: BRAND.textPrimary, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>${m.price}</div>
                <div style={{ color: m.up ? BRAND.accent : BRAND.red, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{m.change}</div>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 20, color: BRAND.textSecondary, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>Top Traders</div>
          {[
            { name: "0xVega", pnl: "+$48.2K", rep: 94 },
            { name: "QuantKing", pnl: "+$31.5K", rep: 88 },
            { name: "ArcadiaFi", pnl: "+$19.1K", rep: 76 },
          ].map((t, i) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <span style={{ color: BRAND.textMuted, fontSize: 13, width: 16 }}>#{i + 1}</span>
              <Avatar initials={t.name.slice(0, 2).toUpperCase()} size={28} />
              <span style={{ color: BRAND.textPrimary, fontSize: 13, flex: 1 }}>{t.name}</span>
              <span style={{ color: BRAND.accent, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{t.pnl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
