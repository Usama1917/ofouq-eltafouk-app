import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Award,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GraduationCap,
  Info,
  Layers,
  List,
  Network,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  Upload,
  Video,
  Youtube,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";
import { confirmDiscardIfDirty } from "@/lib/dialog-dismiss";
import QuizManager, { type LocalQuestion, apiQuestionToLocal, localQuestionToPayload } from "@/components/quiz-manager";
import ChapterExamManager from "@/components/chapter-exam-manager";

type Level = "years" | "subjects" | "units" | "lessons";
type AcademicUnitLabel = "unit" | "chapter" | "section";

type Breadcrumb = {
  level: Level;
  label: string;
  yearId?: number;
  subjectId?: number;
  unitId?: number;
  unitLabel?: AcademicUnitLabel;
};

interface AcademicYear {
  id: number;
  name: string;
  nameEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  orderIndex: number;
  isPublished: boolean;
}

interface Subject {
  id: number;
  yearId: number;
  name: string;
  nameEn?: string | null;
  icon: string;
  description: string;
  descriptionEn?: string | null;
  unitLabel?: AcademicUnitLabel;
  orderIndex: number;
  isPublished: boolean;
}

interface Unit {
  id: number;
  subjectId: number;
  name: string;
  nameEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  orderIndex: number;
  isPublished: boolean;
}

interface Lesson {
  id: number;
  unitId: number;
  title: string;
  titleEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  videoId?: number;
  orderIndex: number;
  isPublished: boolean;
  video?: {
    id: number;
    title: string;
    titleEn?: string | null;
    description: string;
    descriptionEn?: string | null;
    videoUrl: string;
    thumbnailUrl?: string;
    posterUrl?: string;
    duration: number;
    instructor: string;
    instructorEn?: string | null;
    videoType: "youtube" | "upload";
    publishStatus: "draft" | "published";
    segments?: {
      id: number;
      title: string;
      titleEn?: string | null;
      startSeconds: number;
      segmentType: "questions" | "parts" | "topics";
      orderIndex: number;
      thumbnailUrl?: string;
    }[];
  } | null;
}

type UploadKind = "video" | "thumbnail";
type VideoSegmentType = "questions" | "parts" | "topics";
type LessonSegmentFormItem = {
  id: string;
  title: string;
  titleEn: string;
  segmentType: VideoSegmentType;
  hours: string;
  minutes: string;
  seconds: string;
};

const SEGMENT_TYPE_OPTIONS: Array<{ value: VideoSegmentType; label: string }> = [
  { value: "parts", label: "أجزاء" },
  { value: "topics", label: "مواضيع" },
  { value: "questions", label: "أسئلة" },
];

const UNIT_LABEL_OPTIONS: Array<{
  value: AcademicUnitLabel;
  optionLabel: string;
  singular: string;
  plural: string;
  createTitle: string;
  namePlaceholder: string;
  emptyMessage: string;
}> = [
  {
    value: "unit",
    optionLabel: "وحدة",
    singular: "الوحدة",
    plural: "الوحدات",
    createTitle: "إضافة وحدة داخل المادة",
    namePlaceholder: "اسم الوحدة",
    emptyMessage: "لا توجد وحدات داخل هذه المادة.",
  },
  {
    value: "chapter",
    optionLabel: "فصل",
    singular: "الفصل",
    plural: "الفصول",
    createTitle: "إضافة فصل داخل المادة",
    namePlaceholder: "اسم الفصل",
    emptyMessage: "لا توجد فصول داخل هذه المادة.",
  },
  {
    value: "section",
    optionLabel: "باب",
    singular: "الباب",
    plural: "الأبواب",
    createTitle: "إضافة باب داخل المادة",
    namePlaceholder: "اسم الباب",
    emptyMessage: "لا توجد أبواب داخل هذه المادة.",
  },
];

function normalizeUnitLabel(value: unknown): AcademicUnitLabel {
  return UNIT_LABEL_OPTIONS.some((option) => option.value === value) ? value as AcademicUnitLabel : "unit";
}

function getUnitLabelCopy(value: unknown) {
  return UNIT_LABEL_OPTIONS.find((option) => option.value === normalizeUnitLabel(value)) ?? UNIT_LABEL_OPTIONS[0];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// localStorage key for the in-progress lesson editor draft (autosave / crash recovery).
const LESSON_DRAFT_KEY = "ofouq:academic:lessonDraft:v1";
const YEAR_ITEM_TONES = [
  {
    top: "bg-blue-500/80",
    iconWrapper: "bg-blue-50 border-blue-200/70 text-blue-600",
  },
  {
    top: "bg-emerald-500/80",
    iconWrapper: "bg-emerald-50 border-emerald-200/70 text-emerald-600",
  },
  {
    top: "bg-amber-500/80",
    iconWrapper: "bg-amber-50 border-amber-200/70 text-amber-600",
  },
  {
    top: "bg-violet-500/80",
    iconWrapper: "bg-violet-50 border-violet-200/70 text-violet-600",
  },
] as const;

function yearItemTone(index: number) {
  return YEAR_ITEM_TONES[index % YEAR_ITEM_TONES.length];
}

function createSegmentRow(): LessonSegmentFormItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    titleEn: "",
    segmentType: "parts",
    hours: "",
    minutes: "",
    seconds: "",
  };
}

