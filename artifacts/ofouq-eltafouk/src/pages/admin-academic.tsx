import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
  PlayCircle,
  Plus,
  Trash2,
  Upload,
  Video,
  Youtube,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type Level = "years" | "subjects" | "units" | "lessons";

type Breadcrumb = {
  level: Level;
  label: string;
  yearId?: number;
  subjectId?: number;
  unitId?: number;
};

interface AcademicYear {
  id: number;
  name: string;
  description: string;
  orderIndex: number;
  isPublished: boolean;
}

interface Subject {
  id: number;
  yearId: number;
  name: string;
  icon: string;
  description: string;
  orderIndex: number;
  isPublished: boolean;
}

interface Unit {
  id: number;
  subjectId: number;
  name: string;
  description: string;
  orderIndex: number;
  isPublished: boolean;
}

interface Lesson {
  id: number;
  unitId: number;
  title: string;
  description: string;
  videoId?: number;
  orderIndex: number;
  isPublished: boolean;
  video?: {
    id: number;
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl?: string;
    posterUrl?: string;
    duration: number;
    instructor: string;
    videoType: "youtube" | "upload";
    publishStatus: "draft" | "published";
    segments?: {
      id: number;
      title: string;
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
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
    segmentType: "parts",
    hours: "",
    minutes: "",
    seconds: "",
  };
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
  onOpen,
  onRename,
  onTogglePublish,
  onDelete,
  onMoveUp,
  onMoveDown,
  containerClassName,
  iconWrapperClassName,
  topAccentClassName,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  isPublished: boolean;
  badge?: React.ReactNode;
  onOpen?: () => void;
  onRename: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  containerClassName?: string;
  iconWrapperClassName?: string;
  topAccentClassName?: string;
}) {
  return (
    <div className={`glass-card no-lift relative overflow-hidden p-4 min-h-[92px] flex items-center gap-3 ${!isPublished ? "opacity-75" : ""} ${containerClassName ?? ""}`}>
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
          <Plus className="w-3.5 h-3.5" />
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

export function AcademicTab() {
  const qc = useQueryClient();
  const { token } = useAuth();

  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ level: "years", label: "السنوات الدراسية" }]);
  const [showAdd, setShowAdd] = useState(false);

  const [yearForm, setYearForm] = useState({ name: "", description: "" });
  const [subjectForm, setSubjectForm] = useState({ name: "", icon: "📚", description: "" });
  const [unitForm, setUnitForm] = useState({ name: "", description: "" });
  const [lessonForm, setLessonForm] = useState({
    title: "",
    description: "",
    isPublished: true,
    videoType: "youtube" as "youtube" | "upload",
    videoUrl: "",
    videoTitle: "",
    videoDescription: "",
    instructor: "",
    publishStatus: "published" as "draft" | "published",
    thumbnailUrl: "",
    posterUrl: "",
  });
  const [lessonVideoFile, setLessonVideoFile] = useState<File | null>(null);
  const [lessonThumbnailFile, setLessonThumbnailFile] = useState<File | null>(null);
  const [lessonPosterFile, setLessonPosterFile] = useState<File | null>(null);
  const [lessonSegments, setLessonSegments] = useState<LessonSegmentFormItem[]>([]);
  const [lessonFormMode, setLessonFormMode] = useState<"create" | "edit">("create");
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [detectedDurationSeconds, setDetectedDurationSeconds] = useState<number | null>(null);
  const [isDurationDetecting, setIsDurationDetecting] = useState(false);
  const [durationDetectionError, setDurationDetectionError] = useState<string | null>(null);
  const durationDetectionRequestRef = useRef(0);

  const current = crumbs[crumbs.length - 1];

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

  const years = useSorted(yearsQ.data ?? []);
  const subjects = useSorted(subjectsQ.data ?? []);
  const units = useSorted(unitsQ.data ?? []);
  const lessons = useSorted(lessonsQ.data ?? []);

  function invalidateAcademic() {
    qc.invalidateQueries({ queryKey: ["admin", "academic"] });
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

  function resetLessonForm() {
    setLessonForm({
      title: "",
      description: "",
      isPublished: true,
      videoType: "youtube",
      videoUrl: "",
      videoTitle: "",
      videoDescription: "",
      instructor: "",
      publishStatus: "published",
      thumbnailUrl: "",
      posterUrl: "",
    });
    setLessonVideoFile(null);
    setLessonThumbnailFile(null);
    setLessonPosterFile(null);
    setLessonSegments([]);
    setLessonFormMode("create");
    setEditingLessonId(null);
    setDetectedDurationSeconds(null);
    setIsDurationDetecting(false);
    setDurationDetectionError(null);
  }

  function openLessonEditor(lesson: Lesson) {
    const sourceSegments = [...(lesson.video?.segments ?? [])].sort(
      (a, b) => (a.orderIndex - b.orderIndex) || (a.startSeconds - b.startSeconds),
    );

    setLessonForm({
      title: lesson.title,
      description: lesson.description,
      isPublished: lesson.isPublished,
      videoType: lesson.video?.videoType ?? "youtube",
      videoUrl: lesson.video?.videoUrl ?? "",
      videoTitle: lesson.video?.title ?? "",
      videoDescription: lesson.video?.description ?? lesson.description,
      instructor: lesson.video?.instructor ?? "",
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
    setShowAdd(true);
  }

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
      alert("عنوان الدرس مطلوب");
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
        description: lessonForm.description.trim(),
        isPublished: lessonForm.isPublished,
        video: {
          title: manualVideoTitle,
          description: lessonForm.videoDescription.trim() || lessonForm.description.trim(),
          videoType: lessonForm.videoType,
          videoUrl,
          thumbnailUrl: thumbnailUrl || undefined,
          posterUrl: posterUrl || undefined,
          segments,
          instructor: lessonForm.instructor.trim() || "غير محدد",
          duration: autoDuration,
          publishStatus: lessonForm.publishStatus,
        },
      };

      if (lessonFormMode === "create") {
        payload.orderIndex = lessons.length;
        await apiFetch(token, `/admin/academic/units/${current.unitId}/lessons`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        if (!editingLessonId) {
          throw new Error("تعذر تحديد الدرس المطلوب تعديله");
        }
        await apiFetch(token, `/admin/academic/lessons/${editingLessonId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      invalidateAcademic();
      resetLessonForm();
      setShowAdd(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر حفظ الدرس");
    } finally {
      setIsSavingLesson(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            إدارة المحتوى الأكاديمي
          </h2>
          <nav className="flex items-center gap-1.5 mt-2 flex-wrap">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.level}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" /> : null}
                <button
                  onClick={() => {
                    setCrumbs((prev) => prev.slice(0, i + 1));
                    setShowAdd(false);
                  }}
                  className={`text-sm font-semibold ${i === crumbs.length - 1 ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <button
          onClick={() => {
            setShowAdd((open) => {
              const next = !open;
              if (next && current.level === "lessons") {
                resetLessonForm();
              }
              return next;
            });
          }}
          className="btn-primary text-sm py-2 px-4"
        >
          <Plus className="w-4 h-4" />
          {showAdd ? "إغلاق" : "إضافة"}
        </button>
      </div>

      <AnimatePresence>
        {showAdd ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-card p-4 space-y-3 border-primary/20"
          >
            {current.level === "years" ? (
              <>
                <h3 className="font-bold text-foreground">إضافة سنة جديدة</h3>
                <input
                  value={yearForm.name}
                  onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم السنة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={yearForm.description}
                  onChange={(e) => setYearForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!yearForm.name.trim()) return alert("اسم السنة مطلوب");
                    await apiFetch(token, "/admin/academic/years", {
                      method: "POST",
                      body: JSON.stringify({
                        name: yearForm.name.trim(),
                        description: yearForm.description.trim(),
                        isPublished: false,
                      }),
                    });
                    setYearForm({ name: "", description: "" });
                    setShowAdd(false);
                    invalidateAcademic();
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  حفظ السنة
                </button>
              </>
            ) : null}

            {current.level === "subjects" && current.yearId ? (
              <>
                <h3 className="font-bold text-foreground">إضافة مادة داخل السنة</h3>
                <input
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم المادة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.icon}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, icon: e.target.value }))}
                  placeholder="أيقونة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.description}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!subjectForm.name.trim()) return alert("اسم المادة مطلوب");
                    try {
                      await apiFetch(token, `/admin/academic/years/${current.yearId}/subjects`, {
                        method: "POST",
                        body: JSON.stringify({
                          name: subjectForm.name.trim(),
                          icon: subjectForm.icon.trim() || "📚",
                          description: subjectForm.description.trim(),
                          isPublished: false,
                        }),
                      });
                      setSubjectForm({ name: "", icon: "📚", description: "" });
                      setShowAdd(false);
                      invalidateAcademic();
                    } catch (err) {
                      const message = err instanceof Error ? err.message : "تعذر حفظ المادة";
                      alert(message);
                    }
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  حفظ المادة
                </button>
              </>
            ) : null}

            {current.level === "units" && current.subjectId ? (
              <>
                <h3 className="font-bold text-foreground">إضافة وحدة/فصل داخل المادة</h3>
                <input
                  value={unitForm.name}
                  onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم الوحدة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={unitForm.description}
                  onChange={(e) => setUnitForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!unitForm.name.trim()) return alert("اسم الوحدة مطلوب");
                    await apiFetch(token, `/admin/academic/subjects/${current.subjectId}/units`, {
                      method: "POST",
                      body: JSON.stringify({
                        name: unitForm.name.trim(),
                        description: unitForm.description.trim(),
                        isPublished: false,
                      }),
                    });
                    setUnitForm({ name: "", description: "" });
                    setShowAdd(false);
                    invalidateAcademic();
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  حفظ الوحدة
                </button>
              </>
            ) : null}

            {current.level === "lessons" && current.unitId ? (
              <>
                <h3 className="font-bold text-foreground">
                  {lessonFormMode === "edit" ? "تعديل الدرس + الفيديو + التقسيمات" : "إضافة درس + فيديو (داخل السياق الأكاديمي)"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={lessonForm.title}
                    onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="عنوان الدرس"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.description}
                    onChange={(e) => setLessonForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="وصف الدرس"
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
                    placeholder="عنوان الفيديو (مطلوب)"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.instructor}
                    onChange={(e) => setLessonForm((p) => ({ ...p, instructor: e.target.value }))}
                    placeholder="اسم المدرس"
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
                  placeholder="وصف الفيديو"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none min-h-[90px]"
                />

                <div className="w-full rounded-xl border border-white/70 bg-white/55 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">تقسيم الفيديو (وصول سريع)</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLessonSegments((prev) => [...prev, createSegmentRow()])}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20"
                      >
                        + إضافة تقسيمة
                      </button>
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
                            placeholder="عنوان التقسيمة"
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

                <label className="w-full px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                  <span>{lessonThumbnailFile ? lessonThumbnailFile.name : "صورة الكارت قبل الدخول (اختياري)"}</span>
                  <Upload className="w-4 h-4 text-primary" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setLessonThumbnailFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                <label className="w-full px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                  <span>{lessonPosterFile ? lessonPosterFile.name : "صورة بداية الفيديو داخل المشغل (اختياري)"}</span>
                  <Upload className="w-4 h-4 text-primary" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setLessonPosterFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-xs text-muted-foreground -mt-1">
                  تم إلغاء إدخال رابط الثامبنيل يدويًا. الآن يمكنك رفع صورتين منفصلتين: واحدة للكارت الخارجي وواحدة لبداية الفيديو.
                </p>
                {!lessonPosterFile && !lessonForm.posterUrl ? (
                  <p className="text-xs font-semibold text-amber-700 -mt-1">
                    تنبيه: لم يتم رفع صورة بانر للمشغل بعد. سيظهر Placeholder داخل المشغل حتى يتم رفعها.
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
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="space-y-3">
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
                  onRename={async () => {
                    const name = prompt("اسم السنة", year.name);
                    if (name === null) return;
                    await apiFetch(token, `/admin/academic/years/${year.id}`, {
                      method: "PUT",
                      body: JSON.stringify({ name: name.trim() || year.name }),
                    });
                    invalidateAcademic();
                  }}
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
                icon={<span className="text-xl">{subject.icon || "📚"}</span>}
                title={subject.name}
                description={subject.description}
                isPublished={subject.isPublished}
                onRename={async () => {
                  const name = prompt("اسم المادة", subject.name);
                  if (name === null) return;
                  await apiFetch(token, `/admin/academic/subjects/${subject.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ name: name.trim() || subject.name }),
                  });
                  invalidateAcademic();
                }}
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
                  setCrumbs((prev) => [...prev, { level: "units", label: subject.name, yearId: current.yearId, subjectId: subject.id }]);
                  setShowAdd(false);
                }}
              />
            ))
          )
        ) : null}

        {current.level === "units" ? (
          units.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد وحدات داخل هذه المادة.</div>
          ) : (
            units.map((unit, index) => (
              <ItemCard
                key={unit.id}
                icon={<Layers className="w-5 h-5 text-sky-500" />}
                title={unit.name}
                description={unit.description}
                isPublished={unit.isPublished}
                onRename={async () => {
                  const name = prompt("اسم الوحدة", unit.name);
                  if (name === null) return;
                  await apiFetch(token, `/admin/academic/units/${unit.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ name: name.trim() || unit.name }),
                  });
                  invalidateAcademic();
                }}
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
                  setCrumbs((prev) => [...prev, { level: "lessons", label: unit.name, yearId: current.yearId, subjectId: current.subjectId, unitId: unit.id }]);
                  setShowAdd(false);
                }}
              />
            ))
          )
        ) : null}

        {current.level === "lessons" ? (
          lessons.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد دروس داخل هذه الوحدة.</div>
          ) : (
            lessons.map((lesson, index) => (
              <ItemCard
                key={lesson.id}
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
                onRename={async () => {
                  const title = prompt("عنوان الدرس", lesson.title);
                  if (title === null) return;
                  await apiFetch(token, `/admin/academic/lessons/${lesson.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ title: title.trim() || lesson.title }),
                  });
                  invalidateAcademic();
                }}
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
                onOpen={() => openLessonEditor(lesson)}
              />
            ))
          )
        ) : null}
      </div>
    </div>
  );
}
