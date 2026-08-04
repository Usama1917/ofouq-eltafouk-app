import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
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
  notificationsTable,
  lessonWatchProgressTable,
  adminAuditLogTable,
  unitExamsTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, gt, inArray, isNull, like, sql } from "drizzle-orm";
import { sendPushNotificationToUser } from "../lib/push-notifications";
import {
  handleLessonActivity,
  renderAutomatedMessage,
  getMessageConfig,
  getUserLanguage,
  resolveText,
  pickMessageLanguage,
  normalizeMessageTone,
} from "../lib/automated-messages";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

// review B-39: intentional, user-facing validation errors are surfaced to the
// client; any other thrown error is logged and replaced with a generic 500 so
// internal error.message strings are never leaked.
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// review B-19: never trust the client-supplied filename/extension. Derive the
// stored extension from a server-side allowlist keyed off the validated mimetype.
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const VIDEO_MIME_EXTENSIONS: Record<string, string> = {
  "video/mp4": ".mp4",
};

function safeUploadFilename(mimetype: string, allowlist: Record<string, string>, fallbackExt: string) {
  const ext = allowlist[String(mimetype || "").toLowerCase()] ?? fallbackExt;
  return `${randomUUID()}${ext}`;
}

// review B-15: de-dupe concurrent segment-thumbnail generation. yt-dlp/ffmpeg
// are expensive; without this, N simultaneous cache misses for the SAME file
// spawn N duplicate processes. Keyed by the absolute output path; entry is
// cleared once the in-flight generation settles.
const inFlightSegmentThumbnails = new Map<string, Promise<boolean>>();

function generateSegmentThumbnailOnce(
  absoluteFilePath: string,
  generate: () => Promise<boolean>,
): Promise<boolean> {
  const existing = inFlightSegmentThumbnails.get(absoluteFilePath);
  if (existing) return existing;

  const pending = (async () => {
    try {
      return await generate();
    } finally {
      inFlightSegmentThumbnails.delete(absoluteFilePath);
    }
  })();

  inFlightSegmentThumbnails.set(absoluteFilePath, pending);
  return pending;
}

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
  // review B-19: extension from server-side mimetype allowlist + random UUID name.
  filename: (_req, file, cb) => cb(null, safeUploadFilename(file.mimetype, VIDEO_MIME_EXTENSIONS, ".mp4")),
});

const thumbnailStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, thumbnailsUploadDir),
  // review B-19: extension from server-side mimetype allowlist + random UUID name.
  filename: (_req, file, cb) => cb(null, safeUploadFilename(file.mimetype, IMAGE_MIME_EXTENSIONS, ".jpg")),
});

const codeImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, codeImagesUploadDir),
  // review B-19: extension from server-side mimetype allowlist + random UUID name.
  filename: (_req, file, cb) => cb(null, safeUploadFilename(file.mimetype, IMAGE_MIME_EXTENSIONS, ".jpg")),
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

// English (bilingual) text helper: returns the trimmed string or null when empty,
// so it maps cleanly onto the nullable `*_en` columns.
function toTextOrNull(value: unknown): string | null {
  const text = toText(value);
  return text.length > 0 ? text : null;
}

// Validates the bilingual pair for a create request. The English value is required
// (per product decision); the English description is required only when an Arabic
// description was provided. Returns an error message string, or null when valid.
function bilingualCreateError(args: {
  ar: string;
  en: string | null;
  arDesc: string;
  enDesc: string | null;
  primaryLabel: string;
}): string | null {
  if (!args.en) return `${args.primaryLabel} بالإنجليزية مطلوب`;
  if (args.arDesc && !args.enDesc) return "الوصف بالإنجليزية مطلوب";
  return null;
}

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Western, so a code typed on an
// Arabic keyboard matches the Western digits printed on the book. The app now
// converts as you type, but this is the real guard: it is the ONE function used
// both when storing a request and when matching it, so old app builds and any
// direct API call get normalised too.
const AR_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toWesternDigits(text: string) {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const ar = AR_INDIC_DIGITS.indexOf(d);
    if (ar >= 0) return String(ar);
    const fa = PERSIAN_DIGITS.indexOf(d);
    return fa >= 0 ? String(fa) : d;
  });
}
function normalizeSubscriptionCode(value: unknown) {
  return toWesternDigits(toText(value)).replace(/\s+/g, "").toUpperCase();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const academicUnitLabels = new Set(["unit", "chapter", "section"]);

function normalizeAcademicUnitLabel(value: unknown) {
  const label = toText(value, "unit");
  return academicUnitLabels.has(label) ? label : "unit";
}

function toSeconds(value: unknown, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function formatDurationLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function getSegmentThumbnailSeed(video: unknown) {
  const candidate = video as {
    id?: number | null;
    videoUrl?: string | null;
    videoType?: string | null;
    segments?: Array<{ id: number; startSeconds: number }> | null;
  } | null;

  if (!candidate?.id || !candidate.videoUrl || !Array.isArray(candidate.segments) || candidate.segments.length === 0) {
    return null;
  }

  return {
    videoId: candidate.id,
    videoType: candidate.videoType === "upload" ? "upload" as const : "youtube" as const,
    videoUrl: candidate.videoUrl,
    segments: candidate.segments.map((segment) => ({
      id: segment.id,
      startSeconds: segment.startSeconds,
    })),
  };
}

function notificationData(data: Record<string, unknown>) {
  return data;
}

async function createUserNotification(args: {
  userId: number;
  type: string;
  title: string;
  body: string;
  tone?: "primary" | "success" | "warning" | "danger";
  actionUrl?: string | null;
  data?: Record<string, unknown>;
  dedupeKey?: string | null;
  availableAt?: Date;
}) {
  const availableAt = args.availableAt ?? new Date();
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      tone: args.tone ?? "primary",
      actionUrl: args.actionUrl ?? null,
      data: notificationData(args.data ?? {}),
      dedupeKey: args.dedupeKey ?? null,
      availableAt,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });

  if (notification && availableAt <= new Date()) {
    await sendPushNotificationToUser({
      userId: args.userId,
      title: args.title,
      body: args.body,
      data: {
        ...(args.data ?? {}),
        type: args.type,
        notificationId: notification.id,
      },
    }).catch(() => undefined);
  }
}

async function upsertUserNotification(args: {
  userId: number;
  type: string;
  title: string;
  body: string;
  tone?: "primary" | "success" | "warning" | "danger";
  actionUrl?: string | null;
  data?: Record<string, unknown>;
  dedupeKey: string;
  availableAt?: Date;
}) {
  const now = new Date();
  await db
    .insert(notificationsTable)
    .values({
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      tone: args.tone ?? "primary",
      actionUrl: args.actionUrl ?? null,
      data: notificationData(args.data ?? {}),
      dedupeKey: args.dedupeKey,
      availableAt: args.availableAt ?? now,
      createdAt: now,
      readAt: null,
    })
    .onConflictDoUpdate({
      target: [notificationsTable.userId, notificationsTable.dedupeKey],
      set: {
        title: args.title,
        body: args.body,
        tone: args.tone ?? "primary",
        actionUrl: args.actionUrl ?? null,
        data: notificationData(args.data ?? {}),
        availableAt: args.availableAt ?? now,
        readAt: null,
        createdAt: now,
      },
    });
}

async function getSubjectNavigationContext(subjectId: number) {
  const [context] = await db
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

  return context ?? null;
}

async function getLessonNavigationContext(lessonId: number) {
  const [context] = await db
    .select({
      lessonId: lessonsTable.id,
      lessonTitle: lessonsTable.title,
      lessonIsPublished: lessonsTable.isPublished,
      videoTitle: videosTable.title,
      unitId: unitsTable.id,
      unitName: unitsTable.name,
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
      unitLabel: subjectsTable.unitLabel,
      yearId: academicYearsTable.id,
      yearName: academicYearsTable.name,
      videoPublishStatus: videosTable.publishStatus,
    })
    .from(lessonsTable)
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
    .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);

  return context ?? null;
}

