import { useState } from "react";

const BRAND = {
  bg: "#0A0B0F",
  surface: "#111218",
  card: "#16171F",
  border: "#22242E",
  accent: "#00E5A0",
  accentDim: "#00E5A012",
  purple: "#7B6EF6",
  purpleDim: "#7B6EF612",
  red: "#FF4757",
  redDim: "#FF475712",
  gold: "#FFB830",
  textPrimary: "#F2F3F7",
  textSecondary: "#7C7F96",
  textMuted: "#4A4C60",
};

const leaders = [
  { name: "0xVega", handle: "@vega", avatar: "VE", rep: 94, pnl30d: "+48.3%", winRate: 78, copiers: 87, tier: "Elite" },
  { name: "QuantKing", handle: "@qking", avatar: "QK", rep: 88, pnl30d: "+31.5%", winRate: 74, copiers: 54, tier: "Expert" },
  { name: "ArcadiaFi", handle: "@arcadia", avatar: "AF", rep: 76, pnl30d: "+19.1%", winRate: 68, copiers: 31, tier: "Rising" },
];

function Avatar({ initials, size = 36 }: { initials: string; size?: number }) {
  const colors = ["#7B6EF6", "#00E5A0", "#FF4757", "#FFB830", "#4ECDC4"];
  const bg = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size,
      borderRadius: "50%",
      background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#0A0B0F",
      flexShrink: 0,
      fontFamily: "Space Grotesk, sans-serif",
    }}>
      {initials}
    </div>
  );
}

