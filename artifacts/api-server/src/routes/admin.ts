import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getSessionUserId } from "../lib/auth";
import {
  db,
  booksTable,
  videosTable,
  videoSegmentsTable,
  lessonsTable,
  postsTable,
  gamesTable,
  rewardsTable,
  usersTable,
  bannersTable,
  reportsTable,
  redemptionsTable,
  bookPurchasesTable,
  bookReservationsTable,
  bookVouchersTable,
  pointsAccountTable,
  pointsTransactionsTable,
  materialsTable,
  academicYearsTable,
  subjectsTable,
  unitsTable,
  subjectSubscriptionsTable,
  subjectSubscriptionRequestsTable,
  lessonWatchProgressTable,
  notificationsTable,
  pushNotificationTokensTable,
  supportConversationsTable,
  supportMessagesTable,
  studentOnboardingResponsesTable,
  adminAuditLogTable,
} from "@workspace/db";
import { eq, ne, and, count, sql, desc, asc, or, gte, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const bookCoversUploadDir = path.resolve(process.cwd(), "uploads/book-covers");
fs.mkdirSync(bookCoversUploadDir, { recursive: true });

const bookCoverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, bookCoversUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const uploadBookCoverFile = multer({
  storage: bookCoverStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router: IRouter = Router();
const DEFAULT_MATERIALS = [
  { name: "علوم عامة", classification: "علوم" },
  { name: "رياضيات عامة", classification: "رياضيات" },
  { name: "اللغة العربية", classification: "لغة عربية" },
  { name: "اللغة الإنجليزية", classification: "لغة إنجليزية" },
  { name: "تاريخ", classification: "تاريخ" },
  { name: "برمجة", classification: "برمجة" },
];

async function ensureDefaultMaterials() {
  const current = await db.select().from(materialsTable).orderBy(asc(materialsTable.id));
  if (current.length > 0) {
    const hasMissingSortOrder = current.some((material) => !material.sortOrder || material.sortOrder <= 0);
    const hasMissingClassification = current.some((material) => !String(material.classification ?? "").trim());
    if (hasMissingSortOrder || hasMissingClassification) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < current.length; i += 1) {
          const fallbackClassification = String(current[i].classification ?? "").trim() || current[i].name;
          await tx
            .update(materialsTable)
            .set({
              sortOrder: current[i].sortOrder && current[i].sortOrder > 0 ? current[i].sortOrder : i + 1,
              classification: fallbackClassification,
            })
            .where(eq(materialsTable.id, current[i].id));
        }
      });
    }
    return db.select().from(materialsTable).orderBy(asc(materialsTable.sortOrder), asc(materialsTable.name));
  }

  for (let i = 0; i < DEFAULT_MATERIALS.length; i += 1) {
    const item = DEFAULT_MATERIALS[i];
    try {
      await db.insert(materialsTable).values({
        name: item.name,
        classification: item.classification,
        sortOrder: i + 1,
      });
    } catch {
      // ignore duplicate race condition
    }
  }
  return db.select().from(materialsTable).orderBy(asc(materialsTable.sortOrder), asc(materialsTable.name));
}

// ── Admin/owner gate for ALL legacy /admin routes ─────────────────────────────
// These CRUD routes predate auth. A single router-level guard now requires an
// authenticated, active admin or owner on every /admin endpoint in this router.
// Safe for the admin web: it already sends a valid admin token (the academic
// routes sharing the same token already enforce requireAdmin successfully).
function adminActorIdFromReq(req: any): number | null {
  return getSessionUserId(req);
}

async function requireAdminGate(req: any, res: any, next: any) {
  try {
    const actorId = adminActorIdFromReq(req);
    if (!actorId) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
      return;
    }
    const [actor] = await db
      .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, actorId))
      .limit(1);
    if (!actor || actor.status !== "active") {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    if (actor.role !== "admin" && actor.role !== "owner") {
      res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
      return;
    }
    (req as any).adminActor = actor;
    next();
  } catch (err) {
    req.log?.error?.({ err }, "Admin gate error");
    res.status(500).json({ error: "Internal server error" });
  }
}

// Scope the gate to /admin paths ONLY. A bare router.use(gate) would also block
// every other router mounted after this one (academic/student/etc.), breaking
// the public mobile endpoints.
router.use("/admin", requireAdminGate);

// ── Audit logging ─────────────────────────────────────────────────────────────
// Fire-and-forget, append-only. NEVER throws into the request flow: a failed
// audit write must not break the underlying admin action. Captures the actor
// snapshot (name/email/role at action time) so reports stay accurate even if the
// user is later renamed or deleted.
type AuditInput = {
  actionType: string;
  actionLabel?: string;
  entityType?: string;
  entityId?: string | number | null;
  entityLabel?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  status?: "success" | "failed";
  metadata?: Record<string, unknown> | null;
};
async function logAudit(req: any, input: AuditInput): Promise<void> {
  try {
    const actor = (req as any).adminActor;
    const actorId = actor?.id ?? adminActorIdFromReq(req);
    let actorName: string | null = actor?.name ?? null;
    let actorEmail: string | null = actor?.email ?? null;
    let actorRole: string | null = actor?.role ?? null;
    // The gate only selects id/role/status — fetch the name/email snapshot once.
    if (actorId && (!actorName || !actorEmail)) {
      const [u] = await db
        .select({ name: usersTable.name, email: usersTable.email, role: usersTable.role })
        .from(usersTable).where(eq(usersTable.id, actorId)).limit(1);
      if (u) { actorName = u.name; actorEmail = u.email; actorRole = actorRole || u.role; }
    }
    const ipRaw = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "";
    const ip = String(ipRaw).split(",")[0].trim().slice(0, 64) || null;
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 256) || null;
    await db.insert(adminAuditLogTable).values({
      actorUserId: actorId ?? null,
      actorName, actorEmail, actorRole,
      actionType: input.actionType,
      actionLabel: input.actionLabel ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId != null ? String(input.entityId) : null,
      entityLabel: input.entityLabel ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      status: input.status ?? "success",
      metadata: (input.metadata ?? null) as any,
      ip, userAgent,
    });
  } catch (err) {
    req.log?.warn?.({ err }, "Audit log write failed (non-fatal)");
  }
}

