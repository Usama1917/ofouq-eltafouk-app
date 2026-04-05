import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  db,
  academicYearsTable,
  subjectsTable,
  unitsTable,
  lessonsTable,
  videosTable,
  usersTable,
  subjectSubscriptionRequestsTable,
  subjectSubscriptionsTable,
} from "@workspace/db";
import { and, asc, count, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

const videosUploadDir = path.resolve(process.cwd(), "uploads/videos");
const thumbnailsUploadDir = path.resolve(process.cwd(), "uploads/thumbnails");
const codeImagesUploadDir = path.resolve(process.cwd(), "uploads/subscription-codes");
fs.mkdirSync(videosUploadDir, { recursive: true });
fs.mkdirSync(thumbnailsUploadDir, { recursive: true });
fs.mkdirSync(codeImagesUploadDir, { recursive: true });

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, videosUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const thumbnailStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, thumbnailsUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const codeImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, codeImagesUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const uploadVideoFile = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

const uploadThumbnailFile = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const uploadCodeImageFile = multer({
  storage: codeImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

function parsePositiveInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toBool(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  return Boolean(value);
}

function toText(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return match ? match[1] : null;
}

async function requireAdmin(req: any, res: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }

  const userId = parsePositiveInt(token.replace("session_", ""));
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
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

  if (user.role !== "admin" && user.role !== "owner") {
    res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    return null;
  }

  return user;
}

type SessionUser = {
  id: number;
  role: string;
  status: string;
};

function getSessionUserId(req: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) return null;

  const userId = parsePositiveInt(token.replace("session_", ""));
  return userId ?? null;
}

async function getSessionUser(req: any): Promise<SessionUser | null> {
  const userId = getSessionUserId(req);
  if (!userId) return null;

  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.status !== "active") return null;
  return user;
}

async function requireAuthenticatedUser(req: any, res: any) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  return user;
}

async function requireStudent(req: any, res: any) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;

  if (user.role !== "student") {
    res.status(403).json({ error: "هذه الخدمة متاحة للطلاب فقط" });
    return null;
  }

  return user;
}

