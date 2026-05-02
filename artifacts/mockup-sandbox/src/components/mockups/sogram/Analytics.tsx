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

const heatmap = [
  { pair: "BTC-USD", share: 88, vol: "$4.2M", longs: 72 },
  { pair: "ETH-USD", share: 61, vol: "$1.8M", longs: 64 },
  { pair: "XRP-USD", share: 34, vol: "$820K", longs: 38 },
  { pair: "HYPE-USD", share: 28, vol: "$640K", longs: 29 },
  { pair: "LTC-USD", share: 18, vol: "$390K", longs: 55 },
  { pair: "SOL-USD", share: 14, vol: "$280K", longs: 70 },
  { pair: "SILVER", share: 9, vol: "$180K", longs: 45 },
  { pair: "1000SHIB", share: 6, vol: "$110K", longs: 33 },
];

const leverage = [
  { label: "1–3×", pct: 18 },
  { label: "5×", pct: 28 },
  { label: "10×", pct: 31 },
  { label: "20×", pct: 16 },
  { label: "50×+", pct: 7 },
];

const whales = [
  { addr: "0XVEGA", size: "$580K", pair: "BTC-USD", side: "LONG", lev: "10×", ts: "14M AGO", rep: 92 },
  { addr: "0XSKY7", size: "$320K", pair: "ETH-USD", side: "LONG", lev: "5×", ts: "28M AGO", rep: 78 },
  { addr: "0XQUAL", size: "$210K", pair: "XRP-USD", side: "SHORT", lev: "20×", ts: "1H AGO", rep: 65 },
  { addr: "0XMRKT", size: "$185K", pair: "BTC-USD", side: "LONG", lev: "15×", ts: "2H AGO", rep: 81 },
];

const sosoData = [
  { label: "BTC ETF NET FLOW", value: "+$342M", note: "7-DAY HIGH", up: true },
  { label: "DEFI SECTOR", value: "+4.2%", note: "LEADING TODAY", up: true },
  { label: "BTC DOMINANCE", value: "56.4%", note: "+1.8% WEEK", up: true },
  { label: "FED (MAY 7)", value: "2 DAYS", note: "RATE DECISION", up: null },
];

export function Analytics() {
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
        <span style={{ color: C.gray, fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>ANALYTICS</span>
        <span style={{ background: C.accent, color: C.bg, fontSize: 8, padding: "2px 7px", fontWeight: 900, letterSpacing: 0.8 }}>PRO</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>LIVE · 30S AGO</span>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginBottom: 20, border: `1px solid ${C.border}` }}>
          {sosoData.map((s, i) => (
            <div key={s.label} style={{
              padding: "20px 22px",
              borderRight: i < 3 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ color: C.muted, fontSize: 9, fontWeight: 800, letterSpacing: 1, marginBottom: 12 }}>{s.label}</div>
              <div style={{
                color: s.up === true ? C.accent : s.up === false ? C.red : C.white,
                fontSize: 28, fontWeight: 900, fontFamily: FONT_MONO, letterSpacing: -1, marginBottom: 4,
              }}>{s.value}</div>
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{s.note}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ border: `1px solid ${C.border}`, padding: "24px" }}>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.5, marginBottom: 4 }}>CROWD POSITIONS</div>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 20 }}>BY OPEN INTEREST · 1,300 ACTIVE TRADERS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {heatmap.map(row => (
                <div key={row.pair}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.3 }}>{row.pair}</span>
                      <span style={{ color: C.muted, fontSize: 11, fontFamily: FONT_MONO }}>{row.vol}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: C.accent, fontSize: 11, fontFamily: FONT_MONO, fontWeight: 700 }}>{row.longs}%L</span>
                      <span style={{ color: C.red, fontSize: 11, fontFamily: FONT_MONO, fontWeight: 700 }}>{100 - row.longs}%S</span>
                      <span style={{ color: C.gray, fontWeight: 800, fontSize: 12, fontFamily: FONT_MONO, width: 38, textAlign: "right" }}>{row.share}%</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: C.border, borderRadius: 1, overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ width: `${row.share}%`, height: "100%", background: C.accent }} />
                  </div>
                  <div style={{ height: 3, display: "flex", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ width: `${row.longs}%`, background: C.accent + "60" }} />
                    <div style={{ flex: 1, background: C.red + "40" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, padding: "24px" }}>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.5, marginBottom: 4 }}>LEVERAGE DISTRIBUTION</div>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 24 }}>HOW MUCH RISK TRADERS ARE TAKING</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginBottom: 12 }}>
              {leverage.map(d => {
                const maxPct = 31;
                const barH = (d.pct / maxPct) * 90;
                return (
                  <div key={d.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                    <span style={{ color: d.pct === maxPct ? C.accent : C.gray, fontSize: 11, fontWeight: 800, fontFamily: FONT_MONO }}>{d.pct}%</span>
                    <div style={{ width: "100%", height: barH, background: d.pct === maxPct ? C.accent : C.card, border: `1px solid ${d.pct === maxPct ? C.accent : C.border}` }} />
                    <span style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>AVG LEVERAGE THIS WEEK</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ color: C.accent, fontSize: 28, fontWeight: 900, fontFamily: FONT_MONO }}>9.4×</span>
                <span style={{ color: C.muted, fontSize: 11 }}>up from 7.8× last week</span>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 0.5, marginBottom: 12 }}>CROWD SENTIMENT</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.accent, fontSize: 12, fontWeight: 800, fontFamily: FONT_MONO }}>LONG 64%</span>
                <span style={{ color: C.red, fontSize: 12, fontWeight: 800, fontFamily: FONT_MONO }}>SHORT 36%</span>
              </div>
              <div style={{ height: 8, display: "flex", borderRadius: 1, overflow: "hidden" }}>
                <div style={{ width: "64%", background: C.accent }} />
                <div style={{ flex: 1, background: C.red }} />
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Overall market bias across all tracked traders</div>
            </div>
          </div>
        </div>

        <div style={{ border: `1px solid ${C.border}`, padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.5, marginBottom: 4 }}>WHALE ACTIVITY</div>
              <div style={{ color: C.muted, fontSize: 11 }}>LARGE POSITIONS IN LAST 24H · MIN $100K</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
              <span style={{ color: C.accent, fontSize: 10, fontWeight: 800, letterSpacing: 0.8 }}>LIVE</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {whales.map((w, i) => (
              <div key={i} style={{
                border: `1px solid ${C.border}`,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🐋</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.3 }}>{w.addr}</span>
                    <span style={{
                      border: `1px solid ${w.side === "LONG" ? C.accent + "60" : C.red + "60"}`,
                      color: w.side === "LONG" ? C.accent : C.red,
                      fontSize: 8, fontWeight: 900, padding: "1px 5px", letterSpacing: 0.5,
                    }}>{w.side} {w.lev}</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: C.gray }}>{w.pair}</span>
                  </div>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700 }}>{w.size} · {w.ts} · REP {w.rep}</div>
                </div>
                <button style={{
                  background: "transparent",
                  border: `1px solid ${C.accent}50`,
                  color: C.accent,
                  padding: "5px 12px",
                  fontSize: 10, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5, fontFamily: FONT_DISPLAY,
                }}>COPY →</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
