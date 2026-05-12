import { useEffect, useRef, useState } from "react";
import {
  useListPainRooms,
  useAddBreakdown,
  useLikePainRoom,
  useLikeBreakdown,
  useResolveBreakdown,
  useCreatePainRoom,
} from "@workspace/api-client-react";
import type { PainRoom, BreakdownFull, AddBreakdownBody } from "@workspace/api-client-react";
import { useFeedStream } from "@/lib/sse";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useMyId } from "@/hooks/useAuth";

const TIER_COLORS: Record<string, string> = {
  DIAMOND: "#00D4FF",
  PLATINUM: "#E5E7EB",
  GOLD: "#D4FF00",
  SILVER: "#9CA3AF",
  BRONZE: "#F97316",
};

const WHAT_FAILED_LABELS: Record<string, string> = {
  entry_timing: "Entry Timing",
  thesis: "Thesis",
  sizing: "Position Sizing",
  risk_management: "Risk Management",
  exit_timing: "Exit Timing",
  leverage: "Leverage",
};

const WHAT_FAILED_OPTIONS = [
  { value: "entry_timing", label: "Entry Timing" },
  { value: "thesis", label: "Wrong Thesis" },
  { value: "sizing", label: "Position Sizing" },
  { value: "risk_management", label: "Risk Management" },
  { value: "exit_timing", label: "Exit Timing" },
  { value: "leverage", label: "Leverage" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}D AGO`;
  if (h > 0) return `${h}H AGO`;
  return "JUST NOW";
}

function Avatar({ username, size = 36 }: { username: string; size?: number }) {
  const initials = username.slice(0, 2).toUpperCase();
  const hue = username.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: `hsl(${hue},45%,25%)`, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: size * 0.33, fontWeight: 700, color: `hsl(${hue},60%,65%)`,
        fontFamily: "DM Sans, sans-serif", letterSpacing: 1,
      }}
    >
      {initials}
    </div>
  );
}

function BreakdownCard({
  bd,
  isResolved,
  onLike,
  onMarkHelpful,
  canMarkHelpful,
}: {
  bd: BreakdownFull;
  isResolved: boolean;
  onLike: () => void;
  onMarkHelpful: () => void;
  canMarkHelpful: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(bd.likeCount);

  return (
    <div
      style={{
        border: `1px solid ${bd.isMarkedHelpful ? "#22C55E44" : "#1A1A1A"}`,
        borderLeft: `3px solid ${bd.isMarkedHelpful ? "#22C55E" : "#2A2A2A"}`,
        borderRadius: 6,
        padding: "16px 18px",
        background: bd.isMarkedHelpful ? "#0D1F12" : "#0F0F0F",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Avatar username={bd.responderUsername} size={32} />
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 13, color: "#F5F5F5" }}>
                {bd.responderUsername}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 5px",
                border: `1px solid ${TIER_COLORS[bd.responderTier] ?? "#9CA3AF"}`,
                color: TIER_COLORS[bd.responderTier] ?? "#9CA3AF", borderRadius: 2,
              }}>
                {bd.responderTier}
              </span>
              <span style={{ fontSize: 11, color: "#555", fontFamily: "JetBrains Mono" }}>
                REP {bd.responderRepScore}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#444", fontFamily: "JetBrains Mono", marginTop: 1 }}>
              {timeAgo(bd.createdAt)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {bd.isMarkedHelpful && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 7px",
              background: "#22C55E22", border: "1px solid #22C55E44",
              color: "#22C55E", borderRadius: 2,
            }}>
              ✓ HELPED
            </span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 7px",
            background: "#1A1A1A", border: "1px solid #2A2A2A",
            color: "#D4FF00", borderRadius: 2,
          }}>
            {WHAT_FAILED_LABELS[bd.whatFailed] ?? bd.whatFailed}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#555", marginBottom: 5 }}>
          WHAT THE DATA SHOWED
        </div>
        <p style={{ fontSize: 13, color: "#C4C4C4", lineHeight: 1.65, margin: 0, fontFamily: "DM Sans" }}>
          {bd.dataShowed}
        </p>
      </div>

      <div style={{
        background: "#141414", borderRadius: 4, padding: "10px 14px",
        borderLeft: "2px solid #D4FF00", marginBottom: 12,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#D4FF00", marginBottom: 5 }}>
          DO DIFFERENTLY
        </div>
        <p style={{ fontSize: 13, color: "#E5E5E5", lineHeight: 1.65, margin: 0, fontFamily: "DM Sans" }}>
          {bd.doDifferently}
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => { if (!liked) { setLiked(true); setLocalLikes((l: number) => l + 1); onLike(); } }}
          style={{
            background: "none", border: "none", cursor: liked ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 5,
            color: liked ? "#D4FF00" : "#555", fontSize: 12,
            fontFamily: "JetBrains Mono", padding: 0, transition: "color 0.2s",
          }}
        >
          ♥ {localLikes}
        </button>
        {canMarkHelpful && !isResolved && (
          <button
            onClick={onMarkHelpful}
            style={{
              padding: "5px 12px", background: "none",
              border: "1px solid #22C55E44", borderRadius: 4,
              color: "#22C55E", fontSize: 10, fontWeight: 700,
              letterSpacing: 1.5, cursor: "pointer", fontFamily: "DM Sans",
            }}
          >
            THIS HELPED ME →
          </button>
        )}
      </div>
    </div>
  );
}

function AddBreakdownForm({ painRoomId, onSuccess }: { painRoomId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [whatFailed, setWhatFailed] = useState<AddBreakdownBody["whatFailed"]>("thesis");
  const [dataShowed, setDataShowed] = useState("");
  const [doDifferently, setDoDifferently] = useState("");
  const { mutateAsync, isPending } = useAddBreakdown();
  const myId = useMyId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataShowed.trim() || !doDifferently.trim() || myId === null) return;
    await mutateAsync({ painRoomId, data: { responderId: myId, whatFailed, dataShowed, doDifferently } });
    setDataShowed(""); setDoDifferently(""); setOpen(false);
    onSuccess();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={myId === null}
        title={myId === null ? "Connect wallet to add a breakdown" : undefined}
        style={{
          width: "100%", padding: "10px 0",
          background: "none", border: "1px dashed #2A2A2A",
          borderRadius: 6, color: "#555", fontSize: 11,
          fontWeight: 700, letterSpacing: 2, cursor: "pointer",
          fontFamily: "DM Sans", transition: "all 0.2s",
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = "#D4FF0044"; (e.target as HTMLElement).style.color = "#D4FF00"; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "#2A2A2A"; (e.target as HTMLElement).style.color = "#555"; }}
      >
        {myId === null ? "+ CONNECT WALLET TO ADD BREAKDOWN" : "+ ADD YOUR BREAKDOWN"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ border: "1px solid #2A2A2A", borderRadius: 6, padding: 16, background: "#0F0F0F" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#D4FF00", marginBottom: 14 }}>
        YOUR BREAKDOWN
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", fontWeight: 700, display: "block", marginBottom: 5 }}>WHAT FAILED</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WHAT_FAILED_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setWhatFailed(opt.value as AddBreakdownBody["whatFailed"])}
              style={{
                padding: "4px 10px", border: `1px solid ${whatFailed === opt.value ? "#D4FF00" : "#2A2A2A"}`,
                borderRadius: 3, background: whatFailed === opt.value ? "#D4FF0015" : "none",
                color: whatFailed === opt.value ? "#D4FF00" : "#666",
                fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: "pointer", fontFamily: "DM Sans",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", fontWeight: 700, display: "block", marginBottom: 5 }}>WHAT THE DATA SHOWED</label>
        <textarea value={dataShowed} onChange={e => setDataShowed(e.target.value)}
          placeholder="Explain what the charts/data actually showed that the trader missed..."
          rows={3} style={{
            width: "100%", background: "#141414", border: "1px solid #2A2A2A",
            borderRadius: 4, padding: "8px 10px", color: "#E5E5E5",
            fontSize: 12, fontFamily: "DM Sans", resize: "vertical", outline: "none",
            boxSizing: "border-box", lineHeight: 1.55,
          }}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 9, letterSpacing: 2, color: "#555", fontWeight: 700, display: "block", marginBottom: 5 }}>DO DIFFERENTLY</label>
        <textarea value={doDifferently} onChange={e => setDoDifferently(e.target.value)}
          placeholder="Give one concrete thing they should change next time..."
          rows={3} style={{
            width: "100%", background: "#141414", border: "1px solid #2A2A2A",
            borderRadius: 4, padding: "8px 10px", color: "#E5E5E5",
            fontSize: 12, fontFamily: "DM Sans", resize: "vertical", outline: "none",
            boxSizing: "border-box", lineHeight: 1.55,
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={isPending || !dataShowed.trim() || !doDifferently.trim()}
          style={{
            flex: 1, padding: "8px 0", background: "#D4FF00", border: "none", borderRadius: 4,
            color: "#0A0A0A", fontSize: 11, fontWeight: 700, letterSpacing: 2,
            cursor: isPending ? "wait" : "pointer", fontFamily: "DM Sans",
            opacity: (!dataShowed.trim() || !doDifferently.trim()) ? 0.4 : 1,
          }}
        >
          {isPending ? "SUBMITTING..." : "SUBMIT BREAKDOWN"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          style={{
            padding: "8px 16px", background: "none", border: "1px solid #2A2A2A", borderRadius: 4,
            color: "#666", fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: "pointer", fontFamily: "DM Sans",
          }}
        >
          CANCEL
        </button>
      </div>
    </form>
  );
}

function PainRoomCard({ pr, onRefetch }: { pr: PainRoom; onRefetch: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(pr.likeCount);
  const { mutateAsync: likePainRoom } = useLikePainRoom();
  const { mutateAsync: likeBreakdown } = useLikeBreakdown();
  const { mutateAsync: resolveBreakdown } = useResolveBreakdown();
  const myId = useMyId();

  const pnlNum = parseFloat(pr.pnlUsd);
  const pnlPctNum = parseFloat(pr.pnlPct);

  async function handleLike() {
    if (liked) return;
    setLiked(true);
    setLocalLikes((l: number) => l + 1);
    await likePainRoom({ painRoomId: pr.id });
  }

  return (
    <div style={{
      border: "1px solid #2A1A1A", borderTop: "2px solid #FF3B3B",
      borderRadius: 8, marginBottom: 16, background: "#0A0A0A", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 18px 0" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar username={pr.traderUsername} />
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 14, color: "#F5F5F5" }}>
                  {pr.traderUsername}
                </span>
                {!pr.isAnonymous && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 5px",
                    border: `1px solid ${TIER_COLORS[pr.traderTier] ?? "#9CA3AF"}`,
                    color: TIER_COLORS[pr.traderTier] ?? "#9CA3AF", borderRadius: 2,
                  }}>
                    {pr.traderTier}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#555", fontFamily: "JetBrains Mono" }}>
                  {pr.isAnonymous ? "ANON" : `REP ${pr.traderRepScore}`}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#555", fontFamily: "JetBrains Mono", marginTop: 2 }}>
                {timeAgo(pr.createdAt)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pr.isResolved && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 7px",
                background: "#22C55E1A", border: "1px solid #22C55E44", color: "#22C55E", borderRadius: 3,
              }}>
                ✓ RESOLVED
              </span>
            )}
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2, padding: "3px 8px",
              background: "#FF3B3B1A", border: "1px solid #FF3B3B44", color: "#FF3B3B", borderRadius: 3,
            }}>
              PAIN ROOM
            </span>
          </div>
        </div>

        {/* Trade grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 1, marginBottom: 14, background: "#1A1A1A", borderRadius: 6, overflow: "hidden",
        }}>
          {([
            { label: "ASSET", value: pr.asset, color: undefined },
            { label: "DIRECTION", value: pr.side, color: pr.side === "LONG" ? "#22C55E" : "#FF3B3B" },
            { label: "LEVERAGE", value: `${pr.leverage}x`, color: undefined },
            { label: "SIZE", value: `$${parseFloat(pr.positionSize).toLocaleString()}`, color: undefined },
            { label: "ENTRY", value: `$${parseFloat(pr.entryPrice).toLocaleString()}`, color: undefined },
            { label: "EXIT", value: `$${parseFloat(pr.exitPrice).toLocaleString()}`, color: undefined },
            { label: "P&L", value: `${pnlNum < 0 ? "-" : "+"}$${Math.abs(pnlNum).toLocaleString()}`, color: "#FF3B3B" },
            { label: "P&L %", value: `${pnlPctNum.toFixed(2)}%`, color: "#FF3B3B" },
          ] as const).map(({ label, value, color }) => (
            <div key={label} style={{ background: "#0F0F0F", padding: "10px 12px" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#444", fontWeight: 700, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono", color: color ?? "#E5E5E5" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Trader comment */}
        {pr.comment && (
          <div style={{
            background: "#0F0F0F", border: "1px solid #1A1A1A",
            borderLeft: "3px solid #FF3B3B55", borderRadius: 4,
            padding: "12px 14px", marginBottom: 14,
          }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#555", fontWeight: 700, marginBottom: 6 }}>
              WHAT HAPPENED
            </div>
            <p style={{ fontSize: 13, color: "#AAAAAA", lineHeight: 1.65, margin: 0, fontFamily: "DM Sans" }}>
              {pr.comment}
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, paddingTop: 2 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={handleLike} style={{
              background: "none", border: "none", cursor: liked ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 5,
              color: liked ? "#FF3B3B" : "#555", fontSize: 13,
              fontFamily: "JetBrains Mono", padding: 0, transition: "color 0.2s",
            }}>
              ♥ {localLikes}
            </button>
            <span style={{ color: pr.breakdownCount > 0 ? "#D4FF00" : "#555", fontSize: 12, fontFamily: "JetBrains Mono" }}>
              ◆ {pr.breakdownCount} {pr.breakdownCount === 1 ? "BREAKDOWN" : "BREAKDOWNS"}
            </span>
          </div>
          <button onClick={() => setExpanded(e => !e)} style={{
            padding: "6px 14px", background: "none",
            border: "1px solid #2A2A2A", borderRadius: 4,
            color: "#888", fontSize: 10, fontWeight: 700,
            letterSpacing: 1.5, cursor: "pointer", fontFamily: "DM Sans",
          }}>
            {expanded ? "COLLAPSE ↑" : "VIEW BREAKDOWNS ↓"}
          </button>
        </div>
      </div>

      {/* Expanded breakdowns panel */}
      {expanded && (
        <div style={{ background: "#080808", borderTop: "1px solid #1A1A1A", padding: "16px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#555", marginBottom: 14 }}>
            COMMUNITY BREAKDOWNS — RANKED BY REPUTATION
          </div>
          {pr.breakdowns.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#444", fontSize: 12, fontFamily: "DM Sans" }}>
              No breakdowns yet. Be the first to help.
            </div>
          ) : (
            pr.breakdowns.map((bd: BreakdownFull) => (
              <BreakdownCard
                key={bd.id}
                bd={bd}
                isResolved={pr.isResolved}
                onLike={() => likeBreakdown({ breakdownId: bd.id })}
                onMarkHelpful={() => resolveBreakdown({ painRoomId: pr.id, breakdownId: bd.id }).then(onRefetch)}
                canMarkHelpful={myId !== null && pr.traderId === myId}
              />
            ))
          )}
          <AddBreakdownForm painRoomId={pr.id} onSuccess={onRefetch} />
        </div>
      )}
    </div>
  );
}

function PostLossForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const { mutateAsync, isPending } = useCreatePainRoom();
  const myId = useMyId();
  const [asset, setAsset] = useState("BTC/USDT");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [leverage, setLeverage] = useState("1");
  const [positionSize, setPositionSize] = useState("");
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const pnlUsd = entryPrice && exitPrice && positionSize
    ? (
        side === "LONG"
          ? ((Number(exitPrice) - Number(entryPrice)) / Number(entryPrice)) * Number(positionSize) * Number(leverage)
          : ((Number(entryPrice) - Number(exitPrice)) / Number(entryPrice)) * Number(positionSize) * Number(leverage)
      ).toFixed(2)
    : "";
  const pnlPct = entryPrice && exitPrice
    ? (
        side === "LONG"
          ? ((Number(exitPrice) - Number(entryPrice)) / Number(entryPrice)) * 100 * Number(leverage)
          : ((Number(entryPrice) - Number(exitPrice)) / Number(entryPrice)) * 100 * Number(leverage)
      ).toFixed(4)
    : "";

  const isValid = asset && entryPrice && exitPrice && positionSize && Number(pnlUsd) < 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || myId === null) return;
    await mutateAsync({
      data: {
        traderId: myId,
        asset,
        side,
        entryPrice,
        exitPrice,
        pnlUsd,
        pnlPct,
        leverage: Number(leverage),
        positionSize,
        comment: comment || undefined,
        isAnonymous,
      },
    });
    onSuccess();
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#141414", border: "1px solid #2A2A2A",
    borderRadius: 4, padding: "8px 10px", color: "#E5E5E5",
    fontSize: 12, fontFamily: "JetBrains Mono", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: 2, color: "#555", fontWeight: 700, display: "block", marginBottom: 5,
  };

  return (
    <div style={{
      border: "1px solid #2A1A1A", borderTop: "2px solid #FF3B3B",
      background: "#0A0A0A", padding: 20, marginBottom: 20, borderRadius: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#FF3B3B", marginBottom: 16 }}>
        POST YOUR LOSS
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>ASSET</label>
            <select value={asset} onChange={e => setAsset(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","ARB/USDT","AVAX/USDT","OP/USDT"].map(a => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>DIRECTION</label>
            <div style={{ display: "flex", height: 35 }}>
              {(["LONG","SHORT"] as const).map(s => (
                <button key={s} type="button" onClick={() => setSide(s)} style={{
                  flex: 1, border: `1px solid ${side === s ? (s === "LONG" ? "#22C55E" : "#FF3B3B") : "#2A2A2A"}`,
                  background: side === s ? (s === "LONG" ? "#22C55E15" : "#FF3B3B15") : "none",
                  color: side === s ? (s === "LONG" ? "#22C55E" : "#FF3B3B") : "#555",
                  fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: "pointer", fontFamily: "DM Sans",
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>ENTRY PRICE</label>
            <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>EXIT PRICE</label>
            <input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>POSITION SIZE ($)</label>
            <input type="number" value={positionSize} onChange={e => setPositionSize(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>LEVERAGE</label>
            <input type="number" min="1" max="100" value={leverage} onChange={e => setLeverage(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {pnlUsd && (
          <div style={{
            padding: "8px 12px", marginBottom: 12, borderRadius: 4,
            background: Number(pnlUsd) < 0 ? "#FF3B3B12" : "#22C55E12",
            border: `1px solid ${Number(pnlUsd) < 0 ? "#FF3B3B30" : "#22C55E30"}`,
            color: Number(pnlUsd) < 0 ? "#FF3B3B" : "#22C55E",
            fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 700,
          }}>
            P&L: {Number(pnlUsd) >= 0 ? "+" : ""}{Number(pnlUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })} ({Number(pnlPct).toFixed(2)}%)
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>WHAT HAPPENED (OPTIONAL)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Be honest. What did you miss? What were you thinking?"
            rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer" }}
          onClick={() => setIsAnonymous(a => !a)}
        >
          <div style={{
            width: 18, height: 18, border: `2px solid ${isAnonymous ? "#FF3B3B" : "#2A2A2A"}`,
            borderRadius: 3, background: isAnonymous ? "#FF3B3B18" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}>
            {isAnonymous && <span style={{ color: "#FF3B3B", fontSize: 12, fontWeight: 900 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: isAnonymous ? "#FF3B3B" : "#888", fontFamily: "DM Sans" }}>
              Post anonymously
            </div>
            <div style={{ fontSize: 10, color: "#444", fontFamily: "DM Sans" }}>
              Your username and rep score will be hidden
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={!isValid || isPending || myId === null} style={{
            flex: 1, padding: "9px 0", background: isValid && myId !== null ? "#FF3B3B" : "#2A1A1A",
            border: "none", borderRadius: 4, color: isValid && myId !== null ? "#fff" : "#555",
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            cursor: isValid && !isPending && myId !== null ? "pointer" : "not-allowed", fontFamily: "DM Sans",
          }}>
            {myId === null ? "CONNECT WALLET TO POST" : isPending ? "SUBMITTING..." : "POST TO PAIN ROOM"}
          </button>
          <button type="button" onClick={onClose} style={{
            padding: "9px 16px", background: "none", border: "1px solid #2A2A2A",
            borderRadius: 4, color: "#666", fontSize: 11, fontWeight: 700,
            letterSpacing: 1, cursor: "pointer", fontFamily: "DM Sans",
          }}>
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PainRoomPage() {
  const { data, isLoading, refetch } = useListPainRooms();
  const [showPostForm, setShowPostForm] = useState(false);

  // Live SSE — debounced refetch when new trades fire,
  // since closed losses can become Pain Room posts.
  const invalidateTimer = useRef<number | null>(null);
  const scheduleInvalidate = () => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = window.setTimeout(() => {
      invalidateTimer.current = null;
      refetch();
    }, 1000);
  };
  useFeedStream({ onNewTrade: scheduleInvalidate });
  useEffect(() => () => {
    if (invalidateTimer.current) { window.clearTimeout(invalidateTimer.current); invalidateTimer.current = null; }
  }, []);

  const painRooms = data?.painRooms ?? [];
  const totalLost = painRooms.reduce((sum, pr) => sum + Math.abs(parseFloat(pr.pnlUsd)), 0);
  const resolved = painRooms.filter(pr => pr.isResolved).length;
  const totalBreakdowns = painRooms.reduce((sum, pr) => sum + pr.breakdownCount, 0);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 60px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 900, letterSpacing: 3, color: "#FF3B3B",
              fontFamily: "DM Sans", margin: 0, textTransform: "uppercase",
            }}>
              PAIN ROOM
            </h1>
            <p style={{ color: "#555", fontSize: 12, margin: "6px 0 0", fontFamily: "DM Sans" }}>
              Verified losses. Structured breakdowns. You learn more from losses than from wins.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <LiveIndicator />
            <button
              onClick={() => setShowPostForm(f => !f)}
              style={{
                padding: "8px 18px", background: showPostForm ? "#FF3B3B30" : "#FF3B3B1A",
                border: "1px solid #FF3B3B44", borderRadius: 4,
                color: "#FF3B3B", fontSize: 10, fontWeight: 700,
                letterSpacing: 2, cursor: "pointer", fontFamily: "DM Sans",
              }}>
              {showPostForm ? "× CANCEL" : "+ POST LOSS"}
            </button>
          </div>
        </div>
      </div>

      {/* Post Loss Form */}
      {showPostForm && (
        <PostLossForm onSuccess={refetch} onClose={() => setShowPostForm(false)} />
      )}

      {/* Stats bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 1, background: "#1A1A1A", borderRadius: 6,
        overflow: "hidden", marginBottom: 24,
      }}>
        {[
          { label: "COMMUNITY LOSSES", value: `$${totalLost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "#FF3B3B" },
          { label: "BREAKDOWNS GIVEN", value: totalBreakdowns.toString(), color: "#D4FF00" },
          { label: "RESOLVED", value: `${resolved} / ${painRooms.length}`, color: "#22C55E" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#0A0A0A", padding: "14px 18px" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#444", fontWeight: 700, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "JetBrains Mono", color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontSize: 12, fontFamily: "JetBrains Mono" }}>
          LOADING PAIN ROOMS...
        </div>
      ) : painRooms.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 0",
          border: "1px dashed #2A2A2A", borderRadius: 8,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🩸</div>
          <div style={{ fontSize: 14, fontFamily: "DM Sans", color: "#555" }}>
            No losses posted yet. Be the brave one.
          </div>
        </div>
      ) : (
        painRooms.map(pr => (
          <PainRoomCard key={pr.id} pr={pr} onRefetch={refetch} />
        ))
      )}
    </div>
  );
}
