import { useState } from "react";

const C = {
  bg: "#0A0A0A",
  surface: "#111111",
  card: "#161616",
  border: "#242424",
  borderLight: "#1E1E1E",
  accent: "#D4FF00",
  white: "#FFFFFF",
  gray: "#888888",
  muted: "#444444",
  red: "#FF3B3B",
};
const FONT_DISPLAY = "'DM Sans', 'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Mono', monospace";

const leaders = [
  { name: "0XVEGA", handle: "@vega", rep: 94, pnl30d: "+48.3%", winRate: 78, copiers: 87, tier: "ELITE" },
  { name: "QUANTKING", handle: "@qking", rep: 88, pnl30d: "+31.5%", winRate: 74, copiers: 54, tier: "EXPERT" },
  { name: "ARCADIAFI", handle: "@arcadia", rep: 76, pnl30d: "+19.1%", winRate: 68, copiers: 31, tier: "RISING" },
];

function Slider({ value, onChange, min = 0, max = 100, accent = false }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; accent?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const trackColor = accent ? C.accent : C.gray;
  return (
    <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
      <div style={{ position: "relative", flex: 1, height: 3, background: C.border, borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: trackColor, borderRadius: 2 }} />
        <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", margin: 0 }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: "50%",
          transform: "translate(-50%, -50%)",
          width: 14, height: 14,
          background: trackColor,
          border: `2px solid ${C.bg}`,
          borderRadius: "50%",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 38, height: 22, background: value ? C.accent : C.border,
      position: "relative", cursor: "pointer", transition: "background 0.2s",
      borderRadius: 1, flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 3, left: value ? 19 : 3,
        width: 16, height: 16,
        background: value ? C.bg : C.gray,
        transition: "left 0.2s",
        borderRadius: 1,
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
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_DISPLAY, color: C.white }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", gap: 12, height: 56,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: C.accent }}>S</div>
        <span style={{ color: C.white, fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>SOGRAM</span>
        <span style={{ color: C.border, fontSize: 14 }}>/</span>
        <span style={{ color: C.gray, fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>COPY TRADING</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Toggle value={active} onChange={setActive} />
          <span style={{ color: active ? C.accent : C.muted, fontSize: 11, fontWeight: 800, letterSpacing: 0.8 }}>{active ? "ACTIVE" : "PAUSED"}</span>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>SELECT LEADER</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {leaders.map((l, i) => (
              <div key={i} onClick={() => setSelected(i)} style={{
                border: `1px solid ${selected === i ? C.accent : C.border}`,
                padding: "14px 16px",
                cursor: "pointer",
                background: selected === i ? "#D4FF000A" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    border: `1.5px solid ${selected === i ? C.accent : C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900, color: selected === i ? C.accent : C.gray,
                  }}>{l.name.slice(0, 2)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.3 }}>{l.name}</span>
                      <span style={{
                        background: l.tier === "ELITE" ? C.accent : "transparent",
                        color: l.tier === "ELITE" ? C.bg : C.muted,
                        border: l.tier !== "ELITE" ? `1px solid ${C.border}` : "none",
                        fontSize: 8, padding: "1px 5px", fontWeight: 900, letterSpacing: 0.5,
                      }}>{l.tier}</span>
                    </div>
                    <span style={{ color: C.muted, fontSize: 10, fontFamily: FONT_MONO }}>{l.handle}</span>
                  </div>
                  {selected === i && <span style={{ color: C.accent, fontSize: 14, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[["30D PNL", l.pnl30d, true], ["WIN RATE", `${l.winRate}%`, false], ["COPIERS", `${l.copiers}`, false]].map(([lbl, val, acc]) => (
                    <div key={lbl as string}>
                      <div style={{ color: C.muted, fontSize: 9, fontWeight: 800, letterSpacing: 0.6, marginBottom: 3 }}>{lbl as string}</div>
                      <div style={{ color: acc ? C.accent : C.white, fontSize: 14, fontWeight: 900, fontFamily: FONT_MONO }}>{val as string}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ border: `1px solid ${C.border}`, padding: "24px" }}>
            <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, marginBottom: 24 }}>COPY SETTINGS — {leader.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: C.gray, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>COPY RATIO</span>
                  <span style={{ color: C.accent, fontWeight: 900, fontSize: 15, fontFamily: FONT_MONO }}>{copyRatio}%</span>
                </div>
                <Slider value={copyRatio} onChange={setCopyRatio} accent />
                <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Mirror {copyRatio}% of leader's position size</div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: C.gray, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>MAX PER TRADE</span>
                  <span style={{ color: C.white, fontWeight: 900, fontSize: 15, fontFamily: FONT_MONO }}>${maxSize}</span>
                </div>
                <Slider value={maxSize} onChange={setMaxSize} min={100} max={5000} />
                <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Cap any single copied position</div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: C.gray, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>AUTO STOP-COPY</span>
                  <span style={{ color: C.red, fontWeight: 900, fontSize: 15, fontFamily: FONT_MONO }}>-{stopLoss}%</span>
                </div>
                <Slider value={stopLoss} onChange={setStopLoss} min={5} max={50} />
                <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Stop copying if drawdown exceeds this</div>
              </div>
              <div>
                <div style={{ color: C.gray, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 14 }}>MARKETS TO COPY</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <Toggle value={perps} onChange={setPerps} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: perps ? C.white : C.muted, letterSpacing: 0.3 }}>PERPS</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <Toggle value={spot} onChange={setSpot} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: spot ? C.white : C.muted, letterSpacing: 0.3 }}>SPOT</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, padding: "20px 24px" }}>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.5, marginBottom: 14 }}>ALLOWED PAIRS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {allPairs.map(pair => {
                const on = allowedPairs.includes(pair);
                return (
                  <button key={pair} onClick={() => setAllowedPairs(p => on ? p.filter(x => x !== pair) : [...p, pair])} style={{
                    background: on ? C.accent : "transparent",
                    color: on ? C.bg : C.muted,
                    border: `1px solid ${on ? C.accent : C.border}`,
                    padding: "5px 12px",
                    fontSize: 11, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3, fontFamily: FONT_DISPLAY,
                  }}>{pair}</button>
                );
              })}
            </div>
            <div style={{ color: C.muted, fontSize: 11 }}>{allowedPairs.length} of {allPairs.length} pairs active</div>
          </div>

          <div style={{
            border: `1px solid ${active ? C.accent + "40" : C.border}`,
            padding: "16px 20px",
            background: active ? "#D4FF000A" : "transparent",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? C.accent : C.muted, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: active ? C.accent : C.gray, letterSpacing: 0.3 }}>
                {active ? `COPYING ${leader.name} — LIVE SYNC` : "COPY PAUSED"}
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>
                {active ? "Last sync: 2 min ago · 3 open positions · $1,240 deployed" : "Enable toggle to start mirroring trades"}
              </div>
            </div>
            {active && (
              <span style={{ color: C.accent, fontWeight: 900, fontSize: 15, fontFamily: FONT_MONO }}>+$214</span>
            )}
          </div>

          <button style={{
            background: C.accent,
            color: C.bg,
            border: "none",
            padding: "15px",
            fontWeight: 900,
            fontSize: 14,
            cursor: "pointer",
            letterSpacing: 1,
            width: "100%",
            fontFamily: FONT_DISPLAY,
          }}>
            {active ? "UPDATE COPY SETTINGS" : "ACTIVATE COPY TRADING"}
          </button>
        </div>
      </div>
    </div>
  );
}
