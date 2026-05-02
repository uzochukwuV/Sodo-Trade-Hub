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

const heatmapData = [
  { pair: "BTC-USD", pct: 88, vol: "$4.2M", sentiment: 72, longs: 72 },
  { pair: "ETH-USD", pct: 61, vol: "$1.8M", sentiment: 64, longs: 64 },
  { pair: "XRP-USD", pct: 34, vol: "$820K", sentiment: 38, longs: 38 },
  { pair: "HYPE-USD", pct: 28, vol: "$640K", sentiment: 29, longs: 29 },
  { pair: "LTC-USD", pct: 18, vol: "$390K", sentiment: 55, longs: 55 },
  { pair: "SOL-USD", pct: 14, vol: "$280K", sentiment: 70, longs: 70 },
  { pair: "SILVER-USD", pct: 9, vol: "$180K", sentiment: 45, longs: 45 },
  { pair: "1000SHIB-USD", pct: 6, vol: "$110K", sentiment: 33, longs: 33 },
];

const leverageDist = [
  { label: "1–3x", pct: 18, count: 234 },
  { label: "5x", pct: 28, count: 364 },
  { label: "10x", pct: 31, count: 403 },
  { label: "20x", pct: 16, count: 208 },
  { label: "50x+", pct: 7, count: 91 },
];

const whales = [
  { addr: "0xVega", size: "$580K", pair: "BTC-USD", side: "LONG", lev: "10x", ts: "14m ago", pct: 92 },
  { addr: "0xSky7", size: "$320K", pair: "ETH-USD", side: "LONG", lev: "5x", ts: "28m ago", pct: 78 },
  { addr: "0xQual", size: "$210K", pair: "XRP-USD", side: "SHORT", lev: "20x", ts: "1h ago", pct: 65 },
  { addr: "0xMrkt", size: "$185K", pair: "BTC-USD", side: "LONG", lev: "15x", ts: "2h ago", pct: 81 },
];

const sosoInsights = [
  { label: "BTC ETF Net Flow", value: "+$342M", change: "7-day high", up: true },
  { label: "Sector: DeFi", value: "+4.2%", change: "Leading today", up: true },
  { label: "BTC Dominance", value: "56.4%", change: "+1.8% week", up: true },
  { label: "Macro: Fed (May 7)", value: "2 days", change: "Rate decision", up: null },
];