async function userHasSubjectAccess(userId: number, subjectId: number) {
  const [subscription] = await db
    .select({ id: subjectSubscriptionsTable.id })
    .from(subjectSubscriptionsTable)
    .where(
      and(
        eq(subjectSubscriptionsTable.studentId, userId),
        eq(subjectSubscriptionsTable.subjectId, subjectId),
        eq(subjectSubscriptionsTable.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(subscription);
}

async function requireStudentSubjectAccess(req: any, res: any, subjectId: number) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;

  if (user.role !== "student") return user;

  const hasAccess = await userHasSubjectAccess(user.id, subjectId);
  if (!hasAccess) {
    res.status(403).json({
      error: "هذه المادة غير متاحة لحسابك حاليًا. أرسل طلب اشتراك بكود الكتاب ثم انتظر المراجعة.",
    });
    return null;
  }

  return user;
}

type NormalizedVideoInput = {
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number;
  instructor: string;
  videoType: "youtube" | "upload";
  publishStatus: "draft" | "published";
};

function normalizeVideoPayload(payload: unknown, defaults: {
  fallbackTitle: string;
  fallbackDescription: string;
  fallbackPublishStatus: "draft" | "published";
}) {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;

  const videoUrl = toText(raw.videoUrl);
  if (!videoUrl) {
    throw new Error("رابط الفيديو مطلوب");
  }

  const videoType = toText(raw.videoType, "youtube").toLowerCase() === "upload" ? "upload" : "youtube";
  if (videoType === "youtube" && !getYouTubeId(videoUrl)) {
    throw new Error("رابط YouTube غير صالح");
  }

  const publishStatus = toText(raw.publishStatus, defaults.fallbackPublishStatus).toLowerCase() === "draft"
    ? "draft"
    : "published";

  const title = toText(raw.title, defaults.fallbackTitle) || defaults.fallbackTitle;
  const description = toText(raw.description, defaults.fallbackDescription);
  const instructor = toText(raw.instructor, "غير محدد") || "غير محدد";

  return {
    title,
    description,
    videoUrl,
    thumbnailUrl: toText(raw.thumbnailUrl) || null,
    duration: Math.max(0, toNumber(raw.duration, 0)),
    instructor,
    videoType,
    publishStatus,
  } satisfies NormalizedVideoInput;
}

async function getUnitContext(unitId: number) {
  const [unitContext] = await db
    .select({
      unitId: unitsTable.id,
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
    })
    .from(unitsTable)
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .where(eq(unitsTable.id, unitId))
    .limit(1);

  return unitContext ?? null;
}

async function getLessonWithVideo(lessonId: number, publishedOnly: boolean) {
  const rows = await db
    .select({
      id: lessonsTable.id,
      unitId: lessonsTable.unitId,
      subjectId: subjectsTable.id,
      title: lessonsTable.title,
      description: lessonsTable.description,
      videoId: lessonsTable.videoId,
      orderIndex: lessonsTable.orderIndex,
      isPublished: lessonsTable.isPublished,
      createdAt: lessonsTable.createdAt,
      video: {
        id: videosTable.id,
        title: videosTable.title,
        description: videosTable.description,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        videoType: videosTable.videoType,
        publishStatus: videosTable.publishStatus,
      },
    })
    .from(lessonsTable)
    .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), publishedOnly ? eq(unitsTable.isPublished, true) : undefined))
    .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), publishedOnly ? eq(subjectsTable.isPublished, true) : undefined))
    .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), publishedOnly ? eq(academicYearsTable.isPublished, true) : undefined))
    .leftJoin(
      videosTable,
      and(
        eq(lessonsTable.videoId, videosTable.id),
        publishedOnly ? eq(videosTable.publishStatus, "published") : undefined,
      ),
    )
    .where(and(eq(lessonsTable.id, lessonId), publishedOnly ? eq(lessonsTable.isPublished, true) : undefined));

  return rows[0] ?? null;
}

// ── Subscription requests (student + admin review) ───────────────────────