// Stats
router.get("/admin/stats", async (req, res) => {
  try {
    const [usersCount] = await db.select({ count: count() }).from(usersTable);
    const [booksCount] = await db.select({ count: count() }).from(booksTable);
    const [videosCount] = await db.select({ count: count() }).from(videosTable);
    const [postsCount] = await db.select({ count: count() }).from(postsTable);
    const [gamesCount] = await db.select({ count: count() }).from(gamesTable);
    const [rewardsCount] = await db.select({ count: count() }).from(rewardsTable);
    const [purchasesCount] = await db.select({ count: count() }).from(bookPurchasesTable);
    const [redemptionsCount] = await db.select({ count: count() }).from(redemptionsTable);
    const [pendingReportsCount] = await db.select({ count: count() }).from(reportsTable).where(eq(reportsTable.status, "pending"));
    const account = await db.select().from(pointsAccountTable).limit(1);
    const circulating = account[0]?.totalEarned ?? 0;

    res.json({
      totalUsers: Number(usersCount.count),
      totalBooks: Number(booksCount.count),
      totalVideos: Number(videosCount.count),
      totalPosts: Number(postsCount.count),
      totalGames: Number(gamesCount.count),
      totalRewards: Number(rewardsCount.count),
      totalPurchases: Number(purchasesCount.count),
      totalRedemptions: Number(redemptionsCount.count),
      totalPointsCirculating: circulating,
      pendingReports: Number(pendingReportsCount.count),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/subject-insights", async (req, res) => {
  try {
    const subjects = await db
      .select({
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        subjectIcon: subjectsTable.icon,
        yearName: academicYearsTable.name,
        orderIndex: subjectsTable.orderIndex,
      })
      .from(subjectsTable)
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .orderBy(asc(academicYearsTable.orderIndex), asc(subjectsTable.orderIndex), asc(subjectsTable.name));

    const subscriptionCounts = await db
      .select({
        subjectId: subjectSubscriptionsTable.subjectId,
        subscribersCount: sql<number>`count(distinct ${subjectSubscriptionsTable.studentId})`,
      })
      .from(subjectSubscriptionsTable)
      .where(eq(subjectSubscriptionsTable.status, "active"))
      .groupBy(subjectSubscriptionsTable.subjectId);

    const watchTotals = await db
      .select({
        subjectId: unitsTable.subjectId,
        watchedSeconds: sql<number>`
          coalesce(sum(
            case
              when ${lessonWatchProgressTable.durationSeconds} > 0
                then least(${lessonWatchProgressTable.currentSeconds}, ${lessonWatchProgressTable.durationSeconds})
              else ${lessonWatchProgressTable.currentSeconds}
            end
          ), 0)
        `,
      })
      .from(lessonWatchProgressTable)
      .innerJoin(lessonsTable, eq(lessonWatchProgressTable.lessonId, lessonsTable.id))
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .groupBy(unitsTable.subjectId);

    const subscriptionsBySubject = new Map(subscriptionCounts.map((item) => [item.subjectId, Number(item.subscribersCount) || 0]));
    const watchSecondsBySubject = new Map(watchTotals.map((item) => [item.subjectId, Number(item.watchedSeconds) || 0]));

    res.json(
      subjects.map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectIcon: subject.subjectIcon,
        yearName: subject.yearName,
        subscribersCount: subscriptionsBySubject.get(subject.subjectId) ?? 0,
        watchedSeconds: watchSecondsBySubject.get(subject.subjectId) ?? 0,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Admin subject insights error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Owner dashboard summary — 100% real data, owner/admin only ─────────────────
router.get("/admin/owner-dashboard/summary", async (req, res) => {
  try {
    const num = (value: unknown) => Number(value ?? 0) || 0;

    const [
      roleCounts,
      studentStatusCounts,
      requestStatusCounts,
      activeSubsRow,
      yearsRow,
      subjectsRow,
      unitsRow,
      lessonsRow,
      videosRow,
      segmentsRow,
      unreadSupportRow,
      openConversationsRow,
      pushTokenRows,
      lastActiveRow,
    ] = await Promise.all([
      db.select({ role: usersTable.role, total: count() }).from(usersTable).groupBy(usersTable.role),
      db.select({ status: usersTable.status, total: count() }).from(usersTable).where(eq(usersTable.role, "student")).groupBy(usersTable.status),
      db.select({ status: subjectSubscriptionRequestsTable.status, total: count() }).from(subjectSubscriptionRequestsTable).groupBy(subjectSubscriptionRequestsTable.status),
      db.select({ total: count() }).from(subjectSubscriptionsTable).where(eq(subjectSubscriptionsTable.status, "active")),
      db.select({ total: count() }).from(academicYearsTable),
      db.select({ total: count() }).from(subjectsTable),
      db.select({ total: count() }).from(unitsTable),
      db.select({ total: count() }).from(lessonsTable),
      db.select({ total: count() }).from(videosTable),
      db.select({ total: count() }).from(videoSegmentsTable),
      db.select({ total: count() }).from(supportMessagesTable).where(and(eq(supportMessagesTable.senderRole, "student"), sql`${supportMessagesTable.readAt} is null`)),
      db.select({ total: count() }).from(supportConversationsTable).where(eq(supportConversationsTable.status, "open")),
      db.select({ platform: pushNotificationTokensTable.platform, total: count() }).from(pushNotificationTokensTable).where(sql`${pushNotificationTokensTable.disabledAt} is null`).groupBy(pushNotificationTokensTable.platform),
      db.select({ ts: sql<string | null>`max(${usersTable.lastActiveAt})` }).from(usersTable),
    ]);

    const roleMap = new Map(roleCounts.map((r) => [r.role, num(r.total)]));
    const studentStatusMap = new Map(studentStatusCounts.map((r) => [r.status, num(r.total)]));
    const requestMap = new Map(requestStatusCounts.map((r) => [r.status, num(r.total)]));
    const pushMap = new Map(pushTokenRows.map((r) => [r.platform, num(r.total)]));

    const totalStudents = roleMap.get("student") ?? 0;
    const activeStudents = studentStatusMap.get("active") ?? 0;

    const kpis = {
      totalUsers: roleCounts.reduce((sum, r) => sum + num(r.total), 0),
      totalStudents,
      totalTeachers: roleMap.get("teacher") ?? 0,
      totalAdmins: (roleMap.get("admin") ?? 0) + (roleMap.get("owner") ?? 0),
      totalModerators: roleMap.get("moderator") ?? 0,
      totalParents: roleMap.get("parent") ?? 0,
      activeStudents,
      suspendedStudents: Math.max(0, totalStudents - activeStudents),
      activeSubscriptions: num(activeSubsRow[0]?.total),
      pendingSubscriptions: requestMap.get("pending") ?? 0,
      approvedSubscriptions: requestMap.get("approved") ?? 0,
      rejectedSubscriptions: requestMap.get("rejected") ?? 0,
      totalYears: num(yearsRow[0]?.total),
      totalSubjects: num(subjectsRow[0]?.total),
      totalUnits: num(unitsRow[0]?.total),
      totalLessons: num(lessonsRow[0]?.total),
      totalVideos: num(videosRow[0]?.total),
      totalSegments: num(segmentsRow[0]?.total),
      unreadSupport: num(unreadSupportRow[0]?.total),
      openConversations: num(openConversationsRow[0]?.total),
      pushTokensAndroid: pushMap.get("android") ?? 0,
      pushTokensIos: pushMap.get("ios") ?? 0,
      pushTokensTotal: pushTokenRows.reduce((sum, r) => sum + num(r.total), 0),
      lastActivityAt: lastActiveRow[0]?.ts ?? null,
    };

    // ── Content-gap alerts (real existence checks) ──
    const [
      subjectsWithoutUnitsRow,
      unitsWithoutLessonsRow,
      lessonsWithoutVideosRow,
      videosWithoutSegmentsRow,
    ] = await Promise.all([
      db.select({ total: count() }).from(subjectsTable).where(sql`not exists (select 1 from units u where u.subject_id = ${subjectsTable.id})`),
      db.select({ total: count() }).from(unitsTable).where(sql`not exists (select 1 from lessons l where l.unit_id = ${unitsTable.id})`),
      db.select({ total: count() }).from(lessonsTable).where(sql`${lessonsTable.videoId} is null`),
      db.select({ total: count() }).from(videosTable).where(sql`not exists (select 1 from video_segments s where s.video_id = ${videosTable.id})`),
    ]);

    const alerts = {
      pendingSubscriptions: kpis.pendingSubscriptions,
      unreadSupport: kpis.unreadSupport,
      subjectsWithoutUnits: num(subjectsWithoutUnitsRow[0]?.total),
      unitsWithoutLessons: num(unitsWithoutLessonsRow[0]?.total),
      lessonsWithoutVideos: num(lessonsWithoutVideosRow[0]?.total),
      videosWithoutSegments: num(videosWithoutSegmentsRow[0]?.total),
    };

    // ── Charts ──
    const [growthRows, topSubjectRows, watchByDay, requestsByDay, messagesByDay] = await Promise.all([
      db
        .select({
          month: sql<string>`to_char(date_trunc('month', ${usersTable.joinedAt}), 'YYYY-MM')`,
          role: usersTable.role,
          total: count(),
        })
        .from(usersTable)
        .where(sql`${usersTable.joinedAt} >= (now() - interval '6 months')`)
        .groupBy(sql`to_char(date_trunc('month', ${usersTable.joinedAt}), 'YYYY-MM')`, usersTable.role),
      db
        .select({ name: subjectsTable.name, value: sql<number>`count(distinct ${subjectSubscriptionsTable.studentId})` })
        .from(subjectSubscriptionsTable)
        .innerJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
        .where(eq(subjectSubscriptionsTable.status, "active"))
        .groupBy(subjectsTable.id, subjectsTable.name)
        .orderBy(desc(sql`count(distinct ${subjectSubscriptionsTable.studentId})`))
        .limit(6),
      db.select({ day: sql<string>`to_char(${lessonWatchProgressTable.lastWatchedAt}, 'YYYY-MM-DD')`, total: sql<number>`count(distinct ${lessonWatchProgressTable.studentId})` }).from(lessonWatchProgressTable).where(sql`${lessonWatchProgressTable.lastWatchedAt} >= (now() - interval '7 days')`).groupBy(sql`to_char(${lessonWatchProgressTable.lastWatchedAt}, 'YYYY-MM-DD')`),
      db.select({ day: sql<string>`to_char(${subjectSubscriptionRequestsTable.submittedAt}, 'YYYY-MM-DD')`, total: count() }).from(subjectSubscriptionRequestsTable).where(sql`${subjectSubscriptionRequestsTable.submittedAt} >= (now() - interval '7 days')`).groupBy(sql`to_char(${subjectSubscriptionRequestsTable.submittedAt}, 'YYYY-MM-DD')`),
      db.select({ day: sql<string>`to_char(${supportMessagesTable.createdAt}, 'YYYY-MM-DD')`, total: count() }).from(supportMessagesTable).where(and(eq(supportMessagesTable.senderRole, "student"), sql`${supportMessagesTable.createdAt} >= (now() - interval '7 days')`)).groupBy(sql`to_char(${supportMessagesTable.createdAt}, 'YYYY-MM-DD')`),
    ]);

    // user growth: pivot months -> {month, students, teachers, others}
    const growthMonths = new Map<string, { month: string; students: number; teachers: number; others: number }>();
    for (const row of growthRows) {
      const entry = growthMonths.get(row.month) ?? { month: row.month, students: 0, teachers: 0, others: 0 };
      if (row.role === "student") entry.students += num(row.total);
      else if (row.role === "teacher") entry.teachers += num(row.total);
      else entry.others += num(row.total);
      growthMonths.set(row.month, entry);
    }
    const userGrowth = Array.from(growthMonths.values()).sort((a, b) => a.month.localeCompare(b.month));

    // last 7 days buckets (fill gaps with zero)
    const watchMap = new Map(watchByDay.map((r) => [r.day, num(r.total)]));
    const requestsDayMap = new Map(requestsByDay.map((r) => [r.day, num(r.total)]));
    const messagesDayMap = new Map(messagesByDay.map((r) => [r.day, num(r.total)]));
    const last7Days: { day: string; watch: number; requests: number; messages: number }[] = [];
    {
      const today = new Date();
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        last7Days.push({
          day: key,
          watch: watchMap.get(key) ?? 0,
          requests: requestsDayMap.get(key) ?? 0,
          messages: messagesDayMap.get(key) ?? 0,
        });
      }
    }

    const charts = {
      roleDistribution: roleCounts.map((r) => ({ role: r.role, value: num(r.total) })),
      subscriptionsByStatus: [
        { status: "pending", value: kpis.pendingSubscriptions },
        { status: "approved", value: kpis.approvedSubscriptions },
        { status: "rejected", value: kpis.rejectedSubscriptions },
        { status: "active", value: kpis.activeSubscriptions },
      ],
      academicContent: [
        { name: "subjects", value: kpis.totalSubjects },
        { name: "units", value: kpis.totalUnits },
        { name: "lessons", value: kpis.totalLessons },
        { name: "videos", value: kpis.totalVideos },
        { name: "segments", value: kpis.totalSegments },
      ],
      topSubjects: topSubjectRows.map((r) => ({ name: r.name, value: num(r.value) })),
      userGrowth,
      last7Days,
    };

    // ── Recent insights ──
    const [recentStudents, recentRequests, recentSupport] = await Promise.all([
      db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, status: usersTable.status, joinedAt: usersTable.joinedAt })
        .from(usersTable)
        .where(eq(usersTable.role, "student"))
        .orderBy(desc(usersTable.joinedAt))
        .limit(6),
      db
        .select({
          id: subjectSubscriptionRequestsTable.id,
          studentName: usersTable.name,
          subjectName: subjectsTable.name,
          status: subjectSubscriptionRequestsTable.status,
          submittedAt: subjectSubscriptionRequestsTable.submittedAt,
        })
        .from(subjectSubscriptionRequestsTable)
        .leftJoin(usersTable, eq(subjectSubscriptionRequestsTable.studentId, usersTable.id))
        .leftJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
        .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt))
        .limit(6),
      db
        .select({
          conversationId: supportConversationsTable.id,
          userName: usersTable.name,
          status: supportConversationsTable.status,
          lastMessageAt: supportConversationsTable.lastMessageAt,
        })
        .from(supportConversationsTable)
        .leftJoin(usersTable, eq(supportConversationsTable.userId, usersTable.id))
        .orderBy(desc(supportConversationsTable.lastMessageAt))
        .limit(6),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      kpis,
      alerts,
      charts,
      recent: {
        students: recentStudents,
        subscriptionRequests: recentRequests,
        support: recentSupport,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Owner dashboard summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Per-user activity log (owner only) — real timeline from attributed data ────
router.get("/admin/owner-dashboard/admin-activity/:userId", async (req, res) => {
  try {
    const actor = (req as any).adminActor;
    if (!actor || actor.role !== "owner") {
      res.status(403).json({ error: "هذه البيانات متاحة للمالك فقط" });
      return;
    }
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: "معرّف المستخدم غير صالح" });
      return;
    }
    const [profile] = await db
      .select({
        id: usersTable.id, name: usersTable.name, email: usersTable.email,
        role: usersTable.role, status: usersTable.status, phone: usersTable.phone,
        governorate: usersTable.governorate, joinedAt: usersTable.joinedAt, lastActiveAt: usersTable.lastActiveAt,
        expectationStars: usersTable.expectationStars, scoringFrozen: usersTable.scoringFrozen,
      })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!profile) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    const target = alias(usersTable, "target_user");

    const [supportReplies, subReviews, subGrants, requestsMade, messagesSent, lessonsWatched, videosAdded] = await Promise.all([
      db.select({ at: supportMessagesTable.createdAt, body: supportMessagesTable.body, who: target.name })
        .from(supportMessagesTable)
        .innerJoin(supportConversationsTable, eq(supportMessagesTable.conversationId, supportConversationsTable.id))
        .leftJoin(target, eq(supportConversationsTable.userId, target.id))
        .where(and(eq(supportMessagesTable.senderId, userId), ne(supportMessagesTable.senderRole, "student")))
        .orderBy(desc(supportMessagesTable.createdAt)).limit(50),
      db.select({ at: subjectSubscriptionRequestsTable.reviewedAt, status: subjectSubscriptionRequestsTable.status, who: target.name, subject: subjectsTable.name })
        .from(subjectSubscriptionRequestsTable)
        .leftJoin(target, eq(subjectSubscriptionRequestsTable.studentId, target.id))
        .leftJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
        .where(and(eq(subjectSubscriptionRequestsTable.reviewedBy, userId), sql`${subjectSubscriptionRequestsTable.reviewedAt} is not null`))
        .orderBy(desc(subjectSubscriptionRequestsTable.reviewedAt)).limit(50),
      db.select({ at: subjectSubscriptionsTable.createdAt, who: target.name, subject: subjectsTable.name })
        .from(subjectSubscriptionsTable)
        .leftJoin(target, eq(subjectSubscriptionsTable.studentId, target.id))
        .leftJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
        .where(eq(subjectSubscriptionsTable.grantedByUserId, userId))
        .orderBy(desc(subjectSubscriptionsTable.createdAt)).limit(50),
      db.select({ at: subjectSubscriptionRequestsTable.submittedAt, status: subjectSubscriptionRequestsTable.status, subject: subjectsTable.name })
        .from(subjectSubscriptionRequestsTable)
        .leftJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
        .where(eq(subjectSubscriptionRequestsTable.studentId, userId))
        .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt)).limit(50),
      db.select({ at: supportMessagesTable.createdAt, body: supportMessagesTable.body })
        .from(supportMessagesTable)
        .where(and(eq(supportMessagesTable.senderId, userId), eq(supportMessagesTable.senderRole, "student")))
        .orderBy(desc(supportMessagesTable.createdAt)).limit(50),
      db.select({ at: lessonWatchProgressTable.lastWatchedAt, lesson: lessonsTable.title, completed: lessonWatchProgressTable.completed })
        .from(lessonWatchProgressTable)
        .leftJoin(lessonsTable, eq(lessonWatchProgressTable.lessonId, lessonsTable.id))
        .where(eq(lessonWatchProgressTable.studentId, userId))
        .orderBy(desc(lessonWatchProgressTable.lastWatchedAt)).limit(40),
      // Educational videos this admin added — attributed via the audit log.
      db.select({ at: adminAuditLogTable.createdAt, label: adminAuditLogTable.entityLabel })
        .from(adminAuditLogTable)
        .where(and(eq(adminAuditLogTable.actorUserId, userId), eq(adminAuditLogTable.actionType, "content_create"), eq(adminAuditLogTable.entityType, "video")))
        .orderBy(desc(adminAuditLogTable.createdAt)).limit(50),
    ]);

    const trunc = (value: string | null | undefined, max = 160) => {
      const text = String(value ?? "").trim();
      return text.length > max ? `${text.slice(0, max)}…` : text;
    };
    const statusAr = (status: string) =>
      (({ approved: "بالموافقة", rejected: "بالرفض", pending: "قيد المراجعة", expired: "منتهٍ", active: "نشط", revoked: "ملغى" } as Record<string, string>)[status] || status);

    type Item = { type: string; at: string | null; title: string; detail: string };
    const timeline: Item[] = [];
    for (const r of supportReplies) timeline.push({ type: "support_reply", at: r.at as any, title: `ردّ على ${r.who || "مستخدم"} في الدعم`, detail: trunc(r.body) });
    for (const r of subReviews) timeline.push({ type: "subscription_review", at: r.at as any, title: `راجع طلب اشتراك ${r.who || "طالب"}${r.subject ? ` في ${r.subject}` : ""}`, detail: `القرار: ${statusAr(r.status)}` });
    for (const r of subGrants) timeline.push({ type: "subscription_grant", at: r.at as any, title: `منح اشتراك ${r.who || "طالب"}${r.subject ? ` في ${r.subject}` : ""}`, detail: "تفعيل اشتراك مباشر" });
    for (const r of requestsMade) timeline.push({ type: "request_submitted", at: r.at as any, title: `طلب اشتراك${r.subject ? ` في ${r.subject}` : ""}`, detail: `الحالة: ${statusAr(r.status)}` });
    for (const r of messagesSent) timeline.push({ type: "support_message", at: r.at as any, title: "أرسل رسالة دعم", detail: trunc(r.body) });
    for (const r of lessonsWatched) timeline.push({ type: "lesson_watch", at: r.at as any, title: `شاهد درس ${r.lesson || ""}`.trim(), detail: r.completed ? "اكتمل" : "قيد المشاهدة" });
    for (const r of videosAdded) timeline.push({ type: "content_create", at: r.at as any, title: `أضاف فيديو تعليمي${r.label ? `: ${r.label}` : ""}`, detail: "محتوى أكاديمي" });

    timeline.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

    res.json({
      user: profile,
      stats: {
        supportReplies: supportReplies.length,
        subscriptionsReviewed: subReviews.length,
        subscriptionsGranted: subGrants.length,
        requestsSubmitted: requestsMade.length,
        lessonsWatched: lessonsWatched.length,
        videosAdded: videosAdded.length,
      },
      timeline: timeline.slice(0, 150),
    });
  } catch (err) {
    req.log.error({ err }, "Admin activity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Owner sets an admin's performance expectation (stars) / freeze (owner only) ──
router.patch("/admin/owner-dashboard/admin-scoring/:userId", async (req, res) => {
  try {
    const actor = (req as any).adminActor;
    if (!actor || actor.role !== "owner") {
      res.status(403).json({ error: "هذا الإجراء متاح للمالك فقط" });
      return;
    }
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: "معرّف المستخدم غير صالح" });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (req.body.expectationStars !== undefined) {
      const s = Number(req.body.expectationStars);
      if (!Number.isInteger(s) || s < 1 || s > 5) {
        res.status(400).json({ error: "عدد النجوم يجب أن يكون بين 1 و 5" });
        return;
      }
      patch.expectationStars = s;
    }
    if (req.body.scoringFrozen !== undefined) {
      patch.scoringFrozen = Boolean(req.body.scoringFrozen);
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "لا يوجد ما يتم تحديثه" });
      return;
    }
    const [updated] = await db.update(usersTable).set(patch).where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, name: usersTable.name, expectationStars: usersTable.expectationStars, scoringFrozen: usersTable.scoringFrozen });
    if (!updated) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    await logAudit(req, {
      actionType: "scoring_update", actionLabel: "حدّث إعدادات تقييم المشرف",
      entityType: "user", entityId: userId, entityLabel: updated.name,
      newValue: `${updated.expectationStars}★${updated.scoringFrozen ? " / مجمّد" : ""}`,
    });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Admin scoring update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Activity report (Excel/PDF data source) ──────────────────────────────────
// Aggregated, date-ranged activity for one user, combining the append-only audit
// log (richest, going forward) with derived historical activity (support replies,
// subscription reviews/grants) so reports have real data immediately. Owner can
// export any user; a non-owner admin can export ONLY their own report.
const ACTION_LABELS_AR: Record<string, string> = {
  support_reply: "ردّ على رسالة دعم",
  support_message: "أرسل رسالة دعم",
  subscription_review_approved: "وافق على طلب اشتراك",
  subscription_review_rejected: "رفض طلب اشتراك",
  subscription_review: "راجع طلب اشتراك",
  subscription_grant: "منح اشتراك مباشر",
  request_submitted: "قدّم طلب اشتراك",
  lesson_watch: "متابعة درس",
  notification_send: "أرسل إشعارًا",
  user_create: "أنشأ مستخدمًا",
  user_suspend: "أوقف مستخدمًا",
  user_activate: "أعاد تفعيل مستخدم",
  user_update: "حدّث بيانات مستخدم",
  content_create: "أضاف محتوى أكاديمي",
  content_update: "حدّث محتوى أكاديمي",
  content_delete: "حذف محتوى أكاديمي",
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
};
function categoryForAction(actionType: string, entityType?: string | null): string {
  if (actionType.startsWith("subscription") || actionType === "request_submitted") return "subscription";
  if (actionType.startsWith("support")) return "support";
  if (actionType.startsWith("content") || actionType === "lesson_watch" || entityType === "academic") return "academic";
  if (actionType.startsWith("user")) return "user";
  if (actionType.startsWith("notification")) return "notification";
  if (actionType === "login" || actionType === "logout") return "auth";
  return "other";
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

router.get("/admin/reports/activity", async (req, res) => {
  try {
    const actor = (req as any).adminActor;

    // ── Resolve target user (owner → anyone; admin → self only) ──
    let targetId = actor.id as number;
    const adminIdRaw = req.query.adminId;
    if (adminIdRaw != null && String(adminIdRaw).trim() !== "") {
      const parsed = Number.parseInt(String(adminIdRaw), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        res.status(400).json({ error: "معرّف المستخدم غير صالح" });
        return;
      }
      if (actor.role !== "owner" && parsed !== actor.id) {
        res.status(403).json({ error: "يمكنك تصدير تقريرك فقط" });
        return;
      }
      targetId = parsed;
    }

    // ── Parse + validate date range (server-side). Default = current month. ──
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const now = new Date();
    const fromStr = String(req.query.from ?? "").trim();
    const toStr = String(req.query.to ?? "").trim();
    let fromYmd: string;
    let toYmd: string;
    if (fromStr || toStr) {
      if (!dateRe.test(fromStr) || !dateRe.test(toStr)) {
        res.status(400).json({ error: "صيغة التاريخ غير صحيحة (YYYY-MM-DD)" });
        return;
      }
      fromYmd = fromStr;
      toYmd = toStr;
    } else {
      fromYmd = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      toYmd = ymd(now);
    }
    const fromDate = new Date(`${fromYmd}T00:00:00`);
    const toExclusive = new Date(`${toYmd}T00:00:00`);
    toExclusive.setDate(toExclusive.getDate() + 1); // make 'to' inclusive of its full day
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toExclusive.getTime())) {
      res.status(400).json({ error: "صيغة التاريخ غير صحيحة (YYYY-MM-DD)" });
      return;
    }
    if (fromDate.getTime() >= toExclusive.getTime()) {
      res.status(400).json({ error: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية" });
      return;
    }

    const [profile] = await db
      .select({
        id: usersTable.id, name: usersTable.name, email: usersTable.email,
        role: usersTable.role, status: usersTable.status, phone: usersTable.phone,
        governorate: usersTable.governorate, joinedAt: usersTable.joinedAt, lastActiveAt: usersTable.lastActiveAt,
        expectationStars: usersTable.expectationStars, scoringFrozen: usersTable.scoringFrozen,
      })
      .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (!profile) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    const [generatedByRow] = await db
      .select({ name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, actor.id)).limit(1);

    const target = alias(usersTable, "report_target_user");
    const inRange = (col: any) => and(gte(col, fromDate), lt(col, toExclusive));

    const [auditRows, supportReplies, subReviews, subGrants, requestsMade, messagesSent, lessonsWatched] = await Promise.all([
      db.select().from(adminAuditLogTable)
        .where(and(eq(adminAuditLogTable.actorUserId, targetId), inRange(adminAuditLogTable.createdAt)))
        .orderBy(desc(adminAuditLogTable.createdAt)).limit(5000),
      db.select({ at: supportMessagesTable.createdAt, body: supportMessagesTable.body, who: target.name })
        .from(supportMessagesTable)
        .innerJoin(supportConversationsTable, eq(supportMessagesTable.conversationId, supportConversationsTable.id))
        .leftJoin(target, eq(supportConversationsTable.userId, target.id))
        .where(and(eq(supportMessagesTable.senderId, targetId), ne(supportMessagesTable.senderRole, "student"), inRange(supportMessagesTable.createdAt)))
        .orderBy(desc(supportMessagesTable.createdAt)).limit(2000),
      db.select({ at: subjectSubscriptionRequestsTable.reviewedAt, status: subjectSubscriptionRequestsTable.status, who: target.name, subject: subjectsTable.name })
        .from(subjectSubscriptionRequestsTable)
        .leftJoin(target, eq(subjectSubscriptionRequestsTable.studentId, target.id))
        .leftJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
        .where(and(eq(subjectSubscriptionRequestsTable.reviewedBy, targetId), sql`${subjectSubscriptionRequestsTable.reviewedAt} is not null`, inRange(subjectSubscriptionRequestsTable.reviewedAt)))
        .orderBy(desc(subjectSubscriptionRequestsTable.reviewedAt)).limit(2000),
      db.select({ at: subjectSubscriptionsTable.createdAt, who: target.name, subject: subjectsTable.name })
        .from(subjectSubscriptionsTable)
        .leftJoin(target, eq(subjectSubscriptionsTable.studentId, target.id))
        .leftJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
        .where(and(eq(subjectSubscriptionsTable.grantedByUserId, targetId), inRange(subjectSubscriptionsTable.createdAt)))
        .orderBy(desc(subjectSubscriptionsTable.createdAt)).limit(2000),
      db.select({ at: subjectSubscriptionRequestsTable.submittedAt, status: subjectSubscriptionRequestsTable.status, subject: subjectsTable.name })
        .from(subjectSubscriptionRequestsTable)
        .leftJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
        .where(and(eq(subjectSubscriptionRequestsTable.studentId, targetId), inRange(subjectSubscriptionRequestsTable.submittedAt)))
        .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt)).limit(2000),
      db.select({ at: supportMessagesTable.createdAt, body: supportMessagesTable.body })
        .from(supportMessagesTable)
        .where(and(eq(supportMessagesTable.senderId, targetId), eq(supportMessagesTable.senderRole, "student"), inRange(supportMessagesTable.createdAt)))
        .orderBy(desc(supportMessagesTable.createdAt)).limit(2000),
      db.select({ at: lessonWatchProgressTable.lastWatchedAt, lesson: lessonsTable.title, completed: lessonWatchProgressTable.completed })
        .from(lessonWatchProgressTable)
        .leftJoin(lessonsTable, eq(lessonWatchProgressTable.lessonId, lessonsTable.id))
        .where(and(eq(lessonWatchProgressTable.studentId, targetId), inRange(lessonWatchProgressTable.lastWatchedAt)))
        .orderBy(desc(lessonWatchProgressTable.lastWatchedAt)).limit(2000),
    ]);

    const trunc = (value: string | null | undefined, max = 300) => {
      const text = String(value ?? "").trim();
      return text.length > max ? `${text.slice(0, max)}…` : text;
    };
    const statusAr = (status: string) =>
      (({ approved: "بالموافقة", rejected: "بالرفض", pending: "قيد المراجعة", expired: "منتهٍ", active: "نشط", revoked: "ملغى" } as Record<string, string>)[status] || status);

    type Row = {
      at: string | null; actionType: string; actionLabel: string; category: string;
      entityType: string; entityId: string; target: string; oldValue: string; newValue: string;
      status: string; detail: string; ip: string; userAgent: string;
    };
    const rows: Row[] = [];

    // 1) Audit log entries (richest)
    for (const a of auditRows) {
      rows.push({
        at: a.createdAt as any,
        actionType: a.actionType,
        actionLabel: a.actionLabel || ACTION_LABELS_AR[a.actionType] || a.actionType,
        category: categoryForAction(a.actionType, a.entityType),
        entityType: a.entityType || "",
        entityId: a.entityId || "",
        target: a.entityLabel || "",
        oldValue: a.oldValue || "",
        newValue: a.newValue || "",
        status: a.status === "failed" ? "فشل" : "نجاح",
        detail: a.metadata ? trunc(JSON.stringify(a.metadata)) : "",
        ip: a.ip || "",
        userAgent: a.userAgent || "",
      });
    }
    // 2) Derived historical activity
    for (const r of supportReplies) rows.push({ at: r.at as any, actionType: "support_reply", actionLabel: ACTION_LABELS_AR.support_reply, category: "support", entityType: "support_conversation", entityId: "", target: r.who || "", oldValue: "", newValue: "", status: "نجاح", detail: trunc(r.body), ip: "", userAgent: "" });
    for (const r of subReviews) {
      const at = r.status === "approved" ? "subscription_review_approved" : r.status === "rejected" ? "subscription_review_rejected" : "subscription_review";
      rows.push({ at: r.at as any, actionType: at, actionLabel: ACTION_LABELS_AR[at], category: "subscription", entityType: "subscription_request", entityId: "", target: `${r.who || "طالب"}${r.subject ? ` - ${r.subject}` : ""}`, oldValue: "pending", newValue: r.status, status: "نجاح", detail: `القرار: ${statusAr(r.status)}`, ip: "", userAgent: "" });
    }
    for (const r of subGrants) rows.push({ at: r.at as any, actionType: "subscription_grant", actionLabel: ACTION_LABELS_AR.subscription_grant, category: "subscription", entityType: "subscription", entityId: "", target: `${r.who || "طالب"}${r.subject ? ` - ${r.subject}` : ""}`, oldValue: "", newValue: "active", status: "نجاح", detail: "تفعيل اشتراك مباشر", ip: "", userAgent: "" });
    for (const r of requestsMade) rows.push({ at: r.at as any, actionType: "request_submitted", actionLabel: ACTION_LABELS_AR.request_submitted, category: "subscription", entityType: "subscription_request", entityId: "", target: r.subject || "", oldValue: "", newValue: r.status, status: "نجاح", detail: `الحالة: ${statusAr(r.status)}`, ip: "", userAgent: "" });
    for (const r of messagesSent) rows.push({ at: r.at as any, actionType: "support_message", actionLabel: ACTION_LABELS_AR.support_message, category: "support", entityType: "support_conversation", entityId: "", target: "", oldValue: "", newValue: "", status: "نجاح", detail: trunc(r.body), ip: "", userAgent: "" });
    for (const r of lessonsWatched) rows.push({ at: r.at as any, actionType: "lesson_watch", actionLabel: ACTION_LABELS_AR.lesson_watch, category: "academic", entityType: "lesson", entityId: "", target: r.lesson || "", oldValue: "", newValue: "", status: "نجاح", detail: r.completed ? "اكتمل" : "قيد المشاهدة", ip: "", userAgent: "" });

    rows.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

    // ── Aggregates ──
    const byActionType: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const activeDays = new Set<string>();
    for (const r of rows) {
      byActionType[r.actionType] = (byActionType[r.actionType] || 0) + 1;
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      if (r.at) {
        const day = ymd(new Date(r.at));
        byDay[day] = (byDay[day] || 0) + 1;
        activeDays.add(day);
      }
    }
    const subsApproved = subReviews.filter((r) => r.status === "approved").length;
    const subsRejected = subReviews.filter((r) => r.status === "rejected").length;
    const auditCount = (pred: (t: string) => boolean) => auditRows.filter((a) => pred(a.actionType)).length;
    const stats = {
      totalActions: rows.length,
      subscriptionsReviewed: subReviews.length,
      subscriptionsApproved: subsApproved,
      subscriptionsRejected: subsRejected,
      subscriptionsGranted: subGrants.length,
      supportReplies: supportReplies.length,
      supportResolved: auditCount((t) => t === "support_resolve"),
      notificationsSent: auditCount((t) => t.startsWith("notification")),
      contentActions: auditCount((t) => t.startsWith("content")),
      videosAdded: auditRows.filter((a) => a.actionType === "content_create" && a.entityType === "video").length,
      usersCreated: auditCount((t) => t === "user_create"),
      usersSuspended: auditCount((t) => t === "user_suspend"),
      usersDeleted: auditCount((t) => t === "user_delete"),
      requestsSubmitted: requestsMade.length,
      lessonsWatched: lessonsWatched.length,
      activeDays: activeDays.size,
    };

    const rangeDays = Math.max(1, Math.round((toExclusive.getTime() - fromDate.getTime()) / 86400000));

    // ── Fair workload distribution scoring ──
    // The month's total admin work is shared EQUALLY across all non-frozen admins.
    // Each admin has an owner-set star level → an expectation multiplier of the
    // equal share (1★=70% … 3★=100% … 5★=150%). A diligent admin can exceed 100%.
    const STAR_MULT: Record<number, number> = { 1: 0.7, 2: 0.9, 3: 1.0, 4: 1.1, 5: 1.5 };
    const isPoolAudit = (t: string) => t.startsWith("notification") || t.startsWith("content") || t === "user_create" || t === "user_suspend";

    const [adminsPool, repByUser, revByUser, grantByUser, auditByUser] = await Promise.all([
      db.select({ id: usersTable.id, stars: usersTable.expectationStars, frozen: usersTable.scoringFrozen })
        .from(usersTable).where(eq(usersTable.role, "admin")),
      db.select({ uid: supportMessagesTable.senderId, n: count() })
        .from(supportMessagesTable)
        .where(and(ne(supportMessagesTable.senderRole, "student"), inRange(supportMessagesTable.createdAt)))
        .groupBy(supportMessagesTable.senderId),
      db.select({ uid: subjectSubscriptionRequestsTable.reviewedBy, n: count() })
        .from(subjectSubscriptionRequestsTable)
        .where(and(sql`${subjectSubscriptionRequestsTable.reviewedBy} is not null`, sql`${subjectSubscriptionRequestsTable.reviewedAt} is not null`, inRange(subjectSubscriptionRequestsTable.reviewedAt)))
        .groupBy(subjectSubscriptionRequestsTable.reviewedBy),
      db.select({ uid: subjectSubscriptionsTable.grantedByUserId, n: count() })
        .from(subjectSubscriptionsTable)
        .where(and(sql`${subjectSubscriptionsTable.grantedByUserId} is not null`, inRange(subjectSubscriptionsTable.createdAt)))
        .groupBy(subjectSubscriptionsTable.grantedByUserId),
      db.select({ uid: adminAuditLogTable.actorUserId, type: adminAuditLogTable.actionType, n: count() })
        .from(adminAuditLogTable)
        .where(inRange(adminAuditLogTable.createdAt))
        .groupBy(adminAuditLogTable.actorUserId, adminAuditLogTable.actionType),
    ]);

    const actionByUser = new Map<number, number>();
    const addAU = (uid: number | null, n: any) => { if (uid != null) actionByUser.set(uid, (actionByUser.get(uid) || 0) + (Number(n) || 0)); };
    for (const r of repByUser) addAU(r.uid as any, r.n);
    for (const r of revByUser) addAU(r.uid as any, r.n);
    for (const r of grantByUser) addAU(r.uid as any, r.n);
    for (const r of auditByUser) if (r.type && isPoolAudit(r.type)) addAU(r.uid as any, r.n);

    const poolAdmins = adminsPool.filter((a) => !a.frozen);
    const poolCount = poolAdmins.length;
    const poolTotal = poolAdmins.reduce((s, a) => s + (actionByUser.get(a.id) || 0), 0);
    const equalShare = poolCount > 0 ? poolTotal / poolCount : 0;
    const targetStars = profile.expectationStars ?? 3;
    const targetActual = actionByUser.get(targetId) || 0;

    let score: any;
    if (profile.role === "owner") {
      score = { available: false, reason: "تقييم توزيع المهام يخص المشرفين فقط" };
    } else if (profile.role !== "admin") {
      score = { available: false, reason: "هذا المستخدم ليس مشرفًا — التقييم لا ينطبق عليه" };
    } else if (profile.scoringFrozen) {
      score = { available: false, frozen: true, reason: "الحساب مُجمّد — خارج توزيع المهام والتقييم" };
    } else if (poolCount === 0 || poolTotal < 3) {
      score = { available: false, reason: "لا توجد بيانات كافية لحساب تقييم عادل لهذا الشهر" };
    } else {
      const mult = STAR_MULT[targetStars] ?? 1;
      const expected = equalShare * mult;
      const pct = expected > 0 ? Math.round((targetActual / expected) * 100) : 0;
      const label = pct >= 110 ? "ممتاز" : pct >= 90 ? "جيد جدًا" : pct >= 70 ? "جيد" : "يحتاج متابعة";
      score = {
        available: true, value: pct, label, stars: targetStars,
        breakdown: {
          poolCount, poolTotal,
          equalShare: Math.round(equalShare * 10) / 10,
          multiplier: mult,
          expected: Math.round(expected * 10) / 10,
          actual: targetActual,
        },
      };
    }

    const topActionTypes = Object.entries(byActionType)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([type, n]) => ({ type, label: ACTION_LABELS_AR[type] || type, count: n }));
    const byDayArr = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([day, n]) => ({ day, count: n }));

    // Note: audit-backed actions (notifications/content/user-mgmt/auth) only exist
    // for actions performed AFTER audit logging was enabled. Older periods rely on
    // derived activity (support replies, subscription reviews/grants) only.
    const auditCoverageStart = auditRows.length > 0 ? (auditRows[auditRows.length - 1].createdAt as any) : null;

    res.json({
      range: { from: fromYmd, to: toYmd, days: rangeDays },
      generatedAt: new Date().toISOString(),
      generatedBy: generatedByRow ? { name: generatedByRow.name, email: generatedByRow.email, role: generatedByRow.role } : null,
      user: profile,
      stats,
      score,
      byActionType,
      byCategory,
      topActionTypes,
      byDay: byDayArr,
      activities: rows.slice(0, 5000),
      auditCoverage: { rows: auditRows.length, since: auditCoverageStart, note: "السجل المُدقّق يغطّي الإجراءات بعد تفعيل نظام التدقيق فقط؛ الفترات الأقدم تعتمد على النشاط المُستنتَج (الدعم/الاشتراكات)." },
    });
  } catch (err) {
    req.log.error({ err }, "Activity report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Geographic distribution (Egypt governorate heatmap) ───────────────────────
// Per-governorate aggregates for the dashboard map card: total users, students,
// active users, subscriptions (activity), and the most-subscribed subject.
router.get("/admin/owner-dashboard/geo", async (req, res) => {
  try {
    const [usersByGov, subsByGov, subjectRows] = await Promise.all([
      db.select({
        gov: usersTable.governorate,
        total: count(),
        students: sql<number>`count(*) filter (where ${usersTable.role} = 'student')`,
        active: sql<number>`count(*) filter (where ${usersTable.status} = 'active')`,
      }).from(usersTable).groupBy(usersTable.governorate),
      db.select({ gov: usersTable.governorate, subs: count() })
        .from(subjectSubscriptionsTable)
        .innerJoin(usersTable, eq(subjectSubscriptionsTable.studentId, usersTable.id))
        .groupBy(usersTable.governorate),
      db.select({ gov: usersTable.governorate, subject: subjectsTable.name, n: count() })
        .from(subjectSubscriptionsTable)
        .innerJoin(usersTable, eq(subjectSubscriptionsTable.studentId, usersTable.id))
        .innerJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
        .groupBy(usersTable.governorate, subjectsTable.name),
    ]);

    const subsMap = new Map<string, number>();
    for (const r of subsByGov) if (r.gov) subsMap.set(r.gov, Number(r.subs) || 0);
    const topSubject = new Map<string, { subject: string; n: number }>();
    for (const r of subjectRows) {
      if (!r.gov || !r.subject) continue;
      const cur = topSubject.get(r.gov);
      const n = Number(r.n) || 0;
      if (!cur || n > cur.n) topSubject.set(r.gov, { subject: r.subject, n });
    }

    let unknownUsers = 0;
    const governorates = [] as Array<{ name: string; users: number; students: number; activeUsers: number; subscriptions: number; topSubject: string | null; topSubjectCount: number }>;
    for (const r of usersByGov) {
      if (!r.gov) { unknownUsers += Number(r.total) || 0; continue; }
      const ts = topSubject.get(r.gov);
      governorates.push({
        name: r.gov,
        users: Number(r.total) || 0,
        students: Number(r.students) || 0,
        activeUsers: Number(r.active) || 0,
        subscriptions: subsMap.get(r.gov) || 0,
        topSubject: ts?.subject ?? null,
        topSubjectCount: ts?.n ?? 0,
      });
    }
    governorates.sort((a, b) => b.users - a.users);

    res.json({
      generatedAt: new Date().toISOString(),
      governorates,
      unknownUsers,
      totals: {
        coveredGovernorates: governorates.length,
        totalUsersWithGov: governorates.reduce((s, g) => s + g.users, 0),
        totalSubscriptions: governorates.reduce((s, g) => s + g.subscriptions, 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Geo distribution error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Users
router.get("/admin/users", async (req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        status: usersTable.status,
        avatarUrl: usersTable.avatarUrl,
        phone: usersTable.phone,
        governorate: usersTable.governorate,
        joinedAt: usersTable.joinedAt,
        lastActiveAt: usersTable.lastActiveAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.joinedAt));
    res.json(users);
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Admin auth helpers (the legacy CRUD routes above predate auth; the detail
//     endpoint below is admin/owner-only). Mirrors the pattern in notifications.ts. ---
async function requireAdminActor(req: any, res: any) {
  const actorId = getSessionUserId(req);
  if (!actorId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  const [actor] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);
  if (!actor || actor.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  if (actor.role !== "admin" && actor.role !== "owner") {
    res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    return null;
  }
  return actor;
}

function maskPushToken(token: string) {
  if (!token || token.length <= 16) return "•••";
  return `${token.slice(0, 18)}…`;
}

// Full structured details for a single user (admin/owner only). Student-focused,
// but returns safely-empty sections for any role. Never returns password or full tokens.
router.get("/admin/users/:userId/details", async (req, res) => {
  if (!(await requireAdminActor(req, res))) return;
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: "معرّف المستخدم غير صالح" });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        status: usersTable.status,
        avatarUrl: usersTable.avatarUrl,
        phone: usersTable.phone,
        parentPhone: usersTable.parentPhone,
        age: usersTable.age,
        address: usersTable.address,
        governorate: usersTable.governorate,
        specialty: usersTable.specialty,
        qualifications: usersTable.qualifications,
        howDidYouHear: usersTable.howDidYouHear,
        supportNeeded: usersTable.supportNeeded,
        bio: usersTable.bio,
        joinedAt: usersTable.joinedAt,
        lastActiveAt: usersTable.lastActiveAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    const [subscriptions, subscriptionRequests, progressRows, deviceRows, supportConvs, notifAgg] =
      await Promise.all([
        db
          .select({
            id: subjectSubscriptionsTable.id,
            status: subjectSubscriptionsTable.status,
            source: subjectSubscriptionsTable.source,
            createdAt: subjectSubscriptionsTable.createdAt,
            updatedAt: subjectSubscriptionsTable.updatedAt,
            subjectId: subjectsTable.id,
            subjectName: subjectsTable.name,
            subjectIcon: subjectsTable.icon,
            yearName: academicYearsTable.name,
          })
          .from(subjectSubscriptionsTable)
          .leftJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
          .leftJoin(academicYearsTable, eq(subjectSubscriptionsTable.yearId, academicYearsTable.id))
          .where(eq(subjectSubscriptionsTable.studentId, userId))
          .orderBy(desc(subjectSubscriptionsTable.createdAt)),
        db
          .select({
            id: subjectSubscriptionRequestsTable.id,
            status: subjectSubscriptionRequestsTable.status,
            reviewNotes: subjectSubscriptionRequestsTable.reviewNotes,
            codeImageUrl: subjectSubscriptionRequestsTable.codeImageUrl,
            submittedAt: subjectSubscriptionRequestsTable.submittedAt,
            reviewedAt: subjectSubscriptionRequestsTable.reviewedAt,
            subjectName: subjectsTable.name,
            yearName: academicYearsTable.name,
          })
          .from(subjectSubscriptionRequestsTable)
          .leftJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
          .leftJoin(academicYearsTable, eq(subjectSubscriptionRequestsTable.yearId, academicYearsTable.id))
          .where(eq(subjectSubscriptionRequestsTable.studentId, userId))
          .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt)),
        db
          .select({
            id: lessonWatchProgressTable.id,
            currentSeconds: lessonWatchProgressTable.currentSeconds,
            durationSeconds: lessonWatchProgressTable.durationSeconds,
            completed: lessonWatchProgressTable.completed,
            lastWatchedAt: lessonWatchProgressTable.lastWatchedAt,
            lessonTitle: lessonsTable.title,
            subjectName: subjectsTable.name,
          })
          .from(lessonWatchProgressTable)
          .leftJoin(lessonsTable, eq(lessonWatchProgressTable.lessonId, lessonsTable.id))
          .leftJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
          .leftJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
          .where(eq(lessonWatchProgressTable.studentId, userId))
          .orderBy(desc(lessonWatchProgressTable.lastWatchedAt)),
        db
          .select({
            id: pushNotificationTokensTable.id,
            token: pushNotificationTokensTable.token,
            platform: pushNotificationTokensTable.platform,
            deviceName: pushNotificationTokensTable.deviceName,
            disabledAt: pushNotificationTokensTable.disabledAt,
            lastRegisteredAt: pushNotificationTokensTable.lastRegisteredAt,
            lastSeenAt: pushNotificationTokensTable.lastSeenAt,
          })
          .from(pushNotificationTokensTable)
          .where(eq(pushNotificationTokensTable.userId, userId))
          .orderBy(desc(pushNotificationTokensTable.lastSeenAt)),
        db
          .select({
            id: supportConversationsTable.id,
            status: supportConversationsTable.status,
            lastMessageAt: supportConversationsTable.lastMessageAt,
          })
          .from(supportConversationsTable)
          .where(eq(supportConversationsTable.userId, userId))
          .limit(1),
        db
          .select({
            total: count(),
            unread: sql<number>`count(*) filter (where ${notificationsTable.readAt} is null)`,
          })
          .from(notificationsTable)
          .where(eq(notificationsTable.userId, userId)),
      ]);

    // Support message summary (only if a conversation exists)
    let support = {
      hasConversation: false,
      status: null as string | null,
      messagesCount: 0,
      unreadCount: 0,
      lastMessageAt: null as Date | null,
      lastMessagePreview: null as string | null,
    };
    if (supportConvs.length > 0) {
      const conv = supportConvs[0];
      const [[msgAgg], [lastMsg]] = await Promise.all([
        db
          .select({
            total: count(),
            unread: sql<number>`count(*) filter (where ${supportMessagesTable.readAt} is null and ${supportMessagesTable.senderRole} = 'user')`,
          })
          .from(supportMessagesTable)
          .where(eq(supportMessagesTable.conversationId, conv.id)),
        db
          .select({ body: supportMessagesTable.body, createdAt: supportMessagesTable.createdAt })
          .from(supportMessagesTable)
          .where(eq(supportMessagesTable.conversationId, conv.id))
          .orderBy(desc(supportMessagesTable.createdAt))
          .limit(1),
      ]);
      support = {
        hasConversation: true,
        status: conv.status,
        messagesCount: Number(msgAgg?.total ?? 0),
        unreadCount: Number(msgAgg?.unread ?? 0),
        lastMessageAt: conv.lastMessageAt ?? lastMsg?.createdAt ?? null,
        lastMessagePreview: lastMsg?.body ? lastMsg.body.slice(0, 160) : null,
      };
    }

    const completedLessonsCount = progressRows.filter((row) => row.completed).length;
    const activity = {
      watchedLessonsCount: progressRows.length,
      completedLessonsCount,
      lastWatchedAt: progressRows[0]?.lastWatchedAt ?? null,
      lastWatchedLessonTitle: progressRows[0]?.lessonTitle ?? null,
      recent: progressRows.slice(0, 8).map((row) => ({
        lessonTitle: row.lessonTitle,
        subjectName: row.subjectName,
        completed: row.completed,
        progressPercent:
          row.durationSeconds && row.durationSeconds > 0
            ? Math.min(100, Math.round((row.currentSeconds / row.durationSeconds) * 100))
            : null,
        lastWatchedAt: row.lastWatchedAt,
      })),
    };

    const devices = deviceRows.map((row) => ({
      id: row.id,
      platform: row.platform,
      deviceName: row.deviceName,
      tokenPreview: maskPushToken(row.token),
      enabled: row.disabledAt == null,
      lastRegisteredAt: row.lastRegisteredAt,
      lastSeenAt: row.lastSeenAt,
    }));

    // First-time onboarding/intro answers (stored as stable option keys).
    const [onboardingRow] = await db
      .select()
      .from(studentOnboardingResponsesTable)
      .where(eq(studentOnboardingResponsesTable.userId, userId))
      .limit(1);
    const onboarding = onboardingRow?.onboardingCompleted
      ? {
          completed: true,
          completedAt: onboardingRow.onboardingCompletedAt,
          heardAboutUs: onboardingRow.heardAboutUs,
          gradeLevel: onboardingRow.gradeLevel,
          interestedSubjects: Array.isArray(onboardingRow.interestedSubjects) ? onboardingRow.interestedSubjects : [],
          mainGoal: onboardingRow.mainGoal,
          currentLevel: onboardingRow.currentLevel,
          learningPreference: onboardingRow.learningPreference,
          preferredStudyTime: onboardingRow.preferredStudyTime,
        }
      : null;

    res.json({
      user,
      hasActiveAccess: subscriptions.some((s) => s.status === "active"),
      subscriptions,
      subscriptionRequests,
      activity,
      support,
      notifications: {
        total: Number(notifAgg[0]?.total ?? 0),
        unread: Number(notifAgg[0]?.unread ?? 0),
      },
      devices,
      onboarding,
    });
  } catch (err) {
    req.log.error({ err }, "User details error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users", async (req, res) => {
  try {
    const { name, email, role = "student", status = "active" } = req.body;
    const VALID_ROLES = new Set(["student", "teacher", "parent", "admin", "owner", "moderator"]);
    const PRIVILEGED_ROLES = new Set(["admin", "owner", "moderator"]);
    if (!VALID_ROLES.has(String(role))) {
      return res.status(400).json({ error: "دور غير صالح" });
    }
    if (PRIVILEGED_ROLES.has(String(role)) && (req as any).adminActor?.role !== "owner") {
      return res.status(403).json({ error: "إنشاء حسابات إدارية متاح للمالك فقط" });
    }
    const [user] = await db.insert(usersTable).values({ name, email, role, status }).returning();
    await logAudit(req, { actionType: "user_create", actionLabel: `أنشأ مستخدمًا (${role})`, entityType: "user", entityId: user.id, entityLabel: name || email, newValue: `${role}/${status}`, metadata: { email, role, status } });
    res.status(201).json(user);
  } catch (err) {
    req.log.error({ err }, "Create user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, role, status } = req.body;
    const [before] = await db.select({ name: usersTable.name, role: usersTable.role, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
    // Role changes: validate against an allowlist, and only the OWNER may grant or
    // revoke privileged roles (admin/owner/moderator). This prevents an admin from
    // self-escalating to owner or minting other admins.
    const VALID_ROLES = new Set(["student", "teacher", "parent", "admin", "owner", "moderator"]);
    const PRIVILEGED_ROLES = new Set(["admin", "owner", "moderator"]);
    if (role !== undefined) {
      const actor = (req as any).adminActor;
      if (!VALID_ROLES.has(String(role))) {
        return res.status(400).json({ error: "دور غير صالح" });
      }
      const grantsPrivilege = PRIVILEGED_ROLES.has(String(role));
      const removesPrivilege = before ? PRIVILEGED_ROLES.has(String(before.role)) : false;
      if ((grantsPrivilege || removesPrivilege) && actor?.role !== "owner") {
        return res.status(403).json({ error: "تغيير الأدوار الإدارية متاح للمالك فقط" });
      }
    }
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "User not found" });
    // Classify the change so suspend/activate show as distinct actions in reports.
    let actionType = "user_update";
    let actionLabel = "حدّث بيانات مستخدم";
    if (status !== undefined && before && status !== before.status) {
      if (status === "active") { actionType = "user_activate"; actionLabel = "أعاد تفعيل مستخدم"; }
      else { actionType = "user_suspend"; actionLabel = "أوقف مستخدمًا"; }
    } else if (role !== undefined && before && role !== before.role) {
      actionType = "user_update"; actionLabel = `غيّر دور المستخدم إلى ${role}`;
    }
    await logAudit(req, { actionType, actionLabel, entityType: "user", entityId: id, entityLabel: user.name, oldValue: before ? `${before.role}/${before.status}` : "", newValue: `${user.role}/${user.status}` });
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Update user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [before] = await db.select({ name: usersTable.name, email: usersTable.email, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await logAudit(req, { actionType: "user_delete", actionLabel: "حذف مستخدمًا", entityType: "user", entityId: id, entityLabel: before?.name || before?.email || String(id), oldValue: before ? `${before.role}` : "" });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Materials
router.get("/admin/materials", async (req, res) => {
  try {
    const materials = await ensureDefaultMaterials();
    res.json(materials);
  } catch (err) {
    req.log.error({ err }, "List materials error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/materials", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const classification = String(req.body?.classification ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "اسم المادة مطلوب" });
    }
    if (!classification) {
      return res.status(400).json({ error: "التصنيف مطلوب" });
    }
    const [maxOrderResult] = await db
      .select({ maxSortOrder: sql<number>`coalesce(max(${materialsTable.sortOrder}), 0)` })
      .from(materialsTable);
    const nextSortOrder = (Number(maxOrderResult?.maxSortOrder ?? 0) || 0) + 1;
    const [material] = await db
      .insert(materialsTable)
      .values({ name, classification, sortOrder: nextSortOrder })
      .returning();
    res.status(201).json(material);
  } catch (err: any) {
    const errorCode = String(err?.code ?? err?.cause?.code ?? "");
    const errorMessage = `${String(err?.message ?? "")} ${String(err?.cause?.message ?? "")}`;
    if (errorCode === "23505" || errorMessage.includes("duplicate key") || errorMessage.includes("materials_name_unique")) {
      return res.status(400).json({ error: "المادة موجودة بالفعل" });
    }
    req.log.error({ err }, "Create material error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/materials/reorder", async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = rawIds
      .map((value: unknown) => Number.parseInt(String(value), 10))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: "ids مطلوبة" });
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      return res.status(400).json({ error: "ids يجب أن تكون فريدة" });
    }

    const existingMaterials = await db.select({ id: materialsTable.id }).from(materialsTable);
    const existingIds = existingMaterials.map((material) => material.id);
    const sameLength = existingIds.length === ids.length;
    const sameSet = existingIds.every((id) => uniqueIds.includes(id));
    if (!sameLength || !sameSet) {
      return res.status(400).json({ error: "ids يجب أن تحتوي كل المواد مرة واحدة" });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i += 1) {
        await tx.update(materialsTable).set({ sortOrder: i + 1 }).where(eq(materialsTable.id, ids[i]));
      }
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reorder materials error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/materials/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "id غير صالح" });
    }
    const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, id)).limit(1);
    if (!material) {
      return res.status(404).json({ error: "المادة غير موجودة" });
    }
    const classificationValue = String(material.classification ?? "").trim() || material.name;

    const [bookUsage] = await db
      .select({ count: count() })
      .from(booksTable)
      .where(or(eq(booksTable.subject, classificationValue), eq(booksTable.category, classificationValue)));
    const [videoUsage] = await db
      .select({ count: count() })
      .from(videosTable)
      .where(eq(videosTable.subject, classificationValue));

    const [alternativesCount] = await db
      .select({ count: count() })
      .from(materialsTable)
      .where(and(eq(materialsTable.classification, classificationValue), ne(materialsTable.id, id)));

    const isUsed = Number(bookUsage.count) > 0 || Number(videoUsage.count) > 0;
    const hasAlternativeClassification = Number(alternativesCount.count) > 0;
    if (isUsed && !hasAlternativeClassification) {
      return res.status(400).json({
        error: "لا يمكن حذف المادة لأن تصنيفها مرتبط بكتب أو فيديوهات. غيّر ربط المحتوى أو أضف مادة بديلة بنفس التصنيف.",
      });
    }

    await db.delete(materialsTable).where(eq(materialsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete material error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Books
router.get("/admin/books", async (req, res) => {
  try {
    const books = await db
      .select()
      .from(booksTable)
      .orderBy(asc(booksTable.sortOrder), desc(booksTable.createdAt));
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/books/upload-cover", uploadBookCoverFile.single("cover"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No cover file provided" });
    }
    const filename = req.file.filename;
    const url = `/api/uploads/book-covers/${filename}`;
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Upload book cover error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/books", async (req, res) => {
  try {
    const body = req.body ?? {};
    const subject = typeof body.subject === "string" ? body.subject : typeof body.category === "string" ? body.category : "علوم";
    const priceEgp = Number.parseInt(String(body.priceEgp ?? body.pointsPrice ?? 0), 10) || 0;
    const originalPriceEgp = Number.parseInt(String(body.originalPriceEgp ?? priceEgp), 10) || priceEgp;
    const [maxOrderResult] = await db
      .select({ maxSortOrder: sql<number>`coalesce(max(${booksTable.sortOrder}), 0)` })
      .from(booksTable);
    const nextSortOrder = (Number(maxOrderResult?.maxSortOrder ?? 0) || 0) + 1;

    const [book] = await db
      .insert(booksTable)
      .values({
        title: body.title,
        author: typeof body.author === "string" && body.author.trim().length > 0 ? body.author : "غير محدد",
        description: body.description,
        category: subject,
        subject,
        coverUrl: body.coverUrl,
        pointsPrice: priceEgp,
        priceEgp,
        originalPriceEgp,
        sortOrder: nextSortOrder,
        freeShipping: Boolean(body.freeShipping),
        available: body.available === undefined ? true : Boolean(body.available),
      })
      .returning();
    res.status(201).json(book);
  } catch (err) {
    req.log.error({ err }, "Create book error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/books/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body ?? {};
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.coverUrl !== undefined) updateData.coverUrl = body.coverUrl;
    if (body.available !== undefined) updateData.available = Boolean(body.available);
    if (body.freeShipping !== undefined) updateData.freeShipping = Boolean(body.freeShipping);

    if (body.subject !== undefined || body.category !== undefined) {
      const subject = typeof body.subject === "string" ? body.subject : body.category;
      updateData.subject = subject;
      updateData.category = subject;
    }

    if (body.priceEgp !== undefined || body.pointsPrice !== undefined) {
      const priceEgp = Number.parseInt(String(body.priceEgp ?? body.pointsPrice), 10) || 0;
      updateData.priceEgp = priceEgp;
      updateData.pointsPrice = priceEgp;
    }

    if (body.originalPriceEgp !== undefined) {
      updateData.originalPriceEgp = Number.parseInt(String(body.originalPriceEgp), 10) || 0;
    }
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = Number.parseInt(String(body.sortOrder), 10) || 0;
    }

    const [book] = await db.update(booksTable).set(updateData).where(eq(booksTable.id, id)).returning();
    if (!book) return res.status(404).json({ error: "Not found" });
    res.json(book);
  } catch (err) {
    req.log.error({ err }, "Update book error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/books/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(booksTable).where(eq(booksTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/books/reorder", async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = rawIds
      .map((value: unknown) => Number.parseInt(String(value), 10))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: "ids are required" });
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      return res.status(400).json({ error: "ids must be unique" });
    }

    const existingBooks = await db.select({ id: booksTable.id }).from(booksTable);
    const existingIds = existingBooks.map((book) => book.id);
    const sameLength = existingIds.length === ids.length;
    const sameSet = existingIds.every((id) => uniqueIds.includes(id));
    if (!sameLength || !sameSet) {
      return res.status(400).json({ error: "ids must include all books exactly once" });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i += 1) {
        await tx.update(booksTable).set({ sortOrder: i + 1 }).where(eq(booksTable.id, ids[i]));
      }
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reorder books error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/book-vouchers", async (req, res) => {
  try {
    const vouchers = await db
      .select({
        id: bookVouchersTable.id,
        code: bookVouchersTable.code,
        bookId: bookVouchersTable.bookId,
        bookTitle: booksTable.title,
        discountType: bookVouchersTable.discountType,
        discountValue: bookVouchersTable.discountValue,
        discountPercent: bookVouchersTable.discountPercent,
        active: bookVouchersTable.active,
        usageLimit: bookVouchersTable.usageLimit,
        usedCount: bookVouchersTable.usedCount,
        startsAt: bookVouchersTable.startsAt,
        expiresAt: bookVouchersTable.expiresAt,
        createdAt: bookVouchersTable.createdAt,
      })
      .from(bookVouchersTable)
      .leftJoin(booksTable, eq(bookVouchersTable.bookId, booksTable.id))
      .orderBy(desc(bookVouchersTable.createdAt));
    res.json(vouchers);
  } catch (err) {
    req.log.error({ err }, "List book vouchers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/book-vouchers", async (req, res) => {
  try {
    const body = req.body ?? {};
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: "Voucher code is required" });
    }
    const bookId = Number.parseInt(String(body.bookId ?? ""), 10);
    if (!Number.isFinite(bookId) || bookId <= 0) {
      return res.status(400).json({ error: "bookId is required" });
    }
    const [book] = await db.select({ id: booksTable.id }).from(booksTable).where(eq(booksTable.id, bookId)).limit(1);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const discountTypeRaw = String(body.discountType ?? "percent").trim().toLowerCase();
    const discountType = discountTypeRaw === "amount" || discountTypeRaw === "free_shipping" ? discountTypeRaw : "percent";
    const rawDiscountValue = Number.parseInt(String(body.discountValue ?? body.discountPercent ?? 0), 10) || 0;
    const discountValue = Math.max(0, rawDiscountValue);
    const discountPercent = discountType === "percent" ? Math.max(1, Math.min(100, discountValue || 0)) : 0;
    const usageLimitRaw = Number.parseInt(String(body.usageLimit ?? ""), 10);
    const usageLimit = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? usageLimitRaw : null;
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const [voucher] = await db
      .insert(bookVouchersTable)
      .values({
        code,
        bookId,
        discountType,
        discountValue,
        discountPercent,
        active: body.active === undefined ? true : Boolean(body.active),
        usageLimit,
        startsAt,
        expiresAt,
      })
      .returning();
    res.status(201).json(voucher);
  } catch (err) {
    req.log.error({ err }, "Create book voucher error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/book-vouchers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const body = req.body ?? {};
    const updateData: Record<string, unknown> = {};

    if (body.code !== undefined) updateData.code = String(body.code).trim().toUpperCase();
    if (body.discountType !== undefined) {
      const discountTypeRaw = String(body.discountType ?? "percent").trim().toLowerCase();
      const normalizedType = discountTypeRaw === "amount" || discountTypeRaw === "free_shipping" ? discountTypeRaw : "percent";
      updateData.discountType = normalizedType;
      if (normalizedType !== "percent") {
        updateData.discountPercent = 0;
      }
    }
    if (body.discountValue !== undefined || body.discountPercent !== undefined) {
      const discountValue = Math.max(0, Number.parseInt(String(body.discountValue ?? body.discountPercent ?? 0), 10) || 0);
      updateData.discountValue = discountValue;
      const discountTypeRaw = String(body.discountType ?? "").trim().toLowerCase();
      const discountType = discountTypeRaw === "amount" || discountTypeRaw === "free_shipping" ? discountTypeRaw : null;
      if ((discountType ?? null) === "percent") {
        updateData.discountPercent = Math.max(1, Math.min(100, discountValue || 0));
      } else if (discountType === "amount" || discountType === "free_shipping") {
        updateData.discountPercent = 0;
      } else if (body.discountPercent !== undefined) {
        updateData.discountPercent = Math.max(1, Math.min(100, discountValue || 0));
      }
    }
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.bookId !== undefined) {
      const bookId = Number.parseInt(String(body.bookId ?? ""), 10);
      if (!Number.isFinite(bookId) || bookId <= 0) {
        return res.status(400).json({ error: "bookId must be a valid id" });
      }
      updateData.bookId = bookId;
    }
    if (body.usageLimit !== undefined) {
      const usageLimitRaw = Number.parseInt(String(body.usageLimit ?? ""), 10);
      updateData.usageLimit = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? usageLimitRaw : null;
    }
    if (body.startsAt !== undefined) updateData.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const [voucher] = await db.update(bookVouchersTable).set(updateData).where(eq(bookVouchersTable.id, id)).returning();
    if (!voucher) return res.status(404).json({ error: "Not found" });
    res.json(voucher);
  } catch (err) {
    req.log.error({ err }, "Update book voucher error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/book-vouchers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await db.delete(bookVouchersTable).where(eq(bookVouchersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete book voucher error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Videos
router.get("/admin/videos", async (req, res) => {
  try {
    const videos = await db
      .selectDistinct({
        id: videosTable.id,
        title: videosTable.title,
        description: videosTable.description,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        videoType: videosTable.videoType,
        publishStatus: videosTable.publishStatus,
        createdAt: videosTable.createdAt,
      })
      .from(videosTable)
      .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
      .orderBy(desc(videosTable.createdAt));
    res.json(videos);
  } catch (err) {
    req.log.error({ err }, "List admin videos error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/videos/upload", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف رفع الفيديوهات من مسار admin/videos. استخدم /admin/academic/media/upload-video داخل شاشة الدرس.",
  });
});

router.post("/admin/videos/upload-thumbnail", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف رفع الصورة المصغرة من مسار admin/videos. استخدم /admin/academic/media/upload-thumbnail داخل شاشة الدرس.",
  });
});

router.post("/admin/videos", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف إنشاء الفيديو المستقل. أنشئ الفيديو من داخل الدرس عبر /admin/academic.",
  });
});

router.put("/admin/videos/:id", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف تعديل الفيديو المستقل. عدل الفيديو من شاشة الدرس داخل /admin/academic.",
  });
});

router.delete("/admin/videos/:id", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف حذف الفيديو المستقل. احذف/فك ارتباط الفيديو من شاشة الدرس داخل /admin/academic.",
  });
});

// Rewards
router.get("/admin/rewards", async (req, res) => {
  try {
    const rewards = await db.select().from(rewardsTable).orderBy(desc(rewardsTable.createdAt));
    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/rewards", async (req, res) => {
  try {
    const [reward] = await db.insert(rewardsTable).values(req.body).returning();
    res.status(201).json(reward);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/rewards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [reward] = await db.update(rewardsTable).set(req.body).where(eq(rewardsTable.id, id)).returning();
    if (!reward) return res.status(404).json({ error: "Not found" });
    res.json(reward);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/rewards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(rewardsTable).where(eq(rewardsTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Games
router.get("/admin/games", async (req, res) => {
  try {
    const games = await db.select().from(gamesTable).orderBy(desc(gamesTable.createdAt));
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/games", async (req, res) => {
  try {
    const { title, subject, difficulty, pointsReward, description } = req.body;
    const [game] = await db.insert(gamesTable).values({ title, subject, difficulty, pointsReward, description, questionsCount: 0 }).returning();
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/games/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [game] = await db.update(gamesTable).set(req.body).where(eq(gamesTable.id, id)).returning();
    if (!game) return res.status(404).json({ error: "Not found" });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/games/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(gamesTable).where(eq(gamesTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Banners
router.get("/admin/banners", async (req, res) => {
  try {
    const banners = await db.select().from(bannersTable).orderBy(desc(bannersTable.createdAt));
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/banners", async (req, res) => {
  try {
    const [banner] = await db.insert(bannersTable).values(req.body).returning();
    res.status(201).json(banner);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/banners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [banner] = await db.update(bannersTable).set(req.body).where(eq(bannersTable.id, id)).returning();
    if (!banner) return res.status(404).json({ error: "Not found" });
    res.json(banner);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/banners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(bannersTable).where(eq(bannersTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Purchases & Reservations
router.get("/admin/purchases", async (req, res) => {
  try {
    const purchases = await db
      .select({
        id: bookPurchasesTable.id,
        bookId: bookPurchasesTable.bookId,
        bookTitle: booksTable.title,
        pointsSpent: bookPurchasesTable.pointsSpent,
        createdAt: bookPurchasesTable.createdAt,
      })
      .from(bookPurchasesTable)
      .leftJoin(booksTable, eq(bookPurchasesTable.bookId, booksTable.id))
      .orderBy(desc(bookPurchasesTable.createdAt));
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/reservations", async (req, res) => {
  try {
    const reservations = await db
      .select({
        id: bookReservationsTable.id,
        bookId: bookReservationsTable.bookId,
        bookTitle: booksTable.title,
        status: bookReservationsTable.status,
        createdAt: bookReservationsTable.createdAt,
      })
      .from(bookReservationsTable)
      .leftJoin(booksTable, eq(bookReservationsTable.bookId, booksTable.id))
      .orderBy(desc(bookReservationsTable.createdAt));
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/redemptions", async (req, res) => {
  try {
    const redemptions = await db.select().from(redemptionsTable).orderBy(desc(redemptionsTable.createdAt));
    res.json(redemptions);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/points-transactions", async (req, res) => {
  try {
    const transactions = await db.select().from(pointsTransactionsTable).orderBy(desc(pointsTransactionsTable.createdAt));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reports
router.get("/admin/reports", async (req, res) => {
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/reports/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, resolvedBy } = req.body;
    const [report] = await db.update(reportsTable)
      .set({ status, resolvedBy, resolvedAt: new Date() })
      .where(eq(reportsTable.id, id))
      .returning();
    if (!report) return res.status(404).json({ error: "Not found" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
