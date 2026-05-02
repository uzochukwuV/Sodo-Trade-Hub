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

const trades = [
  { asset: "BTC-USD", side: "LONG", pnl: "+$4,318", pnlPct: "+7.45%", date: "MAY 1", up: true },
  { asset: "ETH-USD", side: "LONG", pnl: "+$1,840", pnlPct: "+4.12%", date: "APR 29", up: true },
  { asset: "XRP-USD", side: "SHORT", pnl: "+$920", pnlPct: "+3.68%", date: "APR 27", up: true },
  { asset: "HYPE-USD", side: "SHORT", pnl: "-$380", pnlPct: "-1.52%", date: "APR 24", up: false },
  { asset: "SOL-USD", side: "LONG", pnl: "+$2,250", pnlPct: "+9.00%", date: "APR 21", up: true },
  { asset: "LTC-USD", side: "LONG", pnl: "-$210", pnlPct: "-0.84%", date: "APR 19", up: false },
];

function StatBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px", flex: 1 }}>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 10, fontFamily: FONT_DISPLAY }}>{label}</div>
      <div style={{ color: accent ? C.accent : C.white, fontSize: 26, fontWeight: 900, fontFamily: FONT_MONO, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 4, fontFamily: FONT_DISPLAY }}>{sub}</div>}
    </div>
  );
}

function MiniChart() {
  const pts = [0, 8, 5, 14, 11, 19, 16, 24, 20, 31, 28, 38, 35, 44, 48];
  const max = 48;
  const h = 70, w = 340;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * w} ${h - (p / max) * h}`).join(" ");
  return (
    <svg width={w} height={h}>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity={0.15} />
          <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill="url(#g1)" />
      <path d={d} fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RepCircle({ score }: { score: number }) {
  const r = 38, circ = 2 * Math.PI * r;
  const pct = (score / 100) * 0.75;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={90} height={90} viewBox="0 0 90 90">
        <circle cx={45} cy={45} r={r} fill="none" stroke={C.border} strokeWidth={4}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 45 45)" />
        <circle cx={45} cy={45} r={r} fill="none" stroke={C.accent} strokeWidth={4}
          strokeDasharray={`${circ * pct} ${circ}`}
          strokeDashoffset={-circ * 0.125}
          strokeLinecap="round"
          transform="rotate(135 45 45)" />
        <text x={45} y={47} textAnchor="middle" fill={C.accent} fontSize={22} fontWeight={900} fontFamily={FONT_MONO}>{score}</text>
        <text x={45} y={61} textAnchor="middle" fill={C.muted} fontSize={8} fontFamily={FONT_DISPLAY} letterSpacing={1}>REP</text>
      </svg>
      <span style={{ color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: 0.8 }}>ELITE TIER</span>
    </div>
  );
}

export function TraderProfile() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT_DISPLAY, color: C.white }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", gap: 12,
        height: 56,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: C.accent }}>S</div>
        <span style={{ color: C.white, fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>SOGRAM</span>
        <span style={{ color: C.border, fontSize: 14 }}>/</span>
        <span style={{ color: C.gray, fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>@VEGA</span>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ border: `1px solid ${C.border}`, padding: "28px 28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 28 }}>
            <div style={{
              width: 64, height: 64,
              borderRadius: "50%",
              border: `2px solid ${C.accent}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 900, color: C.accent,
              flexShrink: 0,
            }}>VE</div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0.5 }}>0XVEGA</span>
                <span style={{ background: C.accent, color: C.bg, fontSize: 9, padding: "2px 7px", fontWeight: 900, letterSpacing: 0.8 }}>VERIFIED</span>
                <span style={{ border: `1px solid ${C.border}`, color: C.gray, fontSize: 9, padding: "2px 7px", fontWeight: 800, letterSpacing: 0.8 }}>ELITE TRADER</span>
              </div>
              <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.6, marginBottom: 12, maxWidth: 480 }}>
                Quantitative momentum trader. Macro-first approach. Running algo signals on BTC + ETH perps. 3 years trading professionally.
              </p>
              <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
                {[["1,284", "FOLLOWERS"], ["87", "COPIERS"], ["342", "SIGNALS"], ["JAN 2024", "JOINED"]].map(([v, l]) => (
                  <div key={l}>
                    <span style={{ color: C.white, fontWeight: 900, fontFamily: FONT_MONO }}>{v} </span>
                    <span style={{ color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            <RepCircle score={94} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={{ background: C.accent, color: C.bg, border: "none", padding: "11px 24px", fontWeight: 900, fontSize: 12, cursor: "pointer", letterSpacing: 0.5, fontFamily: FONT_DISPLAY }}>COPY TRADE</button>
              <button style={{ background: "transparent", color: C.gray, border: `1px solid ${C.border}`, padding: "11px 24px", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 0.5, fontFamily: FONT_DISPLAY }}>FOLLOW</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 0 }}>
            <StatBox label="30D PNL" value="+$48,234" sub="Net realized" accent />
            <StatBox label="WIN RATE" value="78.3%" sub="141 / 180 trades" accent />
            <StatBox label="AVG R:R" value="2.8:1" sub="Risk / Reward" />
            <StatBox label="MAX DD" value="-6.2%" sub="30d drawdown" />
            <StatBox label="AVG HOLD" value="1.4D" sub="Per trade" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ border: `1px solid ${C.border}`, padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5 }}>PNL CURVE</span>
              <div style={{ display: "flex", gap: 0 }}>
                {["7D", "30D", "90D"].map((t, i) => (
                  <button key={t} style={{
                    background: i === 1 ? C.accent : "transparent",
                    color: i === 1 ? C.bg : C.muted,
                    border: `1px solid ${i === 1 ? C.accent : C.border}`,
                    padding: "4px 10px",
                    fontWeight: 800, fontSize: 10, cursor: "pointer",
                    letterSpacing: 0.5, fontFamily: FONT_DISPLAY,
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <MiniChart />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
              <span>APR 2</span><span>APR 16</span><span>MAY 2</span>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, marginBottom: 6 }}>TOTAL RETURN</div>
                <div style={{ color: C.accent, fontSize: 24, fontWeight: 900, fontFamily: FONT_MONO }}>+48.3%</div>
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, marginBottom: 6 }}>SHARPE RATIO</div>
                <div style={{ color: C.white, fontSize: 24, fontWeight: 900, fontFamily: FONT_MONO }}>3.14</div>
              </div>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, padding: "24px" }}>
            <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, marginBottom: 20 }}>RECENT TRADES</div>
            {trades.map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 0",
                borderBottom: i < trades.length - 1 ? `1px solid ${C.borderLight}` : "none",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.up ? C.accent : C.red, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 12, flex: 1, letterSpacing: 0.3 }}>{t.asset}</span>
                <span style={{
                  border: `1px solid ${t.side === "LONG" ? C.accent + "50" : C.red + "50"}`,
                  color: t.side === "LONG" ? C.accent : C.red,
                  fontSize: 9, fontWeight: 800, padding: "1px 6px", letterSpacing: 0.5,
                }}>{t.side}</span>
                <span style={{ color: t.up ? C.accent : C.red, fontSize: 13, fontFamily: FONT_MONO, fontWeight: 700 }}>{t.pnl}</span>
                <span style={{ color: t.up ? C.accent : C.red, fontSize: 11, fontFamily: FONT_MONO }}>{t.pnlPct}</span>
                <span style={{ color: C.muted, fontSize: 10, fontWeight: 700, width: 48, textAlign: "right", letterSpacing: 0.3 }}>{t.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