router.post("/academic/subscription-requests/upload-code-image", uploadCodeImageFile.single("image"), async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    if (!req.file) {
      return res.status(400).json({ error: "صورة الكود مطلوبة" });
    }

    res.json({ url: `/api/uploads/subscription-codes/${req.file.filename}` });
  } catch (err) {
    req.log.error({ err }, "Upload subscription code image error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/academic/subscription-requests", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const yearId = toNumber(req.body?.yearId, 0);
    const subjectId = toNumber(req.body?.subjectId, 0);
    const code = toText(req.body?.code);
    const codeImageUrl = toText(req.body?.codeImageUrl) || null;

    if (yearId <= 0) return res.status(400).json({ error: "السنة الدراسية مطلوبة" });
    if (subjectId <= 0) return res.status(400).json({ error: "المادة مطلوبة" });
    if (!code) return res.status(400).json({ error: "كود الكتاب مطلوب" });
    if (!codeImageUrl) return res.status(400).json({ error: "صورة الكود مطلوبة" });

    const [subject] = await db
      .select({
        id: subjectsTable.id,
        yearId: subjectsTable.yearId,
      })
      .from(subjectsTable)
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .where(
        and(
          eq(subjectsTable.id, subjectId),
          eq(subjectsTable.yearId, yearId),
          eq(subjectsTable.isPublished, true),
          eq(academicYearsTable.isPublished, true),
        ),
      )
      .limit(1);

    if (!subject) {
      return res.status(404).json({ error: "السنة أو المادة غير متاحة" });
    }

    const alreadySubscribed = await userHasSubjectAccess(student.id, subjectId);
    if (alreadySubscribed) {
      return res.status(409).json({ error: "أنت مشترك بالفعل في هذه المادة" });
    }

    const [pendingRequest] = await db
      .select({ id: subjectSubscriptionRequestsTable.id })
      .from(subjectSubscriptionRequestsTable)
      .where(
        and(
          eq(subjectSubscriptionRequestsTable.studentId, student.id),
          eq(subjectSubscriptionRequestsTable.subjectId, subjectId),
          eq(subjectSubscriptionRequestsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (pendingRequest) {
      return res.status(409).json({ error: "لديك طلب قيد المراجعة لنفس المادة" });
    }

    const [created] = await db
      .insert(subjectSubscriptionRequestsTable)
      .values({
        studentId: student.id,
        yearId,
        subjectId,
        code,
        codeImageUrl,
        status: "pending",
        reviewNotes: "",
      })
      .returning();

    res.status(201).json({
      request: created,
      message:
        "تم إرسال طلبك بنجاح وهو الآن قيد المراجعة. سيتم مراجعته خلال يوم عمل واحد كحد أقصى. سيقوم المشرف بالتحقق من الكود وبياناتك ثم قبول الطلب أو رفضه.",
    });
  } catch (err) {
    req.log.error({ err }, "Create subscription request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/subscription-requests/me", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const requests = await db
      .select({
        id: subjectSubscriptionRequestsTable.id,
        code: subjectSubscriptionRequestsTable.code,
        codeImageUrl: subjectSubscriptionRequestsTable.codeImageUrl,
        status: subjectSubscriptionRequestsTable.status,
        reviewNotes: subjectSubscriptionRequestsTable.reviewNotes,
        submittedAt: subjectSubscriptionRequestsTable.submittedAt,
        reviewedAt: subjectSubscriptionRequestsTable.reviewedAt,
        year: {
          id: academicYearsTable.id,
          name: academicYearsTable.name,
        },
        subject: {
          id: subjectsTable.id,
          name: subjectsTable.name,
        },
      })
      .from(subjectSubscriptionRequestsTable)
      .innerJoin(academicYearsTable, eq(subjectSubscriptionRequestsTable.yearId, academicYearsTable.id))
      .innerJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
      .where(eq(subjectSubscriptionRequestsTable.studentId, student.id))
      .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt));

    res.json(requests);
  } catch (err) {
    req.log.error({ err }, "List student subscription requests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/subscription-requests", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const requests = await db
      .select({
        id: subjectSubscriptionRequestsTable.id,
        code: subjectSubscriptionRequestsTable.code,
        codeImageUrl: subjectSubscriptionRequestsTable.codeImageUrl,
        status: subjectSubscriptionRequestsTable.status,
        reviewNotes: subjectSubscriptionRequestsTable.reviewNotes,
        submittedAt: subjectSubscriptionRequestsTable.submittedAt,
        reviewedAt: subjectSubscriptionRequestsTable.reviewedAt,
        student: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          phone: usersTable.phone,
        },
        year: {
          id: academicYearsTable.id,
          name: academicYearsTable.name,
        },
        subject: {
          id: subjectsTable.id,
          name: subjectsTable.name,
        },
      })
      .from(subjectSubscriptionRequestsTable)
      .innerJoin(usersTable, eq(subjectSubscriptionRequestsTable.studentId, usersTable.id))
      .innerJoin(academicYearsTable, eq(subjectSubscriptionRequestsTable.yearId, academicYearsTable.id))
      .innerJoin(subjectsTable, eq(subjectSubscriptionRequestsTable.subjectId, subjectsTable.id))
      .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt));

    res.json(requests);
  } catch (err) {
    req.log.error({ err }, "List admin subscription requests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/subscription-requests/:id/status", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const requestId = parsePositiveInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: "معرف الطلب غير صالح" });

    const nextStatus = toText(req.body?.status).toLowerCase();
    if (nextStatus !== "approved" && nextStatus !== "rejected") {
      return res.status(400).json({ error: "الحالة يجب أن تكون approved أو rejected" });
    }

    const reviewNotes = toText(req.body?.reviewNotes);
    const reviewedAt = new Date();

    const updatedRequest = await db.transaction(async (tx) => {
      const [requestRow] = await tx
        .select()
        .from(subjectSubscriptionRequestsTable)
        .where(eq(subjectSubscriptionRequestsTable.id, requestId))
        .limit(1);

      if (!requestRow) return null;

      if (nextStatus === "approved") {
        await tx
          .insert(subjectSubscriptionsTable)
          .values({
            studentId: requestRow.studentId,
            yearId: requestRow.yearId,
            subjectId: requestRow.subjectId,
            source: "book_code",
            status: "active",
            grantedByRequestId: requestRow.id,
            grantedByUserId: admin.id,
            updatedAt: reviewedAt,
          })
          .onConflictDoUpdate({
            target: [subjectSubscriptionsTable.studentId, subjectSubscriptionsTable.subjectId],
            set: {
              yearId: requestRow.yearId,
              source: "book_code",
              status: "active",
              grantedByRequestId: requestRow.id,
              grantedByUserId: admin.id,
              updatedAt: reviewedAt,
            },
          });
      }

      if (nextStatus === "rejected") {
        await tx
          .update(subjectSubscriptionsTable)
          .set({ status: "inactive", updatedAt: reviewedAt })
          .where(
            and(
              eq(subjectSubscriptionsTable.studentId, requestRow.studentId),
              eq(subjectSubscriptionsTable.subjectId, requestRow.subjectId),
              eq(subjectSubscriptionsTable.source, "book_code"),
            ),
          );
      }

      const [updated] = await tx
        .update(subjectSubscriptionRequestsTable)
        .set({
          status: nextStatus,
          reviewNotes,
          reviewedBy: admin.id,
          reviewedAt,
        })
        .where(eq(subjectSubscriptionRequestsTable.id, requestId))
        .returning();

      return updated ?? null;
    });

    if (!updatedRequest) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(updatedRequest);
  } catch (err) {
    req.log.error({ err }, "Review subscription request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public routes (published hierarchy only) ──────────────────────────────

router.get("/academic/years", async (req, res) => {
  try {
    const years = await db
      .select()
      .from(academicYearsTable)
      .where(eq(academicYearsTable.isPublished, true))
      .orderBy(asc(academicYearsTable.orderIndex), asc(academicYearsTable.id));
    res.json(years);
  } catch (err) {
    req.log.error({ err }, "Failed to list academic years");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/years/:yearId/subjects", async (req, res) => {
  try {
    const yearId = parsePositiveInt(req.params.yearId);
    if (!yearId) return res.status(400).json({ error: "معرف السنة غير صالح" });

    const subjects = await db
      .select()
      .from(subjectsTable)
      .where(and(eq(subjectsTable.yearId, yearId), eq(subjectsTable.isPublished, true)))
      .orderBy(asc(subjectsTable.orderIndex), asc(subjectsTable.id));

    res.json(subjects);
  } catch (err) {
    req.log.error({ err }, "Failed to list subjects");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/subjects/:subjectId/units", async (req, res) => {
  try {
    const subjectId = parsePositiveInt(req.params.subjectId);
    if (!subjectId) return res.status(400).json({ error: "معرف المادة غير صالح" });
    if (!(await requireStudentSubjectAccess(req, res, subjectId))) return;

    const units = await db
      .select({
        id: unitsTable.id,
        subjectId: unitsTable.subjectId,
        name: unitsTable.name,
        description: unitsTable.description,
        orderIndex: unitsTable.orderIndex,
        isPublished: unitsTable.isPublished,
        createdAt: unitsTable.createdAt,
      })
      .from(unitsTable)
      .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
      .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
      .where(and(eq(unitsTable.subjectId, subjectId), eq(unitsTable.isPublished, true)))
      .orderBy(asc(unitsTable.orderIndex), asc(unitsTable.id));

    res.json(units);
  } catch (err) {
    req.log.error({ err }, "Failed to list units");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/units/:unitId/lessons", async (req, res) => {
  try {
    const unitId = parsePositiveInt(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الوحدة غير صالح" });

    const [unitContext] = await db
      .select({ subjectId: unitsTable.subjectId })
      .from(unitsTable)
      .where(eq(unitsTable.id, unitId))
      .limit(1);
    if (!unitContext) return res.status(404).json({ error: "الوحدة غير موجودة" });
    if (!(await requireStudentSubjectAccess(req, res, unitContext.subjectId))) return;

    const lessons = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        title: lessonsTable.title,
        description: lessonsTable.description,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          description: videosTable.description,
          subject: videosTable.subject,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
          videoType: videosTable.videoType,
          publishStatus: videosTable.publishStatus,
        },
      })
      .from(lessonsTable)
      .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), eq(unitsTable.isPublished, true)))
      .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
      .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
      .leftJoin(
        videosTable,
        and(eq(lessonsTable.videoId, videosTable.id), eq(videosTable.publishStatus, "published")),
      )
      .where(and(eq(lessonsTable.unitId, unitId), eq(lessonsTable.isPublished, true)))
      .orderBy(asc(lessonsTable.orderIndex), asc(lessonsTable.id));

    res.json(lessons);
  } catch (err) {
    req.log.error({ err }, "Failed to list lessons");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/lessons/:lessonId", async (req, res) => {
  try {
    const lessonId = parsePositiveInt(req.params.lessonId);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    const lesson = await getLessonWithVideo(lessonId, true);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    if (!(await requireStudentSubjectAccess(req, res, lesson.subjectId))) return;

    res.json(lesson);
  } catch (err) {
    req.log.error({ err }, "Failed to get lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin routes (year -> subject -> unit -> lesson -> video) ────────────

router.post("/admin/academic/media/upload-video", uploadVideoFile.single("video"), async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    if (!req.file) return res.status(400).json({ error: "No video file provided" });

    const url = `/api/uploads/videos/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Upload lesson video error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/media/upload-thumbnail", uploadThumbnailFile.single("thumbnail"), async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    if (!req.file) return res.status(400).json({ error: "No thumbnail file provided" });

    const url = `/api/uploads/thumbnails/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Upload lesson thumbnail error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Academic years
router.get("/admin/academic/years", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const years = await db
      .select()
      .from(academicYearsTable)
      .orderBy(asc(academicYearsTable.orderIndex), asc(academicYearsTable.id));

    res.json(years);
  } catch (err) {
    req.log.error({ err }, "Failed to list academic years (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/years", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const name = toText(req.body?.name);
    if (!name) return res.status(400).json({ error: "اسم السنة مطلوب" });

    const [created] = await db
      .insert(academicYearsTable)
      .values({
        name,
        description: toText(req.body?.description),
        orderIndex: toNumber(req.body?.orderIndex, 0),
        isPublished: toBool(req.body?.isPublished, false),
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create academic year");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/years/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "معرف السنة غير صالح" });

    const updateData: Record<string, unknown> = {};
    if (req.body?.name !== undefined) updateData.name = toText(req.body.name);
    if (req.body?.description !== undefined) updateData.description = toText(req.body.description);
    if (req.body?.orderIndex !== undefined) updateData.orderIndex = toNumber(req.body.orderIndex, 0);
    if (req.body?.isPublished !== undefined) updateData.isPublished = toBool(req.body.isPublished, false);

    const [updated] = await db.update(academicYearsTable).set(updateData).where(eq(academicYearsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update academic year");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/years/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "معرف السنة غير صالح" });

    await db.delete(academicYearsTable).where(eq(academicYearsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete academic year");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/years/reorder", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await Promise.all(
      items.map((item: { id: number; orderIndex: number }) =>
        db
          .update(academicYearsTable)
          .set({ orderIndex: toNumber(item.orderIndex, 0) })
          .where(eq(academicYearsTable.id, toNumber(item.id, 0))),
      ),
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder academic years");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subjects
router.get("/admin/academic/years/:yearId/subjects", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const yearId = parsePositiveInt(req.params.yearId);
    if (!yearId) return res.status(400).json({ error: "معرف السنة غير صالح" });

    const subjects = await db
      .select()
      .from(subjectsTable)
      .where(eq(subjectsTable.yearId, yearId))
      .orderBy(asc(subjectsTable.orderIndex), asc(subjectsTable.id));

    res.json(subjects);
  } catch (err) {
    req.log.error({ err }, "Failed to list subjects (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/years/:yearId/subjects", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const yearId = parsePositiveInt(req.params.yearId);
    if (!yearId) return res.status(400).json({ error: "معرف السنة غير صالح" });

    const name = toText(req.body?.name);
    if (!name) return res.status(400).json({ error: "اسم المادة مطلوب" });

    const [created] = await db
      .insert(subjectsTable)
      .values({
        yearId,
        name,
        icon: toText(req.body?.icon, "📚") || "📚",
        description: toText(req.body?.description),
        orderIndex: toNumber(req.body?.orderIndex, 0),
        isPublished: toBool(req.body?.isPublished, false),
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create subject");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/subjects/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "معرف المادة غير صالح" });

    const updateData: Record<string, unknown> = {};
    if (req.body?.name !== undefined) updateData.name = toText(req.body.name);
    if (req.body?.icon !== undefined) updateData.icon = toText(req.body.icon, "📚") || "📚";
    if (req.body?.description !== undefined) updateData.description = toText(req.body.description);
    if (req.body?.orderIndex !== undefined) updateData.orderIndex = toNumber(req.body.orderIndex, 0);
    if (req.body?.isPublished !== undefined) updateData.isPublished = toBool(req.body.isPublished, false);

    const [updated] = await db.update(subjectsTable).set(updateData).where(eq(subjectsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update subject");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/subjects/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "معرف المادة غير صالح" });

    await db.delete(subjectsTable).where(eq(subjectsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete subject");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/subjects/reorder", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await Promise.all(
      items.map((item: { id: number; orderIndex: number }) =>
        db
          .update(subjectsTable)
          .set({ orderIndex: toNumber(item.orderIndex, 0) })
          .where(eq(subjectsTable.id, toNumber(item.id, 0))),
      ),
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder subjects");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Units
router.get("/admin/academic/subjects/:subjectId/units", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const subjectId = parsePositiveInt(req.params.subjectId);
    if (!subjectId) return res.status(400).json({ error: "معرف المادة غير صالح" });

    const units = await db
      .select()
      .from(unitsTable)
      .where(eq(unitsTable.subjectId, subjectId))
      .orderBy(asc(unitsTable.orderIndex), asc(unitsTable.id));

    res.json(units);
  } catch (err) {
    req.log.error({ err }, "Failed to list units (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/subjects/:subjectId/units", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const subjectId = parsePositiveInt(req.params.subjectId);
    if (!subjectId) return res.status(400).json({ error: "معرف المادة غير صالح" });

    const name = toText(req.body?.name);
    if (!name) return res.status(400).json({ error: "اسم الوحدة مطلوب" });

    const [created] = await db
      .insert(unitsTable)
      .values({
        subjectId,
        name,
        description: toText(req.body?.description),
        orderIndex: toNumber(req.body?.orderIndex, 0),
        isPublished: toBool(req.body?.isPublished, false),
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create unit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/units/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "معرف الوحدة غير صالح" });

    const updateData: Record<string, unknown> = {};
    if (req.body?.name !== undefined) updateData.name = toText(req.body.name);
    if (req.body?.description !== undefined) updateData.description = toText(req.body.description);
    if (req.body?.orderIndex !== undefined) updateData.orderIndex = toNumber(req.body.orderIndex, 0);
    if (req.body?.isPublished !== undefined) updateData.isPublished = toBool(req.body.isPublished, false);

    const [updated] = await db.update(unitsTable).set(updateData).where(eq(unitsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update unit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/units/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: "معرف الوحدة غير صالح" });

    await db.delete(unitsTable).where(eq(unitsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete unit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/units/reorder", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await Promise.all(
      items.map((item: { id: number; orderIndex: number }) =>
        db
          .update(unitsTable)
          .set({ orderIndex: toNumber(item.orderIndex, 0) })
          .where(eq(unitsTable.id, toNumber(item.id, 0))),
      ),
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder units");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Lessons (lesson-centric video creation)
router.get("/admin/academic/units/:unitId/lessons", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const unitId = parsePositiveInt(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الوحدة غير صالح" });

    const lessons = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        title: lessonsTable.title,
        description: lessonsTable.description,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          description: videosTable.description,
          subject: videosTable.subject,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
          videoType: videosTable.videoType,
          publishStatus: videosTable.publishStatus,
        },
      })
      .from(lessonsTable)
      .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(eq(lessonsTable.unitId, unitId))
      .orderBy(asc(lessonsTable.orderIndex), asc(lessonsTable.id));

    res.json(lessons);
  } catch (err) {
    req.log.error({ err }, "Failed to list lessons (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/units/:unitId/lessons", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const unitId = parsePositiveInt(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الوحدة غير صالح" });

    const title = toText(req.body?.title);
    if (!title) return res.status(400).json({ error: "عنوان الدرس مطلوب" });

    const unitContext = await getUnitContext(unitId);
    if (!unitContext) return res.status(404).json({ error: "الوحدة غير موجودة" });

    const description = toText(req.body?.description);
    const isPublished = toBool(req.body?.isPublished, false);

    const normalizedVideo = normalizeVideoPayload(req.body?.video, {
      fallbackTitle: title,
      fallbackDescription: description,
      fallbackPublishStatus: isPublished ? "published" : "draft",
    });

    const created = await db.transaction(async (tx) => {
      let createdVideoId: number | null = null;

      if (normalizedVideo) {
        const [video] = await tx
          .insert(videosTable)
          .values({
            title: normalizedVideo.title,
            description: normalizedVideo.description,
            subject: unitContext.subjectName,
            videoUrl: normalizedVideo.videoUrl,
            thumbnailUrl: normalizedVideo.thumbnailUrl,
            duration: normalizedVideo.duration,
            instructor: normalizedVideo.instructor,
            videoType: normalizedVideo.videoType,
            publishStatus: normalizedVideo.publishStatus,
          })
          .returning({ id: videosTable.id });

        createdVideoId = video.id;
      }

      const [lesson] = await tx
        .insert(lessonsTable)
        .values({
          unitId,
          title,
          description,
          videoId: createdVideoId,
          orderIndex: toNumber(req.body?.orderIndex, 0),
          isPublished,
        })
        .returning({ id: lessonsTable.id });

      return lesson;
    });

    const lesson = await getLessonWithVideo(created.id, false);
    res.status(201).json(lesson);
  } catch (err) {
    req.log.error({ err }, "Failed to create lesson");
    if (err instanceof Error && err.message) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/lessons/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const lessonId = parsePositiveInt(req.params.id);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    const [existing] = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        videoId: lessonsTable.videoId,
      })
      .from(lessonsTable)
      .where(eq(lessonsTable.id, lessonId))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "الدرس غير موجود" });

    const unitContext = await getUnitContext(existing.unitId);
    if (!unitContext) return res.status(404).json({ error: "الوحدة غير موجودة" });

    const title = req.body?.title !== undefined ? toText(req.body.title) : undefined;
    const description = req.body?.description !== undefined ? toText(req.body.description) : undefined;
    const clearVideo = toBool(req.body?.clearVideo, false);

    const normalizedVideo = normalizeVideoPayload(req.body?.video, {
      fallbackTitle: title ?? "",
      fallbackDescription: description ?? "",
      fallbackPublishStatus: toBool(req.body?.isPublished, false) ? "published" : "draft",
    });

    const updated = await db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (req.body?.orderIndex !== undefined) updateData.orderIndex = toNumber(req.body.orderIndex, 0);
      if (req.body?.isPublished !== undefined) updateData.isPublished = toBool(req.body.isPublished, false);

      let detachedVideoId: number | null = null;

      if (clearVideo && existing.videoId) {
        updateData.videoId = null;
        detachedVideoId = existing.videoId;
      }

      if (normalizedVideo) {
        if (existing.videoId && !clearVideo) {
          await tx
            .update(videosTable)
            .set({
              title: normalizedVideo.title,
              description: normalizedVideo.description,
              subject: unitContext.subjectName,
              videoUrl: normalizedVideo.videoUrl,
              thumbnailUrl: normalizedVideo.thumbnailUrl,
              duration: normalizedVideo.duration,
              instructor: normalizedVideo.instructor,
              videoType: normalizedVideo.videoType,
              publishStatus: normalizedVideo.publishStatus,
            })
            .where(eq(videosTable.id, existing.videoId));
        } else {
          const [createdVideo] = await tx
            .insert(videosTable)
            .values({
              title: normalizedVideo.title,
              description: normalizedVideo.description,
              subject: unitContext.subjectName,
              videoUrl: normalizedVideo.videoUrl,
              thumbnailUrl: normalizedVideo.thumbnailUrl,
              duration: normalizedVideo.duration,
              instructor: normalizedVideo.instructor,
              videoType: normalizedVideo.videoType,
              publishStatus: normalizedVideo.publishStatus,
            })
            .returning({ id: videosTable.id });

          updateData.videoId = createdVideo.id;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await tx.update(lessonsTable).set(updateData).where(eq(lessonsTable.id, lessonId));
      }

      if (detachedVideoId) {
        const [usage] = await tx
          .select({ linkedCount: count() })
          .from(lessonsTable)
          .where(eq(lessonsTable.videoId, detachedVideoId));

        if (Number(usage.linkedCount) === 0) {
          await tx.delete(videosTable).where(eq(videosTable.id, detachedVideoId));
        }
      }

      return getLessonWithVideo(lessonId, false);
    });

    if (!updated) return res.status(404).json({ error: "الدرس غير موجود" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update lesson");
    if (err instanceof Error && err.message) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/lessons/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const lessonId = parsePositiveInt(req.params.id);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: lessonsTable.id, videoId: lessonsTable.videoId })
        .from(lessonsTable)
        .where(eq(lessonsTable.id, lessonId))
        .limit(1);

      if (!existing) return;

      await tx.delete(lessonsTable).where(eq(lessonsTable.id, lessonId));

      if (existing.videoId) {
        const [usage] = await tx
          .select({ linkedCount: count() })
          .from(lessonsTable)
          .where(eq(lessonsTable.videoId, existing.videoId));

        if (Number(usage.linkedCount) === 0) {
          await tx.delete(videosTable).where(eq(videosTable.id, existing.videoId));
        }
      }
    });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/lessons/reorder", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await Promise.all(
      items.map((item: { id: number; orderIndex: number }) =>
        db
          .update(lessonsTable)
          .set({ orderIndex: toNumber(item.orderIndex, 0) })
          .where(eq(lessonsTable.id, toNumber(item.id, 0))),
      ),
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder lessons");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin helper: list videos that are actually linked to lessons.
router.get("/admin/academic/videos", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const videos = await db
      .select({
        id: videosTable.id,
        title: videosTable.title,
        description: videosTable.description,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
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
    req.log.error({ err }, "Failed to list admin academic videos");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
