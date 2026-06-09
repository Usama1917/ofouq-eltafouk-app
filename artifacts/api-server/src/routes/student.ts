import { Router, type IRouter } from "express";
import { db, usersTable, studentOnboardingResponsesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ---- Auth helpers (same session_<id> bearer scheme used across the API) ----
function parsePositiveInt(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSessionUserId(req: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) return null;
  return parsePositiveInt(token.replace("session_", ""));
}

async function requireStudent(req: any, res: any) {
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
  if (user.role !== "student") {
    res.status(403).json({ error: "هذه الخدمة متاحة للطلاب فقط" });
    return null;
  }
  return user;
}

// ---- Onboarding option keys (STABLE internal values — never display labels) ----
// The mobile app + admin dashboard map these keys to Arabic/English labels.
export const ONBOARDING_OPTION_KEYS = {
  heardAboutUs: ["facebook", "instagram", "tiktok", "youtube", "friend", "teacher", "sponsored_ad", "google", "other"],
  gradeLevel: ["secondary_1", "secondary_2", "secondary_3"],
  interestedSubjects: ["physics", "chemistry", "biology"],
  mainGoal: ["follow_lessons", "more_exercises", "exam_review", "improve_level", "catch_up", "organize_study"],
  currentLevel: ["excellent", "good", "average", "need_help"],
  learningPreference: ["short_videos", "detailed_long", "summaries", "questions_exercises", "live_sessions", "mix"],
  preferredStudyTime: ["morning", "afternoon", "evening", "night", "not_sure"],
} as const;

function serializeResponse(row: typeof studentOnboardingResponsesTable.$inferSelect | undefined) {
  if (!row) return null;
  return {
    onboardingCompleted: row.onboardingCompleted,
    onboardingCompletedAt: row.onboardingCompletedAt,
    heardAboutUs: row.heardAboutUs,
    gradeLevel: row.gradeLevel,
    interestedSubjects: Array.isArray(row.interestedSubjects) ? row.interestedSubjects : [],
    mainGoal: row.mainGoal,
    currentLevel: row.currentLevel,
    learningPreference: row.learningPreference,
    preferredStudyTime: row.preferredStudyTime,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET onboarding status + saved answers for the logged-in student.
router.get("/student/onboarding", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const [row] = await db
      .select()
      .from(studentOnboardingResponsesTable)
      .where(eq(studentOnboardingResponsesTable.userId, student.id))
      .limit(1);

    res.json({
      completed: Boolean(row?.onboardingCompleted),
      response: serializeResponse(row),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load student onboarding");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST onboarding answers (idempotent upsert). Marks onboarding completed.
router.post("/student/onboarding", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const body = req.body ?? {};
    const errors: Record<string, string> = {};

    const pickSingle = (field: keyof typeof ONBOARDING_OPTION_KEYS) => {
      const value = typeof body[field] === "string" ? String(body[field]).trim() : "";
      if (!value || !(ONBOARDING_OPTION_KEYS[field] as readonly string[]).includes(value)) {
        errors[field] = "قيمة غير صالحة";
        return null;
      }
      return value;
    };

    const heardAboutUs = pickSingle("heardAboutUs");
    const gradeLevel = pickSingle("gradeLevel");
    const mainGoal = pickSingle("mainGoal");
    const currentLevel = pickSingle("currentLevel");
    const learningPreference = pickSingle("learningPreference");
    const preferredStudyTime = pickSingle("preferredStudyTime");

    // Multi-select subjects: require >= 1, all values must be valid, dedupe.
    const rawSubjects: unknown[] = Array.isArray(body.interestedSubjects) ? body.interestedSubjects : [];
    const interestedSubjects: string[] = Array.from(
      new Set(
        rawSubjects
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
      ),
    );
    if (
      interestedSubjects.length === 0 ||
      !interestedSubjects.every((value) => (ONBOARDING_OPTION_KEYS.interestedSubjects as readonly string[]).includes(value))
    ) {
      errors.interestedSubjects = "اختر مادة واحدة على الأقل";
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "بيانات الانترو غير مكتملة أو غير صالحة", fields: errors });
      return;
    }

    const now = new Date();
    const values = {
      onboardingCompleted: true,
      onboardingCompletedAt: now,
      heardAboutUs,
      gradeLevel,
      interestedSubjects,
      mainGoal,
      currentLevel,
      learningPreference,
      preferredStudyTime,
      updatedAt: now,
    };

    const [existing] = await db
      .select({ id: studentOnboardingResponsesTable.id })
      .from(studentOnboardingResponsesTable)
      .where(eq(studentOnboardingResponsesTable.userId, student.id))
      .limit(1);

    let saved;
    if (existing) {
      [saved] = await db
        .update(studentOnboardingResponsesTable)
        .set(values)
        .where(eq(studentOnboardingResponsesTable.userId, student.id))
        .returning();
    } else {
      [saved] = await db
        .insert(studentOnboardingResponsesTable)
        .values({ userId: student.id, ...values })
        .returning();
    }

    res.json({ completed: true, response: serializeResponse(saved) });
  } catch (err) {
    req.log.error({ err }, "Failed to save student onboarding");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
