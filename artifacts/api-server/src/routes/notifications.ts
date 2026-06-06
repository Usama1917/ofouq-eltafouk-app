import { Router, type IRouter, type RequestHandler } from "express";
import {
  db,
  academicYearsTable,
  lessonsTable,
  lessonWatchProgressTable,
  notificationsTable,
  pushNotificationTokensTable,
  subjectSubscriptionsTable,
  subjectsTable,
  unitsTable,
  usersTable,
  videosTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { isExpoPushToken, sendPushNotificationToUser } from "../lib/push-notifications";

const router: IRouter = Router();
const ADMIN_NOTIFICATION_CHUNK_SIZE = 400;

type AdminAudience =
  | "all"
  | "subscribed_subjects"
  | "not_subscribed_any"
  | "unopened_lessons"
  | "with_push_token"
  | "without_push_token";

type AdminActionType = "none" | "external_link" | "support_chat" | "subject_units" | "subject_subscribe" | "lesson";

type AdminAudienceFilters = {
  audience: AdminAudience;
  role: "all" | "student" | "teacher" | "admin" | "owner";
  status: "active" | "suspended" | "inactive" | "all";
  push: "any" | "has" | "none";
  yearIds: number[];
  subjectIds: number[];
  joinedWithinDays: number | null;
  selectedUserIds: number[];
};

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseSeconds(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function formatDurationLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizePlatform(value: unknown) {
  const platform = normalizeText(value, 24).toLowerCase();
  return platform || "unknown";
}

function normalizeDeviceInfo(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const allowedKeys = [
    "brand",
    "manufacturer",
    "modelName",
    "osName",
    "osVersion",
    "deviceType",
    "deviceYearClass",
  ];
  const normalized: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const entry = source[key];
    if (typeof entry === "string") {
      const text = normalizeText(entry, 120);
      if (text) normalized[key] = text;
      continue;
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      normalized[key] = entry;
    }
    if (typeof entry === "boolean") {
      normalized[key] = entry;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function getSessionUserId(req: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) return null;

  const userId = parsePositiveInt(token.replace("session_", ""));
  return userId ?? null;
}

async function requireAuthenticatedUser(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }

  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }

  return user;
}

async function requireAdmin(req: any, res: any) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;

  if (user.role !== "admin" && user.role !== "owner") {
    res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    return null;
  }

  return user;
}

async function getUnreadCount(userId: number) {
  const [summary] = await db
    .select({ unreadCount: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        isNull(notificationsTable.readAt),
        lte(notificationsTable.availableAt, sql`now()`),
      ),
    );

  return Number(summary?.unreadCount ?? 0);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => Number.parseInt(String(item), 10))
        .filter((item) => Number.isFinite(item) && item > 0),
    ),
  );
}

function normalizeAdminAudience(value: unknown): AdminAudience {
  const audience = normalizeText(value, 40) as AdminAudience;
  if (
    audience === "subscribed_subjects" ||
    audience === "not_subscribed_any" ||
    audience === "unopened_lessons" ||
    audience === "with_push_token" ||
    audience === "without_push_token"
  ) {
    return audience;
  }
  return "all";
}

function normalizeAudienceFilters(value: unknown): AdminAudienceFilters {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const role = normalizeText(source.role, 24);
  const status = normalizeText(source.status, 24);
  const push = normalizeText(source.push, 24);
  const joinedWithinDays = Number.parseInt(String(source.joinedWithinDays ?? ""), 10);

  return {
    audience: normalizeAdminAudience(source.audience),
    role: role === "student" || role === "teacher" || role === "admin" || role === "owner" ? role : "all",
    status: status === "suspended" || status === "inactive" || status === "all" ? status : "active",
    push: push === "has" || push === "none" ? push : "any",
    yearIds: normalizeIdArray(source.yearIds),
    subjectIds: normalizeIdArray(source.subjectIds),
    joinedWithinDays: Number.isFinite(joinedWithinDays) && joinedWithinDays > 0 ? Math.min(3650, joinedWithinDays) : null,
    selectedUserIds: normalizeIdArray(source.selectedUserIds),
  };
}

