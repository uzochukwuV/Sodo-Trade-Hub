import { db, alertOutcomesTable, walletProfilesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AlertEvent } from "./alert-engine";

function num(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(8) : null;
}

export async function recordAlertOutcome(alertMatchId: number | undefined, event: AlertEvent) {
  if (!alertMatchId || event.subjectType !== "wallet") return;
  const walletAddress = event.walletAddress?.toLowerCase() ?? null;
  const profile = walletAddress
    ? await db.query.walletProfilesTable.findFirst({ where: eq(walletProfilesTable.walletAddress, walletAddress) })
    : null;
  const payload = event.payload ?? {};
  const positionId = String(payload["sodexPositionId"] ?? payload["sodexTradeId"] ?? event.subjectId);

  if (event.eventType === "open_position") {
    await db.insert(alertOutcomesTable).values({
      alertMatchId,
      walletProfileId: profile?.id ?? null,
      walletAddress,
      sodexPositionId: positionId,
      status: "open",
      entryPrice: num(payload["entryPrice"]),
      openedAt: new Date(),
      payload,
    }).onConflictDoNothing();
    return;
  }

  if (event.eventType === "close_position" || event.eventType === "big_pnl") {
    const finalPnl = Number(event.pnlUsd ?? payload["pnlUsd"] ?? 0);
    const existing = walletAddress
      ? await db.query.alertOutcomesTable.findFirst({
          where: and(eq(alertOutcomesTable.walletAddress, walletAddress), eq(alertOutcomesTable.sodexPositionId, positionId)),
        })
      : null;
    if (existing) {
      await db.update(alertOutcomesTable).set({
        status: finalPnl >= 0 ? "won" : "lost",
        finalPnlUsd: finalPnl.toFixed(2),
        maxProfitUsd: Math.max(finalPnl, 0).toFixed(2),
        maxDrawdownUsd: Math.min(finalPnl, 0).toFixed(2),
        closedAt: new Date(),
        resolvedAt: new Date(),
        payload,
        updatedAt: new Date(),
      }).where(eq(alertOutcomesTable.id, existing.id));
    } else {
      await db.insert(alertOutcomesTable).values({
        alertMatchId,
        walletProfileId: profile?.id ?? null,
        walletAddress,
        sodexPositionId: positionId,
        status: finalPnl >= 0 ? "won" : "lost",
        finalPnlUsd: finalPnl.toFixed(2),
        maxProfitUsd: Math.max(finalPnl, 0).toFixed(2),
        maxDrawdownUsd: Math.min(finalPnl, 0).toFixed(2),
        closedAt: new Date(),
        resolvedAt: new Date(),
        payload,
      }).onConflictDoNothing();
    }
  }
}