function subjectActionData(context: NonNullable<Awaited<ReturnType<typeof getSubjectNavigationContext>>>) {
  return {
    route: "units",
    yearId: context.yearId,
    yearName: context.yearName,
    subjectId: context.subjectId,
    subjectName: context.subjectName,
    unitLabel: context.unitLabel,
  };
}

function subscribeActionData(context: NonNullable<Awaited<ReturnType<typeof getSubjectNavigationContext>>>, reviewNotes = "") {
  return {
    route: "subscribe",
    yearId: context.yearId,
    yearName: context.yearName,
    subjectId: context.subjectId,
    subjectName: context.subjectName,
    unitLabel: context.unitLabel,
    reviewNotes,
  };
}

function lessonActionData(
  context: NonNullable<Awaited<ReturnType<typeof getLessonNavigationContext>>>,
  extra: Record<string, unknown> = {},
) {
  return {
    route: "lesson",
    yearId: context.yearId,
    yearName: context.yearName,
    subjectId: context.subjectId,
    subjectName: context.subjectName,
    unitLabel: context.unitLabel,
    unitId: context.unitId,
    unitName: context.unitName,
    lessonId: context.lessonId,
    lessonTitle: context.lessonTitle,
    videoTitle: context.videoTitle,
    ...extra,
  };
}

// The subscription / lesson notifications below are owner-editable "automated
// messages" (text + on-off + badge icon) resolved from routes/gamification-admin →
// lib/automated-messages. `{subject}` / `{lesson}` / `{unit}` / `{time}` / `{video}`
// / `{reason}` placeholders are filled here; if the owner turned a message off
// (enabled=false) we skip sending it.
async function notifySubscriptionRequestCreated(request: { id: number; studentId: number; subjectId: number }) {
  const context = await getSubjectNavigationContext(request.subjectId);
  if (!context) return;

  const language = await getUserLanguage(request.studentId);
  const msg = await renderAutomatedMessage("subscription_pending", language, { subject: context.subjectName });
  if (!msg.enabled) return;

  await createUserNotification({
    userId: request.studentId,
    type: "subscription_pending",
    title: msg.title,
    body: msg.body,
    tone: msg.tone,
    data: { ...subscribeActionData(context), icon: msg.icon ?? undefined, color: msg.color ?? undefined },
    dedupeKey: `subscription-request:${request.id}:pending`,
  });
}

async function notifySubscriptionReviewed(request: {
  id: number;
  studentId: number;
  subjectId: number;
  status: string;
  reviewNotes: string;
}) {
  const context = await getSubjectNavigationContext(request.subjectId);
  if (!context) return;

  const language = await getUserLanguage(request.studentId);

  if (request.status === "approved") {
    const msg = await renderAutomatedMessage("subscription_approved", language, { subject: context.subjectName });
    if (!msg.enabled) return;
    await createUserNotification({
      userId: request.studentId,
      type: "subscription_approved",
      title: msg.title,
      body: msg.body,
      tone: msg.tone,
      data: { ...subjectActionData(context), icon: msg.icon ?? undefined, color: msg.color ?? undefined },
      dedupeKey: `subscription-request:${request.id}:approved`,
    });
    return;
  }

  if (request.status === "rejected") {
    const cfg = await getMessageConfig("subscription_rejected");
    if (!cfg || !cfg.enabled) return;
    // Build the reason prefix in the SAME language the body will actually render in
    // (English only if the owner kept the English text non-empty) so they can't mix.
    const notes = (request.reviewNotes ?? "").trim();
    const reason = notes
      ? (pickMessageLanguage(cfg, language) === "en" ? `\nReason: ${notes}` : `\nسبب الرفض: ${notes}`)
      : "";
    const { title, body } = resolveText(cfg, language, { subject: context.subjectName, reason });
    await createUserNotification({
      userId: request.studentId,
      type: "subscription_rejected",
      title,
      body,
      tone: normalizeMessageTone(cfg.tone),
      data: { ...subscribeActionData(context, request.reviewNotes), icon: cfg.icon ?? undefined, color: cfg.color ?? undefined },
      dedupeKey: `subscription-request:${request.id}:rejected`,
    });
  }
}

async function notifyPublishedLesson(lessonId: number) {
  const context = await getLessonNavigationContext(lessonId);
  if (!context || !context.lessonIsPublished || context.videoPublishStatus !== "published") return;

  const cfg = await getMessageConfig("new_lesson");
  if (!cfg || !cfg.enabled) return;

  const subscribers = await db
    .select({ studentId: subjectSubscriptionsTable.studentId, language: usersTable.language })
    .from(subjectSubscriptionsTable)
    .innerJoin(usersTable, eq(subjectSubscriptionsTable.studentId, usersTable.id))
    .where(
      and(
        eq(subjectSubscriptionsTable.subjectId, context.subjectId),
        eq(subjectSubscriptionsTable.status, "active"),
        eq(usersTable.status, "active"),
      ),
    );

  if (subscribers.length === 0) return;

  const vars = { lesson: context.lessonTitle, unit: context.unitName, subject: context.subjectName };
  const languageByStudent = new Map(subscribers.map((s) => [s.studentId, s.language]));

  const createdNotifications = await db
    .insert(notificationsTable)
    .values(
      subscribers.map((subscription) => {
        const { title, body } = resolveText(cfg, subscription.language, vars);
        return {
          userId: subscription.studentId,
          type: "new_lesson",
          title,
          body,
          tone: cfg.tone,
          data: notificationData({ ...lessonActionData(context), icon: cfg.icon ?? undefined, color: cfg.color ?? undefined }),
          dedupeKey: `new-lesson:${context.lessonId}:student:${subscription.studentId}`,
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id, userId: notificationsTable.userId });

  await Promise.allSettled(
    createdNotifications.map((notification) => {
      const { title, body } = resolveText(cfg, languageByStudent.get(notification.userId), vars);
      return sendPushNotificationToUser({
        userId: notification.userId,
        title,
        body,
        data: {
          ...lessonActionData(context),
          type: "new_lesson",
          notificationId: notification.id,
          icon: cfg.icon ?? undefined,
          color: cfg.color ?? undefined,
        },
      });
    }),
  );
}

function notificationDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function scheduleResumeLessonNotification(args: {
  studentId: number;
  context: NonNullable<Awaited<ReturnType<typeof getLessonNavigationContext>>>;
  currentSeconds: number;
  durationSeconds: number;
}) {
  const now = new Date();
  const lessonDedupePrefix = `resume-lesson:${args.studentId}:${args.context.lessonId}:`;

  // Always clear any stale future reminder for this lesson (also respects the owner
  // turning the message off — the pending one is removed on the next progress ping).
  await db
    .delete(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, args.studentId),
        eq(notificationsTable.type, "resume_lesson"),
        like(notificationsTable.dedupeKey, `${lessonDedupePrefix}%`),
        isNull(notificationsTable.readAt),
        gt(notificationsTable.availableAt, now),
      ),
    );

  const cfg = await getMessageConfig("resume_lesson");
  if (!cfg || !cfg.enabled) return;

  const durationSeconds = Math.max(0, args.durationSeconds);
  const currentSeconds = Math.max(0, Math.min(args.currentSeconds, durationSeconds > 0 ? durationSeconds : args.currentSeconds));
  const progressRatio = durationSeconds > 0 ? currentSeconds / durationSeconds : 0;
  const isCompleted = durationSeconds > 0 && progressRatio >= 0.9;
  const shouldRemind = currentSeconds >= 60 && durationSeconds > 0 && progressRatio < 0.85 && !isCompleted;

  if (!shouldRemind) return;

  const resumeTitle = String(args.context.videoTitle || args.context.lessonTitle || "").trim();
  const language = await getUserLanguage(args.studentId);
  const { title, body } = resolveText(cfg, language, {
    lesson: args.context.lessonTitle,
    video: resumeTitle,
    time: formatDurationLabel(currentSeconds),
  });

  await upsertUserNotification({
    userId: args.studentId,
    type: "resume_lesson",
    title,
    body,
    tone: cfg.tone,
    data: lessonActionData(args.context, { seekSeconds: currentSeconds, icon: cfg.icon ?? undefined, color: cfg.color ?? undefined }),
    dedupeKey: `${lessonDedupePrefix}${notificationDateKey(now)}`,
    availableAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
  });
}