async function loadAdminAcademicOptions() {
  const years = await db
    .select({
      id: academicYearsTable.id,
      name: academicYearsTable.name,
      isPublished: academicYearsTable.isPublished,
      orderIndex: academicYearsTable.orderIndex,
    })
    .from(academicYearsTable)
    .orderBy(asc(academicYearsTable.orderIndex), asc(academicYearsTable.id));

  const subjects = await db
    .select({
      id: subjectsTable.id,
      yearId: subjectsTable.yearId,
      name: subjectsTable.name,
      unitLabel: subjectsTable.unitLabel,
      isPublished: subjectsTable.isPublished,
      orderIndex: subjectsTable.orderIndex,
    })
    .from(subjectsTable)
    .orderBy(asc(subjectsTable.orderIndex), asc(subjectsTable.id));

  const lessons = await db
    .select({
      id: lessonsTable.id,
      title: lessonsTable.title,
      isPublished: lessonsTable.isPublished,
      unitId: unitsTable.id,
      unitName: unitsTable.name,
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
      yearId: academicYearsTable.id,
      yearName: academicYearsTable.name,
      videoId: videosTable.id,
      videoTitle: videosTable.title,
      videoPublishStatus: videosTable.publishStatus,
    })
    .from(lessonsTable)
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
    .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
    .orderBy(
      asc(academicYearsTable.orderIndex),
      asc(subjectsTable.orderIndex),
      asc(unitsTable.orderIndex),
      asc(lessonsTable.orderIndex),
      asc(lessonsTable.id),
    );

  return { years, subjects, lessons };
}

function getSelectedSubjectIds(filters: AdminAudienceFilters, subjects: Array<{ id: number; yearId: number }>) {
  if (filters.subjectIds.length > 0) return new Set(filters.subjectIds);
  if (filters.yearIds.length > 0) {
    return new Set(subjects.filter((subject) => filters.yearIds.includes(subject.yearId)).map((subject) => subject.id));
  }
  return new Set<number>();
}

async function resolveAdminNotificationRecipients(filters: AdminAudienceFilters) {
  const [{ years, subjects }, users, subscriptions, progressRows, pushRows, lessons] = await Promise.all([
    loadAdminAcademicOptions(),
    db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        status: usersTable.status,
        joinedAt: usersTable.joinedAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.joinedAt), desc(usersTable.id)),
    db
      .select({
        studentId: subjectSubscriptionsTable.studentId,
        yearId: subjectSubscriptionsTable.yearId,
        subjectId: subjectSubscriptionsTable.subjectId,
        status: subjectSubscriptionsTable.status,
      })
      .from(subjectSubscriptionsTable),
    db
      .select({
        studentId: lessonWatchProgressTable.studentId,
        lessonId: lessonWatchProgressTable.lessonId,
      })
      .from(lessonWatchProgressTable),
    db
      .select({ userId: pushNotificationTokensTable.userId })
      .from(pushNotificationTokensTable)
      .where(isNull(pushNotificationTokensTable.disabledAt)),
    db
      .select({
        lessonId: lessonsTable.id,
        subjectId: unitsTable.subjectId,
      })
      .from(lessonsTable)
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .innerJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(
        and(
          eq(lessonsTable.isPublished, true),
          eq(unitsTable.isPublished, true),
          eq(subjectsTable.isPublished, true),
          eq(academicYearsTable.isPublished, true),
          eq(videosTable.publishStatus, "published"),
        ),
      ),
  ]);

  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active");
  const selectedSubjectIds = getSelectedSubjectIds(filters, subjects);
  const selectedSubjectFilterActive = selectedSubjectIds.size > 0;
  const pushUserIds = new Set(pushRows.map((row) => row.userId));
  const completedOrOpenedLessonKeys = new Set(progressRows.map((row) => `${row.studentId}:${row.lessonId}`));
  const activeSubscriptionsByStudent = new Map<number, typeof activeSubscriptions>();
  const lessonsBySubject = new Map<number, typeof lessons>();
  const selectedYearIds = new Set(filters.yearIds);
  const selectedUserIds = new Set(filters.selectedUserIds);
  const joinedAfter = filters.joinedWithinDays
    ? new Date(Date.now() - filters.joinedWithinDays * 24 * 60 * 60 * 1000)
    : null;

  for (const subscription of activeSubscriptions) {
    const list = activeSubscriptionsByStudent.get(subscription.studentId) ?? [];
    list.push(subscription);
    activeSubscriptionsByStudent.set(subscription.studentId, list);
  }

  for (const lesson of lessons) {
    const list = lessonsBySubject.get(lesson.subjectId) ?? [];
    list.push(lesson);
    lessonsBySubject.set(lesson.subjectId, list);
  }

  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));

  function matchesSubjectSelection(subscription: (typeof activeSubscriptions)[number]) {
    if (selectedSubjectFilterActive) return selectedSubjectIds.has(subscription.subjectId);
    if (selectedYearIds.size > 0) return selectedYearIds.has(subscription.yearId);
    return true;
  }

  function hasUnopenedLesson(userId: number, userSubscriptions: typeof activeSubscriptions) {
    return userSubscriptions.some((subscription) => {
      if (!matchesSubjectSelection(subscription)) return false;
      const subjectLessons = lessonsBySubject.get(subscription.subjectId) ?? [];
      return subjectLessons.some((lesson) => !completedOrOpenedLessonKeys.has(`${userId}:${lesson.lessonId}`));
    });
  }

  const recipients = users.filter((user) => {
    if (selectedUserIds.size > 0 && !selectedUserIds.has(user.id)) return false;
    if (filters.status !== "all" && user.status !== filters.status) return false;
    if (filters.role !== "all" && user.role !== filters.role) return false;
    if (filters.push === "has" && !pushUserIds.has(user.id)) return false;
    if (filters.push === "none" && pushUserIds.has(user.id)) return false;
    if (joinedAfter && user.joinedAt < joinedAfter) return false;

    const userSubscriptions = activeSubscriptionsByStudent.get(user.id) ?? [];
    const matchingSubscriptions = userSubscriptions.filter(matchesSubjectSelection);

    if (filters.audience === "subscribed_subjects") return matchingSubscriptions.length > 0;
    if (filters.audience === "not_subscribed_any") return userSubscriptions.length === 0;
    if (filters.audience === "unopened_lessons") return hasUnopenedLesson(user.id, userSubscriptions);
    if (filters.audience === "with_push_token") return pushUserIds.has(user.id);
    if (filters.audience === "without_push_token") return !pushUserIds.has(user.id);

    return true;
  });

  const byRole = recipients.reduce<Record<string, number>>((acc, user) => {
    acc[user.role] = (acc[user.role] ?? 0) + 1;
    return acc;
  }, {});
  const byStatus = recipients.reduce<Record<string, number>>((acc, user) => {
    acc[user.status] = (acc[user.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    recipients,
    summary: {
      total: recipients.length,
      withPushToken: recipients.filter((user) => pushUserIds.has(user.id)).length,
      withoutPushToken: recipients.filter((user) => !pushUserIds.has(user.id)).length,
      byRole,
      byStatus,
      sample: recipients.slice(0, 12).map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        hasPushToken: pushUserIds.has(user.id),
      })),
      selectedSubjects: Array.from(selectedSubjectIds)
        .map((id) => subjectById.get(id))
        .filter(Boolean)
        .map((subject) => ({ id: subject!.id, name: subject!.name, yearId: subject!.yearId })),
    },
    options: { years, subjects },
  };
}

