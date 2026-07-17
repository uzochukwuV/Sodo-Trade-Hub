import { db, notificationChannelsTable, notificationDeliveriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

type DispatchInput = {
  userId: number;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  alertMatchId?: number;
};

async function sendTelegram(destination: string, title: string, body: string): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) return { ok: false, error: "TELEGRAM_BOT_TOKEN missing" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: destination,
        text: `<b>${title}</b>\n\n${body}`,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, error: await res.text().catch(() => `HTTP ${res.status}`) };
    }
    const json = await res.json().catch(() => null) as { result?: { message_id?: number } } | null;
    return { ok: true, providerMessageId: json?.result?.message_id ? String(json.result.message_id) : undefined };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function dispatchNotification(input: DispatchInput) {
  const channels = await db.select().from(notificationChannelsTable).where(eq(notificationChannelsTable.userId, input.userId));
  if (channels.length === 0) {
    logger.debug({ userId: input.userId }, "notification.dispatch.no_channels");
    return;
  }

  for (const channel of channels) {
    if (!channel.isEnabled) continue;
    let status = "sent";
    let lastError: string | null = null;
    let providerMessageId: string | null = null;

    if (channel.type === "telegram") {
      const result = await sendTelegram(channel.destination, input.title, input.body);
      status = result.ok ? "sent" : "failed";
      lastError = result.error ?? null;
      providerMessageId = result.providerMessageId ?? null;
    } else {
      status = "skipped";
      lastError = `channel type ${channel.type} not implemented yet`;
    }

    await db.insert(notificationDeliveriesTable).values({
      alertMatchId: input.alertMatchId ?? null,
      channelId: channel.id,
      status,
      attempts: 1,
      lastError,
      providerMessageId,
      sentAt: status === "sent" ? new Date() : null,
    });
  }
}