function getYouTubeId(url: string): string | null {
  // review F-04: restrict the capture to the real YouTube id alphabet and
  // re-validate, so a crafted videoUrl can't smuggle quotes/markup into the id
  // that later lands in the mobile player HTML.
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  const id = match ? match[1] : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
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
  const userId = getSessionUserId(req);
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

// Express middleware form of requireAdmin — used to reject unauthorized callers
// BEFORE the multer upload middleware runs, so no bytes are written to disk first.
async function requireAdminMw(req: any, res: any, next: any) {
  if (await requireAdmin(req, res)) next();
}

// Any authenticated user — gates uploads before multer writes the file to disk.
function requireAuthMw(req: any, res: any, next: any) {
  if (getSessionUserId(req)) return next();
  return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
}

// Append-only audit entry attributing an academic-content action to the admin
// who performed it. Fire-and-forget: a failed audit write must never break the
// underlying content action. This is the ONLY place academic content creation
// gets attributed to an actor — there's no created_by column — so the owner
// dashboard / workload scoring read these rows to count "videos an admin added".
async function logContentAudit(
  req: any,
  actor: { id: number; role: string },
  input: { actionType: string; actionLabel?: string; entityType: string; entityId?: number | null; entityLabel?: string | null },
): Promise<void> {
  try {
    const [snap] = await db
      .select({ name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, actor.id)).limit(1);
    const ipRaw = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "";
    const ip = String(ipRaw).split(",")[0].trim().slice(0, 64) || null;
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 256) || null;
    await db.insert(adminAuditLogTable).values({
      actorUserId: actor.id,
      actorName: snap?.name ?? null,
      actorEmail: snap?.email ?? null,
      actorRole: snap?.role ?? actor.role ?? null,
      actionType: input.actionType,
      actionLabel: input.actionLabel ?? null,
      entityType: input.entityType,
      entityId: input.entityId != null ? String(input.entityId) : null,
      entityLabel: input.entityLabel ?? null,
      status: "success",
      ip, userAgent,
    });
  } catch (err) {
    req.log?.warn?.({ err }, "Content audit log write failed (non-fatal)");
  }
}

import { getSessionUserId } from "../lib/auth";
import { getUserAuth, type CachedUserAuth } from "../lib/user-cache";
import { hasAllSubjectsAccess } from "../lib/feature-access";

// SessionUser now carries the owner-set per-account overrides (feature-access).
type SessionUser = CachedUserAuth;

async function getSessionUser(req: any): Promise<SessionUser | null> {
  const userId = getSessionUserId(req);
  if (!userId) return null;

  // review B-34: short-TTL cached {id, role, status} lookup instead of a DB
  // round-trip on every authenticated request (this gates the hot student paths).
  const user = await getUserAuth(userId);
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

  // Owner always; admins by default (owner-revocable); owner-boosted accounts too.
  if (hasAllSubjectsAccess(user)) return user;

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
  titleEn: string | null;
  description: string;
  descriptionEn: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  segments: NormalizedVideoSegmentInput[];
  hasSegmentsField: boolean;
  duration: number;
  instructor: string;
  instructorEn: string | null;
  videoType: "youtube" | "upload";
  publishStatus: "draft" | "published";
};

type VideoSegmentType = "questions" | "parts" | "topics";