function Slider({ value, onChange, min = 0, max = 100, color = BRAND.accent }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ position: "relative", height: 24, display: "flex", alignItems: "center" }}>
      <div style={{ position: "relative", flex: 1, height: 6, background: BRAND.border, borderRadius: 3, cursor: "pointer" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%",
            cursor: "pointer", margin: 0,
          }}
        />
        <div style={{
          position: "absolute",
          left: `${pct}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 16, height: 16,
          background: color,
          borderRadius: "50%",
          border: `2px solid ${BRAND.bg}`,
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 42, height: 24,
        background: value ? BRAND.accent : BRAND.border,
        borderRadius: 12,
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute",
        top: 3, left: value ? 21 : 3,
        width: 18, height: 18,
        background: value ? "#0A0B0F" : BRAND.textMuted,
        borderRadius: "50%",
        transition: "left 0.2s",
      }} />
    </div>
  );
}

export function CopyTrading() {
  const [selected, setSelected] = useState(0);
  const [copyRatio, setCopyRatio] = useState(50);
  const [maxSize, setMaxSize] = useState(500);
  const [stopLoss, setStopLoss] = useState(15);
  const [active, setActive] = useState(true);
  const [perps, setPerps] = useState(true);
  const [spot, setSpot] = useState(false);
  const [allowedPairs, setAllowedPairs] = useState<string[]>(["BTC-USD", "ETH-USD", "XRP-USD"]);

  const allPairs = ["BTC-USD", "ETH-USD", "XRP-USD", "HYPE-USD", "LTC-USD", "SOL-USD"];
  const leader = leaders[selected];

  return (
    <div style={{
      minHeight: "100vh",
      background: BRAND.bg,
      fontFamily: "Inter, system-ui, sans-serif",
      color: BRAND.textPrimary,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      <div style={{
        background: BRAND.surface,
        borderBottom: `1px solid ${BRAND.border}`,
        padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 32, height: 32,
          background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.purple})`,
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 900, color: "#0A0B0F",
          fontFamily: "Space Grotesk, sans-serif",
        }}>S</div>
        <span style={{ color: BRAND.textPrimary, fontWeight: 800, fontSize: 18, fontFamily: "Space Grotesk, sans-serif", letterSpacing: -0.5 }}>Sogram</span>
        <span style={{ color: BRAND.textMuted, margin: "0 4px" }}>/</span>
        <span style={{ color: BRAND.textSecondary, fontSize: 14 }}>Copy Trading</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: BRAND.textSecondary, fontSize: 14 }}>Status</span>
          <Toggle value={active} onChange={setActive} />
          <span style={{ color: active ? BRAND.accent : BRAND.textMuted, fontSize: 13, fontWeight: 600 }}>{active ? "ACTIVE" : "PAUSED"}</span>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.textSecondary, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8, fontSize: 11 }}>Select Leader</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {leaders.map((l, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  background: selected === i ? BRAND.card : BRAND.surface,
                  border: `1px solid ${selected === i ? BRAND.accent + "60" : BRAND.border}`,
                  borderRadius: 12,
                  padding: 14,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Avatar initials={l.avatar} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{l.name}</span>
                      <span style={{
                        background: l.rep >= 90 ? BRAND.gold + "20" : BRAND.accentDim,
                        color: l.rep >= 90 ? BRAND.gold : BRAND.accent,
                        fontSize: 10, fontWeight: 700,
                        padding: "1px 6px", borderRadius: 3,
                      }}>{l.tier}</span>
                    </div>
                    <span style={{ color: BRAND.textMuted, fontSize: 12 }}>{l.handle}</span>
                  </div>
                  {selected === i && (
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: BRAND.accent,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#0A0B0F", fontWeight: 900,
                    }}>✓</div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ color: BRAND.textMuted, fontSize: 10 }}>30d PNL</div>
                    <div style={{ color: BRAND.accent, fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{l.pnl30d}</div>
                  </div>
                  <div>
                    <div style={{ color: BRAND.textMuted, fontSize: 10 }}>Win Rate</div>
                    <div style={{ color: BRAND.textPrimary, fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{l.winRate}%</div>
                  </div>
                  <div>
                    <div style={{ color: BRAND.textMuted, fontSize: 10 }}>Copiers</div>
                    <div style={{ color: BRAND.textPrimary, fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{l.copiers}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 22,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Copy Settings — {leader.name}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: BRAND.textSecondary, fontSize: 13 }}>Copy Ratio</span>
                  <span style={{ color: BRAND.accent, fontWeight: 700, fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>{copyRatio}%</span>
                </div>
                <Slider value={copyRatio} onChange={setCopyRatio} />
                <div style={{ color: BRAND.textMuted, fontSize: 11, marginTop: 6 }}>
                  Mirror {copyRatio}% of leader's position size proportionally
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: BRAND.textSecondary, fontSize: 13 }}>Max per Trade</span>
                  <span style={{ color: BRAND.textPrimary, fontWeight: 700, fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>${maxSize}</span>
                </div>
                <Slider value={maxSize} onChange={setMaxSize} min={100} max={5000} color={BRAND.purple} />
                <div style={{ color: BRAND.textMuted, fontSize: 11, marginTop: 6 }}>
                  Cap any single copied position at this amount
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: BRAND.textSecondary, fontSize: 13 }}>Auto Stop-Copy</span>
                  <span style={{ color: BRAND.red, fontWeight: 700, fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>-{stopLoss}%</span>
                </div>
                <Slider value={stopLoss} onChange={setStopLoss} min={5} max={50} color={BRAND.red} />
                <div style={{ color: BRAND.textMuted, fontSize: 11, marginTop: 6 }}>
                  Auto-stop copying if total drawdown exceeds this
                </div>
              </div>

              <div>
                <div style={{ color: BRAND.textSecondary, fontSize: 13, marginBottom: 12 }}>Markets to Copy</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <Toggle value={perps} onChange={setPerps} />
                    <span style={{ fontSize: 13, color: perps ? BRAND.textPrimary : BRAND.textMuted }}>Perps</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <Toggle value={spot} onChange={setSpot} />
                    <span style={{ fontSize: 13, color: spot ? BRAND.textPrimary : BRAND.textMuted }}>Spot</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 22,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Allowed Pairs</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {allPairs.map(pair => {
                const allowed = allowedPairs.includes(pair);
                return (
                  <button
                    key={pair}
                    onClick={() => setAllowedPairs(p => allowed ? p.filter(x => x !== pair) : [...p, pair])}
                    style={{
                      background: allowed ? BRAND.accentDim : "transparent",
                      color: allowed ? BRAND.accent : BRAND.textMuted,
                      border: `1px solid ${allowed ? BRAND.accent + "50" : BRAND.border}`,
                      borderRadius: 7,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >{pair}</button>
                );
              })}
            </div>
            <div style={{ color: BRAND.textMuted, fontSize: 12 }}>
              Only copy trades on selected pairs. {allowedPairs.length} of {allPairs.length} pairs active.
            </div>
          </div>

          <div style={{
            background: active ? BRAND.accentDim : BRAND.surface,
            border: `1px solid ${active ? BRAND.accent + "40" : BRAND.border}`,
            borderRadius: 14,
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: active ? BRAND.accent : BRAND.textMuted,
              boxShadow: active ? `0 0 0 3px ${BRAND.accent}30` : "none",
              animation: active ? "pulse 2s infinite" : "none",
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: active ? BRAND.accent : BRAND.textSecondary }}>
                {active ? "Copy active — syncing with 0xVega" : "Copy paused"}
              </div>
              <div style={{ color: BRAND.textMuted, fontSize: 12, marginTop: 2 }}>
                {active
                  ? "Last sync: 2 minutes ago · 3 open copied positions · $1,240 deployed"
                  : "Enable toggle to start mirroring this leader's trades"}
              </div>
            </div>
            {active && (
              <div style={{
                background: BRAND.accent + "15",
                border: `1px solid ${BRAND.accent}30`,
                borderRadius: 8,
                padding: "6px 14px",
                color: BRAND.accent,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "JetBrains Mono, monospace",
              }}>+$214 today</div>
            )}
          </div>

          <button style={{
            background: `linear-gradient(135deg, ${BRAND.accent}, #00C48A)`,
            color: "#0A0B0F",
            border: "none",
            borderRadius: 10,
            padding: "14px 24px",
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer",
            width: "100%",
            fontFamily: "Space Grotesk, sans-serif",
          }}>
            {active ? "Update Copy Settings" : "Activate Copy Trading"}
          </button>
        </div>
      </div>
    </div>
  );
}
