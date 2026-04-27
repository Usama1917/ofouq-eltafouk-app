import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  db,
  academicYearsTable,
  subjectsTable,
  unitsTable,
  lessonsTable,
  videosTable,
  videoSegmentsTable,
  usersTable,
  subjectSubscriptionRequestsTable,
  subjectSubscriptionsTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

const videosUploadDir = path.resolve(process.cwd(), "uploads/videos");
const thumbnailsUploadDir = path.resolve(process.cwd(), "uploads/thumbnails");
const segmentThumbnailsUploadDir = path.resolve(process.cwd(), "uploads/thumbnails/segments");
const codeImagesUploadDir = path.resolve(process.cwd(), "uploads/subscription-codes");
fs.mkdirSync(videosUploadDir, { recursive: true });
fs.mkdirSync(thumbnailsUploadDir, { recursive: true });
fs.mkdirSync(segmentThumbnailsUploadDir, { recursive: true });
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

function normalizeSubscriptionCode(value: unknown) {
  return toText(value).replace(/\s+/g, "").toUpperCase();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return match ? match[1] : null;
}

function parseIso8601DurationToSeconds(value: string): number | null {
  const match = String(value || "").trim().match(
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match) return null;
  const days = Number.parseInt(match[3] || "0", 10);
  const hours = Number.parseInt(match[4] || "0", 10);
  const minutes = Number.parseInt(match[5] || "0", 10);
  const seconds = Number.parseInt(match[6] || "0", 10);
  const total = (days * 24 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

async function detectYouTubeDurationSeconds(videoUrl: string): Promise<number | null> {
  const videoId = getYouTubeId(videoUrl);
  if (!videoId) return null;
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!response.ok) return null;
    const payload = await response.json() as {
      items?: Array<{ contentDetails?: { duration?: string } }>;
    };
    const rawDuration = payload.items?.[0]?.contentDetails?.duration;
    if (!rawDuration) return null;
    return parseIso8601DurationToSeconds(rawDuration);
  } catch {
    return null;
  }
}

function resolveUploadPath(videoUrl: string): string | null {
  const raw = String(videoUrl || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/api/uploads/videos/")) return null;
  const filename = path.basename(raw);
  if (!filename || filename.includes("..")) return null;
  return path.join(videosUploadDir, filename);
}

async function detectUploadDurationSeconds(videoUrl: string): Promise<number | null> {
  const absolutePath = resolveUploadPath(videoUrl);
  if (!absolutePath || !fs.existsSync(absolutePath)) return null;

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      absolutePath,
    ]);
    const parsed = Number.parseFloat(String(stdout || "").trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
  } catch {
    return null;
  }
}

function buildSegmentThumbnailEndpoint(
  videoId: number,
  segmentId: number,
  startSeconds?: number,
  videoUrl?: string,
): string {
  const params = new URLSearchParams();
  if (Number.isFinite(startSeconds)) {
    params.set("ts", String(Math.max(0, Math.floor(Number(startSeconds)))));
  }
  const normalizedVideoUrl = String(videoUrl || "").trim();
  if (normalizedVideoUrl) {
    params.set("vh", createHash("sha1").update(normalizedVideoUrl).digest("hex").slice(0, 8));
  }
  const query = params.toString();
  return query
    ? `/api/academic/videos/${videoId}/segments/${segmentId}/thumbnail?${query}`
    : `/api/academic/videos/${videoId}/segments/${segmentId}/thumbnail`;
}

function buildSegmentThumbnailFilename(args: {
  videoId: number;
  segmentId: number;
  startSeconds: number;
  videoUrl: string;
}) {
  const start = Math.max(0, Math.floor(args.startSeconds));
  const urlHash = createHash("sha1").update(args.videoUrl).digest("hex").slice(0, 10);
  return `v${args.videoId}-seg${args.segmentId}-t${start}-${urlHash}.jpg`;
}

async function generateUploadSegmentThumbnail(inputPath: string, startSeconds: number, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      String(Math.max(0, startSeconds)),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-vf",
      "scale='min(640,iw)':-2",
      outputPath,
    ]);
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