type NormalizedVideoSegmentInput = {
  title: string;
  titleEn: string | null;
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
      throw new ValidationError(`عنوان التقسيمة رقم ${index + 1} مطلوب`);
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
      throw new ValidationError(`وقت التقسيمة رقم ${index + 1} غير صالح`);
    }

    normalized.push({
      title,
      titleEn: toTextOrNull(raw.titleEn),
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
    throw new ValidationError("رابط الفيديو مطلوب");
  }

  const videoType = toText(raw.videoType, "youtube").toLowerCase() === "upload" ? "upload" : "youtube";
  if (videoType === "youtube" && !getYouTubeId(videoUrl)) {
    throw new ValidationError("رابط YouTube غير صالح");
  }

  const publishStatus = toText(raw.publishStatus, defaults.fallbackPublishStatus).toLowerCase() === "draft"
    ? "draft"
    : "published";

  const title = toText(raw.title);
  if (!title) {
    throw new ValidationError("عنوان الفيديو مطلوب ويجب إدخاله يدويًا.");
  }
  const titleEn = toTextOrNull(raw.titleEn);
  const description = toText(raw.description, defaults.fallbackDescription);
  const descriptionEn = toTextOrNull(raw.descriptionEn);
  const instructor = toText(raw.instructor, "غير محدد") || "غير محدد";
  const instructorEn = toTextOrNull(raw.instructorEn);
  const hasSegmentsField = Array.isArray(raw.segments);
  const segments = hasSegmentsField ? normalizeVideoSegments(raw.segments) : [];
  const hintedDuration = Math.max(0, toNumber(raw.duration, 0));
  const detectedDuration = videoType === "youtube"
    ? await detectYouTubeDurationSeconds(videoUrl)
    : await detectUploadDurationSeconds(videoUrl);
  const finalDuration = detectedDuration ?? (hintedDuration > 0 ? hintedDuration : null);
  if (!finalDuration || finalDuration <= 0) {
    throw new ValidationError("تعذر حساب مدة الفيديو تلقائيًا. أعد إدخال رابط/ملف الفيديو وحاول مرة أخرى.");
  }

  return {
    title,
    titleEn,
    description,
    descriptionEn,
    videoUrl,
    thumbnailUrl: toText(raw.thumbnailUrl) || null,
    posterUrl: toText(raw.posterUrl) || null,
    segments,
    hasSegmentsField,
    duration: finalDuration,
    instructor,
    instructorEn,
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
      titleEn: lessonsTable.titleEn,
      description: lessonsTable.description,
      descriptionEn: lessonsTable.descriptionEn,
      videoId: lessonsTable.videoId,
      orderIndex: lessonsTable.orderIndex,
      isPublished: lessonsTable.isPublished,
      createdAt: lessonsTable.createdAt,
      video: {
        id: videosTable.id,
        title: videosTable.title,
        titleEn: videosTable.titleEn,
        description: videosTable.description,
        descriptionEn: videosTable.descriptionEn,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        instructorEn: videosTable.instructorEn,
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
      titleEn: videoSegmentsTable.titleEn,
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

router.post("/academic/subscription-requests/upload-code-image", requireAuthMw, uploadCodeImageFile.single("image"), async (req, res) => {
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

    await notifySubscriptionRequestCreated({
      id: created.id,
      studentId: created.studentId,
      subjectId: created.subjectId,
    }).catch((err) => {
      req.log.warn({ err, requestId: created.id }, "Failed to create pending subscription notification");
    });

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
          nameEn: academicYearsTable.nameEn,
        },
        subject: {
          id: subjectsTable.id,
          name: subjectsTable.name,
          nameEn: subjectsTable.nameEn,
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

// v2 Phase 3 — personalized home feed: the "continue where you left off" card + a smart
// mix of suggestions ("مقترح ليك"). EVERYTHING is scoped to the student's ACTIVE
// subscriptions (nothing locked/foreign is surfaced). Progress uses REAL watch coverage
// (dragging the scrubber never counts), same as watch-history.
router.get("/me/home-feed", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    // Owner-boosted accounts (all-subjects access) get the feed across EVERY
    // published subject; everyone else stays scoped to their active subscriptions.
    const subjectIds = hasAllSubjectsAccess(student)
      ? (
          await db
            .select({ subjectId: subjectsTable.id })
            .from(subjectsTable)
            .where(eq(subjectsTable.isPublished, true))
        ).map((s) => s.subjectId)
      : [
          ...new Set(
            (
              await db
                .select({ subjectId: subjectSubscriptionsTable.subjectId })
                .from(subjectSubscriptionsTable)
                .where(and(eq(subjectSubscriptionsTable.studentId, student.id), eq(subjectSubscriptionsTable.status, "active")))
            ).map((s) => s.subjectId),
          ),
        ];
    if (subjectIds.length === 0) {
      res.json({ continueLesson: null, startJourney: null, suggestions: [] });
      return;
    }

    // Every watchable lesson (published lesson + unit + subject + year + video) in the
    // student's subscribed subjects, with their progress. Ordered by the natural
    // curriculum sequence so "next lesson in the chapter" is just the next row.
    const rows = await db
      .select({
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        subjectNameEn: subjectsTable.nameEn,
        unitLabel: subjectsTable.unitLabel,
        yearId: academicYearsTable.id,
        yearName: academicYearsTable.name,
        yearNameEn: academicYearsTable.nameEn,
        unitId: unitsTable.id,
        unitName: unitsTable.name,
        unitNameEn: unitsTable.nameEn,
        lessonId: lessonsTable.id,
        lessonTitle: lessonsTable.title,
        lessonTitleEn: lessonsTable.titleEn,
        lessonCreatedAt: lessonsTable.createdAt,
        videoId: videosTable.id,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        instructor: videosTable.instructor,
        videoDuration: videosTable.duration,
        currentSeconds: lessonWatchProgressTable.currentSeconds,
        watchedRealSeconds: lessonWatchProgressTable.watchedSeconds,
        progressDuration: lessonWatchProgressTable.durationSeconds,
        completed: lessonWatchProgressTable.completed,
        lastWatchedAt: lessonWatchProgressTable.lastWatchedAt,
      })
      .from(lessonsTable)
      .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), eq(unitsTable.isPublished, true)))
      .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
      .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
      .innerJoin(videosTable, and(eq(lessonsTable.videoId, videosTable.id), eq(videosTable.publishStatus, "published")))
      .leftJoin(
        lessonWatchProgressTable,
        and(eq(lessonWatchProgressTable.lessonId, lessonsTable.id), eq(lessonWatchProgressTable.studentId, student.id)),
      )
      .where(and(inArray(unitsTable.subjectId, subjectIds), eq(lessonsTable.isPublished, true)))
      .orderBy(asc(subjectsTable.orderIndex), asc(unitsTable.orderIndex), asc(lessonsTable.orderIndex), asc(lessonsTable.id));

    const items = rows.map((r) => {
      const duration = Math.max(toSeconds(r.videoDuration, 0), toSeconds(r.progressDuration, 0));
      const cap = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
      const currentSeconds = Math.min(toSeconds(r.currentSeconds, 0), cap);
      const realWatched = Math.min(toSeconds(r.watchedRealSeconds, 0), cap);
      const progressRatio = duration > 0 ? Math.min(1, realWatched / duration) : 0;
      // Real-coverage only (consistent with watch-history): seeking / merely opening a
      // video doesn't mark it completed or "in progress".
      const completed = duration > 0 && progressRatio >= 0.9;
      const started = realWatched > 0;
      const lastWatchedMs = r.lastWatchedAt ? r.lastWatchedAt.getTime() : 0;
      const createdMs = r.lessonCreatedAt ? r.lessonCreatedAt.getTime() : 0;
      return { r, duration, currentSeconds, progressRatio, completed, started, inProgress: started && !completed, lastWatchedMs, createdMs };
    });

    type Item = (typeof items)[number];
    const toCard = (it: Item) => ({
      lessonId: it.r.lessonId,
      lessonTitle: it.r.lessonTitle,
      lessonTitleEn: it.r.lessonTitleEn,
      unitId: it.r.unitId,
      unitName: it.r.unitName,
      unitNameEn: it.r.unitNameEn,
      unitLabel: it.r.unitLabel,
      subjectId: it.r.subjectId,
      subjectName: it.r.subjectName,
      subjectNameEn: it.r.subjectNameEn,
      yearId: it.r.yearId,
      yearName: it.r.yearName,
      yearNameEn: it.r.yearNameEn,
      videoId: it.r.videoId,
      thumbnailUrl: it.r.thumbnailUrl,
      posterUrl: it.r.posterUrl,
      instructor: it.r.instructor,
      durationSeconds: it.duration,
      currentSeconds: it.currentSeconds,
      progressRatio: it.progressRatio,
    });

    const anyWatched = items.some((it) => it.started || it.completed);
    const inProgress = items.filter((it) => it.inProgress).sort((a, b) => b.lastWatchedMs - a.lastWatchedMs);

    // "next up" = first not-started, not-completed lesson in each unit the student has
    // already touched (in curriculum order). Drives both the continue card (when nothing
    // is mid-watch) and the "next" suggestions.
    const touchedUnits = new Set(items.filter((it) => it.started || it.completed).map((it) => it.r.unitId));
    const seenUnit = new Set<number>();
    const nextUp: Item[] = [];
    for (const it of items) {
      if (!touchedUnits.has(it.r.unitId) || it.started || it.completed || seenUnit.has(it.r.unitId)) continue;
      seenUnit.add(it.r.unitId);
      nextUp.push(it);
    }

    // Continue card: most-recent in-progress lesson; else (finished it / none mid-watch)
    // the next lesson to do in a chapter they've started; else null (brand new → journey).
    let continueItem: Item | null = inProgress[0] ?? null;
    if (!continueItem && anyWatched) continueItem = nextUp[0] ?? null;
    const startJourney = !anyWatched ? items[0] ?? null : null;

    // Suggestions — smart mix, deduped, excluding the continue card:
    //   1) other lessons still in progress, 2) the next lesson in chapters they started,
    //   3) the newest lessons in their subjects they haven't started.
    const used = new Set<number>();
    if (continueItem) used.add(continueItem.r.lessonId);
    if (startJourney) used.add(startJourney.r.lessonId);
    const suggestions: Array<ReturnType<typeof toCard> & { reason: string }> = [];
    const add = (it: Item | undefined, reason: string) => {
      if (!it || used.has(it.r.lessonId) || suggestions.length >= 8) return;
      used.add(it.r.lessonId);
      suggestions.push({ ...toCard(it), reason });
    };
    for (const it of inProgress) add(it, "in_progress");
    for (const it of nextUp) add(it, "next");
    const newest = items.filter((it) => !it.started && !it.completed).sort((a, b) => b.createdMs - a.createdMs);
    for (const it of newest) add(it, "new");

    res.json({
      continueLesson: continueItem ? toCard(continueItem) : null,
      startJourney: startJourney ? toCard(startJourney) : null,
      suggestions,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build home feed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/watch-history/me", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const subscriptions = await db
      .select({
        id: subjectSubscriptionsTable.id,
        status: subjectSubscriptionsTable.status,
        source: subjectSubscriptionsTable.source,
        createdAt: subjectSubscriptionsTable.createdAt,
        updatedAt: subjectSubscriptionsTable.updatedAt,
        year: {
          id: academicYearsTable.id,
          name: academicYearsTable.name,
          nameEn: academicYearsTable.nameEn,
        },
        subject: {
          id: subjectsTable.id,
          name: subjectsTable.name,
          nameEn: subjectsTable.nameEn,
          icon: subjectsTable.icon,
          description: subjectsTable.description,
          descriptionEn: subjectsTable.descriptionEn,
          unitLabel: subjectsTable.unitLabel,
        },
      })
      .from(subjectSubscriptionsTable)
      .innerJoin(academicYearsTable, eq(subjectSubscriptionsTable.yearId, academicYearsTable.id))
      .innerJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
      .where(and(eq(subjectSubscriptionsTable.studentId, student.id), eq(subjectSubscriptionsTable.status, "active")))
      .orderBy(desc(subjectSubscriptionsTable.updatedAt), desc(subjectSubscriptionsTable.id));

    if (subscriptions.length === 0) {
      res.json({
        subjects: [],
        totals: {
          subscriptionCount: 0,
          lessonCount: 0,
          watchedLessons: 0,
          completedLessons: 0,
          totalSeconds: 0,
          watchedSeconds: 0,
          progressRatio: 0,
        },
      });
      return;
    }

    const subjectIds = subscriptions.map((subscription) => subscription.subject.id);
    const lessonRows = await db
      .select({
        subjectId: subjectsTable.id,
        unitId: unitsTable.id,
        unitName: unitsTable.name,
        unitNameEn: unitsTable.nameEn,
        unitOrderIndex: unitsTable.orderIndex,
        lessonId: lessonsTable.id,
        lessonTitle: lessonsTable.title,
        lessonTitleEn: lessonsTable.titleEn,
        lessonDescription: lessonsTable.description,
        lessonDescriptionEn: lessonsTable.descriptionEn,
        lessonOrderIndex: lessonsTable.orderIndex,
        videoId: videosTable.id,
        videoTitle: videosTable.title,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        videoDurationSeconds: videosTable.duration,
        instructor: videosTable.instructor,
        currentSeconds: lessonWatchProgressTable.currentSeconds,
        watchedRealSeconds: lessonWatchProgressTable.watchedSeconds,
        progressDurationSeconds: lessonWatchProgressTable.durationSeconds,
        completed: lessonWatchProgressTable.completed,
        lastWatchedAt: lessonWatchProgressTable.lastWatchedAt,
      })
      .from(lessonsTable)
      .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), eq(unitsTable.isPublished, true)))
      .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
      .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
      .leftJoin(
        videosTable,
        and(eq(lessonsTable.videoId, videosTable.id), eq(videosTable.publishStatus, "published")),
      )
      .leftJoin(
        lessonWatchProgressTable,
        and(eq(lessonWatchProgressTable.lessonId, lessonsTable.id), eq(lessonWatchProgressTable.studentId, student.id)),
      )
      .where(and(inArray(unitsTable.subjectId, subjectIds), eq(lessonsTable.isPublished, true)))
      .orderBy(asc(subjectsTable.orderIndex), asc(unitsTable.orderIndex), asc(lessonsTable.orderIndex), asc(lessonsTable.id));

    type WatchLesson = {
      id: number;
      title: string;
      titleEn: string | null;
      description: string;
      descriptionEn: string | null;
      unitId: number;
      unitName: string;
      unitNameEn: string | null;
      videoId: number | null;
      videoTitle: string | null;
      thumbnailUrl: string | null;
      posterUrl: string | null;
      instructor: string | null;
      durationSeconds: number;
      currentSeconds: number;
      progressRatio: number;
      completed: boolean;
      lastWatchedAt: Date | null;
    };
    type WatchUnit = {
      id: number;
      name: string;
      nameEn: string | null;
      orderIndex: number;
      lessonCount: number;
      watchedLessons: number;
      completedLessons: number;
      totalSeconds: number;
      watchedSeconds: number;
      progressRatio: number;
      lessons: WatchLesson[];
    };
    type WatchSubject = {
      subscriptionId: number;
      status: string;
      source: string;
      createdAt: Date;
      updatedAt: Date;
      year: { id: number; name: string; nameEn: string | null };
      subject: { id: number; name: string; nameEn: string | null; icon: string; description: string; descriptionEn: string | null; unitLabel: string };
      lessonCount: number;
      watchedLessons: number;
      completedLessons: number;
      totalSeconds: number;
      watchedSeconds: number;
      progressRatio: number;
      lastWatchedAt: Date | null;
      units: Map<number, WatchUnit>;
      recentLessons: WatchLesson[];
    };

    const subjectMap = new Map<number, WatchSubject>();
    for (const subscription of subscriptions) {
      subjectMap.set(subscription.subject.id, {
        subscriptionId: subscription.id,
        status: subscription.status,
        source: subscription.source,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        year: subscription.year,
        subject: subscription.subject,
        lessonCount: 0,
        watchedLessons: 0,
        completedLessons: 0,
        totalSeconds: 0,
        watchedSeconds: 0,
        progressRatio: 0,
        lastWatchedAt: null,
        units: new Map<number, WatchUnit>(),
        recentLessons: [],
      });
    }

    for (const row of lessonRows) {
      const subject = subjectMap.get(row.subjectId);
      if (!subject) continue;

      const durationSeconds = Math.max(
        toSeconds(row.videoDurationSeconds, 0),
        toSeconds(row.progressDurationSeconds, 0),
      );
      const cap = durationSeconds > 0 ? durationSeconds : Number.MAX_SAFE_INTEGER;
      // currentSeconds = furthest seek position (kept only for "resume where you left off").
      const currentSeconds = Math.min(toSeconds(row.currentSeconds, 0), cap);
      // realWatchedSeconds = distinct seconds actually PLAYED (seeking excluded). ALL the
      // "how much did they watch / progress / completed" numbers use this, so scrubbing to
      // the end never inflates the watch history.
      const realWatchedSeconds = Math.min(toSeconds(row.watchedRealSeconds, 0), cap);
      const progressRatio = durationSeconds > 0 ? Math.min(1, realWatchedSeconds / durationSeconds) : 0;
      // Completed + watched are derived PURELY from real coverage — NOT the stored
      // `completed` flag (which older/seek-based data can set with 0 real seconds) and NOT
      // `lastWatchedAt` (opening a video ≠ watching it). So "2 مكتمل / 1د استمعت" can't happen.
      const completed = durationSeconds > 0 && progressRatio >= 0.9;
      const wasWatched = realWatchedSeconds > 0;
      const lesson: WatchLesson = {
        id: row.lessonId,
        title: row.lessonTitle,
        titleEn: row.lessonTitleEn,
        description: row.lessonDescription,
        descriptionEn: row.lessonDescriptionEn,
        unitId: row.unitId,
        unitName: row.unitName,
        unitNameEn: row.unitNameEn,
        videoId: row.videoId,
        videoTitle: row.videoTitle,
        thumbnailUrl: row.thumbnailUrl,
        posterUrl: row.posterUrl,
        instructor: row.instructor,
        durationSeconds,
        currentSeconds,
        progressRatio,
        completed,
        lastWatchedAt: row.lastWatchedAt,
      };

      let unit = subject.units.get(row.unitId);
      if (!unit) {
        unit = {
          id: row.unitId,
          name: row.unitName,
          nameEn: row.unitNameEn,
          orderIndex: row.unitOrderIndex,
          lessonCount: 0,
          watchedLessons: 0,
          completedLessons: 0,
          totalSeconds: 0,
          watchedSeconds: 0,
          progressRatio: 0,
          lessons: [],
        };
        subject.units.set(row.unitId, unit);
      }

      unit.lessonCount += 1;
      unit.totalSeconds += durationSeconds;
      unit.watchedSeconds += realWatchedSeconds;
      if (wasWatched) unit.watchedLessons += 1;
      if (completed) unit.completedLessons += 1;
      unit.lessons.push(lesson);

      subject.lessonCount += 1;
      subject.totalSeconds += durationSeconds;
      subject.watchedSeconds += realWatchedSeconds;
      if (wasWatched) {
        subject.watchedLessons += 1;
        subject.recentLessons.push(lesson);
      }
      if (completed) subject.completedLessons += 1;
      if (row.lastWatchedAt && (!subject.lastWatchedAt || row.lastWatchedAt > subject.lastWatchedAt)) {
        subject.lastWatchedAt = row.lastWatchedAt;
      }
    }

    const subjects = Array.from(subjectMap.values()).map((subject) => {
      const units = Array.from(subject.units.values()).map((unit) => ({
        ...unit,
        progressRatio: unit.totalSeconds > 0 ? Math.min(1, unit.watchedSeconds / unit.totalSeconds) : 0,
      }));
      const recentLessons = subject.recentLessons
        .sort((a, b) => new Date(b.lastWatchedAt ?? 0).getTime() - new Date(a.lastWatchedAt ?? 0).getTime())
        .slice(0, 6);

      return {
        ...subject,
        progressRatio: subject.totalSeconds > 0 ? Math.min(1, subject.watchedSeconds / subject.totalSeconds) : 0,
        units,
        recentLessons,
      };
    });

    const totals = subjects.reduce(
      (acc, subject) => {
        acc.lessonCount += subject.lessonCount;
        acc.watchedLessons += subject.watchedLessons;
        acc.completedLessons += subject.completedLessons;
        acc.totalSeconds += subject.totalSeconds;
        acc.watchedSeconds += subject.watchedSeconds;
        return acc;
      },
      {
        subscriptionCount: subjects.length,
        lessonCount: 0,
        watchedLessons: 0,
        completedLessons: 0,
        totalSeconds: 0,
        watchedSeconds: 0,
        progressRatio: 0,
      },
    );
    totals.progressRatio = totals.totalSeconds > 0 ? Math.min(1, totals.watchedSeconds / totals.totalSeconds) : 0;

    res.json({ subjects, totals });
  } catch (err) {
    req.log.error({ err }, "Load student watch history error");
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

      if (!requestRow) return { kind: "not_found" as const };

      // review B-50: only pending requests can be reviewed — guard against a
      // double review (idempotent) so an approve/reject can't run twice.
      if (requestRow.status !== "pending") return { kind: "already_reviewed" as const };

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

      return updated ? { kind: "ok" as const, request: updated } : { kind: "not_found" as const };
    });

    if (updatedRequest.kind === "not_found") return res.status(404).json({ error: "الطلب غير موجود" });
    // review B-50: surface a conflict (not a silent re-review) when already handled.
    if (updatedRequest.kind === "already_reviewed") {
      return res.status(409).json({ error: "تم مراجعة هذا الطلب من قبل" });
    }

    const reviewedRequest = updatedRequest.request;
    await notifySubscriptionReviewed({
      id: reviewedRequest.id,
      studentId: reviewedRequest.studentId,
      subjectId: reviewedRequest.subjectId,
      status: reviewedRequest.status,
      reviewNotes: reviewedRequest.reviewNotes,
    }).catch((err) => {
      req.log.warn({ err, requestId: reviewedRequest.id }, "Failed to create reviewed subscription notification");
    });
    res.json(reviewedRequest);
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

    // Owner-boosted student accounts see every subject unlocked («مشترك») without
    // any subscription rows — mirrors the server-side paywall bypass exactly.
    const boosted = hasAllSubjectsAccess(user);

    const withAccessState = subjects.map((subject) => {
      const subscription = latestSubscriptionBySubject.get(subject.id);
      const latestRequest = latestRequestBySubject.get(subject.id);

      let accessStatus: "none" | "pending" | "approved" | "rejected" = "none";
      let isLocked = true;
      let canRequestSubscription = true;

      if (boosted) {
        accessStatus = "approved";
        isLocked = false;
        canRequestSubscription = false;
      } else if (subscription?.status === "active") {
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
        nameEn: unitsTable.nameEn,
        description: unitsTable.description,
        descriptionEn: unitsTable.descriptionEn,
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
        titleEn: lessonsTable.titleEn,
        description: lessonsTable.description,
        descriptionEn: lessonsTable.descriptionEn,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          titleEn: videosTable.titleEn,
          description: videosTable.description,
          descriptionEn: videosTable.descriptionEn,
          subject: videosTable.subject,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          posterUrl: videosTable.posterUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
          instructorEn: videosTable.instructorEn,
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

router.post("/academic/lessons/:lessonId/progress", async (req, res) => {
  try {
    const student = await requireStudent(req, res);
    if (!student) return;

    const lessonId = parsePositiveInt(req.params.lessonId);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    const lesson = await getLessonWithVideo(lessonId, true);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    if (!(await requireStudentSubjectAccess(req, res, lesson.subjectId))) return;

    const fallbackDuration = toSeconds(lesson.video?.duration, 0);
    const durationSeconds = toSeconds(req.body?.durationSeconds, fallbackDuration);
    const durationCap = durationSeconds > 0 ? durationSeconds : Number.MAX_SAFE_INTEGER;
    const currentSeconds = Math.min(toSeconds(req.body?.currentSeconds, 0), durationCap);
    // REAL watched coverage (distinct seconds actually played, seeks excluded) —
    // computed on the client, capped at the duration here and kept monotonic below.
    // Drives the quiz watch-gate; scrubbing to the end can't inflate it.
    const watchedSeconds = Math.min(Math.max(toSeconds(req.body?.watchedSeconds, 0), 0), durationCap);
    // Completion is based on REAL watched coverage, never the seek position — a student
    // can't skip/scrub to the end to "finish" a lesson. 90% actually played = completed.
    const completed = durationSeconds > 0 && watchedSeconds / durationSeconds >= 0.9;
    const now = new Date();

    // Read the prior row first (before the monotonic upsert) so the gamification engine
    // can credit only the NEW *real-watched* seconds since the last ping and detect the
    // not-completed → completed transition (to award the lesson bonus once).
    const [priorProgress] = await db
      .select({
        watchedSeconds: lessonWatchProgressTable.watchedSeconds,
        completed: lessonWatchProgressTable.completed,
      })
      .from(lessonWatchProgressTable)
      .where(and(eq(lessonWatchProgressTable.studentId, student.id), eq(lessonWatchProgressTable.lessonId, lessonId)))
      .limit(1);
    // Points credit only the NEW real-watched seconds since the last ping (never negative,
    // never from seeking) — so watch-points reflect genuine viewing time.
    const watchedDeltaSeconds = Math.max(0, watchedSeconds - (priorProgress?.watchedSeconds ?? 0));
    const justCompletedLesson = completed && !(priorProgress?.completed ?? false);

    await db
      .insert(lessonWatchProgressTable)
      .values({
        studentId: student.id,
        lessonId,
        currentSeconds,
        durationSeconds,
        watchedSeconds,
        completed,
        lastWatchedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonWatchProgressTable.studentId, lessonWatchProgressTable.lessonId],
        // review B-17: keep progress monotonic — never let an out-of-order /
        // smaller report rewind currentSeconds, watchedSeconds, or un-complete a lesson.
        set: {
          currentSeconds: sql`greatest(${lessonWatchProgressTable.currentSeconds}, ${currentSeconds})`,
          watchedSeconds: sql`greatest(${lessonWatchProgressTable.watchedSeconds}, ${watchedSeconds})`,
          durationSeconds,
          completed: sql`${lessonWatchProgressTable.completed} OR ${completed}`,
          lastWatchedAt: now,
          updatedAt: now,
        },
      });

    res.json({
      success: true,
      currentSeconds,
      durationSeconds,
      watchedSeconds,
      completed,
    });

    // review B-05: keep the hot path lean — resolve the navigation context and
    // schedule the resume reminder AFTER responding, fire-and-forget so neither
    // the extra read nor the notification write blocks the student's request.
    void (async () => {
      const context = await getLessonNavigationContext(lessonId);
      if (!context) return;
      await scheduleResumeLessonNotification({
        studentId: student.id,
        context,
        currentSeconds,
        durationSeconds,
      });
    })().catch((err) => {
      req.log.warn({ err, lessonId }, "Failed to schedule resume-lesson notification");
    });

    // Gamification (v2 Phase 1): award points, advance the daily streak, tick the
    // daily-goal ring, and fire any triggered auto-messages (goal congrats / points
    // milestone). Fire-and-forget — must never block or fail the student's write.
    void handleLessonActivity({
      userId: student.id,
      watchedDeltaSeconds,
      justCompletedLesson,
      lessonId,
    }).catch((err) => {
      req.log.warn({ err, lessonId }, "Failed to record gamification activity");
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save lesson progress");
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

    if (!hasAllSubjectsAccess(user)) {
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
      // review B-15: collapse concurrent misses for the same file into a single
      // yt-dlp/ffmpeg run; later requests await the in-flight promise.
      const generated = await generateSegmentThumbnailOnce(absoluteFilePath, async () => {
        if (fs.existsSync(absoluteFilePath)) return true;
        if (segment.videoType === "upload") {
          const inputPath = resolveUploadVideoAbsolutePath(segment.videoUrl);
          if (inputPath && fs.existsSync(inputPath)) {
            return generateUploadSegmentThumbnail(inputPath, segment.startSeconds, absoluteFilePath);
          }
          return false;
        }
        return generateYouTubeSegmentThumbnail(segment.videoUrl, segment.startSeconds, absoluteFilePath);
      });

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

router.post("/admin/academic/media/upload-video", requireAdminMw, uploadVideoFile.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No video file provided" });

    const url = `/api/uploads/videos/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Upload lesson video error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/media/upload-thumbnail", requireAdminMw, uploadThumbnailFile.single("thumbnail"), async (req, res) => {
  try {
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
    const nameEn = toTextOrNull(req.body?.nameEn);
    const description = toText(req.body?.description);
    const descriptionEn = toTextOrNull(req.body?.descriptionEn);
    const bilingualError = bilingualCreateError({ ar: name, en: nameEn, arDesc: description, enDesc: descriptionEn, primaryLabel: "اسم السنة" });
    if (bilingualError) return res.status(400).json({ error: bilingualError });

    const [created] = await db
      .insert(academicYearsTable)
      .values({
        name,
        nameEn,
        description,
        descriptionEn,
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
    if (req.body?.nameEn !== undefined) updateData.nameEn = toTextOrNull(req.body.nameEn);
    if (req.body?.description !== undefined) updateData.description = toText(req.body.description);
    if (req.body?.descriptionEn !== undefined) updateData.descriptionEn = toTextOrNull(req.body.descriptionEn);
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

    // review B-27: cap the batch so a malicious/huge payload can't fan out into
    // an unbounded number of concurrent UPDATEs.
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 500);
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
    const nameEn = toTextOrNull(req.body?.nameEn);
    const description = toText(req.body?.description);
    const descriptionEn = toTextOrNull(req.body?.descriptionEn);
    const bilingualError = bilingualCreateError({ ar: name, en: nameEn, arDesc: description, enDesc: descriptionEn, primaryLabel: "اسم المادة" });
    if (bilingualError) return res.status(400).json({ error: bilingualError });

    const [created] = await db
      .insert(subjectsTable)
      .values({
        yearId,
        name,
        nameEn,
        icon: toText(req.body?.icon, "📚") || "📚",
        description,
        descriptionEn,
        unitLabel: normalizeAcademicUnitLabel(req.body?.unitLabel),
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
    if (req.body?.nameEn !== undefined) updateData.nameEn = toTextOrNull(req.body.nameEn);
    if (req.body?.icon !== undefined) updateData.icon = toText(req.body.icon, "📚") || "📚";
    if (req.body?.description !== undefined) updateData.description = toText(req.body.description);
    if (req.body?.descriptionEn !== undefined) updateData.descriptionEn = toTextOrNull(req.body.descriptionEn);
    if (req.body?.unitLabel !== undefined) updateData.unitLabel = normalizeAcademicUnitLabel(req.body.unitLabel);
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

    // review B-27: cap the batch so a malicious/huge payload can't fan out into
    // an unbounded number of concurrent UPDATEs.
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 500);
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
    const nameEn = toTextOrNull(req.body?.nameEn);
    const description = toText(req.body?.description);
    const descriptionEn = toTextOrNull(req.body?.descriptionEn);
    const bilingualError = bilingualCreateError({ ar: name, en: nameEn, arDesc: description, enDesc: descriptionEn, primaryLabel: "اسم الوحدة" });
    if (bilingualError) return res.status(400).json({ error: bilingualError });

    const [created] = await db
      .insert(unitsTable)
      .values({
        subjectId,
        name,
        nameEn,
        description,
        descriptionEn,
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
    if (req.body?.nameEn !== undefined) updateData.nameEn = toTextOrNull(req.body.nameEn);
    if (req.body?.description !== undefined) updateData.description = toText(req.body.description);
    if (req.body?.descriptionEn !== undefined) updateData.descriptionEn = toTextOrNull(req.body.descriptionEn);
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

    // review B-27: cap the batch so a malicious/huge payload can't fan out into
    // an unbounded number of concurrent UPDATEs.
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 500);
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
        titleEn: lessonsTable.titleEn,
        description: lessonsTable.description,
        descriptionEn: lessonsTable.descriptionEn,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          titleEn: videosTable.titleEn,
          description: videosTable.description,
          descriptionEn: videosTable.descriptionEn,
          subject: videosTable.subject,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          posterUrl: videosTable.posterUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
          instructorEn: videosTable.instructorEn,
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
      .filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0);

    if (videoIds.length === 0) {
      return res.json(lessons);
    }

    const segments = await db
      .select({
        id: videoSegmentsTable.id,
        videoId: videoSegmentsTable.videoId,
        title: videoSegmentsTable.title,
        titleEn: videoSegmentsTable.titleEn,
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

// Full nested tree for one year (subjects → units → lessons+video+segments) in a
// single request. Powers the grid/tree view of the academic dashboard so it can
// render the whole year at once without an N+1 waterfall of per-parent calls.
// Constant number of queries (subjects, units, lessons, segments) regardless of
// tree size; mirrors the exact shapes of the per-parent endpoints above.
router.get("/admin/academic/years/:yearId/tree", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const yearId = parsePositiveInt(req.params.yearId);
    if (!yearId) return res.status(400).json({ error: "معرف السنة غير صالح" });

    const subjects = await db
      .select()
      .from(subjectsTable)
      .where(eq(subjectsTable.yearId, yearId))
      .orderBy(asc(subjectsTable.orderIndex), asc(subjectsTable.id));

    const subjectIds = subjects.map((subject) => subject.id);

    const units = subjectIds.length
      ? await db
          .select()
          .from(unitsTable)
          .where(inArray(unitsTable.subjectId, subjectIds))
          .orderBy(asc(unitsTable.orderIndex), asc(unitsTable.id))
      : [];

    const unitIds = units.map((unit) => unit.id);

    const lessons = unitIds.length
      ? await db
          .select({
            id: lessonsTable.id,
            unitId: lessonsTable.unitId,
            title: lessonsTable.title,
            titleEn: lessonsTable.titleEn,
            description: lessonsTable.description,
            descriptionEn: lessonsTable.descriptionEn,
            videoId: lessonsTable.videoId,
            orderIndex: lessonsTable.orderIndex,
            isPublished: lessonsTable.isPublished,
            createdAt: lessonsTable.createdAt,
            video: {
              id: videosTable.id,
              title: videosTable.title,
              titleEn: videosTable.titleEn,
              description: videosTable.description,
              descriptionEn: videosTable.descriptionEn,
              subject: videosTable.subject,
              videoUrl: videosTable.videoUrl,
              thumbnailUrl: videosTable.thumbnailUrl,
              posterUrl: videosTable.posterUrl,
              duration: videosTable.duration,
              instructor: videosTable.instructor,
              instructorEn: videosTable.instructorEn,
              videoType: videosTable.videoType,
              publishStatus: videosTable.publishStatus,
            },
          })
          .from(lessonsTable)
          .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
          .where(inArray(lessonsTable.unitId, unitIds))
          .orderBy(asc(lessonsTable.orderIndex), asc(lessonsTable.id))
      : [];

    const videoIds = lessons
      .map((lesson) => lesson.video?.id)
      .filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0);

    const segments = videoIds.length
      ? await db
          .select({
            id: videoSegmentsTable.id,
            videoId: videoSegmentsTable.videoId,
            title: videoSegmentsTable.title,
            titleEn: videoSegmentsTable.titleEn,
            startSeconds: videoSegmentsTable.startSeconds,
            segmentType: videoSegmentsTable.segmentType,
            orderIndex: videoSegmentsTable.orderIndex,
          })
          .from(videoSegmentsTable)
          .where(inArray(videoSegmentsTable.videoId, videoIds))
          .orderBy(asc(videoSegmentsTable.orderIndex), asc(videoSegmentsTable.startSeconds), asc(videoSegmentsTable.id))
      : [];

    const videoUrlById = new Map<number, string>();
    lessons.forEach((lesson) => {
      const videoId = Number(lesson.video?.id ?? 0);
      const videoUrl = lesson.video?.videoUrl;
      if (Number.isFinite(videoId) && videoId > 0 && typeof videoUrl === "string" && videoUrl.trim()) {
        videoUrlById.set(videoId, videoUrl.trim());
      }
    });

    const segmentsByVideoId = new Map<number, Array<(typeof segments)[number] & { thumbnailUrl: string | null }>>();
    segments.forEach((segment) => {
      const withThumb = {
        ...segment,
        thumbnailUrl: buildSegmentThumbnailEndpoint(
          segment.videoId,
          segment.id,
          segment.startSeconds,
          videoUrlById.get(segment.videoId),
        ),
      };
      const list = segmentsByVideoId.get(segment.videoId) ?? [];
      list.push(withThumb);
      segmentsByVideoId.set(segment.videoId, list);
    });

    const lessonsByUnit = new Map<number, typeof lessons>();
    lessons.forEach((lesson) => {
      const withSegments = lesson.video?.id
        ? { ...lesson, video: { ...lesson.video, segments: segmentsByVideoId.get(lesson.video.id) ?? [] } }
        : lesson;
      const list = lessonsByUnit.get(lesson.unitId) ?? [];
      list.push(withSegments as (typeof lessons)[number]);
      lessonsByUnit.set(lesson.unitId, list);
    });

    // v2 Phase 2 — chapter exams, so the grid can show an exam card beside each unit.
    const exams = unitIds.length
      ? await db
          .select({
            unitId: unitExamsTable.unitId,
            reviewPublished: unitExamsTable.reviewPublished,
            adaptivePublished: unitExamsTable.adaptivePublished,
          })
          .from(unitExamsTable)
          .where(inArray(unitExamsTable.unitId, unitIds))
      : [];
    const examByUnit = new Map(exams.map((e) => [e.unitId, e]));

    const unitsBySubject = new Map<number, Array<(typeof units)[number] & { lessons: unknown[] }>>();
    units.forEach((unit) => {
      const exam = examByUnit.get(unit.id) ?? null;
      const withLessons = {
        ...unit,
        lessons: lessonsByUnit.get(unit.id) ?? [],
        exam: exam ? { reviewPublished: exam.reviewPublished, adaptivePublished: exam.adaptivePublished } : null,
      };
      const list = unitsBySubject.get(unit.subjectId) ?? [];
      list.push(withLessons);
      unitsBySubject.set(unit.subjectId, list);
    });

    const tree = subjects.map((subject) => ({
      ...subject,
      units: unitsBySubject.get(subject.id) ?? [],
    }));

    res.json({ subjects: tree });
  } catch (err) {
    req.log.error({ err }, "Failed to build academic year tree (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/units/:unitId/lessons", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;

    const unitId = parsePositiveInt(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الوحدة غير صالح" });

    const title = toText(req.body?.title);
    if (!title) return res.status(400).json({ error: "عنوان الدرس مطلوب" });
    const titleEn = toTextOrNull(req.body?.titleEn);

    const unitContext = await getUnitContext(unitId);
    if (!unitContext) return res.status(404).json({ error: "الوحدة غير موجودة" });

    const description = toText(req.body?.description);
    const descriptionEn = toTextOrNull(req.body?.descriptionEn);
    const bilingualError = bilingualCreateError({ ar: title, en: titleEn, arDesc: description, enDesc: descriptionEn, primaryLabel: "عنوان الدرس" });
    if (bilingualError) return res.status(400).json({ error: bilingualError });
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
            titleEn: normalizedVideo.titleEn,
            description: normalizedVideo.description,
            descriptionEn: normalizedVideo.descriptionEn,
            subject: unitContext.subjectName,
            videoUrl: normalizedVideo.videoUrl,
            thumbnailUrl: normalizedVideo.thumbnailUrl,
            posterUrl: normalizedVideo.posterUrl,
            duration: normalizedVideo.duration,
            instructor: normalizedVideo.instructor,
            instructorEn: normalizedVideo.instructorEn,
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
              titleEn: segment.titleEn,
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
          titleEn,
          description,
          descriptionEn,
          videoId: createdVideoId,
          orderIndex: toNumber(req.body?.orderIndex, 0),
          isPublished,
        })
        .returning({ id: lessonsTable.id });

      return { id: lesson.id, videoId: createdVideoId };
    });

    // Attribute the new video to the admin who added it (workload/owner stats).
    if (created.videoId) {
      void logContentAudit(req, actor, {
        actionType: "content_create", actionLabel: "أضاف فيديو تعليمي",
        entityType: "video", entityId: created.videoId, entityLabel: normalizedVideo?.title ?? title,
      });
    }

    const lesson = await getLessonWithVideo(created.id, false);
    const segmentSeed = getSegmentThumbnailSeed(lesson?.video);
    if (segmentSeed) {
      void primeVideoSegmentThumbnails(segmentSeed).catch((err) => {
        req.log.warn({ err, lessonId: created.id }, "Segment thumbnail pre-generation failed");
      });
    }
    res.status(201).json(lesson);
    // review B-40: don't block the 201 on the push fan-out; fire-and-forget.
    void notifyPublishedLesson(created.id).catch((err) => {
      req.log.warn({ err, lessonId: created.id }, "Failed to create new lesson notifications");
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create lesson");
    // review B-39: only surface intentional validation messages; never leak
    // arbitrary internal error.message strings.
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/lessons/:id", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;

    const lessonId = parsePositiveInt(req.params.id);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    const [existing] = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        videoId: lessonsTable.videoId,
        isPublished: lessonsTable.isPublished,
      })
      .from(lessonsTable)
      .where(eq(lessonsTable.id, lessonId))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "الدرس غير موجود" });

    const unitContext = await getUnitContext(existing.unitId);
    if (!unitContext) return res.status(404).json({ error: "الوحدة غير موجودة" });

    const title = req.body?.title !== undefined ? toText(req.body.title) : undefined;
    const titleEn = req.body?.titleEn !== undefined ? toTextOrNull(req.body.titleEn) : undefined;
    const description = req.body?.description !== undefined ? toText(req.body.description) : undefined;
    const descriptionEn = req.body?.descriptionEn !== undefined ? toTextOrNull(req.body.descriptionEn) : undefined;
    const clearVideo = toBool(req.body?.clearVideo, false);

    const normalizedVideo = await normalizeVideoPayload(req.body?.video, {
      fallbackDescription: description ?? "",
      fallbackPublishStatus: toBool(req.body?.isPublished, false) ? "published" : "draft",
    });

    let newVideoId: number | null = null;
    const updated = await db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (titleEn !== undefined) updateData.titleEn = titleEn;
      if (description !== undefined) updateData.description = description;
      if (descriptionEn !== undefined) updateData.descriptionEn = descriptionEn;
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
              titleEn: normalizedVideo.titleEn,
              description: normalizedVideo.description,
              descriptionEn: normalizedVideo.descriptionEn,
              subject: unitContext.subjectName,
              videoUrl: normalizedVideo.videoUrl,
              thumbnailUrl: normalizedVideo.thumbnailUrl,
              posterUrl: normalizedVideo.posterUrl,
              duration: normalizedVideo.duration,
              instructor: normalizedVideo.instructor,
              instructorEn: normalizedVideo.instructorEn,
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
                  titleEn: segment.titleEn,
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
          newVideoId = createdVideo.id;

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
    // A brand-new video was attached during this update — attribute it.
    if (newVideoId) {
      void logContentAudit(req, actor, {
        actionType: "content_create", actionLabel: "أضاف فيديو تعليمي",
        entityType: "video", entityId: newVideoId, entityLabel: normalizedVideo?.title ?? null,
      });
    }
    const segmentSeed = getSegmentThumbnailSeed(updated.video);
    if (segmentSeed) {
      void primeVideoSegmentThumbnails(segmentSeed).catch((err) => {
        req.log.warn({ err, lessonId }, "Segment thumbnail pre-generation failed after lesson update");
      });
    }
    res.json(updated);
    // review B-40: don't block the response on the push fan-out; fire-and-forget.
    if (!existing.isPublished && updated.isPublished) {
      void notifyPublishedLesson(lessonId).catch((err) => {
        req.log.warn({ err, lessonId }, "Failed to create new lesson notifications after publish");
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update lesson");
    // review B-39: only surface intentional validation messages; never leak
    // arbitrary internal error.message strings.
    if (err instanceof ValidationError) {
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

    // review B-27: cap the batch so a malicious/huge payload can't fan out into
    // an unbounded number of concurrent UPDATEs.
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 500);
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
        titleEn: videosTable.titleEn,
        description: videosTable.description,
        descriptionEn: videosTable.descriptionEn,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        instructorEn: videosTable.instructorEn,
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