function SentimentBar({ longs }: { longs: number }) {
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${longs}%`, background: BRAND.accent }} />
      <div style={{ flex: 1, background: BRAND.red }} />
    </div>
  );
}

function BarChart({ data }: { data: typeof leverageDist }) {
  const max = Math.max(...data.map(d => d.pct));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100 }}>
      {data.map(d => (
        <div key={d.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
          <span style={{ color: BRAND.accent, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{d.pct}%</span>
          <div style={{
            width: "100%",
            height: (d.pct / max) * 70,
            background: `linear-gradient(to top, ${BRAND.accent}, ${BRAND.purple})`,
            borderRadius: "4px 4px 0 0",
          }} />
          <span style={{ color: BRAND.textMuted, fontSize: 11 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Analytics() {
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
        <span style={{ color: BRAND.textSecondary, fontSize: 14 }}>Analytics</span>
        <div style={{
          marginLeft: 8,
          background: BRAND.gold + "15",
          color: BRAND.gold,
          border: `1px solid ${BRAND.gold}30`,
          borderRadius: 5,
          padding: "2px 8px",
          fontSize: 11,
          fontWeight: 700,
        }}>PRO</div>
        <div style={{ marginLeft: "auto", color: BRAND.textMuted, fontSize: 12 }}>
          Live · Updated 30s ago
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {sosoInsights.map(ins => (
            <div key={ins.label} style={{
              background: BRAND.card,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 10,
              padding: "14px 16px",
            }}>
              <div style={{ color: BRAND.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: 0.7, marginBottom: 8, textTransform: "uppercase" }}>{ins.label}</div>
              <div style={{
                color: ins.up === true ? BRAND.accent : ins.up === false ? BRAND.red : BRAND.textPrimary,
                fontSize: 20,
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
                marginBottom: 4,
              }}>{ins.value}</div>
              <div style={{ color: BRAND.textMuted, fontSize: 11 }}>{ins.change}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 20,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>What the Crowd is Trading</div>
            <div style={{ color: BRAND.textMuted, fontSize: 12, marginBottom: 16 }}>By open interest share · 1,300 active traders</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {heatmapData.map(row => {
                const barColor = row.pct > 50 ? BRAND.accent : row.pct > 25 ? BRAND.purple : BRAND.textMuted;
                return (
                  <div key={row.pair}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{row.pair}</span>
                        <span style={{ color: BRAND.textMuted, fontSize: 12 }}>{row.vol}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: BRAND.accent, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{row.longs}% L</span>
                        <span style={{ color: BRAND.red, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{100 - row.longs}% S</span>
                        <span style={{ color: barColor, fontWeight: 700, fontSize: 13, fontFamily: "JetBrains Mono, monospace", width: 42, textAlign: "right" }}>{row.pct}%</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ flex: 1, height: 8, background: BRAND.border, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                          width: `${row.pct}%`,
                          height: "100%",
                          background: `linear-gradient(to right, ${BRAND.accent}, ${BRAND.purple})`,
                          borderRadius: 4,
                        }} />
                      </div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <SentimentBar longs={row.longs} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 4, borderRadius: 2, background: BRAND.accent }} />
                <span style={{ color: BRAND.textMuted, fontSize: 11 }}>Long sentiment</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 4, borderRadius: 2, background: BRAND.red }} />
                <span style={{ color: BRAND.textMuted, fontSize: 11 }}>Short sentiment</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              background: BRAND.card,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 14,
              padding: 20,
              flex: 1,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Leverage Distribution</div>
              <div style={{ color: BRAND.textMuted, fontSize: 12, marginBottom: 16 }}>How much risk traders are taking</div>
              <BarChart data={leverageDist} />
              <div style={{ color: BRAND.textMuted, fontSize: 12, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BRAND.border}` }}>
                Avg leverage this week: <strong style={{ color: BRAND.gold }}>9.4x</strong> · Up from 7.8x last week
              </div>
            </div>
          </div>
        </div>

        <div style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Whale Activity</div>
              <div style={{ color: BRAND.textMuted, fontSize: 12 }}>Large positions opened in the last 24h · Min $100K</div>
            </div>
            <div style={{
              background: BRAND.accentDim,
              color: BRAND.accent,
              border: `1px solid ${BRAND.accent}30`,
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}>LIVE</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {whales.map((w, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                background: BRAND.bg,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 10,
              }}>
                <div style={{
                  width: 36, height: 36,
                  background: `linear-gradient(135deg, ${BRAND.accent}30, ${BRAND.purple}30)`,
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: BRAND.accent, fontWeight: 700,
                }}>🐋</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{w.addr}</span>
                    <span style={{
                      background: w.side === "LONG" ? BRAND.accentDim : BRAND.redDim,
                      color: w.side === "LONG" ? BRAND.accent : BRAND.red,
                      border: `1px solid ${w.side === "LONG" ? BRAND.accent : BRAND.red}30`,
                      fontSize: 11, fontWeight: 700,
                      padding: "1px 6px", borderRadius: 4,
                    }}>{w.side} {w.lev}</span>
                    <span style={{ fontWeight: 600, color: BRAND.textPrimary, fontSize: 14 }}>{w.pair}</span>
                  </div>
                  <div style={{ color: BRAND.textMuted, fontSize: 12, marginTop: 2 }}>Position: {w.size} · {w.ts}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: BRAND.textMuted, fontSize: 10, marginBottom: 3 }}>Rep Score</div>
                  <div style={{ color: w.pct >= 80 ? BRAND.gold : BRAND.accent, fontWeight: 800, fontSize: 18, fontFamily: "JetBrains Mono, monospace" }}>{w.pct}</div>
                </div>
                <button style={{
                  background: "transparent",
                  border: `1px solid ${BRAND.accent}40`,
                  color: BRAND.accent,
                  borderRadius: 7,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}>Copy →</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