// ── Excel import for video segments ─────────────────────────────────────────────
// Flexible header matching (Arabic/English), so non-technical editors can upload a
// simple sheet with: العنوان / Section title (English) / النوع / الوقت.
const SEGMENT_TYPE_BY_KEYWORD: Record<string, VideoSegmentType> = {
  "أجزاء": "parts", "اجزاء": "parts", "جزء": "parts", part: "parts", parts: "parts",
  "مواضيع": "topics", "موضوع": "topics", topic: "topics", topics: "topics",
  "أسئلة": "questions", "اسئلة": "questions", "سؤال": "questions", question: "questions", questions: "questions",
};
const SEG_COL = {
  title: ["العنوان", "عنوان", "العنوان عربي", "العنوان (عربي)", "العنوان بالعربية", "العنوان عربى", "title", "title ar", "اسم", "الاسم"],
  titleEn: ["العنوان بالانجليزية", "العنوان (انجليزي)", "العنوان انجليزي", "section title (english)", "section title", "title en", "titleen", "english", "english title"],
  type: ["النوع", "نوع", "type", "segment type", "الفئة"],
  time: ["الوقت", "الزمن", "التوقيت", "وقت البداية", "البداية", "time", "timestamp", "start", "start time"],
  hours: ["ساعة", "ساعات", "hours", "hour", "h"],
  minutes: ["دقيقة", "دقائق", "minutes", "minute", "min", "m"],
  seconds: ["ثانية", "ثواني", "seconds", "second", "sec", "s"],
};
function normHeader(s: unknown) { return String(s ?? "").trim().toLowerCase(); }
function pickCol(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    if (keys.includes(normHeader(k))) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}
// Normalise any time spelling ("H:M:S", "M:S", seconds, or an Excel time fraction)
// into clamped h/m/s strings. Returns null when there is nothing to parse.
function parseTimeToHMS(raw: string): { hours: string; minutes: string; seconds: string } | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  let total = 0;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => Number.parseInt(p.replace(/\D/g, ""), 10) || 0);
    if (parts.length >= 3) total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) total = parts[0] * 60 + parts[1];
    else total = parts[0] || 0;
  } else {
    const num = Number(t);
    if (!Number.isFinite(num)) return null;
    total = num > 0 && num < 1 ? Math.round(num * 86400) : Math.round(num); // <1 ⇒ Excel day-fraction
  }
  if (total < 0) total = 0;
  return {
    hours: String(Math.floor(total / 3600)),
    minutes: String(Math.floor((total % 3600) / 60)),
    seconds: String(total % 60),
  };
}
async function parseSegmentsFromExcel(file: File): Promise<LessonSegmentFormItem[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out: LessonSegmentFormItem[] = [];
  for (const row of rows) {
    const title = pickCol(row, SEG_COL.title);
    const titleEn = pickCol(row, SEG_COL.titleEn);
    const segmentType = SEGMENT_TYPE_BY_KEYWORD[normHeader(pickCol(row, SEG_COL.type))] ?? "parts";
    let time = parseTimeToHMS(pickCol(row, SEG_COL.time));
    if (!time) {
      const hh = pickCol(row, SEG_COL.hours), mm = pickCol(row, SEG_COL.minutes), ss = pickCol(row, SEG_COL.seconds);
      if (hh || mm || ss) time = parseTimeToHMS(`${hh || 0}:${mm || 0}:${ss || 0}`);
    }
    if (!title && !titleEn && !time) continue; // skip blank rows
    out.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${out.length}`,
      title, titleEn, segmentType,
      hours: time?.hours ?? "", minutes: time?.minutes ?? "", seconds: time?.seconds ?? "",
    });
  }
  return out;
}
function downloadSegmentsTemplate() {
  const aoa = [
    ["العنوان (عربي)", "Section title (English)", "النوع", "الوقت"],
    ["مقدمة", "Introduction", "أجزاء", "0:00"],
    ["السؤال الأول", "Question 1", "أسئلة", "2:30"],
    ["موضوع التفاضل", "Differentiation", "مواضيع", "10:05"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 26 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "التقسيمات");
  XLSX.writeFile(wb, "قالب-تقسيمات-الفيديو.xlsx");
}

function parseYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return match ? match[1] : null;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const YOUTUBE_IFRAME_API_ID = "admin-youtube-iframe-api-script";
let youTubeApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("YouTube API is unavailable"));
  const ytWindow = window as Window & {
    YT?: {
      Player?: new (element: Element, options: Record<string, unknown>) => { getDuration: () => number; destroy: () => void };
    };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (ytWindow.YT?.Player) return Promise.resolve();
  if (youTubeApiPromise) return youTubeApiPromise;

  youTubeApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(YOUTUBE_IFRAME_API_ID) as HTMLScriptElement | null;
    const previousReady = ytWindow.onYouTubeIframeAPIReady;
    ytWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    if (existing) {
      existing.addEventListener("error", () => reject(new Error("Failed to load YouTube API")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = YOUTUBE_IFRAME_API_ID;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load YouTube API"));
    document.head.appendChild(script);
  });

  return youTubeApiPromise;
}

async function detectYouTubeDurationSeconds(videoUrl: string): Promise<number | null> {
  const videoId = parseYouTubeId(videoUrl);
  if (!videoId) return null;

  await loadYouTubeIframeApi();
  const ytWindow = window as Window & {
    YT?: {
      Player?: new (element: Element, options: Record<string, unknown>) => { getDuration: () => number; destroy: () => void };
    };
  };
  const YouTubePlayer = ytWindow.YT?.Player;
  if (!YouTubePlayer) return null;

  return new Promise<number | null>((resolve) => {
    let settled = false;
    let player: { getDuration: () => number; destroy: () => void } | null = null;
    const mount = document.createElement("div");
    mount.style.position = "fixed";
    mount.style.left = "-9999px";
    mount.style.top = "-9999px";
    mount.style.width = "240px";
    mount.style.height = "135px";
    mount.style.pointerEvents = "none";
    document.body.appendChild(mount);

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      try {
        player?.destroy();
      } catch {
        // ignore player teardown errors
      }
      mount.remove();
      resolve(value && value > 0 ? Math.round(value) : null);
    };

    const timeoutId = window.setTimeout(() => finish(null), 12000);

    player = new YouTubePlayer(mount, {
      host: "https://www.youtube-nocookie.com",
      videoId,
      width: "240",
      height: "135",
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
        playsinline: 1,
      },
      events: {
        onReady: (event: { target: { getDuration: () => number } }) => {
          let tries = 0;
          const readDuration = () => {
            const value = Number(event.target.getDuration() || 0);
            if (value > 0) {
              finish(value);
              return;
            }
            if (tries >= 16) {
              finish(null);
              return;
            }
            tries += 1;
            window.setTimeout(readDuration, 220);
          };
          readDuration();
        },
        onError: () => finish(null),
      },
    });
  });
}

async function detectUploadDurationSeconds(src: string): Promise<number | null> {
  if (!src) return null;
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    let done = false;

    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      video.load();
      resolve(value && value > 0 ? Math.round(value) : null);
    };

    const timeoutId = window.setTimeout(() => finish(null), 12000);
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = src;
  });
}

async function apiFetch<T>(token: string | null, path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type") && options?.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) return undefined as T;

  const raw = await res.text();
  const payload = raw
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
    : null;

  if (!res.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? String((payload as any).error) : `API error ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function ItemCard({
  icon,
  title,
  description,
  isPublished,
  badge,
  meta,
  onOpen,
  onRename,
  onTogglePublish,
  onDelete,
  onMoveUp,
  onMoveDown,
  containerClassName,
  iconWrapperClassName,
  topAccentClassName,
  highlight,
  onHighlightEnd,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  isPublished: boolean;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  onOpen?: () => void;
  onRename: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  containerClassName?: string;
  iconWrapperClassName?: string;
  topAccentClassName?: string;
  highlight?: boolean;
  onHighlightEnd?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlight && rootRef.current) {
      rootRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);
  return (
    <div
      ref={rootRef}
      onAnimationEnd={() => {
        if (highlight) onHighlightEnd?.();
      }}
      className={`glass-card no-lift relative overflow-hidden p-4 min-h-[92px] flex items-center gap-3 ${!isPublished ? "opacity-75" : ""} ${highlight ? "acad-flash" : ""} ${containerClassName ?? ""}`}
    >
      {topAccentClassName ? <div className={`absolute inset-x-0 top-0 h-1 ${topAccentClassName}`} /> : null}
      <div className={`w-10 h-10 rounded-xl border bg-muted/50 flex items-center justify-center flex-shrink-0 ${iconWrapperClassName ?? ""}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-foreground truncate">{title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isPublished ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            {isPublished ? "منشور" : "مسودة"}
          </span>
          {badge}
        </div>
        {description ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      <div className="flex items-center gap-1.5">
        {onMoveUp ? (
          <button onClick={onMoveUp} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        ) : null}
        {onMoveDown ? (
          <button onClick={onMoveDown} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <button onClick={onRename} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onTogglePublish} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isPublished ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
          {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => {
            if (confirm("هل أنت متأكد من الحذف؟")) onDelete();
          }}
          className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {onOpen ? (
          <button onClick={onOpen} className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:opacity-90">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function useSorted<T extends { orderIndex: number; id: number }>(items: T[]) {
  return useMemo(() => {
    return [...items].sort((a, b) => (a.orderIndex - b.orderIndex) || (a.id - b.id));
  }, [items]);
}

// ─── Grid / tree view ────────────────────────────────────────────────────────
// A second way to view academic content (alongside the nested-cards drill-down):
// a year card expands in place and reveals its WHOLE subtree — subjects → units →
// lessons — as a top-down knockout-bracket-style org chart, with the same
// edit / publish / delete / reorder actions on every node.

type NodeKind = "year" | "subject" | "unit" | "lesson";
const NODE_KIND_PATH: Record<NodeKind, string> = {
  year: "years",
  subject: "subjects",
  unit: "units",
  lesson: "lessons",
};

type UnitExamFlags = { reviewPublished: boolean; adaptivePublished: boolean } | null;
type UnitTreeNode = Unit & { lessons: Lesson[]; exam?: UnitExamFlags };
type SubjectTreeNode = Subject & { units: UnitTreeNode[] };
type YearTreeData = { subjects: SubjectTreeNode[] };

type TreeActions = {
  editYear: (year: AcademicYear) => void;
  editSubject: (subject: Subject, ctx: { yearId: number; yearName: string }) => void;
  editUnit: (
    unit: Unit,
    ctx: { yearId: number; subjectId: number; subjectName: string; yearName: string; unitLabel: AcademicUnitLabel },
  ) => void;
  editLesson: (
    lesson: Lesson,
    ctx: {
      yearId: number;
      subjectId: number;
      unitId: number;
      unitName: string;
      subjectName: string;
      yearName: string;
      unitLabel: AcademicUnitLabel;
    },
  ) => void;
  togglePublish: (kind: NodeKind, id: number, next: boolean) => void;
  remove: (kind: NodeKind, id: number) => void;
  reorder: <T extends { id: number; orderIndex: number }>(kind: NodeKind, siblings: T[], index: number, dir: "up" | "down") => void;
  // Clicking a tree node jumps to the normal cards view at that node's level and
  // flashes it among its siblings.
  gotoSubject: (subject: Subject, ctx: { yearId: number; yearName: string }) => void;
  gotoUnit: (
    unit: Unit,
    ctx: { yearId: number; subjectId: number; subjectName: string; yearName: string; unitLabel: AcademicUnitLabel },
  ) => void;
  gotoLesson: (
    lesson: Lesson,
    ctx: {
      yearId: number;
      subjectId: number;
      unitId: number;
      unitName: string;
      subjectName: string;
      yearName: string;
      unitLabel: AcademicUnitLabel;
    },
  ) => void;
  gotoExam: (
    unit: Unit,
    ctx: { yearId: number; subjectId: number; subjectName: string; yearName: string; unitLabel: AcademicUnitLabel; unitName: string },
  ) => void;
};

// Compact card for a single node inside the tree. No inline actions — the whole card
// is a click target that jumps to that node in the normal cards view (kept as a plain
// <div> onClick, NOT a <button>, so drag-to-pan still works on the card body; a drag
// is cancelled before it fires a click by the tree's onClickCapture).
function TreeNodeCard({
  icon,
  title,
  subtitle,
  isPublished,
  accentClass,
  iconWrapperClass,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  isPublished: boolean;
  accentClass?: string;
  iconWrapperClass?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={`acad-tree-card acad-tree-clickable ${!isPublished ? "opacity-70" : ""}`} onClick={onClick} title="اضغط للانتقال إليه">
      <span className={`acad-tree-accent ${accentClass ?? "bg-primary/40"}`} />
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg border bg-muted/50 flex items-center justify-center flex-shrink-0 ${iconWrapperClass ?? ""}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-[13px] text-foreground truncate leading-tight">{title}</h4>
          {subtitle ? <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2.5 min-w-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isPublished ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          {isPublished ? "منشور" : "مسودة"}
        </span>
        {badge}
      </div>
    </div>
  );
}

// The chapter-exam card that sits beside a unit in the tree (only when the unit has an
// exam). Clicking it opens that chapter's exam settings.
function TreeExamCard({ reviewOpen, adaptiveOpen, onClick }: { reviewOpen: boolean; adaptiveOpen: boolean; onClick?: () => void }) {
  const pill = (label: string, open: boolean) => (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${open ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
      {label}
    </span>
  );
  return (
    <div className="acad-tree-exam acad-tree-clickable" onClick={onClick} title="اضغط لإعدادات الامتحان">
      <span className="acad-tree-accent bg-indigo-400/70" />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-100 text-indigo-600">
          <Award className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-[13px] text-foreground truncate leading-tight">الامتحان</h4>
          <p className="text-[11px] text-muted-foreground truncate">استدراك + تحدي</p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2.5 min-w-0">
        {pill("استدراك", reviewOpen)}
        {pill("تحدي", adaptiveOpen)}
      </div>
    </div>
  );
}

// Click-and-drag horizontal panning for wide trees (in addition to the native
// trackpad / Magic-Mouse two-finger swipe that overflow-x already gives us).
// Grab anywhere on the tree background/cards and pull to scroll; buttons and
// links are left alone, and a drag never fires a stray click on them. A grab
// cursor only shows when the tree is actually wider than its container.
function useDragScroll() {
  const elRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ down: false, moved: false, startX: 0, startScroll: 0, pointerId: -1 });
  const roRef = useRef<ResizeObserver | null>(null);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    elRef.current = node;
    if (node) {
      const update = () => node.classList.toggle("is-grabbable", node.scrollWidth > node.clientWidth + 1);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(node);
      roRef.current = ro;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = elRef.current;
    if (!el) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return; // left button only
    if (el.scrollWidth <= el.clientWidth + 1) return; // nothing to pan
    drag.current = { down: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft, pointerId: e.pointerId };
    el.classList.add("is-grabbing");
    el.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = elRef.current;
    const d = drag.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    el.scrollLeft = d.startScroll - dx;
  }, []);

  const endDrag = useCallback(() => {
    const el = elRef.current;
    if (el) {
      el.classList.remove("is-grabbing");
      if (drag.current.pointerId >= 0) el.releasePointerCapture?.(drag.current.pointerId);
    }
    drag.current.down = false;
    drag.current.pointerId = -1;
    // keep `moved` alive for the click that immediately follows, then clear it
    window.setTimeout(() => {
      drag.current.moved = false;
    }, 0);
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return { setRef, onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture };
}

// One year row in the grid: a normal-width card that grows in height (animated)
// and reveals its full subtree as a bracket when opened. Siblings reflow down via
// framer's layout animation. The subtree loads lazily (only while expanded).
function YearTreeCard({
  year,
  expanded,
  onToggle,
  token,
  actions,
  tone,
  onMoveUp,
  onMoveDown,
}: {
  year: AcademicYear;
  expanded: boolean;
  onToggle: () => void;
  token: string | null;
  actions: TreeActions;
  tone: { top: string; iconWrapper: string };
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const treeQ = useQuery<YearTreeData>({
    queryKey: ["admin", "academic", "tree", year.id],
    queryFn: () => apiFetch(token, `/admin/academic/years/${year.id}/tree`),
    enabled: !!token && expanded,
  });
  const subjects = treeQ.data?.subjects ?? [];
  const dragScroll = useDragScroll();

  return (
    <motion.div
      layout="position"
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={`glass-card no-lift relative overflow-hidden ${!year.isPublished ? "opacity-75" : ""}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${tone.top}`} />
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0 hover:opacity-90"
          aria-label={expanded ? "طي السنة" : "فتح السنة"}
        >
          <motion.span animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.2 }} className="flex">
            <ChevronDown className="w-4 h-4" />
          </motion.span>
        </button>
        <div className={`w-10 h-10 rounded-xl border bg-muted/50 flex items-center justify-center flex-shrink-0 ${tone.iconWrapper}`}>
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground truncate">{year.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${year.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              {year.isPublished ? "منشور" : "مسودة"}
            </span>
          </div>
          {year.description ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{year.description}</p> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {onMoveUp ? (
            <button onClick={onMoveUp} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          ) : null}
          {onMoveDown ? (
            <button onClick={onMoveDown} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button onClick={() => actions.editYear(year)} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => actions.togglePublish("year", year.id, !year.isPublished)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${year.isPublished ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}
          >
            {year.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              if (confirm("هل أنت متأكد من الحذف؟")) actions.remove("year", year.id);
            }}
            className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/50 px-3 pb-4 pt-1">
              {treeQ.isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">جارِ تحميل الشجرة…</div>
              ) : subjects.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">لا توجد مواد داخل هذه السنة بعد.</div>
              ) : (
                <div
                  className="acad-tree"
                  dir="rtl"
                  ref={dragScroll.setRef}
                  onPointerDown={dragScroll.onPointerDown}
                  onPointerMove={dragScroll.onPointerMove}
                  onPointerUp={dragScroll.onPointerUp}
                  onPointerCancel={dragScroll.onPointerCancel}
                  onClickCapture={dragScroll.onClickCapture}
                >
                  <ul>
                    {subjects.map((subject) => (
                      <li key={subject.id}>
                        <TreeNodeCard
                          icon={<span className="text-lg leading-none">{subject.icon || "📚"}</span>}
                          title={subject.name}
                          subtitle={subject.description}
                          isPublished={subject.isPublished}
                          accentClass="bg-blue-400/60"
                          badge={
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold truncate">
                              {getUnitLabelCopy(subject.unitLabel).plural}
                            </span>
                          }
                          onClick={() => actions.gotoSubject(subject, { yearId: year.id, yearName: year.name })}
                        />
                        {subject.units.length ? (
                          <ul>
                            {subject.units.map((unit) => (
                              <li key={unit.id}>
                                {/* Unit card stays centered under the connector; the exam
                                    card sits on its left. An equal-width spacer on the right
                                    keeps the unit card dead-centre (so the tree line still
                                    hits it, not the pair). */}
                                <div className="acad-unit-row">
                                  {unit.exam ? <div className="acad-unit-spacer" aria-hidden="true" /> : null}
                                  <TreeNodeCard
                                    icon={<Layers className="w-4 h-4 text-sky-500" />}
                                    title={unit.name}
                                    subtitle={unit.description}
                                    isPublished={unit.isPublished}
                                    accentClass="bg-sky-400/60"
                                    onClick={() =>
                                      actions.gotoUnit(unit, {
                                        yearId: year.id,
                                        subjectId: subject.id,
                                        subjectName: subject.name,
                                        yearName: year.name,
                                        unitLabel: normalizeUnitLabel(subject.unitLabel),
                                      })
                                    }
                                  />
                                  {unit.exam ? (
                                    <TreeExamCard
                                      reviewOpen={unit.exam.reviewPublished}
                                      adaptiveOpen={unit.exam.adaptivePublished}
                                      onClick={() =>
                                        actions.gotoExam(unit, {
                                          yearId: year.id,
                                          subjectId: subject.id,
                                          subjectName: subject.name,
                                          yearName: year.name,
                                          unitLabel: normalizeUnitLabel(subject.unitLabel),
                                          unitName: unit.name,
                                        })
                                      }
                                    />
                                  ) : null}
                                </div>
                                {unit.lessons.length ? (
                                  <ul>
                                    {unit.lessons.map((lesson) => (
                                      <li key={lesson.id}>
                                        <TreeNodeCard
                                          icon={<PlayCircle className="w-4 h-4 text-emerald-500" />}
                                          title={lesson.title}
                                          subtitle={lesson.video ? (lesson.video.videoType === "youtube" ? "YouTube" : "رفع") : "بلا فيديو"}
                                          isPublished={lesson.isPublished}
                                          accentClass="bg-emerald-400/60"
                                          onClick={() =>
                                            actions.gotoLesson(lesson, {
                                              yearId: year.id,
                                              subjectId: subject.id,
                                              unitId: unit.id,
                                              unitName: unit.name,
                                              subjectName: subject.name,
                                              yearName: year.name,
                                              unitLabel: normalizeUnitLabel(subject.unitLabel),
                                            })
                                          }
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export function AcademicTab() {
  const qc = useQueryClient();
  const { token } = useAuth();

  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ level: "years", label: "السنوات الدراسية" }]);
  const [showAdd, setShowAdd] = useState(false);
  // Two ways to view the hierarchy: nested drill-down cards (default) or a
  // top-down bracket/grid where a year expands to its whole subtree. Persisted.
  const [viewMode, setViewMode] = useState<"cards" | "grid">(() =>
    typeof window !== "undefined" && window.localStorage.getItem("acad-view-mode") === "grid" ? "grid" : "cards",
  );
  const [expandedYearId, setExpandedYearId] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("acad-view-mode", viewMode);
  }, [viewMode]);

  const [yearForm, setYearForm] = useState({ name: "", nameEn: "", description: "", descriptionEn: "" });
  const [yearFormMode, setYearFormMode] = useState<"create" | "edit">("create");
  const [editingYearId, setEditingYearId] = useState<number | null>(null);
  const [subjectForm, setSubjectForm] = useState({
    name: "",
    nameEn: "",
    icon: "📚",
    description: "",
    descriptionEn: "",
    unitLabel: "unit" as AcademicUnitLabel,
  });
  const [subjectFormMode, setSubjectFormMode] = useState<"create" | "edit">("create");
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [unitForm, setUnitForm] = useState({ name: "", nameEn: "", description: "", descriptionEn: "" });
  const [unitFormMode, setUnitFormMode] = useState<"create" | "edit">("create");
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [lessonForm, setLessonForm] = useState({
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    isPublished: true,
    videoType: "youtube" as "youtube" | "upload",
    videoUrl: "",
    videoTitle: "",
    videoTitleEn: "",
    videoDescription: "",
    videoDescriptionEn: "",
    instructor: "",
    instructorEn: "",
    publishStatus: "published" as "draft" | "published",
    thumbnailUrl: "",
    posterUrl: "",
  });
  const [lessonVideoFile, setLessonVideoFile] = useState<File | null>(null);
  const [lessonThumbnailFile, setLessonThumbnailFile] = useState<File | null>(null);
  const [lessonPosterFile, setLessonPosterFile] = useState<File | null>(null);
  const [lessonSegments, setLessonSegments] = useState<LessonSegmentFormItem[]>([]);
  const segmentsFileRef = useRef<HTMLInputElement | null>(null);
  // Deep-link from the dashboard "videos without segments" alert: scroll target +
  // the lesson we still need to open once its unit's lessons finish loading.
  const segmentsSectionRef = useRef<HTMLDivElement | null>(null);
  const pendingDeepLinkLessonRef = useRef<number | null>(null);
  const importSegmentsFromExcel = async (file: File) => {
    try {
      const parsed = await parseSegmentsFromExcel(file);
      if (!parsed.length) {
        alert("لم يتم العثور على تقسيمات صالحة في الملف. تأكد من وجود عمود للعنوان (مثلاً «العنوان»).");
        return;
      }
      setLessonSegments((prev) => {
        const existing = prev.filter((s) => s.title.trim() || s.hours || s.minutes || s.seconds);
        return [...existing, ...parsed];
      });
      alert(`تم استيراد ${parsed.length} تقسيمة من الملف.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر قراءة ملف Excel");
    }
  };
  const [lessonFormMode, setLessonFormMode] = useState<"create" | "edit">("create");
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lastSavedLesson, setLastSavedLesson] = useState<{ id: number; title: string; videoId?: number | null } | null>(null);
  // Quiz questions edited with the lesson (on their own page, saved together in one "save").
  const [lessonQuestions, setLessonQuestions] = useState<LocalQuestion[]>([]);
  const [lessonQuizCount, setLessonQuizCount] = useState<number | null>(null);
  const [lessonQuizLanguage, setLessonQuizLanguage] = useState<"ar" | "en">("ar");
  // v2 Phase 2 — per-video quiz watch-gate: lock the quiz until the student has really
  // watched `percent`% of the video (playback coverage, not seek position).
  const [lessonQuizWatchGateEnabled, setLessonQuizWatchGateEnabled] = useState(false);
  const [lessonQuizWatchGatePercent, setLessonQuizWatchGatePercent] = useState(75);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showQuestionsPage, setShowQuestionsPage] = useState(false);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [detectedDurationSeconds, setDetectedDurationSeconds] = useState<number | null>(null);
  const [isDurationDetecting, setIsDurationDetecting] = useState(false);
  const [durationDetectionError, setDurationDetectionError] = useState<string | null>(null);
  const durationDetectionRequestRef = useRef(0);
  // "Click outside to close" for the inline add/edit panel. The panel ref scopes
  // what counts as "inside"; the toggle button ref lets its own onClick handle the
  // close so the document listener doesn't double-fire on it.
  const addPanelRef = useRef<HTMLDivElement | null>(null);
  const addToggleRef = useRef<HTMLButtonElement | null>(null);

  const current = crumbs[crumbs.length - 1];
  // The unit-label term (فصل/وحدة/باب) lives on the units-level crumb; at the lessons
  // level fall back to the nearest crumb that carries it so labels stay correct.
  const currentUnitCopy = getUnitLabelCopy(current.unitLabel ?? [...crumbs].reverse().find((c) => c.unitLabel)?.unitLabel);

  const yearsQ = useQuery<AcademicYear[]>({
    queryKey: ["admin", "academic", "years"],
    queryFn: () => apiFetch(token, "/admin/academic/years"),
    enabled: !!token,
  });

  const subjectsQ = useQuery<Subject[]>({
    queryKey: ["admin", "academic", "subjects", current.yearId],
    queryFn: () => apiFetch(token, `/admin/academic/years/${current.yearId}/subjects`),
    enabled: !!token && !!current.yearId,
  });

  const unitsQ = useQuery<Unit[]>({
    queryKey: ["admin", "academic", "units", current.subjectId],
    queryFn: () => apiFetch(token, `/admin/academic/subjects/${current.subjectId}/units`),
    enabled: !!token && !!current.subjectId,
  });

  const lessonsQ = useQuery<Lesson[]>({
    queryKey: ["admin", "academic", "lessons", current.unitId],
    queryFn: () => apiFetch(token, `/admin/academic/units/${current.unitId}/lessons`),
    enabled: !!token && !!current.unitId,
  });

  // v2 Phase 2 — does this chapter already have an exam row? Drives the "add exam"
  // button (hidden once created) + the distinguished exam card at the bottom of the
  // lessons list. `showExam` opens the exam-settings panel (create or edit).
  const [showExam, setShowExam] = useState(false);
  // When you click a node in the grid, we jump to the cards view at its level and
  // briefly flash that card (a "here it is" highlight among its siblings).
  const [flash, setFlash] = useState<{ kind: NodeKind; id: number } | null>(null);
  const unitExamQ = useQuery<{ exam: { reviewPublished?: boolean; adaptivePublished?: boolean } | null }>({
    queryKey: ["admin", "academic", "unit-exam", current.unitId],
    queryFn: () => apiFetch(token, `/admin/units/${current.unitId}/exam`),
    enabled: !!token && !!current.unitId && current.level === "lessons",
  });
  const examExists = !!unitExamQ.data?.exam;
  const examReviewOpen = !!unitExamQ.data?.exam?.reviewPublished;
  const examAdaptiveOpen = !!unitExamQ.data?.exam?.adaptivePublished;

  const years = useSorted(yearsQ.data ?? []);
  const subjects = useSorted(subjectsQ.data ?? []);
  const units = useSorted(unitsQ.data ?? []);
  const lessons = useSorted(lessonsQ.data ?? []);
  const editingLesson = editingLessonId ? lessons.find((lesson) => lesson.id === editingLessonId) ?? null : null;

  // Warm each year's full-tree cache as soon as the grid view is shown, so the
  // first time a year is expanded its data is already there and the open
  // animation grows straight to the final height (no mid-animation "jump" while
  // the request is still in flight).
  useEffect(() => {
    if (viewMode !== "grid" || !token) return;
    for (const year of years) {
      qc.prefetchQuery({
        queryKey: ["admin", "academic", "tree", year.id],
        queryFn: () => apiFetch(token, `/admin/academic/years/${year.id}/tree`),
        staleTime: 30_000,
      });
    }
  }, [viewMode, years, token, qc]);

  // Whether the open add/edit panel has unsaved input, judged per level against
  // each form's reset/default state. Used to confirm before an outside-click close.
  function isAddPanelDirty(): boolean {
    if (current.level === "years") {
      return Boolean(yearForm.name || yearForm.nameEn || yearForm.description || yearForm.descriptionEn);
    }
    if (current.level === "subjects") {
      return Boolean(
        subjectForm.name ||
          subjectForm.nameEn ||
          subjectForm.description ||
          subjectForm.descriptionEn ||
          subjectForm.icon !== "📚" ||
          subjectForm.unitLabel !== "unit",
      );
    }
    if (current.level === "units") {
      return Boolean(unitForm.name || unitForm.nameEn || unitForm.description || unitForm.descriptionEn);
    }
    // lessons
    return Boolean(
      lessonForm.title ||
        lessonForm.titleEn ||
        lessonForm.description ||
        lessonForm.descriptionEn ||
        lessonForm.videoUrl ||
        lessonForm.videoTitle ||
        lessonForm.videoTitleEn ||
        lessonForm.videoDescription ||
        lessonForm.videoDescriptionEn ||
        lessonForm.instructor ||
        lessonForm.instructorEn ||
        lessonForm.thumbnailUrl ||
        lessonForm.posterUrl ||
        lessonVideoFile ||
        lessonThumbnailFile ||
        lessonPosterFile ||
        lessonSegments.length > 0,
    );
  }

  // While the inline add/edit panel is open, a mousedown anywhere outside it (and
  // outside the toggle button, which handles its own close) confirms-then-closes.
  useEffect(() => {
    if (!showAdd) return;
    // The lesson editor is a dedicated full page (heavy: video + segments + quiz) —
    // it must NOT close on an outside click; the explicit "رجوع"/"إغلاق" button closes it.
    if (current.level === "lessons") return;
    function onDocMouseDown(event: globalThis.MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (addPanelRef.current?.contains(target)) return;
      if (addToggleRef.current?.contains(target)) return;
      if (confirmDiscardIfDirty(isAddPanelDirty())) {
        setShowAdd(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // isAddPanelDirty reads live form state via closure; re-bind when it changes so
    // the dirty check stays accurate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showAdd,
    current.level,
    yearForm,
    subjectForm,
    unitForm,
    lessonForm,
    lessonVideoFile,
    lessonThumbnailFile,
    lessonPosterFile,
    lessonSegments,
  ]);

  function invalidateAcademic() {
    qc.invalidateQueries({ queryKey: ["admin", "academic"] });
  }

  function upsertLessonInCache(unitId: number, lesson: Lesson) {
    qc.setQueryData<Lesson[]>(["admin", "academic", "lessons", unitId], (currentLessons = []) => {
      const exists = currentLessons.some((item) => item.id === lesson.id);
      const nextLessons = exists
        ? currentLessons.map((item) => (item.id === lesson.id ? lesson : item))
        : [...currentLessons, lesson];
      return nextLessons.sort((a, b) => (a.orderIndex - b.orderIndex) || (a.id - b.id));
    });
  }

  async function uploadMedia(file: File, kind: UploadKind) {
    const fd = new FormData();
    fd.append(kind, file);
    const endpoint = kind === "video" ? "/admin/academic/media/upload-video" : "/admin/academic/media/upload-thumbnail";
    const response = await apiFetch<{ url: string }>(token, endpoint, {
      method: "POST",
      body: fd,
    });
    return response.url;
  }

  async function moveItem<T extends { id: number; orderIndex: number }>(
    items: T[],
    index: number,
    direction: "up" | "down",
    reorderPath: string,
  ) {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;

    const clone = [...items];
    [clone[index], clone[target]] = [clone[target], clone[index]];

    await apiFetch(token, reorderPath, {
      method: "PATCH",
      body: JSON.stringify({
        items: clone.map((item, idx) => ({ id: item.id, orderIndex: idx })),
      }),
    });

    invalidateAcademic();
  }

  function resetSubjectForm() {
    setSubjectForm({
      name: "",
      nameEn: "",
      icon: "📚",
      description: "",
      descriptionEn: "",
      unitLabel: "unit",
    });
    setSubjectFormMode("create");
    setEditingSubjectId(null);
  }

  function openSubjectEditor(subject: Subject) {
    setSubjectForm({
      name: subject.name,
      nameEn: subject.nameEn ?? "",
      icon: subject.icon || "📚",
      description: subject.description,
      descriptionEn: subject.descriptionEn ?? "",
      unitLabel: normalizeUnitLabel(subject.unitLabel),
    });
    setSubjectFormMode("edit");
    setEditingSubjectId(subject.id);
    setShowAdd(true);
  }

  function resetYearForm() {
    setYearForm({ name: "", nameEn: "", description: "", descriptionEn: "" });
    setYearFormMode("create");
    setEditingYearId(null);
  }

  function openYearEditor(year: AcademicYear) {
    setYearForm({
      name: year.name,
      nameEn: year.nameEn ?? "",
      description: year.description,
      descriptionEn: year.descriptionEn ?? "",
    });
    setYearFormMode("edit");
    setEditingYearId(year.id);
    setShowAdd(true);
  }

  function resetUnitForm() {
    setUnitForm({ name: "", nameEn: "", description: "", descriptionEn: "" });
    setUnitFormMode("create");
    setEditingUnitId(null);
  }

  function openUnitEditor(unit: Unit) {
    setUnitForm({
      name: unit.name,
      nameEn: unit.nameEn ?? "",
      description: unit.description,
      descriptionEn: unit.descriptionEn ?? "",
    });
    setUnitFormMode("edit");
    setEditingUnitId(unit.id);
    setShowAdd(true);
  }

  function resetLessonForm() {
    setLessonForm({
      title: "",
      titleEn: "",
      description: "",
      descriptionEn: "",
      isPublished: true,
      videoType: "youtube",
      videoUrl: "",
      videoTitle: "",
      videoTitleEn: "",
      videoDescription: "",
      videoDescriptionEn: "",
      instructor: "",
      instructorEn: "",
      publishStatus: "published",
      thumbnailUrl: "",
      posterUrl: "",
    });
    setLessonVideoFile(null);
    setLessonThumbnailFile(null);
    setLessonPosterFile(null);
    setLessonSegments([]);
    setLessonQuestions([]);
    setLessonQuizCount(null);
    setLessonQuizLanguage("ar");
    setLessonQuizWatchGateEnabled(false);
    setLessonQuizWatchGatePercent(75);
    setDraftRestored(false);
    setShowQuestionsPage(false);
    setLessonFormMode("create");
    setEditingLessonId(null);
    setDetectedDurationSeconds(null);
    setIsDurationDetecting(false);
    setDurationDetectionError(null);
  }

  useEffect(() => {
    setLastSavedLesson(null);
  }, [current.unitId]);

  function openLessonEditor(lesson: Lesson) {
    const sourceSegments = [...(lesson.video?.segments ?? [])].sort(
      (a, b) => (a.orderIndex - b.orderIndex) || (a.startSeconds - b.startSeconds),
    );

    setLessonForm({
      title: lesson.title,
      titleEn: lesson.titleEn ?? "",
      description: lesson.description,
      descriptionEn: lesson.descriptionEn ?? "",
      isPublished: lesson.isPublished,
      videoType: lesson.video?.videoType ?? "youtube",
      videoUrl: lesson.video?.videoUrl ?? "",
      videoTitle: lesson.video?.title ?? "",
      videoTitleEn: lesson.video?.titleEn ?? "",
      videoDescription: lesson.video?.description ?? lesson.description,
      videoDescriptionEn: lesson.video?.descriptionEn ?? "",
      instructor: lesson.video?.instructor ?? "",
      instructorEn: lesson.video?.instructorEn ?? "",
      publishStatus: lesson.video?.publishStatus ?? (lesson.isPublished ? "published" : "draft"),
      thumbnailUrl: lesson.video?.thumbnailUrl ?? "",
      posterUrl: lesson.video?.posterUrl ?? "",
    });
    setLessonSegments(
      sourceSegments.map((segment) => {
        const start = Math.max(0, Math.floor(segment.startSeconds));
        const hh = Math.floor(start / 3600);
        const mm = Math.floor((start % 3600) / 60);
        const ss = start % 60;
        return {
          id: `${segment.id}-${segment.orderIndex}`,
          title: segment.title,
          titleEn: segment.titleEn ?? "",
          segmentType: segment.segmentType,
          hours: hh > 0 ? String(hh) : "",
          minutes: String(mm),
          seconds: String(ss),
        };
      }),
    );
    setLessonVideoFile(null);
    setLessonThumbnailFile(null);
    setLessonPosterFile(null);
    setLessonFormMode("edit");
    setEditingLessonId(lesson.id);
    setDetectedDurationSeconds(lesson.video && lesson.video.duration > 0 ? lesson.video.duration : null);
    setIsDurationDetecting(false);
    setDurationDetectionError(null);
    // Seed the quiz questions from the server (they save back together with the lesson).
    setLessonQuestions([]);
    setLessonQuizCount(null);
    setLessonQuizLanguage("ar");
    setLessonQuizWatchGateEnabled(false);
    setLessonQuizWatchGatePercent(75);
    setDraftRestored(false);
    setShowQuestionsPage(false);
    const videoId = lesson.video?.id;
    if (videoId) {
      void apiFetch<{
        video: {
          quizQuestionCount: number | null;
          quizLanguage?: string;
          quizWatchGateEnabled?: boolean;
          quizWatchGatePercent?: number;
        };
        questions: unknown[];
      }>(token, `/admin/videos/${videoId}/questions`)
        .then((data) => {
          setLessonQuestions((data.questions ?? []).map(apiQuestionToLocal));
          setLessonQuizCount(data.video?.quizQuestionCount ?? null);
          setLessonQuizLanguage(data.video?.quizLanguage === "en" ? "en" : "ar");
          setLessonQuizWatchGateEnabled(Boolean(data.video?.quizWatchGateEnabled));
          setLessonQuizWatchGatePercent(
            typeof data.video?.quizWatchGatePercent === "number" ? data.video.quizWatchGatePercent : 75,
          );
        })
        .catch(() => undefined);
    }
    setShowAdd(true);
  }

  // ── Draft autosave: survive an accidental refresh / power cut / crash ──────────
  // The lesson editor takes ~30 min to fill (video + many questions), so we persist
  // the whole editor state to localStorage while it's open and offer to restore it on
  // the next load. Uploaded file blobs can't be serialised (only their URLs), so the
  // admin re-picks any not-yet-uploaded file — but every typed field + all questions
  // come back. Cleared on a successful save.
  const [pendingDraft, setPendingDraft] = useState<any | null>(null);

  function clearLessonDraft() {
    try {
      localStorage.removeItem(LESSON_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  // On mount: if a draft exists, surface a restore banner (don't auto-apply).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LESSON_DRAFT_KEY);
      if (raw) setPendingDraft(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Persist the lesson editor continuously while it's open (debounced).
  useEffect(() => {
    if (!showAdd || current.level !== "lessons") return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          LESSON_DRAFT_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            crumbs,
            mode: lessonFormMode,
            editingLessonId,
            form: lessonForm,
            segments: lessonSegments,
            questions: lessonQuestions,
            quizCount: lessonQuizCount,
            quizLanguage: lessonQuizLanguage,
            quizWatchGateEnabled: lessonQuizWatchGateEnabled,
            quizWatchGatePercent: lessonQuizWatchGatePercent,
          }),
        );
      } catch {
        /* ignore (e.g. quota) */
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [showAdd, current.level, crumbs, lessonFormMode, editingLessonId, lessonForm, lessonSegments, lessonQuestions, lessonQuizCount, lessonQuizLanguage, lessonQuizWatchGateEnabled, lessonQuizWatchGatePercent]);

  function restoreLessonDraft() {
    const d = pendingDraft;
    if (!d) return;
    if (Array.isArray(d.crumbs)) setCrumbs(d.crumbs);
    if (d.form) setLessonForm(d.form);
    setLessonSegments(Array.isArray(d.segments) ? d.segments : []);
    setLessonQuestions(Array.isArray(d.questions) ? d.questions : []);
    setLessonQuizCount(d.quizCount ?? null);
    setLessonQuizLanguage(d.quizLanguage === "en" ? "en" : "ar");
    setLessonQuizWatchGateEnabled(Boolean(d.quizWatchGateEnabled));
    setLessonQuizWatchGatePercent(typeof d.quizWatchGatePercent === "number" ? d.quizWatchGatePercent : 75);
    setLessonFormMode(d.mode === "edit" ? "edit" : "create");
    setEditingLessonId(d.editingLessonId ?? null);
    setDetectedDurationSeconds(null);
    setDraftRestored(true);
    setShowAdd(true);
    setPendingDraft(null);
  }
  function discardLessonDraft() {
    clearLessonDraft();
    setPendingDraft(null);
  }

  // Deep-link entry: the dashboard "videos without segments" alert stashes the target
  // lesson (full path + names). On mount we rebuild the breadcrumb trail down to its
  // unit so the lessons query loads, then mark the lesson as pending-to-open.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("ofouq_academic_open_lesson"); } catch { /* ignore */ }
    if (!raw) return;
    try { sessionStorage.removeItem("ofouq_academic_open_lesson"); } catch { /* ignore */ }
    let target: {
      lessonId?: number; unitId?: number; unitName?: string; unitLabel?: unknown;
      subjectId?: number; subjectName?: string; yearId?: number; yearName?: string;
    };
    try { target = JSON.parse(raw); } catch { return; }
    if (!target?.lessonId || !target.unitId || !target.subjectId || !target.yearId) return;
    setCrumbs([
      { level: "years", label: "السنوات الدراسية" },
      { level: "subjects", label: target.yearName ?? "السنة الدراسية", yearId: target.yearId },
      { level: "units", label: target.subjectName ?? "المادة", yearId: target.yearId, subjectId: target.subjectId, unitLabel: normalizeUnitLabel(target.unitLabel) },
      { level: "lessons", label: target.unitName ?? "الوحدة", yearId: target.yearId, subjectId: target.subjectId, unitId: target.unitId },
    ]);
    pendingDeepLinkLessonRef.current = target.lessonId;
  }, []);

  // Once the deep-linked unit's lessons have arrived, open that lesson's editor and
  // scroll the segments section into view.
  useEffect(() => {
    const lessonId = pendingDeepLinkLessonRef.current;
    if (!lessonId) return;
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    pendingDeepLinkLessonRef.current = null;
    openLessonEditor(lesson);
    window.setTimeout(() => {
      segmentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
  }, [lessons]);

  useEffect(() => {
    let isCancelled = false;
    const requestId = durationDetectionRequestRef.current + 1;
    durationDetectionRequestRef.current = requestId;

    const run = async () => {
      const youtubeUrl = lessonForm.videoUrl.trim();
      if (lessonForm.videoType === "youtube") {
        if (!youtubeUrl) {
          setIsDurationDetecting(false);
          setDurationDetectionError(null);
          setDetectedDurationSeconds(null);
          return;
        }
        if (!parseYouTubeId(youtubeUrl)) {
          setIsDurationDetecting(false);
          setDurationDetectionError("رابط YouTube غير صالح، لا يمكن حساب المدة.");
          setDetectedDurationSeconds(null);
          return;
        }

        setIsDurationDetecting(true);
        setDurationDetectionError(null);
        setDetectedDurationSeconds(null);
        const seconds = await detectYouTubeDurationSeconds(youtubeUrl);
        if (isCancelled || durationDetectionRequestRef.current !== requestId) return;
        setIsDurationDetecting(false);
        if (seconds && seconds > 0) {
          setDetectedDurationSeconds(seconds);
          setDurationDetectionError(null);
        } else {
          setDetectedDurationSeconds(null);
          setDurationDetectionError("تعذر حساب مدة فيديو YouTube تلقائيًا. تأكد من الرابط أو جرب مرة أخرى.");
        }
        return;
      }

      const uploadSource = lessonVideoFile ? URL.createObjectURL(lessonVideoFile) : lessonForm.videoUrl.trim();
      if (!uploadSource) {
        setIsDurationDetecting(false);
        setDurationDetectionError(null);
        setDetectedDurationSeconds(null);
        return;
      }

      setIsDurationDetecting(true);
      setDurationDetectionError(null);
      setDetectedDurationSeconds(null);
      const seconds = await detectUploadDurationSeconds(uploadSource);
      if (lessonVideoFile) URL.revokeObjectURL(uploadSource);
      if (isCancelled || durationDetectionRequestRef.current !== requestId) return;

      setIsDurationDetecting(false);
      if (seconds && seconds > 0) {
        setDetectedDurationSeconds(seconds);
        setDurationDetectionError(null);
      } else {
        setDetectedDurationSeconds(null);
        setDurationDetectionError("تعذر حساب مدة الفيديو المرفوع تلقائيًا. تأكد من الملف أو الرابط.");
      }
    };

    void run();

    return () => {
      isCancelled = true;
    };
  }, [lessonForm.videoType, lessonForm.videoUrl, lessonVideoFile]);

  async function submitLesson() {
    if (!current.unitId) return;
    if (!lessonForm.title.trim()) {
      alert("عنوان الدرس بالعربية مطلوب");
      return;
    }
    if (!lessonForm.titleEn.trim()) {
      alert("عنوان الدرس بالإنجليزية مطلوب");
      return;
    }
    if (!lessonForm.videoTitleEn.trim()) {
      alert("عنوان الفيديو بالإنجليزية مطلوب");
      return;
    }

    setIsSavingLesson(true);
    try {
      let videoUrl = lessonForm.videoUrl.trim();
      let thumbnailUrl = lessonForm.thumbnailUrl.trim();
      let posterUrl = lessonForm.posterUrl.trim();

      if (lessonForm.videoType === "upload" && !videoUrl) {
        if (!lessonVideoFile) {
          throw new Error("اختر ملف الفيديو أولًا");
        }
        videoUrl = await uploadMedia(lessonVideoFile, "video");
      }

      if (lessonThumbnailFile) {
        thumbnailUrl = await uploadMedia(lessonThumbnailFile, "thumbnail");
      }

      if (lessonPosterFile) {
        posterUrl = await uploadMedia(lessonPosterFile, "thumbnail");
      }

      const manualVideoTitle = lessonForm.videoTitle.trim();
      if (!manualVideoTitle) {
        throw new Error("عنوان الفيديو مطلوب ويجب إدخاله يدويًا.");
      }

      const autoDuration = Math.max(0, Math.floor(detectedDurationSeconds ?? 0));
      if (autoDuration <= 0) {
        throw new Error("تعذر حساب مدة الفيديو تلقائيًا. راجع الرابط/الملف ثم حاول مجددًا.");
      }

      const segments = lessonSegments
        .flatMap((segment, index) => {
          const title = segment.title.trim();
          const hasTimeValues = segment.hours !== "" || segment.minutes !== "" || segment.seconds !== "";
          const hasAnyValue = title.length > 0 || hasTimeValues;
          if (!hasAnyValue) return [];
          if (!title) {
            throw new Error(`عنوان التقسيمة رقم ${index + 1} مطلوب.`);
          }

          const hours = Number.parseInt(segment.hours || "0", 10);
          const minutes = Number.parseInt(segment.minutes || "0", 10);
          const seconds = Number.parseInt(segment.seconds || "0", 10);

          if (!Number.isFinite(hours) || hours < 0) throw new Error(`ساعة التقسيمة رقم ${index + 1} غير صالحة`);
          if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
            throw new Error(`دقائق التقسيمة رقم ${index + 1} يجب أن تكون بين 0 و 59`);
          }
          if (!Number.isFinite(seconds) || seconds < 0 || seconds > 59) {
            throw new Error(`ثواني التقسيمة رقم ${index + 1} يجب أن تكون بين 0 و 59`);
          }

          return [{
            title,
            titleEn: segment.titleEn.trim() || undefined,
            segmentType: segment.segmentType,
            startSeconds: (hours * 3600) + (minutes * 60) + seconds,
          }];
        })
        .sort((a, b) => a.startSeconds - b.startSeconds);

      if (lessonForm.videoType === "youtube" && !videoUrl) {
        throw new Error("رابط YouTube مطلوب");
      }

      const payload: Record<string, unknown> = {
        title: lessonForm.title.trim(),
        titleEn: lessonForm.titleEn.trim(),
        description: lessonForm.description.trim(),
        descriptionEn: lessonForm.descriptionEn.trim(),
        isPublished: lessonForm.isPublished,
        video: {
          title: manualVideoTitle,
          titleEn: lessonForm.videoTitleEn.trim(),
          description: lessonForm.videoDescription.trim() || lessonForm.description.trim(),
          descriptionEn: lessonForm.videoDescriptionEn.trim() || lessonForm.descriptionEn.trim(),
          videoType: lessonForm.videoType,
          videoUrl,
          thumbnailUrl: thumbnailUrl || undefined,
          posterUrl: posterUrl || undefined,
          segments,
          instructor: lessonForm.instructor.trim() || "غير محدد",
          instructorEn: lessonForm.instructorEn.trim() || undefined,
          duration: autoDuration,
          publishStatus: lessonForm.publishStatus,
        },
      };

      let savedLesson: Lesson;
      if (lessonFormMode === "create") {
        payload.orderIndex = lessons.length;
        savedLesson = await apiFetch<Lesson>(token, `/admin/academic/units/${current.unitId}/lessons`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        upsertLessonInCache(current.unitId, savedLesson);
      } else {
        if (!editingLessonId) {
          throw new Error("تعذر تحديد الدرس المطلوب تعديله");
        }
        savedLesson = await apiFetch<Lesson>(token, `/admin/academic/lessons/${editingLessonId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        upsertLessonInCache(savedLesson.unitId, savedLesson);
      }
      setLastSavedLesson({ id: savedLesson.id, title: savedLesson.title, videoId: savedLesson.video?.id ?? null });

      // Save the quiz questions + settings together with the lesson (one save).
      const savedVideoId = savedLesson.video?.id;
      if (savedVideoId) {
        await apiFetch(token, `/admin/videos/${savedVideoId}/questions`, {
          method: "PUT",
          body: JSON.stringify({
            quizQuestionCount: lessonQuizCount,
            quizLanguage: lessonQuizLanguage,
            quizWatchGateEnabled: lessonQuizWatchGateEnabled,
            quizWatchGatePercent: lessonQuizWatchGatePercent,
            questions: lessonQuestions.map(localQuestionToPayload),
          }),
        });
      }

      invalidateAcademic();
      clearLessonDraft();
      resetLessonForm();
      setShowAdd(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر حفظ الدرس");
    } finally {
      setIsSavingLesson(false);
    }
  }

  // Actions for the grid/tree nodes. Edits reuse the existing per-level editor
  // panel by first pointing the breadcrumb path at the node's level (so the right
  // form renders), then opening it. Publish/delete/reorder are direct API calls.
  const treeActions: TreeActions = {
    editYear: (year) => {
      setCrumbs([{ level: "years", label: "السنوات الدراسية" }]);
      openYearEditor(year);
    },
    editSubject: (subject, ctx) => {
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
      ]);
      openSubjectEditor(subject);
    },
    editUnit: (unit, ctx) => {
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
        { level: "units", label: ctx.subjectName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitLabel: ctx.unitLabel },
      ]);
      openUnitEditor(unit);
    },
    editLesson: (lesson, ctx) => {
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
        { level: "units", label: ctx.subjectName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitLabel: ctx.unitLabel },
        { level: "lessons", label: ctx.unitName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitId: ctx.unitId },
      ]);
      openLessonEditor(lesson);
    },
    togglePublish: async (kind, id, next) => {
      await apiFetch(token, `/admin/academic/${NODE_KIND_PATH[kind]}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isPublished: next }),
      });
      invalidateAcademic();
    },
    remove: async (kind, id) => {
      await apiFetch(token, `/admin/academic/${NODE_KIND_PATH[kind]}/${id}`, { method: "DELETE" });
      invalidateAcademic();
    },
    reorder: (kind, siblings, index, dir) => {
      void moveItem(siblings, index, dir, `/admin/academic/${NODE_KIND_PATH[kind]}/reorder`);
    },
    gotoSubject: (subject, ctx) => {
      setViewMode("cards");
      setShowAdd(false);
      setShowExam(false);
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
      ]);
      setFlash({ kind: "subject", id: subject.id });
    },
    gotoUnit: (unit, ctx) => {
      setViewMode("cards");
      setShowAdd(false);
      setShowExam(false);
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
        { level: "units", label: ctx.subjectName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitLabel: ctx.unitLabel },
      ]);
      setFlash({ kind: "unit", id: unit.id });
    },
    gotoLesson: (lesson, ctx) => {
      setViewMode("cards");
      setShowAdd(false);
      setShowExam(false);
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
        { level: "units", label: ctx.subjectName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitLabel: ctx.unitLabel },
        { level: "lessons", label: ctx.unitName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitId: ctx.unitId, unitLabel: ctx.unitLabel },
      ]);
      setFlash({ kind: "lesson", id: lesson.id });
    },
    gotoExam: (unit, ctx) => {
      setViewMode("cards");
      setShowAdd(false);
      setCrumbs([
        { level: "years", label: "السنوات الدراسية" },
        { level: "subjects", label: ctx.yearName, yearId: ctx.yearId },
        { level: "units", label: ctx.subjectName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitLabel: ctx.unitLabel },
        { level: "lessons", label: ctx.unitName, yearId: ctx.yearId, subjectId: ctx.subjectId, unitId: unit.id, unitLabel: ctx.unitLabel },
      ]);
      setShowExam(true);
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            إدارة المحتوى الأكاديمي
          </h2>
          {viewMode === "cards" ? (
            <nav className="flex items-center gap-1.5 mt-2 flex-wrap">
              {crumbs.map((crumb, i) => (
                <span key={`${crumb.level}-${i}`} className="flex items-center gap-1">
                  {i > 0 ? <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" /> : null}
                  <button
                    onClick={() => {
                      setCrumbs((prev) => prev.slice(0, i + 1));
                      setShowAdd(false);
                      setShowExam(false);
                    }}
                    className={`text-sm font-semibold ${i === crumbs.length - 1 ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
          ) : (
            <p className="text-sm font-semibold text-primary mt-2">عرض شبكي · اضغط سنة لفتح شجرتها كاملة</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${viewMode === "cards" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title="عرض الكروت"
              aria-label="عرض الكروت"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${viewMode === "grid" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title="عرض شجري"
              aria-label="عرض شجري"
            >
              <Network className="w-4 h-4" />
            </button>
          </div>

          {viewMode === "cards" && current.level === "lessons" && !examExists && !showExam ? (
            <button
              type="button"
              onClick={() => {
                if (lessons.length === 0) return;
                setShowAdd(false);
                setShowExam(true);
              }}
              disabled={lessons.length === 0}
              title={lessons.length === 0 ? `ضيف درس واحد على الأقل الأول عشان تقدر تضيف الامتحان` : undefined}
              className="text-sm py-2 px-4 rounded-xl font-bold inline-flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Award className="w-4 h-4" />
              إضافة امتحان {currentUnitCopy.singular}
            </button>
          ) : null}

          {/* While the chapter-exam panel is open, the generic "إضافة" is hidden — the
              panel has its own "رجوع" and there's nothing to add at that point. */}
          {showExam ? null : (
            <button
              ref={addToggleRef}
              onClick={() => {
                setShowExam(false);
                setShowAdd((open) => {
                  const next = !open;
                  if (next) {
                    if (viewMode === "grid") {
                      // In grid mode the top "إضافة" always adds a year.
                      setCrumbs([{ level: "years", label: "السنوات الدراسية" }]);
                      resetYearForm();
                    } else if (current.level === "years") {
                      resetYearForm();
                    } else if (current.level === "subjects") {
                      resetSubjectForm();
                    } else if (current.level === "units") {
                      resetUnitForm();
                    } else if (current.level === "lessons") {
                      resetLessonForm();
                    }
                  }
                  return next;
                });
              }}
              className="btn-primary text-sm py-2 px-4"
            >
              <Plus className="w-4 h-4" />
              {showAdd ? "إغلاق" : "إضافة"}
            </button>
          )}
        </div>
      </div>

      {pendingDraft && !showAdd ? (
        <div className="glass-card p-3 flex items-center justify-between gap-3 flex-wrap border-amber-300/50 bg-amber-50/60">
          <div className="flex items-center gap-2 text-sm">
            <span>📝</span>
            <span className="font-bold text-amber-800">فيه مسودة درس لسه ماتحفظتش — تحب تكمّلها؟</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={restoreLessonDraft} className="btn-primary text-xs py-1.5 px-3">استرجاع المسودة</button>
            <button onClick={discardLessonDraft} className="text-xs py-1.5 px-3 rounded-lg bg-white/70 border border-white/70 font-bold text-muted-foreground hover:text-foreground">تجاهل</button>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {showAdd ? (
          <motion.div
            ref={addPanelRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-card p-4 space-y-3 border-primary/20"
          >
            {current.level === "years" ? (
              <>
                <h3 className="font-bold text-foreground">{yearFormMode === "edit" ? "تعديل السنة" : "إضافة سنة جديدة"}</h3>
                <input
                  value={yearForm.name}
                  onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم السنة (عربي)"
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={yearForm.nameEn}
                  onChange={(e) => setYearForm((p) => ({ ...p, nameEn: e.target.value }))}
                  placeholder="Year name (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={yearForm.description}
                  onChange={(e) => setYearForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف (عربي)"
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={yearForm.descriptionEn}
                  onChange={(e) => setYearForm((p) => ({ ...p, descriptionEn: e.target.value }))}
                  placeholder="Description (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!yearForm.name.trim()) return alert("اسم السنة بالعربية مطلوب");
                    if (!yearForm.nameEn.trim()) return alert("اسم السنة بالإنجليزية مطلوب");
                    try {
                      const body = JSON.stringify({
                        name: yearForm.name.trim(),
                        nameEn: yearForm.nameEn.trim(),
                        description: yearForm.description.trim(),
                        descriptionEn: yearForm.descriptionEn.trim(),
                      });
                      if (yearFormMode === "edit" && editingYearId) {
                        await apiFetch(token, `/admin/academic/years/${editingYearId}`, { method: "PUT", body });
                      } else {
                        await apiFetch(token, "/admin/academic/years", {
                          method: "POST",
                          body: JSON.stringify({ ...JSON.parse(body), isPublished: false }),
                        });
                      }
                      resetYearForm();
                      setShowAdd(false);
                      invalidateAcademic();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "تعذر حفظ السنة");
                    }
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  {yearFormMode === "edit" ? "حفظ تعديل السنة" : "حفظ السنة"}
                </button>
              </>
            ) : null}

            {current.level === "subjects" && current.yearId ? (
              <>
                <h3 className="font-bold text-foreground">
                  {subjectFormMode === "edit" ? "تعديل المادة" : "إضافة مادة داخل السنة"}
                </h3>
                <input
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم المادة (عربي)"
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.nameEn}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, nameEn: e.target.value }))}
                  placeholder="Subject name (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.icon}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, icon: e.target.value }))}
                  placeholder="أيقونة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">اسم التقسيم داخل المادة</p>
                  <div className="grid grid-cols-3 gap-2">
                    {UNIT_LABEL_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSubjectForm((p) => ({ ...p, unitLabel: option.value }))}
                        className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                          subjectForm.unitLabel === option.value
                            ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                            : "border-white/70 bg-white/70 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option.optionLabel}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيظهر هذا الاسم في شاشة المادة وأزرار الرجوع، مثل: {getUnitLabelCopy(subjectForm.unitLabel).plural}.
                  </p>
                </div>
                <input
                  value={subjectForm.description}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف (عربي)"
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.descriptionEn}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, descriptionEn: e.target.value }))}
                  placeholder="Description (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!subjectForm.name.trim()) return alert("اسم المادة بالعربية مطلوب");
                    if (!subjectForm.nameEn.trim()) return alert("اسم المادة بالإنجليزية مطلوب");
                    try {
                      const payload = {
                        name: subjectForm.name.trim(),
                        nameEn: subjectForm.nameEn.trim(),
                        icon: subjectForm.icon.trim() || "📚",
                        description: subjectForm.description.trim(),
                        descriptionEn: subjectForm.descriptionEn.trim(),
                        unitLabel: subjectForm.unitLabel,
                      };

                      if (subjectFormMode === "edit") {
                        if (!editingSubjectId) throw new Error("تعذر تحديد المادة المطلوب تعديلها");
                        await apiFetch(token, `/admin/academic/subjects/${editingSubjectId}`, {
                          method: "PUT",
                          body: JSON.stringify(payload),
                        });
                      } else {
                        await apiFetch(token, `/admin/academic/years/${current.yearId}/subjects`, {
                          method: "POST",
                          body: JSON.stringify({
                            ...payload,
                            isPublished: false,
                          }),
                        });
                      }

                      resetSubjectForm();
                      setShowAdd(false);
                      invalidateAcademic();
                    } catch (err) {
                      const message = err instanceof Error ? err.message : "تعذر حفظ المادة";
                      alert(message);
                    }
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  {subjectFormMode === "edit" ? "حفظ تعديل المادة" : "حفظ المادة"}
                </button>
              </>
            ) : null}

            {current.level === "units" && current.subjectId ? (
              <>
                <h3 className="font-bold text-foreground">{unitFormMode === "edit" ? `تعديل ${currentUnitCopy.singular}` : currentUnitCopy.createTitle}</h3>
                <input
                  value={unitForm.name}
                  onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder={`${currentUnitCopy.namePlaceholder} (عربي)`}
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={unitForm.nameEn}
                  onChange={(e) => setUnitForm((p) => ({ ...p, nameEn: e.target.value }))}
                  placeholder="Name (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={unitForm.description}
                  onChange={(e) => setUnitForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف (عربي)"
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={unitForm.descriptionEn}
                  onChange={(e) => setUnitForm((p) => ({ ...p, descriptionEn: e.target.value }))}
                  placeholder="Description (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!unitForm.name.trim()) return alert(`${currentUnitCopy.namePlaceholder} بالعربية مطلوب`);
                    if (!unitForm.nameEn.trim()) return alert("الاسم بالإنجليزية مطلوب");
                    try {
                      const body = JSON.stringify({
                        name: unitForm.name.trim(),
                        nameEn: unitForm.nameEn.trim(),
                        description: unitForm.description.trim(),
                        descriptionEn: unitForm.descriptionEn.trim(),
                      });
                      if (unitFormMode === "edit" && editingUnitId) {
                        await apiFetch(token, `/admin/academic/units/${editingUnitId}`, { method: "PUT", body });
                      } else {
                        await apiFetch(token, `/admin/academic/subjects/${current.subjectId}/units`, {
                          method: "POST",
                          body: JSON.stringify({ ...JSON.parse(body), isPublished: false }),
                        });
                      }
                      resetUnitForm();
                      setShowAdd(false);
                      invalidateAcademic();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "تعذر حفظ الوحدة");
                    }
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  {unitFormMode === "edit" ? `حفظ تعديل ${currentUnitCopy.singular}` : `حفظ ${currentUnitCopy.singular}`}
                </button>
              </>
            ) : null}

            {current.level === "lessons" && current.unitId ? (
              showQuestionsPage ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-white/40 pb-2.5">
                    <button
                      type="button"
                      onClick={() => setShowQuestionsPage(false)}
                      className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary"
                    >
                      <ChevronRight className="w-4 h-4" /> رجوع لبيانات الدرس
                    </button>
                    <span className="text-sm font-bold text-primary">أسئلة الاختبار</span>
                  </div>
                  <QuizManager
                    questions={lessonQuestions}
                    onChange={setLessonQuestions}
                    quizQuestionCount={lessonQuizCount}
                    onCountChange={setLessonQuizCount}
                    quizLanguage={lessonQuizLanguage}
                    onLanguageChange={setLessonQuizLanguage}
                    quizWatchGateEnabled={lessonQuizWatchGateEnabled}
                    onWatchGateEnabledChange={setLessonQuizWatchGateEnabled}
                    quizWatchGatePercent={lessonQuizWatchGatePercent}
                    onWatchGatePercentChange={setLessonQuizWatchGatePercent}
                    token={token}
                  />
                  <button type="button" onClick={() => setShowQuestionsPage(false)} className="btn-primary text-sm py-2 px-5">
                    تمام — رجوع للدرس (الأسئلة بتتحفظ مع الدرس)
                  </button>
                </div>
              ) : (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-white/40 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary"
                  >
                    <ChevronRight className="w-4 h-4" /> رجوع لقائمة الدروس
                  </button>
                  {draftRestored ? (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">📝 مسودة مستعادة (لسه ماتحفظتش)</span>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1">💾 بيتحفظ تلقائي وأنت بتكتب</span>
                  )}
                </div>
                <h3 className="font-bold text-foreground">
                  {lessonFormMode === "edit" ? "تعديل الدرس + الفيديو + الأسئلة" : "إضافة درس + فيديو + أسئلة (كله مرة واحدة)"}
                </h3>
                <div className="rounded-xl border border-primary/15 bg-primary/10 px-3 py-2 text-xs font-bold text-primary flex flex-wrap gap-2">
                  {lessonFormMode === "edit" ? (
                    <>
                      <span>رقم الدرس: {editingLessonId ?? "غير معروف"}</span>
                      <span>رقم الفيديو: {editingLesson?.video?.id ?? "لا يوجد فيديو مرتبط"}</span>
                    </>
                  ) : (
                    <span>سيظهر رقم الدرس ورقم الفيديو تلقائيًا بعد الحفظ، وسيظهران على كارت الدرس في القائمة.</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={lessonForm.title}
                    onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="عنوان الدرس (عربي)"
                    dir="rtl"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.titleEn}
                    onChange={(e) => setLessonForm((p) => ({ ...p, titleEn: e.target.value }))}
                    placeholder="Lesson title (English)"
                    dir="ltr"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.description}
                    onChange={(e) => setLessonForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="وصف الدرس (عربي)"
                    dir="rtl"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.descriptionEn}
                    onChange={(e) => setLessonForm((p) => ({ ...p, descriptionEn: e.target.value }))}
                    placeholder="Lesson description (English)"
                    dir="ltr"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLessonForm((p) => ({ ...p, videoType: "youtube" }))}
                    className={`py-2 rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 ${lessonForm.videoType === "youtube" ? "bg-primary text-white border-primary" : "bg-white/70 border-white/70"}`}
                  >
                    <Youtube className="w-4 h-4" /> YouTube
                  </button>
                  <button
                    onClick={() => setLessonForm((p) => ({ ...p, videoType: "upload" }))}
                    className={`py-2 rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 ${lessonForm.videoType === "upload" ? "bg-primary text-white border-primary" : "bg-white/70 border-white/70"}`}
                  >
                    <Upload className="w-4 h-4" /> رفع ملف
                  </button>
                </div>

                {lessonForm.videoType === "youtube" ? (
                  <input
                    value={lessonForm.videoUrl}
                    onChange={(e) => setLessonForm((p) => ({ ...p, videoUrl: e.target.value }))}
                    placeholder="رابط YouTube"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                ) : (
                  <label className="w-full px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                    <span>{lessonVideoFile ? lessonVideoFile.name : "اختر ملف فيديو"}</span>
                    <Video className="w-4 h-4 text-primary" />
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => setLessonVideoFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={lessonForm.videoTitle}
                    onChange={(e) => setLessonForm((p) => ({ ...p, videoTitle: e.target.value }))}
                    placeholder="عنوان الفيديو (عربي - مطلوب)"
                    dir="rtl"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.videoTitleEn}
                    onChange={(e) => setLessonForm((p) => ({ ...p, videoTitleEn: e.target.value }))}
                    placeholder="Video title (English)"
                    dir="ltr"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.instructor}
                    onChange={(e) => setLessonForm((p) => ({ ...p, instructor: e.target.value }))}
                    placeholder="اسم المدرس (عربي)"
                    dir="rtl"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.instructorEn}
                    onChange={(e) => setLessonForm((p) => ({ ...p, instructorEn: e.target.value }))}
                    placeholder="Instructor name (English)"
                    dir="ltr"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 text-sm">
                    <p className="text-[11px] font-bold text-muted-foreground mb-1">مدة الفيديو (تلقائي)</p>
                    {isDurationDetecting ? (
                      <p className="font-semibold text-primary">Calculating video duration...</p>
                    ) : detectedDurationSeconds && detectedDurationSeconds > 0 ? (
                      <p className="font-bold text-foreground">{formatDuration(detectedDurationSeconds)}</p>
                    ) : (
                      <p className="font-semibold text-muted-foreground">سيتم حساب المدة تلقائيًا بعد إدخال الفيديو.</p>
                    )}
                    {durationDetectionError ? (
                      <p className="mt-1 text-[11px] font-semibold text-rose-600">{durationDetectionError}</p>
                    ) : null}
                  </div>
                  <select
                    value={lessonForm.publishStatus}
                    onChange={(e) => setLessonForm((p) => ({ ...p, publishStatus: e.target.value as "draft" | "published" }))}
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  >
                    <option value="published">الفيديو منشور</option>
                    <option value="draft">الفيديو مسودة</option>
                  </select>
                </div>

                <textarea
                  value={lessonForm.videoDescription}
                  onChange={(e) => setLessonForm((p) => ({ ...p, videoDescription: e.target.value }))}
                  placeholder="وصف الفيديو (عربي)"
                  dir="rtl"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none min-h-[90px]"
                />
                <textarea
                  value={lessonForm.videoDescriptionEn}
                  onChange={(e) => setLessonForm((p) => ({ ...p, videoDescriptionEn: e.target.value }))}
                  placeholder="Video description (English)"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none min-h-[90px]"
                />

                <div ref={segmentsSectionRef} className="w-full rounded-xl border border-white/70 bg-white/55 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">تقسيم الفيديو (وصول سريع)</p>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={downloadSegmentsTemplate}
                        title="تحميل قالب Excel جاهز للتعبئة"
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 border border-white/70 text-muted-foreground font-bold hover:text-primary flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> قالب
                      </button>
                      <button
                        type="button"
                        onClick={() => segmentsFileRef.current?.click()}
                        title="استيراد التقسيمات من ملف Excel"
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold hover:bg-emerald-500/20 flex items-center gap-1"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> استيراد Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => setLessonSegments((prev) => [...prev, createSegmentRow()])}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20"
                      >
                        + إضافة تقسيمة
                      </button>
                      <input
                        ref={segmentsFileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSegmentsFromExcel(f); e.target.value = ""; }}
                      />
                    </div>
                  </div>

                  {lessonSegments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">لا توجد تقسيمات الآن. يمكنك إضافة أسئلة/أجزاء/مواضيع مع الوقت.</p>
                  ) : (
                    <div className="space-y-2">
                      {lessonSegments.map((segment, index) => (
                        <div key={segment.id} className="rounded-xl border border-white/70 bg-white/70 p-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-muted-foreground">تقسيمة #{index + 1}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLessonSegments((prev) => prev.filter((item) => item.id !== segment.id))}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-600 font-bold hover:bg-red-200"
                            >
                              حذف
                            </button>
                          </div>

                          <input
                            value={segment.title}
                            onChange={(e) =>
                              setLessonSegments((prev) =>
                                prev.map((item) => (item.id === segment.id ? { ...item, title: e.target.value } : item)),
                              )
                            }
                            placeholder="عنوان التقسيمة (عربي)"
                            dir="rtl"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-white/70 text-sm outline-none"
                          />
                          <input
                            value={segment.titleEn}
                            onChange={(e) =>
                              setLessonSegments((prev) =>
                                prev.map((item) => (item.id === segment.id ? { ...item, titleEn: e.target.value } : item)),
                              )
                            }
                            placeholder="Section title (English)"
                            dir="ltr"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-white/70 text-sm outline-none"
                          />

                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2">
                            <select
                              value={segment.segmentType}
                              onChange={(e) =>
                                setLessonSegments((prev) =>
                                  prev.map((item) =>
                                    item.id === segment.id
                                      ? { ...item, segmentType: e.target.value as VideoSegmentType }
                                      : item,
                                  ),
                                )
                              }
                              className="px-3 py-2 rounded-lg bg-white border border-white/70 text-sm outline-none"
                            >
                              {SEGMENT_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>

                            <input
                              value={segment.hours}
                              onChange={(e) =>
                                setLessonSegments((prev) =>
                                  prev.map((item) =>
                                    item.id === segment.id
                                      ? { ...item, hours: e.target.value.replace(/\D/g, "").slice(0, 3) }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="ساعة"
                              inputMode="numeric"
                              className="px-3 py-2 rounded-lg bg-white border border-white/70 text-sm outline-none w-full sm:w-20"
                            />
                            <input
                              value={segment.minutes}
                              onChange={(e) =>
                                setLessonSegments((prev) =>
                                  prev.map((item) =>
                                    item.id === segment.id
                                      ? { ...item, minutes: e.target.value.replace(/\D/g, "").slice(0, 2) }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="دقيقة"
                              inputMode="numeric"
                              className="px-3 py-2 rounded-lg bg-white border border-white/70 text-sm outline-none w-full sm:w-20"
                            />
                            <input
                              value={segment.seconds}
                              onChange={(e) =>
                                setLessonSegments((prev) =>
                                  prev.map((item) =>
                                    item.id === segment.id
                                      ? { ...item, seconds: e.target.value.replace(/\D/g, "").slice(0, 2) }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="ثانية"
                              inputMode="numeric"
                              className="px-3 py-2 rounded-lg bg-white border border-white/70 text-sm outline-none w-full sm:w-20"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex-1 px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                    <span>{lessonThumbnailFile ? lessonThumbnailFile.name : "الصورة الرئيسية — قائمة الدروس + ثامبنيل الفيديو (اختياري)"}</span>
                    <Upload className="w-4 h-4 text-primary" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setLessonThumbnailFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="الأبعاد الموصى بها للصورة الرئيسية" className="shrink-0 text-muted-foreground hover:text-primary transition-colors">
                          <Info className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="end" className="max-w-[280px] text-right leading-relaxed">
                        <strong>الصورة الرئيسية</strong>: تظهر في قائمة الدروس، وفي سجل المشاهدة، وكثامبنيل الفيديو داخل صفحة الدرس. المقاس الموصى به: <strong>1280×720 بكسل</strong> (الأفضل 1920×1080) — بنسبة <strong>16:9</strong>. أقصى حجم 10 ميجا، صيغة JPG أو WebP.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex-1 px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                    <span>{lessonPosterFile ? lessonPosterFile.name : "الصورة الثانوية — كارت ملخص الدرس (اختياري)"}</span>
                    <Upload className="w-4 h-4 text-primary" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setLessonPosterFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="الأبعاد الموصى بها للصورة الثانوية" className="shrink-0 text-muted-foreground hover:text-primary transition-colors">
                          <Info className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="end" className="max-w-[280px] text-right leading-relaxed">
                        <strong>الصورة الثانوية</strong>: تظهر في كارت ملخص الدرس أسفل الفيديو. نفس النسبة <strong>16:9</strong> — المقاس الموصى به <strong>1280×720 بكسل</strong>. أقصى حجم 10 ميجا، صيغة JPG أو WebP.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  لكل درس صورتان: <strong>الرئيسية</strong> (قائمة الدروس + ثامبنيل الفيديو) و<strong>الثانوية</strong> (كارت ملخص الدرس). كلاهما بنسبة 16:9.
                </p>
                {!lessonThumbnailFile && !lessonForm.thumbnailUrl ? (
                  <p className="text-xs font-semibold text-amber-700 -mt-1">
                    تنبيه: لم يتم رفع الصورة الرئيسية بعد. سيظهر Placeholder في قائمة الدروس وكثامبنيل الفيديو حتى يتم رفعها.
                  </p>
                ) : null}

                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={lessonForm.isPublished}
                    onChange={(e) => setLessonForm((p) => ({ ...p, isPublished: e.target.checked }))}
                    className="accent-primary"
                  />
                  نشر الدرس مباشرة
                </label>

                {/* v2 Phase 2 — quiz questions open on their own page; saved WITH the lesson */}
                <button
                  type="button"
                  onClick={() => setShowQuestionsPage(true)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-primary/25 bg-primary/5 text-primary font-bold text-sm hover:bg-primary/10"
                >
                  <span className="flex items-center gap-2">
                    📝 أسئلة الاختبار{lessonQuestions.length > 0 ? ` (${lessonQuestions.length})` : ""}
                  </span>
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={submitLesson}
                  disabled={isSavingLesson || isDurationDetecting}
                  className="btn-primary text-sm py-2 px-5 disabled:opacity-60"
                >
                  {isSavingLesson
                    ? "جاري الحفظ..."
                    : isDurationDetecting
                    ? "جارٍ حساب المدة..."
                    : lessonFormMode === "edit"
                    ? "حفظ التعديلات"
                    : "حفظ الدرس والفيديو"}
                </button>
              </>
              )
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="space-y-3">
        {viewMode === "grid" ? (
          years.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد سنوات دراسية بعد.</div>
          ) : (
            years.map((year, index) => (
              <YearTreeCard
                key={year.id}
                year={year}
                expanded={expandedYearId === year.id}
                onToggle={() => {
                  setExpandedYearId((prev) => (prev === year.id ? null : year.id));
                  setShowAdd(false);
                }}
                token={token}
                actions={treeActions}
                tone={yearItemTone(index)}
                onMoveUp={index > 0 ? () => moveItem(years, index, "up", "/admin/academic/years/reorder") : undefined}
                onMoveDown={index < years.length - 1 ? () => moveItem(years, index, "down", "/admin/academic/years/reorder") : undefined}
              />
            ))
          )
        ) : (
        <>
        {current.level === "years" ? (
          years.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد سنوات دراسية بعد.</div>
          ) : (
            years.map((year, index) => {
              const tone = yearItemTone(index);
              return (
                <ItemCard
                  key={year.id}
                  icon={<GraduationCap className="w-5 h-5" />}
                  title={year.name}
                  description={year.description}
                  isPublished={year.isPublished}
                  containerClassName="border-white/70"
                  iconWrapperClassName={tone.iconWrapper}
                  topAccentClassName={tone.top}
                  onRename={() => openYearEditor(year)}
                  onTogglePublish={async () => {
                    await apiFetch(token, `/admin/academic/years/${year.id}`, {
                      method: "PUT",
                      body: JSON.stringify({ isPublished: !year.isPublished }),
                    });
                    invalidateAcademic();
                  }}
                  onDelete={async () => {
                    await apiFetch(token, `/admin/academic/years/${year.id}`, { method: "DELETE" });
                    invalidateAcademic();
                  }}
                  onMoveUp={index > 0 ? () => moveItem(years, index, "up", "/admin/academic/years/reorder") : undefined}
                  onMoveDown={index < years.length - 1 ? () => moveItem(years, index, "down", "/admin/academic/years/reorder") : undefined}
                  onOpen={() => {
                    setCrumbs((prev) => [...prev, { level: "subjects", label: year.name, yearId: year.id }]);
                    setShowAdd(false);
                  }}
                />
              );
            })
          )
        ) : null}

        {current.level === "subjects" ? (
          subjects.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد مواد داخل هذه السنة.</div>
          ) : (
            subjects.map((subject, index) => (
              <ItemCard
                key={subject.id}
                highlight={flash?.kind === "subject" && flash.id === subject.id}
                onHighlightEnd={() => setFlash(null)}
                icon={<span className="text-xl">{subject.icon || "📚"}</span>}
                title={subject.name}
                description={subject.description}
                isPublished={subject.isPublished}
                badge={
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                    {getUnitLabelCopy(subject.unitLabel).plural}
                  </span>
                }
                onRename={() => openSubjectEditor(subject)}
                onTogglePublish={async () => {
                  await apiFetch(token, `/admin/academic/subjects/${subject.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ isPublished: !subject.isPublished }),
                  });
                  invalidateAcademic();
                }}
                onDelete={async () => {
                  await apiFetch(token, `/admin/academic/subjects/${subject.id}`, { method: "DELETE" });
                  invalidateAcademic();
                }}
                onMoveUp={index > 0 ? () => moveItem(subjects, index, "up", "/admin/academic/subjects/reorder") : undefined}
                onMoveDown={index < subjects.length - 1 ? () => moveItem(subjects, index, "down", "/admin/academic/subjects/reorder") : undefined}
                onOpen={() => {
                  setCrumbs((prev) => [
                    ...prev,
                    {
                      level: "units",
                      label: subject.name,
                      yearId: current.yearId,
                      subjectId: subject.id,
                      unitLabel: normalizeUnitLabel(subject.unitLabel),
                    },
                  ]);
                  setShowAdd(false);
                }}
              />
            ))
          )
        ) : null}

        {current.level === "units" ? (
          units.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">{currentUnitCopy.emptyMessage}</div>
          ) : (
            units.map((unit, index) => (
              <ItemCard
                key={unit.id}
                highlight={flash?.kind === "unit" && flash.id === unit.id}
                onHighlightEnd={() => setFlash(null)}
                icon={<Layers className="w-5 h-5 text-sky-500" />}
                title={unit.name}
                description={unit.description}
                isPublished={unit.isPublished}
                onRename={() => openUnitEditor(unit)}
                onTogglePublish={async () => {
                  await apiFetch(token, `/admin/academic/units/${unit.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ isPublished: !unit.isPublished }),
                  });
                  invalidateAcademic();
                }}
                onDelete={async () => {
                  await apiFetch(token, `/admin/academic/units/${unit.id}`, { method: "DELETE" });
                  invalidateAcademic();
                }}
                onMoveUp={index > 0 ? () => moveItem(units, index, "up", "/admin/academic/units/reorder") : undefined}
                onMoveDown={index < units.length - 1 ? () => moveItem(units, index, "down", "/admin/academic/units/reorder") : undefined}
                onOpen={() => {
                  setCrumbs((prev) => [...prev, { level: "lessons", label: unit.name, yearId: current.yearId, subjectId: current.subjectId, unitId: unit.id, unitLabel: current.unitLabel }]);
                  setShowAdd(false);
                  setShowExam(false);
                }}
              />
            ))
          )
        ) : null}

        {/* v2 Phase 2 — the chapter-exam settings panel (both exams, each independent). */}
        {current.level === "lessons" && showExam && current.unitId ? (
          <div className="glass-card p-4 space-y-3 border-indigo-200/60">
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-white/40 pb-2.5">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600" /> امتحان {currentUnitCopy.singular}: {current.label}
              </h3>
              <button
                type="button"
                onClick={() => setShowExam(false)}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary"
              >
                <ChevronRight className="w-4 h-4" /> رجوع لقائمة الدروس
              </button>
            </div>
            <ChapterExamManager
              unitId={current.unitId}
              token={token}
              unitLabelSingular={currentUnitCopy.singular}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["admin", "academic", "unit-exam", current.unitId] });
              }}
            />
          </div>
        ) : null}

        {current.level === "lessons" && !showAdd && !showExam ? (
          <>
            {lastSavedLesson ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                تم حفظ الدرس "{lastSavedLesson.title}". رقم الدرس: {lastSavedLesson.id}
                {lastSavedLesson.videoId ? ` · رقم الفيديو: ${lastSavedLesson.videoId}` : " · لا يوجد فيديو مرتبط"}
              </div>
            ) : null}

            {lessons.length === 0 ? (
              <div className="glass-card p-8 text-center text-muted-foreground">لا توجد دروس داخل هذه الوحدة.</div>
            ) : (
              lessons.map((lesson, index) => (
              <ItemCard
                key={lesson.id}
                highlight={flash?.kind === "lesson" && flash.id === lesson.id}
                onHighlightEnd={() => setFlash(null)}
                icon={<PlayCircle className="w-5 h-5 text-emerald-500" />}
                title={lesson.title}
                description={lesson.description}
                isPublished={lesson.isPublished}
                badge={
                  lesson.video ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold">
                      {lesson.video.videoType === "youtube" ? "YouTube" : "Upload"}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">بلا فيديو</span>
                  )
                }
                meta={
                  <>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                      رقم الدرس: {lesson.id}
                    </span>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-black text-sky-700">
                      رقم الفيديو: {lesson.video?.id ?? "لا يوجد"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                      استخدم رقم الدرس في الرسائل
                    </span>
                  </>
                }
                onRename={() => openLessonEditor(lesson)}
                onTogglePublish={async () => {
                  await apiFetch(token, `/admin/academic/lessons/${lesson.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ isPublished: !lesson.isPublished }),
                  });
                  invalidateAcademic();
                }}
                onDelete={async () => {
                  await apiFetch(token, `/admin/academic/lessons/${lesson.id}`, { method: "DELETE" });
                  invalidateAcademic();
                }}
                onMoveUp={index > 0 ? () => moveItem(lessons, index, "up", "/admin/academic/lessons/reorder") : undefined}
                onMoveDown={index < lessons.length - 1 ? () => moveItem(lessons, index, "down", "/admin/academic/lessons/reorder") : undefined}
              />
              ))
            )}

            {/* The distinguished chapter-exam card — always pinned at the bottom, once
                the exam exists. Tap to open its settings (both exams). */}
            {examExists ? (
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setShowExam(true);
                }}
                className="w-full text-start rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:brightness-105 transition"
              >
                <span className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-white" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[15px]">امتحان {currentUnitCopy.singular}</span>
                  <span className="block text-[12px] text-indigo-100 mt-0.5">
                    امتحان الاستدراك:{" "}
                    <b className={examReviewOpen ? "text-emerald-200" : "text-indigo-200"}>{examReviewOpen ? "مفتوح" : "مقفول"}</b>
                    {" · "}تحديك الخاص:{" "}
                    <b className={examAdaptiveOpen ? "text-emerald-200" : "text-indigo-200"}>{examAdaptiveOpen ? "مفتوح" : "مقفول"}</b>
                    {" · "}اضغط للإعدادات
                  </span>
                </span>
                <ChevronLeft className="w-5 h-5 text-white/80 shrink-0" />
              </button>
            ) : null}
          </>
        ) : null}
        </>
        )}
      </div>
    </div>
  );
}