async function generateYouTubeSegmentThumbnail(videoUrl: string, startSeconds: number, outputPath: string): Promise<boolean> {
  const videoId = getYouTubeId(videoUrl);
  if (!videoId) return false;

  const youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const { stdout } = await execFileAsync("yt-dlp", ["-g", "--no-playlist", youtubeWatchUrl], {
      maxBuffer: 1024 * 1024,
    });
    const streamUrl = String(stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (streamUrl) {
      const ok = await generateUploadSegmentThumbnail(streamUrl, startSeconds, outputPath);
      if (ok) return true;
    }
  } catch {
    // yt-dlp unavailable or failed; fallback below
  }

  try {
    const fallback = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    if (!fallback.ok) return false;
    const bytes = await fallback.arrayBuffer();
    await fs.promises.writeFile(outputPath, Buffer.from(bytes));
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

function resolveUploadVideoAbsolutePath(videoUrl: string): string | null {
  const raw = String(videoUrl || "").trim();
  if (!raw.startsWith("/api/uploads/videos/")) return null;
  const fileName = path.basename(raw);
  if (!fileName || fileName.includes("..")) return null;
  return path.join(videosUploadDir, fileName);
}

type SegmentThumbSeed = {
  id: number;
  startSeconds: number;
};

async function primeVideoSegmentThumbnails(args: {
  videoId: number;
  videoType: "youtube" | "upload";
  videoUrl: string;
  segments: SegmentThumbSeed[];
}) {
  if (!args.videoId || !args.videoUrl || args.segments.length === 0) return;

  for (const segment of args.segments) {
    const fileName = buildSegmentThumbnailFilename({
      videoId: args.videoId,
      segmentId: segment.id,
      startSeconds: segment.startSeconds,
      videoUrl: args.videoUrl,
    });
    const absoluteFilePath = path.join(segmentThumbnailsUploadDir, fileName);
    if (fs.existsSync(absoluteFilePath)) continue;

    if (args.videoType === "upload") {
      const inputPath = resolveUploadVideoAbsolutePath(args.videoUrl);
      if (!inputPath || !fs.existsSync(inputPath)) continue;
      await generateUploadSegmentThumbnail(inputPath, segment.startSeconds, absoluteFilePath);
      continue;
    }

    await generateYouTubeSegmentThumbnail(args.videoUrl, segment.startSeconds, absoluteFilePath);
  }
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
  posterUrl: string | null;
  segments: NormalizedVideoSegmentInput[];
  hasSegmentsField: boolean;
  duration: number;
  instructor: string;
  videoType: "youtube" | "upload";
  publishStatus: "draft" | "published";
};

type VideoSegmentType = "questions" | "parts" | "topics";

type NormalizedVideoSegmentInput = {
  title: string;
  startSeconds: number;
  segmentType: VideoSegmentType;
  orderIndex: number;
};

function normalizeSegmentType(value: unknown): VideoSegmentType {
  const raw = toText(value, "parts").toLowerCase();
  if (raw === "questions" || raw === "question" || raw === "اسئلة" || raw === "أسئلة") return "questions";
  if (raw === "topics" || raw === "topic" || raw === "مواضيع" || raw === "موضوع") return "topics";
  return "parts";
}

function parseTimestampTextToSeconds(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;

  const nums = parts.map((part) => Number.parseInt(part, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = nums;
    if (seconds > 59) return null;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = nums;
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function normalizeVideoSegments(payload: unknown): NormalizedVideoSegmentInput[] {
  if (!Array.isArray(payload)) return [];

  const normalized: NormalizedVideoSegmentInput[] = [];
  payload.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const raw = item as Record<string, unknown>;
    const title = toText(raw.title);
    if (!title) {
      throw new Error(`عنوان التقسيمة رقم ${index + 1} مطلوب`);
    }

    let startSeconds = toNumber(raw.startSeconds, Number.NaN);
    if (!Number.isFinite(startSeconds)) {
      const hours = toNumber(raw.hours, Number.NaN);
      const minutes = toNumber(raw.minutes, Number.NaN);
      const seconds = toNumber(raw.seconds, Number.NaN);
      if (Number.isFinite(hours) || Number.isFinite(minutes) || Number.isFinite(seconds)) {
        startSeconds = Math.max(0, Number.isFinite(hours) ? hours : 0) * 3600
          + Math.max(0, Number.isFinite(minutes) ? minutes : 0) * 60
          + Math.max(0, Number.isFinite(seconds) ? seconds : 0);
      }
    }
    if (!Number.isFinite(startSeconds)) {
      const parsedFromText = parseTimestampTextToSeconds(toText(raw.time));
      if (parsedFromText !== null) startSeconds = parsedFromText;
    }

    if (!Number.isFinite(startSeconds) || startSeconds < 0) {
      throw new Error(`وقت التقسيمة رقم ${index + 1} غير صالح`);
    }

    normalized.push({
      title,
      startSeconds: Math.floor(startSeconds),
      segmentType: normalizeSegmentType(raw.segmentType),
      orderIndex: normalized.length,
    });
  });

  normalized.sort((a, b) => (a.startSeconds - b.startSeconds) || (a.orderIndex - b.orderIndex));
  normalized.forEach((segment, orderIndex) => {
    segment.orderIndex = orderIndex;
  });

  return normalized;
}

async function normalizeVideoPayload(payload: unknown, defaults: {
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

  const title = toText(raw.title);
  if (!title) {
    throw new Error("عنوان الفيديو مطلوب ويجب إدخاله يدويًا.");
  }
  const description = toText(raw.description, defaults.fallbackDescription);
  const instructor = toText(raw.instructor, "غير محدد") || "غير محدد";
  const hasSegmentsField = Array.isArray(raw.segments);
  const segments = hasSegmentsField ? normalizeVideoSegments(raw.segments) : [];
  const hintedDuration = Math.max(0, toNumber(raw.duration, 0));
  const detectedDuration = videoType === "youtube"
    ? await detectYouTubeDurationSeconds(videoUrl)
    : await detectUploadDurationSeconds(videoUrl);
  const finalDuration = detectedDuration ?? (hintedDuration > 0 ? hintedDuration : null);
  if (!finalDuration || finalDuration <= 0) {
    throw new Error("تعذر حساب مدة الفيديو تلقائيًا. أعد إدخال رابط/ملف الفيديو وحاول مرة أخرى.");
  }

  return {
    title,
    description,
    videoUrl,
    thumbnailUrl: toText(raw.thumbnailUrl) || null,
    posterUrl: toText(raw.posterUrl) || null,
    segments,
    hasSegmentsField,
    duration: finalDuration,
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
        posterUrl: videosTable.posterUrl,
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

  const lesson = rows[0] ?? null;
  if (!lesson?.video?.id) return lesson;

  const segments = await db
    .select({
      id: videoSegmentsTable.id,
      title: videoSegmentsTable.title,
      startSeconds: videoSegmentsTable.startSeconds,
      segmentType: videoSegmentsTable.segmentType,
      orderIndex: videoSegmentsTable.orderIndex,
    })
    .from(videoSegmentsTable)
    .where(eq(videoSegmentsTable.videoId, lesson.video.id))
    .orderBy(asc(videoSegmentsTable.orderIndex), asc(videoSegmentsTable.startSeconds), asc(videoSegmentsTable.id));

  const segmentsWithThumb = segments.map((segment) => ({
    ...segment,
    thumbnailUrl: buildSegmentThumbnailEndpoint(
      lesson.video?.id ?? 0,
      segment.id,
      segment.startSeconds,
      lesson.video?.videoUrl || undefined,
    ),
  }));

  return {
    ...lesson,
    video: {
      ...lesson.video,
      segments: segmentsWithThumb,
    },
  };
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
    const code = normalizeSubscriptionCode(req.body?.code);
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
        "تم إرسال طلبك بنجاح وهو الآن قيد المراجعة. سيتم مراجعته خلال يوم عمل واحد كحد أقصى.",
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

router.get("/academic/subscriptions/me", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const subscriptions = await db
      .select({
        id: subjectSubscriptionsTable.id,
        status: subjectSubscriptionsTable.status,
        source: subjectSubscriptionsTable.source,
        grantedByRequestId: subjectSubscriptionsTable.grantedByRequestId,
        createdAt: subjectSubscriptionsTable.createdAt,
        updatedAt: subjectSubscriptionsTable.updatedAt,
        year: {
          id: academicYearsTable.id,
          name: academicYearsTable.name,
        },
        subject: {
          id: subjectsTable.id,
          name: subjectsTable.name,
          icon: subjectsTable.icon,
        },
      })
      .from(subjectSubscriptionsTable)
      .innerJoin(academicYearsTable, eq(subjectSubscriptionsTable.yearId, academicYearsTable.id))
      .innerJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
      .where(eq(subjectSubscriptionsTable.studentId, student.id))
      .orderBy(desc(subjectSubscriptionsTable.updatedAt), desc(subjectSubscriptionsTable.id));

    res.json(subscriptions);
  } catch (err) {
    req.log.error({ err }, "List student subscriptions error");
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

    const requestsAsc = [...requests].sort((a, b) => {
      const left = new Date(a.submittedAt).getTime();
      const right = new Date(b.submittedAt).getTime();
      if (left !== right) return left - right;
      return a.id - b.id;
    });

    const codeStats = new Map<
      string,
      {
        usageCount: number;
        firstUsedAt: Date;
        firstUsedBy: {
          id: number;
          name: string;
          email: string;
        };
        requestIds: number[];
      }
    >();

    for (const request of requestsAsc) {
      const normalizedCode = normalizeSubscriptionCode(request.code);
      const existing = codeStats.get(normalizedCode);
      if (existing) {
        existing.usageCount += 1;
        existing.requestIds.push(request.id);
        continue;
      }

      codeStats.set(normalizedCode, {
        usageCount: 1,
        firstUsedAt: new Date(request.submittedAt),
        firstUsedBy: {
          id: request.student.id,
          name: request.student.name,
          email: request.student.email,
        },
        requestIds: [request.id],
      });
    }

    const enrichedRequests = requests.map((request) => {
      const normalizedCode = normalizeSubscriptionCode(request.code);
      const stats = codeStats.get(normalizedCode);

      return {
        ...request,
        codeTracking: {
          normalizedCode,
          isDuplicate: (stats?.usageCount ?? 0) > 1,
          usageCount: stats?.usageCount ?? 1,
          firstUsedAt: stats?.firstUsedAt ?? request.submittedAt,
          firstUsedBy: stats?.firstUsedBy ?? {
            id: request.student.id,
            name: request.student.name,
            email: request.student.email,
          },
          requestIds: stats?.requestIds ?? [request.id],
        },
      };
    });

    res.json(enrichedRequests);
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

    const user = await getSessionUser(req);
    if (!user || user.role !== "student" || subjects.length === 0) {
      return res.json(subjects);
    }

    const subjectIds = subjects.map((subject) => subject.id);

    const subscriptions = await db
      .select({
        id: subjectSubscriptionsTable.id,
        subjectId: subjectSubscriptionsTable.subjectId,
        status: subjectSubscriptionsTable.status,
        updatedAt: subjectSubscriptionsTable.updatedAt,
      })
      .from(subjectSubscriptionsTable)
      .where(
        and(
          eq(subjectSubscriptionsTable.studentId, user.id),
          inArray(subjectSubscriptionsTable.subjectId, subjectIds),
        ),
      )
      .orderBy(desc(subjectSubscriptionsTable.updatedAt), desc(subjectSubscriptionsTable.id));

    const latestRequests = await db
      .select({
        id: subjectSubscriptionRequestsTable.id,
        subjectId: subjectSubscriptionRequestsTable.subjectId,
        status: subjectSubscriptionRequestsTable.status,
        submittedAt: subjectSubscriptionRequestsTable.submittedAt,
        reviewedAt: subjectSubscriptionRequestsTable.reviewedAt,
        reviewNotes: subjectSubscriptionRequestsTable.reviewNotes,
      })
      .from(subjectSubscriptionRequestsTable)
      .where(
        and(
          eq(subjectSubscriptionRequestsTable.studentId, user.id),
          inArray(subjectSubscriptionRequestsTable.subjectId, subjectIds),
        ),
      )
      .orderBy(desc(subjectSubscriptionRequestsTable.submittedAt), desc(subjectSubscriptionRequestsTable.id));

    const latestSubscriptionBySubject = new Map<number, (typeof subscriptions)[number]>();
    for (const subscription of subscriptions) {
      if (!latestSubscriptionBySubject.has(subscription.subjectId)) {
        latestSubscriptionBySubject.set(subscription.subjectId, subscription);
      }
    }

    const latestRequestBySubject = new Map<number, (typeof latestRequests)[number]>();
    for (const request of latestRequests) {
      if (!latestRequestBySubject.has(request.subjectId)) {
        latestRequestBySubject.set(request.subjectId, request);
      }
    }

    const withAccessState = subjects.map((subject) => {
      const subscription = latestSubscriptionBySubject.get(subject.id);
      const latestRequest = latestRequestBySubject.get(subject.id);

      let accessStatus: "none" | "pending" | "approved" | "rejected" = "none";
      let isLocked = true;
      let canRequestSubscription = true;

      if (subscription?.status === "active") {
        accessStatus = "approved";
        isLocked = false;
        canRequestSubscription = false;
      } else if (!subscription && latestRequest?.status === "approved") {
        accessStatus = "approved";
        isLocked = false;
        canRequestSubscription = false;
      } else if (latestRequest?.status === "pending") {
        accessStatus = "pending";
        isLocked = true;
        canRequestSubscription = false;
      } else if (latestRequest?.status === "rejected") {
        accessStatus = "rejected";
        isLocked = true;
        canRequestSubscription = true;
      }

      return {
        ...subject,
        accessStatus,
        isLocked,
        canRequestSubscription,
        subscriptionRecord: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              updatedAt: subscription.updatedAt,
            }
          : null,
        latestRequest: latestRequest
          ? {
              id: latestRequest.id,
              status: latestRequest.status,
              submittedAt: latestRequest.submittedAt,
              reviewedAt: latestRequest.reviewedAt,
              reviewNotes: latestRequest.reviewNotes,
            }
          : null,
      };
    });

    res.json(withAccessState);
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
          posterUrl: videosTable.posterUrl,
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

function formatSecondsBadge(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

router.get("/academic/videos/:videoId/segments/:segmentId/thumbnail", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const videoId = parsePositiveInt(req.params.videoId);
    const segmentId = parsePositiveInt(req.params.segmentId);
    if (!videoId || !segmentId) {
      return res.status(400).json({ error: "معرّف الفيديو أو التقسيمة غير صالح" });
    }

    const [segment] = await db
      .select({
        segmentId: videoSegmentsTable.id,
        videoId: videoSegmentsTable.videoId,
        startSeconds: videoSegmentsTable.startSeconds,
        videoUrl: videosTable.videoUrl,
        videoType: videosTable.videoType,
        subjectId: subjectsTable.id,
      })
      .from(videoSegmentsTable)
      .innerJoin(videosTable, eq(videoSegmentsTable.videoId, videosTable.id))
      .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
      .where(and(eq(videoSegmentsTable.videoId, videoId), eq(videoSegmentsTable.id, segmentId)))
      .limit(1);

    if (!segment) {
      return res.status(404).json({ error: "التقسيمة غير موجودة" });
    }

    if (user.role === "student") {
      const hasAccess = await userHasSubjectAccess(user.id, segment.subjectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "غير مصرح لك بمشاهدة هذه المادة." });
      }
    }

    const fileName = buildSegmentThumbnailFilename({
      videoId: segment.videoId,
      segmentId: segment.segmentId,
      startSeconds: segment.startSeconds,
      videoUrl: segment.videoUrl,
    });
    const absoluteFilePath = path.join(segmentThumbnailsUploadDir, fileName);

    if (!fs.existsSync(absoluteFilePath)) {
      let generated = false;
      if (segment.videoType === "upload") {
        const inputPath = resolveUploadVideoAbsolutePath(segment.videoUrl);
        if (inputPath && fs.existsSync(inputPath)) {
          generated = await generateUploadSegmentThumbnail(inputPath, segment.startSeconds, absoluteFilePath);
        }
      } else {
        generated = await generateYouTubeSegmentThumbnail(segment.videoUrl, segment.startSeconds, absoluteFilePath);
      }

      if (!generated) {
        if (user.role === "admin" || user.role === "owner") {
          res.setHeader("x-thumbnail-generation-warning", "segment-thumbnail-generation-failed");
        }
        const badge = formatSecondsBadge(segment.startSeconds);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0f1b34"/><rect x="0" y="0" width="640" height="360" fill="url(#g)"/><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#1f3f7a"/><stop offset="100%" stop-color="#122441"/></linearGradient></defs><text x="320" y="184" text-anchor="middle" fill="#d7e5ff" font-size="28" font-family="Arial, sans-serif" font-weight="700">معاينة الدرس</text><rect x="500" y="308" rx="10" ry="10" width="118" height="38" fill="#030712" stroke="#ffffff66"/><text x="559" y="333" text-anchor="middle" fill="#ffffff" font-size="22" font-family="Arial, sans-serif" font-weight="700">${badge}</text></svg>`;
        res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(svg);
      }
    }

    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    return res.sendFile(absoluteFilePath);
  } catch (err) {
    req.log.error({ err }, "Failed to generate/fetch segment thumbnail");
    res.status(500).json({ error: "تعذر تجهيز صورة التقسيمة" });
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
          posterUrl: videosTable.posterUrl,
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

    const videoIds = lessons
      .map((lesson) => lesson.video?.id)
      .filter((id): id is number => Number.isFinite(id) && id > 0);

    if (videoIds.length === 0) {
      return res.json(lessons);
    }

    const segments = await db
      .select({
        id: videoSegmentsTable.id,
        videoId: videoSegmentsTable.videoId,
        title: videoSegmentsTable.title,
        startSeconds: videoSegmentsTable.startSeconds,
        segmentType: videoSegmentsTable.segmentType,
        orderIndex: videoSegmentsTable.orderIndex,
      })
      .from(videoSegmentsTable)
      .where(inArray(videoSegmentsTable.videoId, videoIds))
      .orderBy(asc(videoSegmentsTable.orderIndex), asc(videoSegmentsTable.startSeconds), asc(videoSegmentsTable.id));

    const videoUrlById = new Map<number, string>();
    lessons.forEach((lesson) => {
      const videoId = Number(lesson.video?.id ?? 0);
      const videoUrl = lesson.video?.videoUrl;
      if (Number.isFinite(videoId) && videoId > 0 && typeof videoUrl === "string" && videoUrl.trim()) {
        videoUrlById.set(videoId, videoUrl.trim());
      }
    });

    const segmentsWithThumb = segments.map((segment) => ({
      ...segment,
      thumbnailUrl: buildSegmentThumbnailEndpoint(
        segment.videoId,
        segment.id,
        segment.startSeconds,
        videoUrlById.get(segment.videoId),
      ),
    }));

    const segmentsByVideoId = new Map<number, typeof segmentsWithThumb>();
    segmentsWithThumb.forEach((segment) => {
      const current = segmentsByVideoId.get(segment.videoId) ?? [];
      current.push(segment);
      segmentsByVideoId.set(segment.videoId, current);
    });

    const lessonsWithSegments = lessons.map((lesson) => {
      if (!lesson.video?.id) return lesson;
      return {
        ...lesson,
        video: {
          ...lesson.video,
          segments: segmentsByVideoId.get(lesson.video.id) ?? [],
        },
      };
    });

    res.json(lessonsWithSegments);
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

    const normalizedVideo = await normalizeVideoPayload(req.body?.video, {
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
            posterUrl: normalizedVideo.posterUrl,
            duration: normalizedVideo.duration,
            instructor: normalizedVideo.instructor,
            videoType: normalizedVideo.videoType,
            publishStatus: normalizedVideo.publishStatus,
          })
          .returning({ id: videosTable.id });

        createdVideoId = video.id;

        if (normalizedVideo.hasSegmentsField && normalizedVideo.segments.length > 0) {
          await tx.insert(videoSegmentsTable).values(
            normalizedVideo.segments.map((segment, orderIndex) => ({
              videoId: video.id,
              title: segment.title,
              startSeconds: segment.startSeconds,
              segmentType: segment.segmentType,
              orderIndex,
            })),
          );
        }
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
    if (lesson?.video?.id && lesson.video.videoUrl && Array.isArray(lesson.video.segments) && lesson.video.segments.length > 0) {
      void primeVideoSegmentThumbnails({
        videoId: lesson.video.id,
        videoType: lesson.video.videoType,
        videoUrl: lesson.video.videoUrl,
        segments: lesson.video.segments.map((segment) => ({
          id: segment.id,
          startSeconds: segment.startSeconds,
        })),
      }).catch((err) => {
        req.log.warn({ err, lessonId: lesson.id }, "Segment thumbnail pre-generation failed");
      });
    }
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

    const normalizedVideo = await normalizeVideoPayload(req.body?.video, {
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
              posterUrl: normalizedVideo.posterUrl,
              duration: normalizedVideo.duration,
              instructor: normalizedVideo.instructor,
              videoType: normalizedVideo.videoType,
              publishStatus: normalizedVideo.publishStatus,
            })
            .where(eq(videosTable.id, existing.videoId));

          if (normalizedVideo.hasSegmentsField) {
            await tx.delete(videoSegmentsTable).where(eq(videoSegmentsTable.videoId, existing.videoId));
            if (normalizedVideo.segments.length > 0) {
              await tx.insert(videoSegmentsTable).values(
                normalizedVideo.segments.map((segment, orderIndex) => ({
                  videoId: existing.videoId as number,
                  title: segment.title,
                  startSeconds: segment.startSeconds,
                  segmentType: segment.segmentType,
                  orderIndex,
                })),
              );
            }
          }
        } else {
          const [createdVideo] = await tx
            .insert(videosTable)
            .values({
              title: normalizedVideo.title,
              description: normalizedVideo.description,
              subject: unitContext.subjectName,
              videoUrl: normalizedVideo.videoUrl,
              thumbnailUrl: normalizedVideo.thumbnailUrl,
              posterUrl: normalizedVideo.posterUrl,
              duration: normalizedVideo.duration,
              instructor: normalizedVideo.instructor,
              videoType: normalizedVideo.videoType,
              publishStatus: normalizedVideo.publishStatus,
            })
            .returning({ id: videosTable.id });

          updateData.videoId = createdVideo.id;

          if (normalizedVideo.hasSegmentsField && normalizedVideo.segments.length > 0) {
            await tx.insert(videoSegmentsTable).values(
              normalizedVideo.segments.map((segment, orderIndex) => ({
                videoId: createdVideo.id,
                title: segment.title,
                startSeconds: segment.startSeconds,
                segmentType: segment.segmentType,
                orderIndex,
              })),
            );
          }
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
    if (updated.video?.id && updated.video.videoUrl && Array.isArray(updated.video.segments) && updated.video.segments.length > 0) {
      void primeVideoSegmentThumbnails({
        videoId: updated.video.id,
        videoType: updated.video.videoType,
        videoUrl: updated.video.videoUrl,
        segments: updated.video.segments.map((segment) => ({
          id: segment.id,
          startSeconds: segment.startSeconds,
        })),
      }).catch((err) => {
        req.log.warn({ err, lessonId }, "Segment thumbnail pre-generation failed after lesson update");
      });
    }
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
    req.log.error({ err }, "Failed to list admin academic videos");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