async function buildAdminNotificationAction(action: unknown) {
  const source = (action && typeof action === "object" ? action : {}) as Record<string, unknown>;
  const type = normalizeText(source.type, 40) as AdminActionType;
  const normalizedType: AdminActionType =
    type === "external_link" ||
    type === "support_chat" ||
    type === "subject_units" ||
    type === "subject_subscribe" ||
    type === "lesson"
      ? type
      : "none";

  if (normalizedType === "external_link") {
    const url = normalizeText(source.url, 500);
    if (!/^https?:\/\//i.test(url)) throw new Error("رابط الرسالة يجب أن يبدأ بـ http أو https");
    return { actionUrl: url, data: { route: "external", url } };
  }

  if (normalizedType === "support_chat") {
    return { actionUrl: "/(tabs)/settings/support-chat", data: { route: "supportChat" } };
  }

  const subjectId = parsePositiveInt(String(source.subjectId ?? ""));
  if (normalizedType === "subject_units" || normalizedType === "subject_subscribe") {
    if (!subjectId) throw new Error("اختر المادة الخاصة بالوصول السريع");
    const [subject] = await db
      .select({
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        unitLabel: subjectsTable.unitLabel,
        yearId: academicYearsTable.id,
        yearName: academicYearsTable.name,
      })
      .from(subjectsTable)
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .where(eq(subjectsTable.id, subjectId))
      .limit(1);
    if (!subject) throw new Error("المادة المختارة غير موجودة");

    return {
      actionUrl: null,
      data: {
        route: normalizedType === "subject_units" ? "units" : "subscribe",
        yearId: subject.yearId,
        yearName: subject.yearName,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        unitLabel: subject.unitLabel,
      },
    };
  }

  if (normalizedType === "lesson") {
    const lessonId = parsePositiveInt(String(source.lessonId ?? ""));
    if (!lessonId) throw new Error("اكتب رقم الدرس للوصول السريع");
    const [lesson] = await db
      .select({
        lessonId: lessonsTable.id,
        lessonTitle: lessonsTable.title,
        unitId: unitsTable.id,
        unitName: unitsTable.name,
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        unitLabel: subjectsTable.unitLabel,
        yearId: academicYearsTable.id,
        yearName: academicYearsTable.name,
      })
      .from(lessonsTable)
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .where(eq(lessonsTable.id, lessonId))
      .limit(1);
    if (!lesson) throw new Error("الدرس المختار غير موجود");

    return {
      actionUrl: null,
      data: {
        route: "lesson",
        yearId: lesson.yearId,
        yearName: lesson.yearName,
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName,
        unitLabel: lesson.unitLabel,
        unitId: lesson.unitId,
        unitName: lesson.unitName,
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lessonTitle,
      },
    };
  }

  return { actionUrl: null, data: {} };
}

router.get("/admin/notifications/recipients", async (req, res): Promise<void> => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const query = normalizeText(req.query.q, 120);
    if (query.length < 2) {
      res.json([]);
      return;
    }

    const recipients = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        status: usersTable.status,
        avatarUrl: usersTable.avatarUrl,
        joinedAt: usersTable.joinedAt,
        lastActiveAt: usersTable.lastActiveAt,
      })
      .from(usersTable)
      .where(or(ilike(usersTable.email, `%${query}%`), ilike(usersTable.phone, `%${query}%`)))
      .orderBy(desc(usersTable.joinedAt), desc(usersTable.id))
      .limit(8);

    res.json(recipients);
  } catch (err) {
    req.log.error({ err }, "Failed to search admin notification recipients");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/notifications/options", async (req, res): Promise<void> => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { years, subjects, lessons } = await loadAdminAcademicOptions();
    res.json({
      years: years.map((year) => ({
        id: year.id,
        name: year.name,
        isPublished: year.isPublished,
        subjects: subjects
          .filter((subject) => subject.yearId === year.id)
          .map((subject) => ({
            id: subject.id,
            name: subject.name,
            unitLabel: subject.unitLabel,
            isPublished: subject.isPublished,
          })),
      })),
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        isPublished: lesson.isPublished,
        unitId: lesson.unitId,
        unitName: lesson.unitName,
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName,
        yearId: lesson.yearId,
        yearName: lesson.yearName,
        videoId: lesson.videoId,
        videoTitle: lesson.videoTitle,
        videoPublishStatus: lesson.videoPublishStatus,
      })),
      audiences: [
        { id: "all", label: "الكل" },
        { id: "subscribed_subjects", label: "مشتركين في مواد محددة أو أي مادة" },
        { id: "not_subscribed_any", label: "غير مشتركين في أي مادة" },
        { id: "unopened_lessons", label: "مشتركين ولديهم دروس لم يفتحوها" },
        { id: "with_push_token", label: "لديهم إشعارات جهاز مفعلة" },
        { id: "without_push_token", label: "ليس لديهم إشعارات جهاز مفعلة" },
      ],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load admin notification options");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/notifications/preview", async (req, res): Promise<void> => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const filters = normalizeAudienceFilters(req.body?.filters ?? req.body);
    const { summary } = await resolveAdminNotificationRecipients(filters);
    res.json({ filters, summary });
  } catch (err) {
    req.log.error({ err }, "Failed to preview admin notification audience");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/notifications/send", async (req, res): Promise<void> => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const title = normalizeText(req.body?.title, 140);
    const body = normalizeText(req.body?.body, 2000);
    const tone = normalizeText(req.body?.tone, 24);
    const filters = normalizeAudienceFilters(req.body?.filters ?? {});

    if (!title) {
      res.status(400).json({ error: "عنوان الرسالة مطلوب" });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "محتوى الرسالة مطلوب" });
      return;
    }

    const action = await buildAdminNotificationAction(req.body?.action);
    const { recipients, summary } = await resolveAdminNotificationRecipients(filters);
    if (recipients.length === 0) {
      res.status(400).json({ error: "لا يوجد مستخدمون مطابقون للفلاتر الحالية" });
      return;
    }

    const now = new Date();
    const batchKey = `admin-broadcast:${admin.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const data = {
      ...action.data,
      type: "admin_broadcast",
      sentByAdminId: admin.id,
      batchKey,
    };
    const notificationRows = recipients.map((recipient) => ({
      userId: recipient.id,
      type: "admin_broadcast",
      title,
      body,
      tone: tone === "success" || tone === "warning" || tone === "danger" ? tone : "primary",
      actionUrl: action.actionUrl,
      data,
      dedupeKey: `${batchKey}:user:${recipient.id}`,
      availableAt: now,
    }));

    const inserted: Array<{ id: number; userId: number }> = [];
    for (const batch of chunk(notificationRows, ADMIN_NOTIFICATION_CHUNK_SIZE)) {
      const rows = await db
        .insert(notificationsTable)
        .values(batch)
        .returning({ id: notificationsTable.id, userId: notificationsTable.userId });
      inserted.push(...rows);
    }

    let pushRegisteredCount = 0;
    let pushSentCount = 0;
    let pushDisabledCount = 0;
    let pushTicketErrorCount = 0;
    let pushReceiptErrorCount = 0;
    const pushErrorMessages = new Set<string>();

    for (const batch of chunk(inserted, 25)) {
      const results = await Promise.all(
        batch.map((notification) =>
          sendPushNotificationToUser({
            userId: notification.userId,
            title,
            body,
            data: {
              ...data,
              notificationId: notification.id,
            },
          }).catch((err) => {
            req.log.warn({ err, userId: notification.userId }, "Failed to send push notification");
            return {
              registeredCount: 0,
              sentCount: 0,
              disabledCount: 0,
              ticketErrorCount: 1,
              receiptErrorCount: 0,
              errorMessages: [err instanceof Error ? err.message : "Failed to send push notification"],
            };
          }),
        ),
      );

      for (const result of results) {
        pushRegisteredCount += result.registeredCount;
        pushSentCount += result.sentCount;
        pushDisabledCount += result.disabledCount;
        pushTicketErrorCount += result.ticketErrorCount;
        pushReceiptErrorCount += result.receiptErrorCount;
        result.errorMessages.forEach((message) => pushErrorMessages.add(message));
      }
    }

    res.status(201).json({
      success: true,
      notificationCount: inserted.length,
      recipientCount: recipients.length,
      pushRegisteredCount,
      pushSentCount,
      pushDisabledCount,
      pushTicketErrorCount,
      pushReceiptErrorCount,
      pushErrorMessages: Array.from(pushErrorMessages).slice(0, 5),
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message !== "Internal server error") {
      res.status(400).json({ error: message });
      return;
    }
    req.log.error({ err }, "Failed to send admin notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/notifications/summary", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    res.json({ unreadCount: await getUnreadCount(user.id) });
  } catch (err) {
    req.log.error({ err }, "Failed to load notification summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/notifications", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limit = Math.min(100, Math.max(1, parsePositiveInt(String(req.query.limit ?? "50")) ?? 50));
    const items = await db
      .select({
        id: notificationsTable.id,
        type: notificationsTable.type,
        title: notificationsTable.title,
        body: notificationsTable.body,
        tone: notificationsTable.tone,
        actionUrl: notificationsTable.actionUrl,
        data: notificationsTable.data,
        availableAt: notificationsTable.availableAt,
        readAt: notificationsTable.readAt,
        createdAt: notificationsTable.createdAt,
      })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.id), lte(notificationsTable.availableAt, sql`now()`)))
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(limit);

    const resumeLessonIds = Array.from(
      new Set(
        items
          .filter((item) => item.type === "resume_lesson")
          .map((item) => parsePositiveInt(String(item.data?.["lessonId"] ?? "")))
          .filter((lessonId): lessonId is number => Boolean(lessonId)),
      ),
    );
    const resumeTitlesByLessonId = new Map<number, string>();

    if (resumeLessonIds.length > 0) {
      const resumeRows = await db
        .select({
          lessonId: lessonsTable.id,
          lessonTitle: lessonsTable.title,
          videoTitle: videosTable.title,
        })
        .from(lessonsTable)
        .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
        .where(inArray(lessonsTable.id, resumeLessonIds));

      for (const row of resumeRows) {
        resumeTitlesByLessonId.set(row.lessonId, String(row.videoTitle || row.lessonTitle || "").trim());
      }
    }

    const normalizedItems = items.map((item) => {
      if (item.type !== "resume_lesson") return item;

      const lessonId = parsePositiveInt(String(item.data?.["lessonId"] ?? ""));
      const seekSeconds = parseSeconds(item.data?.["seekSeconds"]);
      const resumeTitle = String(item.data?.["videoTitle"] || (lessonId ? resumeTitlesByLessonId.get(lessonId) : "") || "").trim();
      if (!resumeTitle || seekSeconds <= 0) return item;

      return {
        ...item,
        body: `وقفت عند ${formatDurationLabel(seekSeconds)} في "${resumeTitle}".`,
        data: {
          ...item.data,
          videoTitle: resumeTitle,
        },
      };
    });

    res.json({
      items: normalizedItems,
      unreadCount: await getUnreadCount(user.id),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const notificationId = parsePositiveInt(req.params.id);
    if (!notificationId) {
      res.status(400).json({ error: "معرف الإشعار غير صالح" });
      return;
    }

    const [updated] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "الإشعار غير موجود" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const now = new Date();
    await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          isNull(notificationsTable.readAt),
          lte(notificationsTable.availableAt, sql`now()`),
        ),
      );

    res.json({ success: true, unreadCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications read");
    res.status(500).json({ error: "Internal server error" });
  }
});

const registerPushTokenHandler: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const token = normalizeText(req.body?.token ?? req.body?.expoPushToken, 260);
    if (!token || !isExpoPushToken(token)) {
      res.status(400).json({ error: "رمز إشعارات الجهاز غير صالح" });
      return;
    }

    const now = new Date();
    const [registered] = await db
      .insert(pushNotificationTokensTable)
      .values({
        userId: user.id,
        token,
        platform: normalizePlatform(req.body?.platform),
        deviceName: normalizeText(req.body?.deviceName, 120) || null,
        deviceInfo: normalizeDeviceInfo(req.body?.deviceInfo),
        disabledAt: null,
        lastRegisteredAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushNotificationTokensTable.token,
        set: {
          userId: user.id,
          platform: normalizePlatform(req.body?.platform),
          deviceName: normalizeText(req.body?.deviceName, 120) || null,
          deviceInfo: normalizeDeviceInfo(req.body?.deviceInfo),
          disabledAt: null,
          lastRegisteredAt: now,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: pushNotificationTokensTable.id });

    res.json({ success: true, id: registered?.id ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to register push notification token");
    res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/notifications/push-token", registerPushTokenHandler);
router.post("/notifications/register-token", registerPushTokenHandler);

router.post("/notifications/test-push", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const title = normalizeText(req.body?.title, 140) || "أفق التفوق";
    const body = normalizeText(req.body?.body, 500) || "هذه رسالة اختبار لإشعارات أندرويد.";
    const now = new Date();
    const [notification] = await db
      .insert(notificationsTable)
      .values({
        userId: user.id,
        type: "test_push",
        title,
        body,
        tone: "primary",
        data: {
          route: "notifications",
          type: "test_push",
        },
        dedupeKey: `test-push:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        availableAt: now,
      })
      .returning({ id: notificationsTable.id });

    const push = await sendPushNotificationToUser({
      userId: user.id,
      title,
      body,
      data: {
        route: "notifications",
        type: "test_push",
        notificationId: notification?.id,
      },
    });

    res.status(201).json({
      success: true,
      notificationId: notification?.id ?? null,
      ...push,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send test push notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notifications/read", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const deleted = await db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          isNotNull(notificationsTable.readAt),
          lte(notificationsTable.availableAt, sql`now()`),
        ),
      )
      .returning({ id: notificationsTable.id });

    res.json({
      success: true,
      deletedCount: deleted.length,
      unreadCount: await getUnreadCount(user.id),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to clear read notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notifications/push-token", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const token = normalizeText(req.body?.token ?? req.body?.expoPushToken, 260);
    if (!token) {
      res.status(400).json({ error: "رمز إشعارات الجهاز مطلوب" });
      return;
    }

    await db
      .update(pushNotificationTokensTable)
      .set({ disabledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pushNotificationTokensTable.userId, user.id), eq(pushNotificationTokensTable.token, token)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to unregister push notification token");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notifications/:id", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const notificationId = parsePositiveInt(req.params.id);
    if (!notificationId) {
      res.status(400).json({ error: "معرف الإشعار غير صالح" });
      return;
    }

    const [deleted] = await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)))
      .returning({ id: notificationsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "الإشعار غير موجود" });
      return;
    }

    res.json({
      success: true,
      id: deleted.id,
      unreadCount: await getUnreadCount(user.id),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to delete notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
