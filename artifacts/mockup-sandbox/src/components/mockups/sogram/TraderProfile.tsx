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
  gold: "#FFB830",
  textPrimary: "#F2F3F7",
  textSecondary: "#7C7F96",
  textMuted: "#4A4C60",
};

const trades = [
  { asset: "BTC-USD", side: "LONG", pnl: "+$4,318", pnlPct: "+7.45%", date: "May 1", up: true },
  { asset: "ETH-USD", side: "LONG", pnl: "+$1,840", pnlPct: "+4.12%", date: "Apr 29", up: true },
  { asset: "XRP-USD", side: "SHORT", pnl: "+$920", pnlPct: "+3.68%", date: "Apr 27", up: true },
  { asset: "HYPE-USD", side: "SHORT", pnl: "-$380", pnlPct: "-1.52%", date: "Apr 24", up: false },
  { asset: "SOL-USD", side: "LONG", pnl: "+$2,250", pnlPct: "+9.00%", date: "Apr 21", up: true },
  { asset: "LTC-USD", side: "LONG", pnl: "-$210", pnlPct: "-0.84%", date: "Apr 19", up: false },
];

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: "14px 16px",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ color: BRAND.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ color: color || BRAND.textPrimary, fontSize: 22, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ color: BRAND.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniPnlChart() {
  const pts = [0, 8, 5, 14, 11, 19, 16, 24, 20, 31, 28, 38, 35, 44, 48];
  const max = Math.max(...pts);
  const h = 60;
  const w = 300;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * w} ${h - (p / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND.accent} stopOpacity={0.3} />
          <stop offset="100%" stopColor={BRAND.accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill="url(#chartGrad)" />
      <path d={d} fill="none" stroke={BRAND.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RepMeter({ score }: { score: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const dasharray = circ;
  const dashoffset = circ * (1 - pct * 0.75);
  const color = score >= 90 ? BRAND.gold : score >= 75 ? BRAND.accent : BRAND.purple;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke={BRAND.border} strokeWidth={8} strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" transform="rotate(135 50 50)" />
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={8} strokeDasharray={`${dasharray * pct * 0.75} ${dasharray}`} strokeDashoffset={-circ * 0.125} strokeLinecap="round" transform="rotate(135 50 50)" style={{ transition: "all 1s ease" }} />
        <text x={50} y={52} textAnchor="middle" fill={color} fontSize={20} fontWeight={800} fontFamily="JetBrains Mono, monospace">{score}</text>
        <text x={50} y={66} textAnchor="middle" fill={BRAND.textMuted} fontSize={9} fontFamily="Inter, sans-serif">REP</text>
      </svg>
      <span style={{ color: BRAND.textSecondary, fontSize: 12 }}>
        {score >= 90 ? "Elite" : score >= 75 ? "Expert" : "Rising"}
      </span>
    </div>
  );
}

export function TraderProfile() {
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
        display: "flex",
        alignItems: "center",
        gap: 12,
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
        <span style={{ color: BRAND.textSecondary, fontSize: 14 }}>@vega</span>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, right: 0, width: 300, height: "100%",
            background: `radial-gradient(circle at 100% 50%, ${BRAND.accent}08 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 20 }}>
            <div style={{
              width: 72, height: 72,
              background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.purple})`,
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, fontWeight: 900, color: "#0A0B0F",
              fontFamily: "Space Grotesk, sans-serif",
              flexShrink: 0,
              border: `3px solid ${BRAND.accent}40`,
            }}>VE</div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif" }}>0xVega</span>
                <span style={{
                  background: BRAND.accentDim,
                  color: BRAND.accent,
                  border: `1px solid ${BRAND.accent}40`,
                  borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700,
                }}>✓ Verified</span>
                <span style={{
                  background: BRAND.gold + "15",
                  color: BRAND.gold,
                  border: `1px solid ${BRAND.gold}40`,
                  borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700,
                }}>Elite Trader</span>
              </div>
              <div style={{ color: BRAND.textSecondary, fontSize: 13, marginBottom: 10 }}>
                Quantitative momentum trader. Macro-first approach. Running algo signals on BTC, ETH perps. 3y trading professionally.
              </div>
              <div style={{ display: "flex", gap: 20, color: BRAND.textSecondary, fontSize: 13 }}>
                <span><strong style={{ color: BRAND.textPrimary }}>1,284</strong> followers</span>
                <span><strong style={{ color: BRAND.textPrimary }}>87</strong> copiers</span>
                <span><strong style={{ color: BRAND.textPrimary }}>342</strong> signals posted</span>
                <span><strong style={{ color: BRAND.textPrimary }}>joined</strong> Jan 2024</span>
              </div>
            </div>

            <RepMeter score={94} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={{
                background: BRAND.accent,
                color: "#0A0B0F",
                border: "none",
                borderRadius: 9,
                padding: "10px 22px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}>Copy Trade</button>
              <button style={{
                background: "transparent",
                color: BRAND.textSecondary,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 9,
                padding: "10px 22px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}>Follow</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Stat label="30d PNL" value="+$48,234" sub="Net realized" color={BRAND.accent} />
            <Stat label="Win Rate" value="78.3%" sub="141 / 180 trades" color={BRAND.accent} />
            <Stat label="Avg R:R" value="2.8:1" sub="Risk/Reward" />
            <Stat label="Max DD" value="-6.2%" sub="30d drawdown" />
            <Stat label="Avg Hold" value="1.4d" sub="Per trade" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>PNL Curve</span>
              <div style={{ display: "flex", gap: 6 }}>
                {["7d", "30d", "90d"].map((t, i) => (
                  <button key={t} style={{
                    background: i === 1 ? BRAND.accent : "transparent",
                    color: i === 1 ? "#0A0B0F" : BRAND.textSecondary,
                    border: `1px solid ${i === 1 ? BRAND.accent : BRAND.border}`,
                    borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer",
                    fontWeight: 600,
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <MiniPnlChart />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: BRAND.textMuted, fontSize: 11 }}>
              <span>Apr 2</span><span>Apr 16</span><span>May 2</span>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 16 }}>
              <div>
                <div style={{ color: BRAND.textMuted, fontSize: 11, marginBottom: 2 }}>Total Return</div>
                <div style={{ color: BRAND.accent, fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>+48.3%</div>
              </div>
              <div>
                <div style={{ color: BRAND.textMuted, fontSize: 11, marginBottom: 2 }}>Sharpe Ratio</div>
                <div style={{ color: BRAND.textPrimary, fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>3.14</div>
              </div>
            </div>
          </div>

          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 20,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Recent Trades</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {trades.map((t, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i < trades.length - 1 ? `1px solid ${BRAND.border}` : "none",
                  gap: 12,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: t.up ? BRAND.accent : BRAND.red,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{t.asset}</span>
                  <span style={{
                    background: t.side === "LONG" ? BRAND.accentDim : BRAND.red + "15",
                    color: t.side === "LONG" ? BRAND.accent : BRAND.red,
                    fontSize: 11, fontWeight: 700,
                    padding: "2px 6px", borderRadius: 4,
                  }}>{t.side}</span>
                  <span style={{ color: t.up ? BRAND.accent : BRAND.red, fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{t.pnl}</span>
                  <span style={{ color: t.up ? BRAND.accent : BRAND.red, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{t.pnlPct}</span>
                  <span style={{ color: BRAND.textMuted, fontSize: 12, width: 50, textAlign: "right" }}>{t.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
