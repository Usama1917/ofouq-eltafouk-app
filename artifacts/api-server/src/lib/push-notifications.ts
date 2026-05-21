import { db, pushNotificationTokensTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100;

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

function summarizeExpoPushError(ticket: ExpoPushTicket) {
  const message = String(ticket.message ?? "").trim();
  const detail = String(ticket.details?.error ?? "").trim();
  return [detail, message].filter(Boolean).join(": ") || "Unknown Expo push error";
}

export function isExpoPushToken(token: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizePushData(data: Record<string, unknown> | undefined) {
  return data ? JSON.parse(JSON.stringify(data)) as Record<string, unknown> : {};
}

export async function sendPushNotificationToUser(args: {
  userId: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const rows = await db
    .select({
      id: pushNotificationTokensTable.id,
      token: pushNotificationTokensTable.token,
    })
    .from(pushNotificationTokensTable)
    .where(and(eq(pushNotificationTokensTable.userId, args.userId), isNull(pushNotificationTokensTable.disabledAt)));

  const validRows = rows.filter((row) => isExpoPushToken(row.token));
  const invalidIds = rows.filter((row) => !isExpoPushToken(row.token)).map((row) => row.id);
  const disabledIds = [...invalidIds];
  let sentCount = 0;
  let ticketErrorCount = 0;
  const errorMessages = new Set<string>();

  if (invalidIds.length > 0) {
    errorMessages.add("Invalid Expo push token format");
  }

  for (const batch of chunk(validRows, EXPO_PUSH_BATCH_SIZE)) {
    const messages = batch.map((row) => ({
      to: row.token,
      title: args.title,
      body: args.body,
      data: normalizePushData(args.data),
      sound: "default",
      priority: "high",
      channelId: "default",
    }));

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
        "content-type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      throw new Error(`Expo push service returned ${response.status}`);
    }

    const payload = await response.json() as { data?: ExpoPushTicket[] };
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === "ok") {
        sentCount += 1;
        return;
      }

      if (ticket.status === "error") {
        ticketErrorCount += 1;
        errorMessages.add(summarizeExpoPushError(ticket));
      }

      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        const row = batch[index];
        if (row) disabledIds.push(row.id);
      }
    });
  }

  if (disabledIds.length > 0) {
    await db
      .update(pushNotificationTokensTable)
      .set({ disabledAt: new Date(), updatedAt: new Date() })
      .where(inArray(pushNotificationTokensTable.id, disabledIds));
  }

  return {
    registeredCount: rows.length,
    sentCount,
    disabledCount: disabledIds.length,
    ticketErrorCount,
    errorMessages: Array.from(errorMessages).slice(0, 5),
  };
}
