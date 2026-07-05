// Shared notification delivery used by automated gamification messages (and, later,
// reused by manual broadcasts) so every send is anchored to a `notification_campaigns`
// row — that anchor is what powers the admin delivery report (who received what /
// when / who opened it). A per-user `notifications` row is created (idempotent on the
// user+dedupeKey unique index) and a push is attempted; the campaign's recipient and
// push counts are kept in sync.

import { db, notificationsTable, notificationCampaignsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendPushNotificationToUser } from "./push-notifications";

/**
 * Find-or-create the single campaign for an automated message on a given day. Keyed by
 * `sourceKey` (e.g. "goal_congrats:2026-06-30") which has a unique index, so concurrent
 * callers converge on one row.
 */
export async function getOrCreateDailyCampaign(opts: {
  sourceKey: string;
  title: string;
  body: string;
  audienceSummary?: string;
}): Promise<number> {
  await db
    .insert(notificationCampaignsTable)
    .values({
      kind: "automated",
      sourceKey: opts.sourceKey,
      title: opts.title,
      body: opts.body,
      audienceSummary: opts.audienceSummary ?? null,
    })
    .onConflictDoNothing({ target: notificationCampaignsTable.sourceKey });

  const [row] = await db
    .select({ id: notificationCampaignsTable.id })
    .from(notificationCampaignsTable)
    .where(eq(notificationCampaignsTable.sourceKey, opts.sourceKey))
    .limit(1);
  return row!.id;
}

/** Create a fresh campaign row for a manual one-off send (no sourceKey). */
export async function createCampaign(opts: {
  kind: string;
  title: string;
  body: string;
  audienceSummary?: string;
  sentByUserId?: number | null;
}): Promise<number> {
  const [row] = await db
    .insert(notificationCampaignsTable)
    .values({
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      audienceSummary: opts.audienceSummary ?? null,
      sentByUserId: opts.sentByUserId ?? null,
    })
    .returning({ id: notificationCampaignsTable.id });
  return row!.id;
}

/**
 * Deliver one campaign notification to one user: write the in-app row (idempotent on
 * user+dedupeKey) and attempt a push. On a fresh insert, bump the campaign's recipient
 * (and push-sent) counters. Returns whether a new row was created and a push landed.
 */
export async function deliverToUser(opts: {
  campaignId: number;
  userId: number;
  type: string;
  title: string;
  body: string;
  tone?: string;
  actionUrl?: string | null;
  data?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<{ inserted: boolean; pushSent: boolean }> {
  const inserted = await db
    .insert(notificationsTable)
    .values({
      userId: opts.userId,
      campaignId: opts.campaignId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      tone: opts.tone ?? "primary",
      actionUrl: opts.actionUrl ?? null,
      data: { ...(opts.data ?? {}), campaignId: opts.campaignId },
      dedupeKey: opts.dedupeKey,
    })
    .onConflictDoNothing({ target: [notificationsTable.userId, notificationsTable.dedupeKey] })
    .returning({ id: notificationsTable.id });

  if (inserted.length === 0) return { inserted: false, pushSent: false };

  await db
    .update(notificationCampaignsTable)
    .set({ totalRecipients: sql`${notificationCampaignsTable.totalRecipients} + 1` })
    .where(eq(notificationCampaignsTable.id, opts.campaignId));

  let pushSent = false;
  try {
    const result = await sendPushNotificationToUser({
      userId: opts.userId,
      title: opts.title,
      body: opts.body,
      data: { ...(opts.data ?? {}), campaignId: opts.campaignId },
    });
    if (result.sentCount > 0) {
      pushSent = true;
      await db
        .update(notificationCampaignsTable)
        .set({ pushSentCount: sql`${notificationCampaignsTable.pushSentCount} + 1` })
        .where(eq(notificationCampaignsTable.id, opts.campaignId));
    }
  } catch {
    // Push failure must not undo the in-app delivery; the row still stands.
  }

  return { inserted: true, pushSent };
}

/** Mark a campaign's stored recipient/push counts (used after a bulk manual send). */
export async function setCampaignCounts(campaignId: number, totalRecipients: number, pushSentCount: number): Promise<void> {
  await db
    .update(notificationCampaignsTable)
    .set({ totalRecipients, pushSentCount })
    .where(eq(notificationCampaignsTable.id, campaignId));
}
