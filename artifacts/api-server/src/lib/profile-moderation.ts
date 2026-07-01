// Moral review (v2). Public-identity fields (name, avatar) that a user sets/changes
// apply to their own row immediately but stay hidden from OTHER users until an admin
// approves them. Each changed field becomes one pending request (a "message"). Admins
// approve (→ becomes public), reject (→ stays hidden), or report (5 → auto-suspend).

import { db, usersTable, profileModerationRequestsTable, userReportsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { invalidateUserAuth } from "./user-cache";

export const MODERATED_FIELDS = ["name", "avatar"] as const;
export type ModeratedField = (typeof MODERATED_FIELDS)[number];
export const AUTO_SUSPEND_AT = 5;

/**
 * Queue a public-identity change for review. Supersedes any earlier pending request
 * for the same field (only the latest pending one matters), then inserts a fresh
 * pending request. No-op when the new value already equals the approved public value
 * (e.g. the user reverted to what's already shown publicly).
 */
export async function submitProfileChange(opts: {
  userId: number;
  field: ModeratedField;
  newValue: string | null;
  currentPublicValue: string | null;
}): Promise<void> {
  const { userId, field, newValue, currentPublicValue } = opts;
  if ((newValue ?? null) === (currentPublicValue ?? null)) return;

  await db
    .update(profileModerationRequestsTable)
    .set({ status: "superseded" })
    .where(
      and(
        eq(profileModerationRequestsTable.userId, userId),
        eq(profileModerationRequestsTable.field, field),
        eq(profileModerationRequestsTable.status, "pending"),
      ),
    );

  await db.insert(profileModerationRequestsTable).values({
    userId,
    field,
    proposedValue: newValue ?? null,
    previousValue: currentPublicValue ?? null,
    status: "pending",
  });
}

/** Approve a pending request → its proposed value becomes the public one. */
export async function approveModerationRequest(requestId: number, adminId: number): Promise<boolean> {
  const [reqRow] = await db
    .select()
    .from(profileModerationRequestsTable)
    .where(eq(profileModerationRequestsTable.id, requestId))
    .limit(1);
  if (!reqRow || reqRow.status !== "pending") return false;

  const patch = reqRow.field === "avatar" ? { publicAvatarUrl: reqRow.proposedValue } : { publicName: reqRow.proposedValue };
  await db.update(usersTable).set(patch).where(eq(usersTable.id, reqRow.userId));
  await db
    .update(profileModerationRequestsTable)
    .set({ status: "approved", reviewedAt: new Date(), reviewedBy: adminId })
    .where(eq(profileModerationRequestsTable.id, requestId));
  return true;
}

/** Reject a pending request → the public value is left unchanged (others keep old). */
export async function rejectModerationRequest(requestId: number, adminId: number): Promise<boolean> {
  const res = await db
    .update(profileModerationRequestsTable)
    .set({ status: "rejected", reviewedAt: new Date(), reviewedBy: adminId })
    .where(and(eq(profileModerationRequestsTable.id, requestId), eq(profileModerationRequestsTable.status, "pending")))
    .returning({ id: profileModerationRequestsTable.id });
  return res.length > 0;
}

/** Record an admin report against a user; auto-suspend (block login) at the threshold. */
export async function reportUser(opts: { userId: number; reportedBy: number; requestId?: number }): Promise<{ reportCount: number; suspended: boolean }> {
  const { userId, reportedBy, requestId } = opts;
  await db.insert(userReportsTable).values({ userId, reportedBy, requestId: requestId ?? null });
  const [updated] = await db
    .update(usersTable)
    .set({ reportCount: sql`${usersTable.reportCount} + 1` })
    .where(eq(usersTable.id, userId))
    .returning({ reportCount: usersTable.reportCount, status: usersTable.status });

  const reportCount = updated?.reportCount ?? 0;
  let suspended = updated?.status === "suspended";
  if (reportCount >= AUTO_SUSPEND_AT && !suspended) {
    await db
      .update(usersTable)
      .set({ status: "suspended", tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, userId));
    invalidateUserAuth(userId); // drop cached auth + the version bump revokes live sessions
    suspended = true;
    logger.warn({ userId, reportCount }, "User auto-suspended after reaching the report threshold");
  }
  return { reportCount, suspended };
}

/** Admin list: pending (default) or all moderation requests, newest first, with user context. */
export async function listModerationRequests(status: "pending" | "all" = "pending") {
  const cond = status === "all" ? sql`true` : eq(profileModerationRequestsTable.status, "pending");
  return db
    .select({
      id: profileModerationRequestsTable.id,
      userId: profileModerationRequestsTable.userId,
      field: profileModerationRequestsTable.field,
      proposedValue: profileModerationRequestsTable.proposedValue,
      previousValue: profileModerationRequestsTable.previousValue,
      status: profileModerationRequestsTable.status,
      createdAt: profileModerationRequestsTable.createdAt,
      reviewedAt: profileModerationRequestsTable.reviewedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userStatus: usersTable.status,
      reportCount: usersTable.reportCount,
    })
    .from(profileModerationRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, profileModerationRequestsTable.userId))
    .where(cond)
    .orderBy(desc(profileModerationRequestsTable.createdAt))
    .limit(500);
}
