import { db, pushNotificationTokensTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_PUSH_BATCH_SIZE = 100;
const EXPO_RECEIPT_BATCH_SIZE = 300;

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

type ExpoPushReceipt = ExpoPushTicket;

type PendingReceipt = {
  ticketId: string;
  tokenId: number;
};

function summarizeExpoPushError(result: ExpoPushTicket | ExpoPushReceipt) {
  const message = String(result.message ?? "").trim();
  const detail = String(result.details?.error ?? "").trim();
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

async function fetchExpoReceipts(pendingReceipts: PendingReceipt[]) {
  const receiptErrors: Array<{ tokenId: number; receipt: ExpoPushReceipt }> = [];

  for (const batch of chunk(pendingReceipts, EXPO_RECEIPT_BATCH_SIZE)) {
    const response = await fetch(EXPO_PUSH_RECEIPTS_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ids: batch.map((item) => item.ticketId) }),
    });

    if (!response.ok) {
      throw new Error(`Expo push receipt service returned ${response.status}`);
    }

    const payload = await response.json() as { data?: Record<string, ExpoPushReceipt> };
    const receipts = payload.data ?? {};
    for (const item of batch) {
      const receipt = receipts[item.ticketId];
      if (receipt?.status === "error") {
        receiptErrors.push({ tokenId: item.tokenId, receipt });
      }
    }
  }

  return receiptErrors;
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
  let receiptErrorCount = 0;
  const errorMessages = new Set<string>();
  const pendingReceipts: PendingReceipt[] = [];

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
        if (ticket.id) {
          const row = batch[index];
          if (row) pendingReceipts.push({ ticketId: ticket.id, tokenId: row.id });
        }
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

  if (pendingReceipts.length > 0) {
    try {
      const receiptErrors = await fetchExpoReceipts(pendingReceipts);
      receiptErrorCount = receiptErrors.length;
      for (const { tokenId, receipt } of receiptErrors) {
        errorMessages.add(summarizeExpoPushError(receipt));
        if (receipt.details?.error === "DeviceNotRegistered") {
          disabledIds.push(tokenId);
        }
      }
    } catch (err) {
      errorMessages.add(err instanceof Error ? err.message : "Failed to fetch Expo push receipts");
    }
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
    receiptErrorCount,
    errorMessages: Array.from(errorMessages).slice(0, 5),
  };
}
