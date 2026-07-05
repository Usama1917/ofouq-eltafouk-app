// v2 Phase 2 — exam automated notifications. Three owner-editable messages (text /
// on-off / icon are managed from the "الرسائل المؤتمتة" screen, category "الامتحانات"):
//   • exam_opened  — broadcast to a subject's subscribers when a chapter exam is opened.
//   • exam_passed  — sent to a student who scores >= passPercent on a chapter exam.
//   • exam_retry   — sent to a student who scores <  passPercent (nudge to try again).
// All three are subject-scoped: nobody outside the subscribers of that subject is ever
// notified. Tapping a notification opens that chapter's lessons screen (where the exam
// card lives) via data.route "lessons".

import {
  db,
  usersTable,
  unitsTable,
  subjectsTable,
  academicYearsTable,
  subjectSubscriptionsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { getMessageConfig, resolveText, pickMessageLanguage, type MessageConfig } from "./automated-messages";
import { sendPushNotificationToUser } from "./push-notifications";

export type ExamType = "review" | "adaptive";

const EXAM_NAME = {
  ar: { review: "امتحان الاستدراك", adaptive: "تحديك الخاص", both: "امتحان الفصل" },
  en: { review: "the catch-up exam", adaptive: "your own challenge", both: "the chapter exam" },
} as const;

/** The exam name for a given rendered language + which exam(s) it refers to. */
function examName(lang: "en" | "ar", types: ExamType[]): string {
  if (types.length >= 2) return EXAM_NAME[lang].both;
  return types[0] === "review" ? EXAM_NAME[lang].review : EXAM_NAME[lang].adaptive;
}

async function getUnitNavContext(unitId: number) {
  const [ctx] = await db
    .select({
      unitId: unitsTable.id,
      unitName: unitsTable.name,
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
      unitLabel: subjectsTable.unitLabel,
      yearId: academicYearsTable.id,
      yearName: academicYearsTable.name,
    })
    .from(unitsTable)
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
    .where(eq(unitsTable.id, unitId))
    .limit(1);
  return ctx ?? null;
}

/** Navigation payload that lands the student on the chapter's lessons screen. */
function examLessonsData(ctx: NonNullable<Awaited<ReturnType<typeof getUnitNavContext>>>, extra: Record<string, unknown> = {}) {
  return {
    route: "lessons",
    yearId: ctx.yearId,
    yearName: ctx.yearName,
    subjectId: ctx.subjectId,
    subjectName: ctx.subjectName,
    unitLabel: ctx.unitLabel,
    unitId: ctx.unitId,
    unitName: ctx.unitName,
    ...extra,
  };
}

/**
 * Broadcast "a chapter exam just opened" to every ACTIVE subscriber of the chapter's
 * subject. `openedTypes` = the exam(s) that transitioned closed→open in this save.
 * Deduped per (unit, opened-set, student), so re-saving config never re-notifies.
 */
export async function notifyExamOpened(unitId: number, openedTypes: ExamType[]): Promise<void> {
  if (openedTypes.length === 0) return;
  const cfg = await getMessageConfig("exam_opened");
  if (!cfg || !cfg.enabled) return;

  const ctx = await getUnitNavContext(unitId);
  if (!ctx) return;

  const subscribers = await db
    .select({ studentId: subjectSubscriptionsTable.studentId, language: usersTable.language })
    .from(subjectSubscriptionsTable)
    .innerJoin(usersTable, eq(subjectSubscriptionsTable.studentId, usersTable.id))
    .where(
      and(
        eq(subjectSubscriptionsTable.subjectId, ctx.subjectId),
        eq(subjectSubscriptionsTable.status, "active"),
        eq(usersTable.status, "active"),
      ),
    );
  if (subscribers.length === 0) return;

  const typesKey = [...openedTypes].sort().join("+");
  const data = examLessonsData(ctx, { icon: cfg.icon ?? undefined, color: cfg.color ?? undefined });

  const renderFor = (language: string | null) => {
    const lang = pickMessageLanguage(cfg as MessageConfig, language);
    return resolveText(cfg as MessageConfig, language, {
      exam: examName(lang, openedTypes),
      unit: ctx.unitName,
      subject: ctx.subjectName,
    });
  };

  const created = await db
    .insert(notificationsTable)
    .values(
      subscribers.map((s) => {
        const { title, body } = renderFor(s.language);
        return {
          userId: s.studentId,
          type: "exam_opened",
          title,
          body,
          tone: cfg.tone,
          data,
          dedupeKey: `exam-opened:${unitId}:${typesKey}:student:${s.studentId}`,
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id, userId: notificationsTable.userId });

  const langByStudent = new Map(subscribers.map((s) => [s.studentId, s.language]));
  await Promise.allSettled(
    created.map((n) => {
      const { title, body } = renderFor(langByStudent.get(n.userId) ?? null);
      return sendPushNotificationToUser({
        userId: n.userId,
        title,
        body,
        data: { ...data, type: "exam_opened", notificationId: n.id },
      });
    }),
  );
}

/**
 * Sent to ONE student after they finish a chapter exam: a congrats (>= passPercent) or a
 * "try again" nudge (< passPercent). No-op if the chosen message is disabled.
 */
export async function notifyExamResult(args: { userId: number; unitId: number; examType: ExamType; percent: number }): Promise<void> {
  const { userId, unitId, examType, percent } = args;
  const passKey = "exam_passed";
  const retryKey = "exam_retry";

  // The threshold lives on either message's config (owner-editable); default 50.
  const gateCfg = await getMessageConfig(passKey);
  const passPercent = Number(gateCfg?.config?.passPercent ?? 50);
  const key = percent >= passPercent ? passKey : retryKey;

  const cfg = await getMessageConfig(key);
  if (!cfg || !cfg.enabled) return;

  const ctx = await getUnitNavContext(unitId);
  if (!ctx) return;

  const [student] = await db.select({ language: usersTable.language }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const language = student?.language ?? null;
  const lang = pickMessageLanguage(cfg, language);
  const { title, body } = resolveText(cfg, language, {
    exam: examName(lang, [examType]),
    percent,
    unit: ctx.unitName,
    subject: ctx.subjectName,
  });

  const data = examLessonsData(ctx, { icon: cfg.icon ?? undefined, color: cfg.color ?? undefined });

  const [created] = await db
    .insert(notificationsTable)
    .values({
      userId,
      type: key,
      title,
      body,
      tone: cfg.tone,
      data,
      // One result notification per (student, unit, examType) — the first attempt.
      dedupeKey: `exam-result:${unitId}:${examType}:student:${userId}`,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });

  if (created) {
    await sendPushNotificationToUser({
      userId,
      title,
      body,
      data: { ...data, type: key, notificationId: created.id },
    }).catch(() => undefined);
  }
}
