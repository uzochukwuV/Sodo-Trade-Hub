import { useEffect, useState } from "react";
import { useLiveStatus } from "@/lib/sse";

/**
 * Persistent LIVE / OFFLINE pill driven by the shared SSE hub. Shows a green
 * pulsing dot + age of the most recent event ("LIVE · 2s") whenever the
 * connection is healthy, and a red dot + "OFFLINE" otherwise. Stale (>30s)
 * surfaces as amber.
 */
export function LiveIndicator({ compact = false }: { compact?: boolean }) {
  const { connected, lastEventAt } = useLiveStatus();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ageMs = lastEventAt ? now - lastEventAt : null;
  const stale = ageMs !== null && ageMs > 30_000;
  const color = !connected ? "#FF3B3B" : stale ? "#F59E0B" : "#22C55E";
  const label = !connected
    ? "OFFLINE"
    : ageMs === null
      ? "LIVE"
      : ageMs < 1000 ? "LIVE · NOW" : ageMs < 60_000 ? `LIVE · ${Math.floor(ageMs / 1000)}s` : `LIVE · ${Math.floor(ageMs / 60_000)}m`;

  return (
    <div
      title={connected ? `Last event ${ageMs ?? 0}ms ago` : "SSE disconnected — reconnecting..."}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "2px 7px" : "4px 9px",
        border: `1px solid ${color}55`,
        background: `${color}10`,
        color,
        fontSize: compact ? 9 : 10,
        fontWeight: 800,
        letterSpacing: 1.5,
        fontFamily: "DM Sans, sans-serif",
      }}
      data-testid="live-indicator"
    >
      <span
        className={connected && !stale ? "animate-pulse" : ""}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}
