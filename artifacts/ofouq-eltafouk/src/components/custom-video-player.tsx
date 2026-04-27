import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ListVideo,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";

type PlayerVideoType = "youtube" | "upload";
type VideoSegmentType = "questions" | "parts" | "topics";
type PlayerVideoSegment = {
  id?: number;
  title: string;
  startSeconds: number;
  segmentType: VideoSegmentType;
  orderIndex?: number;
  thumbnailUrl?: string;
};

type VideoChapter = {
  id: string;
  title?: string;
  description?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  thumbnailUrl?: string;
  order: number;
};

type CustomVideoPlayerProps = {
  videoUrl: string;
  videoType: PlayerVideoType;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  segments?: PlayerVideoSegment[] | null;
  chapters?: VideoChapter[] | null;
  watermarkText?: string;
};

type YouTubeQualityLevel =
  | "highres"
  | "hd2160"
  | "hd1440"
  | "hd1080"
  | "hd720"
  | "large"
  | "medium"
  | "small"
  | "tiny"
  | "auto";

const QUALITY_ORDER: YouTubeQualityLevel[] = [
  "auto",
  "highres",
  "hd2160",
  "hd1440",
  "hd1080",
  "hd720",
  "large",
  "medium",
  "small",
  "tiny",
];

const FALLBACK_QUALITY_LEVELS: YouTubeQualityLevel[] = ["auto"];
const CLEAN_YOUTUBE_PLAYER_VARS: Record<string, string> = {
  controls: "0",
  disablekb: "1",
  fs: "0",
  rel: "0",
  showinfo: "0",
  modestbranding: "1",
  iv_load_policy: "3",
  cc_load_policy: "0",
  playsinline: "1",
  enablejsapi: "1",
};
const YOUTUBE_IFRAME_CROP = {
  top: 24,
  bottom: 24,
  side: 6,
};

declare global {
  interface Window {
    YT?: {
      Player: new (element: Element, options: unknown) => YT.Player;
      PlayerState: {
        UNSTARTED: -1;
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
    AndroidSecure?: {
      setSecure?: (enabled: boolean) => void;
    };
    ReactNativeWebView?: {
      postMessage?: (message: string) => void;
    };
  }

  namespace YT {
    type OnReadyEvent = { target: Player };
    type OnStateChangeEvent = { data: number; target: Player };

    interface Player {
      destroy(): void;
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead?: boolean): void;
      getCurrentTime(): number;
      getDuration(): number;
      setVolume(volume: number): void;
      mute(): void;
      unMute(): void;
      setPlaybackRate(rate: number): void;
      getAvailablePlaybackRates(): number[];
      getPlaybackRate(): number;
      getAvailableQualityLevels(): string[];
      setPlaybackQuality(quality: string): void;
      getPlaybackQuality(): string;
    }
  }
}

const YOUTUBE_API_SCRIPT_ID = "youtube-iframe-api-script";
let youTubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is unavailable on the server."));
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (youTubeApiPromise) {
    return youTubeApiPromise;
  }

  youTubeApiPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(YOUTUBE_API_SCRIPT_ID) as HTMLScriptElement | null;

    const previousHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousHandler?.();
      resolve();
    };

    if (existingScript) {
      existingScript.addEventListener("error", () => reject(new Error("Failed to load YouTube API.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = YOUTUBE_API_SCRIPT_ID;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load YouTube API."));
    document.head.appendChild(script);
  });

  return youTubeApiPromise;
}

function parseYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return match ? match[1] : null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildCleanWatermarkLabel(watermarkText: string | undefined, clockText: string): string | null {
  const text = (watermarkText || "").trim();
  if (!text) return null;

  const parts = text.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    const [first, second] = parts;
    if (looksLikeEmail(first) && !looksLikeEmail(second)) {
      return `${first} · ${clockText} · ${second}`;
    }
    if (looksLikeEmail(second) && !looksLikeEmail(first)) {
      return `${second} · ${clockText} · ${first}`;
    }
  }

  return `${text} · ${clockText}`;
}

function isLikelyYouTubePosterUrl(url: string): boolean {
  const normalized = String(url || "").toLowerCase();
  return normalized.includes("i.ytimg.com/vi/") || normalized.includes("img.youtube.com/vi/") || normalized.includes("ytimg.com/vi_webp/");
}

function sanitizeChapterThumbnailUrl(rawUrl: string | undefined, isYouTubeVideo: boolean): string | undefined {
  const url = rawUrl?.trim();
  if (!url) return undefined;
  if (isYouTubeVideo && isLikelyYouTubePosterUrl(url)) return undefined;
  return url;
}

function isProtectedSegmentThumbnailUrl(url: string): boolean {
  return /\/api\/academic\/videos\/\d+\/segments\/\d+\/thumbnail(?:\?|$)/.test(url.trim());
}

function buildYouTubeChapterFallbackThumbnail(videoId: string, startSeconds: number): string {
  const slot = (Math.floor(Math.max(0, startSeconds) / 20) % 3) + 1;
  return `https://i.ytimg.com/vi/${videoId}/mq${slot}.jpg`;
}

function buildYouTubePosterUrl(videoId: string, quality: "maxres" | "hq" = "maxres"): string {
  if (quality === "maxres") return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function enforceYouTubeIframeQueryParams(iframe: HTMLIFrameElement) {
  try {
    const nextUrl = new URL(iframe.src);
    Object.entries(CLEAN_YOUTUBE_PLAYER_VARS).forEach(([key, value]) => {
      nextUrl.searchParams.set(key, value);
    });
    if (nextUrl.searchParams.get("origin") === null) {
      nextUrl.searchParams.set("origin", window.location.origin);
    }
    if (nextUrl.searchParams.get("widget_referrer") === null) {
      nextUrl.searchParams.set("widget_referrer", window.location.origin);
    }

    const normalized = nextUrl.toString();
    if (normalized !== iframe.src) {
      iframe.src = normalized;
    }
  } catch {
    // no-op: if URL parsing fails we keep the current source
  }
}

function formatBadgeClock(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(safeSeconds / 3600);
  const mm = Math.floor((safeSeconds % 3600) / 60);
  const ss = safeSeconds % 60;

  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatSegmentTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safeSeconds / 3600);
  const mm = Math.floor((safeSeconds % 3600) / 60);
  const ss = safeSeconds % 60;

  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function normalizeSegmentType(type: unknown): VideoSegmentType {
  const value = String(type ?? "").toLowerCase();
  if (value === "questions") return "questions";
  if (value === "topics") return "topics";
  return "parts";
}

function segmentTypeLabel(type: VideoSegmentType): string {
  if (type === "questions") return "أسئلة";
  if (type === "topics") return "مواضيع";
  return "أجزاء";
}

function segmentTypeBadgeClass(type: VideoSegmentType): string {
  if (type === "questions") return "bg-rose-500/20 text-rose-100 border border-rose-300/35";
  if (type === "topics") return "bg-emerald-500/20 text-emerald-100 border border-emerald-300/35";
  return "bg-sky-500/20 text-sky-100 border border-sky-300/35";
}

function labelQuality(level: string): string {
  const map: Record<string, string> = {
    highres: "أقصى جودة",
    hd2160: "4K",
    hd1440: "2K",
    hd1080: "1080p",
    hd720: "720p",
    large: "480p",
    medium: "360p",
    small: "240p",
    tiny: "144p",
    auto: "Auto",
  };

  return map[level] ?? level;
}

function requestFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return Promise.resolve();

  const target = element as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  if (target.requestFullscreen) {
    return target.requestFullscreen();
  }
  if (target.webkitRequestFullscreen) {
    target.webkitRequestFullscreen();
    return Promise.resolve();
  }
  if (target.msRequestFullscreen) {
    target.msRequestFullscreen();
    return Promise.resolve();
  }

  return Promise.resolve();
}

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };

  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null;
}

function isElementFullscreen(element: HTMLElement | null): boolean {
  if (!element) return false;
  const activeFullscreenElement = getFullscreenElement();
  if (!activeFullscreenElement) return false;
  return activeFullscreenElement === element || element.contains(activeFullscreenElement);
}

function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };

  if (doc.exitFullscreen) {
    return doc.exitFullscreen();
  }
  if (doc.webkitExitFullscreen) {
    doc.webkitExitFullscreen();
    return Promise.resolve();
  }
  if (doc.msExitFullscreen) {
    doc.msExitFullscreen();
    return Promise.resolve();
  }
  return Promise.resolve();
}

function isSuspiciousCaptureShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const isPrintScreen = key === "printscreen";
  const isCtrlShiftS = key === "s" && event.shiftKey && (event.ctrlKey || event.metaKey);
  const isCmdShiftCapture = event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key);
  const isCtrlShiftPrint = key === "p" && event.shiftKey && (event.ctrlKey || event.metaKey);
  const isPrintShortcut = key === "p" && (event.ctrlKey || event.metaKey);
  const isSaveAttempt = key === "s" && (event.ctrlKey || event.metaKey);

  return isPrintScreen || isCtrlShiftS || isCmdShiftCapture || isCtrlShiftPrint || isPrintShortcut || isSaveAttempt;
}

function SeekTenIcon({ forward }: { forward: boolean }) {
  return (
    <span className="relative inline-flex h-6 w-6 items-center justify-center">
      {forward ? <RotateCw className="h-[23px] w-[23px]" strokeWidth={2.25} /> : <RotateCcw className="h-[23px] w-[23px]" strokeWidth={2.25} />}
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none tracking-tight">10</span>
    </span>
  );
}

function VolumeLevelIcon({ volume }: { volume: number }) {
  const level = volume <= 0 ? 0 : volume < 34 ? 1 : volume < 68 ? 2 : 3;

  return (
    <span className="inline-flex h-[26px] w-[26px] items-center justify-center overflow-visible">
      <svg
        viewBox="0 0 24 24"
        className="h-[26px] w-[26px]"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6.3 10.4h3.1l4.1-3v9.2l-4.1-3H6.3z" />
        <path
          d="M15.5 10a2.7 2.7 0 0 1 0 4"
          className={`origin-center transition-all duration-200 ${level >= 1 ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
          fill="none"
        />
        <path
          d="M17.8 8.1a5.2 5.2 0 0 1 0 7.8"
          className={`origin-center transition-all duration-200 ${level >= 2 ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
          fill="none"
        />
        <path
          d="M20.1 6.1a7.8 7.8 0 0 1 0 11.8"
          className={`origin-center transition-all duration-200 ${level >= 3 ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
          fill="none"
        />
        <path
          d="M4.3 4.2 19.8 19.7"
          className={`transition-all duration-200 ${level === 0 ? "opacity-100" : "opacity-0"}`}
          fill="none"
        />
      </svg>
    </span>
  );
}

export function CustomVideoPlayer({
  videoUrl,
  videoType,
  title,
  subtitle,
  posterUrl,
  segments,
  chapters,
  watermarkText,
}: CustomVideoPlayerProps) {
  const isYouTube = videoType === "youtube";
  const youTubeId = useMemo(() => (isYouTube ? parseYouTubeId(videoUrl) : null), [isYouTube, videoUrl]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoSurfaceRef = useRef<HTMLDivElement | null>(null);
  const youtubeMountRef = useRef<HTMLDivElement | null>(null);
  const uploadVideoRef = useRef<HTMLVideoElement | null>(null);
  const lessonPanelRef = useRef<HTMLDivElement | null>(null);
  const lessonPanelToggleRef = useRef<HTMLButtonElement | null>(null);
  const volumePanelRef = useRef<HTMLDivElement | null>(null);
  const volumeWrapperRef = useRef<HTMLDivElement | null>(null);
  const volumeHideTimeoutRef = useRef<number | null>(null);
  const isVolumeDraggingRef = useRef(false);
  const protectionHideTimeoutRef = useRef<number | null>(null);
  const protectionLockRef = useRef(false);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const tickerRef = useRef<number | null>(null);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const surfaceClickTimeoutRef = useRef<number | null>(null);
  const youTubeUiShieldTimeoutRef = useRef<number | null>(null);
  const lastNonZeroVolumeRef = useRef<number>(80);
  const selectedQualityRef = useRef<string>("auto");
  const manualQualityLockRef = useRef(false);
  const chapterThumbCacheRef = useRef<Map<string, string | null>>(new Map());
  const chapterThumbObjectUrlRef = useRef<Map<string, string>>(new Map());

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackRates, setPlaybackRates] = useState<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);
  const [qualityLevels, setQualityLevels] = useState<string[]>(isYouTube ? FALLBACK_QUALITY_LEVELS : []);
  const [quality, setQuality] = useState<string>("auto");
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clockText, setClockText] = useState(() => formatBadgeClock(new Date()));
  const [youTubePosterQuality, setYouTubePosterQuality] = useState<"maxres" | "hq">("maxres");
  const [preferCustomPoster, setPreferCustomPoster] = useState(true);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [isLessonPanelOpen, setIsLessonPanelOpen] = useState(false);
  const [isVolumePanelOpen, setIsVolumePanelOpen] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [seekFx, setSeekFx] = useState<"backward" | "forward" | null>(null);
  const [seekToast, setSeekToast] = useState<"-10s" | "+10s" | null>(null);
  const [sideSeekToast, setSideSeekToast] = useState<"left" | "right" | null>(null);
  const [isYouTubeUiShieldVisible, setIsYouTubeUiShieldVisible] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [showCaptureShield, setShowCaptureShield] = useState(false);
  const [generatedChapterThumbs, setGeneratedChapterThumbs] = useState<Record<string, string | null>>({});
  const [chapterThumbLoading, setChapterThumbLoading] = useState<Record<string, boolean>>({});
  const [chapterThumbBroken, setChapterThumbBroken] = useState<Record<string, boolean>>({});
  const watermarkLabel = useMemo(() => buildCleanWatermarkLabel(watermarkText, clockText), [clockText, watermarkText]);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const previewSeconds = seekPreviewTime ?? currentTime;
  const previewPercent = duration > 0 ? Math.min(100, Math.max(0, (previewSeconds / duration) * 100)) : 0;
  const customPosterUrl = posterUrl?.trim() || null;
  const youTubePosterUrl = youTubeId ? buildYouTubePosterUrl(youTubeId, youTubePosterQuality) : null;
  const pausedCoverPosterUrl = preferCustomPoster && customPosterUrl ? customPosterUrl : youTubePosterUrl;
  const showYouTubePausedCover = isYouTube && !hasStartedPlayback && !error && Boolean(pausedCoverPosterUrl);
  const normalizedSegments = useMemo(() => {
    if (!Array.isArray(segments)) return [];
    return segments
      .filter((segment) => segment && typeof segment.title === "string")
      .map((segment, index) => ({
        id: segment.id ?? index + 1,
        title: String(segment.title).trim(),
        startSeconds: Math.max(0, Math.floor(Number(segment.startSeconds) || 0)),
        segmentType: normalizeSegmentType(segment.segmentType),
        orderIndex: Number.isFinite(segment.orderIndex) ? Number(segment.orderIndex) : index,
        thumbnailUrl: sanitizeChapterThumbnailUrl(segment.thumbnailUrl, false),
      }))
      .filter((segment) => segment.title.length > 0)
      .sort((a, b) => (a.startSeconds - b.startSeconds) || (a.orderIndex - b.orderIndex));
  }, [segments]);
  const hasSegments = normalizedSegments.length > 0;
  const panelAvailable = hasSegments || (Array.isArray(chapters) && chapters.length > 0);
  const overlayVisible = showControls || !isPlaying;
  const showYouTubeBrandGuards = isYouTube;
  const displaySubtitle = (subtitle || "").trim();
  const lessonThumb = customPosterUrl ?? youTubePosterUrl;
  const chapterFallbackThumb = isYouTube ? null : lessonThumb;

  async function toggleFullscreen() {
    if (isElementFullscreen(containerRef.current) || getFullscreenElement()) {
      await exitFullscreen().catch(() => undefined);
      return;
    }

    await requestFullscreen(containerRef.current).catch(() => undefined);
  }

  function hardenYouTubeIframe() {
    const mount = youtubeMountRef.current;
    if (!mount) return;

    const iframe = mount.querySelector("iframe") as HTMLIFrameElement | null;
    if (!iframe) return;

    iframe.style.pointerEvents = "none";
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("title", title ? `مشغل ${title}` : "مشغل الفيديو");
    iframe.setAttribute("referrerpolicy", "origin");
    iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "true");
    enforceYouTubeIframeQueryParams(iframe);

    // Best-effort hardening for YouTube iframe. Some branding overlays are controlled
    // by YouTube and cannot be removed 100% in all cases, so we combine iframe hardening
    // with app-side masking to keep the custom UI dominant.
    // Keep rendering stable while cropping unavoidable top/bottom YouTube chrome
    // without transform-based compositing that can hide frames on some GPUs.
    iframe.style.position = "absolute";
    iframe.style.top = `-${YOUTUBE_IFRAME_CROP.top}%`;
    iframe.style.left = `-${YOUTUBE_IFRAME_CROP.side}%`;
    iframe.style.width = `${100 + YOUTUBE_IFRAME_CROP.side * 2}%`;
    iframe.style.height = `${100 + YOUTUBE_IFRAME_CROP.top + YOUTUBE_IFRAME_CROP.bottom}%`;
    iframe.style.border = "0";
    iframe.style.zIndex = "0";
    iframe.style.background = "transparent";
  }

  function clearYouTubeUiShieldTimeout() {
    if (youTubeUiShieldTimeoutRef.current) {
      window.clearTimeout(youTubeUiShieldTimeoutRef.current);
      youTubeUiShieldTimeoutRef.current = null;
    }
  }

  function triggerYouTubeUiShield(durationMs = 1200) {
    if (!isYouTube) return;
    clearYouTubeUiShieldTimeout();
    setIsYouTubeUiShieldVisible(true);
    youTubeUiShieldTimeoutRef.current = window.setTimeout(() => {
      setIsYouTubeUiShieldVisible(false);
      youTubeUiShieldTimeoutRef.current = null;
    }, Math.max(200, durationMs));
  }

  function scheduleYouTubeHardeningPasses(options?: { withUiShield?: boolean }) {
    if (!isYouTube) return;
    if (options?.withUiShield) {
      triggerYouTubeUiShield(1200);
    }
    hardenYouTubeIframe();
    [80, 180, 340, 700].forEach((delayMs) => {
      window.setTimeout(() => {
        hardenYouTubeIframe();
      }, delayMs);
    });
  }

  function normalizeQualityLevels(levels: string[]): string[] {
    const levelSet = new Set(levels.filter(Boolean).map((level) => level as YouTubeQualityLevel));
    levelSet.add("auto");

    const ranked = QUALITY_ORDER.filter((qualityLevel) => levelSet.has(qualityLevel));
    return ranked.length > 0 ? ranked : FALLBACK_QUALITY_LEVELS;
  }

  function refreshYouTubeQualityOptions(player: YT.Player) {
    const availableQuality = player.getAvailableQualityLevels();
    const normalized = normalizeQualityLevels(availableQuality);
    setQualityLevels(normalized);

    if (manualQualityLockRef.current && selectedQualityRef.current !== "auto" && normalized.includes(selectedQualityRef.current)) {
      try {
        player.setPlaybackQuality(selectedQualityRef.current as YouTubeQualityLevel);
      } catch {
        // keep state stable even if the player ignores one call
      }
      setQuality(selectedQualityRef.current);
      return;
    }

    const activeQuality = player.getPlaybackQuality();
    if (activeQuality && normalized.includes(activeQuality)) {
      setQuality(activeQuality);
      return;
    }

    setQuality((prev) => (normalized.includes(prev) ? prev : "auto"));
  }

  function clearTicker() {
    if (tickerRef.current) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }

  function syncProgress() {
    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;

      const nextDuration = player.getDuration();
      const nextCurrent = player.getCurrentTime();

      if (Number.isFinite(nextDuration)) {
        setDuration(nextDuration);
      }
      if (Number.isFinite(nextCurrent)) {
        setCurrentTime(nextCurrent);
      }
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;

    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
  }

  function startTicker() {
    clearTicker();
    tickerRef.current = window.setInterval(() => {
      syncProgress();
    }, 250);
  }

  function showControlsMomentarily() {
    setShowControls(true);

    if (hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (isPlaying) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2400);
    }
  }

  async function playWithFullscreen() {
    if (isYouTube) {
      scheduleYouTubeHardeningPasses({ withUiShield: true });
      ytPlayerRef.current?.playVideo();
      setIsPlaying(true);
      setHasStartedPlayback(true);
      startTicker();
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;

    await video.play().catch(() => undefined);
    setIsPlaying(true);
    setHasStartedPlayback(true);
    startTicker();
  }

  function pausePlayback() {
    if (isYouTube) {
      scheduleYouTubeHardeningPasses({ withUiShield: true });
      ytPlayerRef.current?.pauseVideo();
      setIsPlaying(false);
      clearTicker();
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    clearTicker();
  }

  function togglePlayback() {
    showControlsMomentarily();
    if (isPlaying) {
      pausePlayback();
    } else {
      void playWithFullscreen();
    }
  }

  function applyVolume(nextVolume: number) {
    const safeVolume = Math.min(100, Math.max(0, Math.round(nextVolume)));
    setVolume(safeVolume);
    if (safeVolume > 0) {
      lastNonZeroVolumeRef.current = safeVolume;
    }

    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;
      player.setVolume(safeVolume);
      if (safeVolume === 0) player.mute();
      else player.unMute();
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;
    video.volume = Math.min(Math.max(safeVolume / 100, 0), 1);
    video.muted = safeVolume === 0;
  }

  function toggleMute() {
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
      applyVolume(0);
      return;
    }
    applyVolume(lastNonZeroVolumeRef.current || 60);
  }

  function changeVolumeBy(step: number) {
    applyVolume(volume + step);
  }

  function clearVolumeHideTimeout() {
    if (volumeHideTimeoutRef.current) {
      window.clearTimeout(volumeHideTimeoutRef.current);
      volumeHideTimeoutRef.current = null;
    }
  }

  function openVolumePanel() {
    clearVolumeHideTimeout();
    setIsVolumePanelOpen(true);
  }

  function scheduleVolumePanelHide(delayMs = 300) {
    clearVolumeHideTimeout();
    volumeHideTimeoutRef.current = window.setTimeout(() => {
      const wrapper = volumeWrapperRef.current;
      const keepOpenBecauseHoverOrFocus =
        Boolean(wrapper?.matches(":hover")) || Boolean(wrapper?.contains(document.activeElement));
      if (keepOpenBecauseHoverOrFocus) return;
      if (isVolumeDraggingRef.current) return;
      setIsVolumePanelOpen(false);
    }, delayMs);
  }

  function clearCaptureShieldTimeout() {
    if (protectionHideTimeoutRef.current) {
      window.clearTimeout(protectionHideTimeoutRef.current);
      protectionHideTimeoutRef.current = null;
    }
  }

  function showCaptureProtection(message: string, options?: { sticky?: boolean; autoHideMs?: number }) {
    const sticky = options?.sticky ?? false;
    const autoHideMs = options?.autoHideMs ?? 1500;
    clearCaptureShieldTimeout();
    protectionLockRef.current = sticky;
    setCaptureNotice(message);
    setShowCaptureShield(true);

    if (!sticky && autoHideMs > 0) {
      protectionHideTimeoutRef.current = window.setTimeout(() => {
        setShowCaptureShield(false);
        setCaptureNotice(null);
      }, autoHideMs);
    }
  }

  function hideCaptureProtection(delayMs = 260) {
    if (protectionLockRef.current) return;
    clearCaptureShieldTimeout();
    protectionHideTimeoutRef.current = window.setTimeout(() => {
      if (protectionLockRef.current) return;
      setShowCaptureShield(false);
      setCaptureNotice(null);
    }, delayMs);
  }

  function applyRate(nextRate: number) {
    setPlaybackRate(nextRate);

    if (isYouTube) {
      ytPlayerRef.current?.setPlaybackRate(nextRate);
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;
    video.playbackRate = nextRate;
  }

  function applyQuality(nextQuality: string) {
    setQuality(nextQuality);
    selectedQualityRef.current = nextQuality;
    manualQualityLockRef.current = nextQuality !== "auto";
    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;
      player.setPlaybackQuality(nextQuality as YouTubeQualityLevel);
      [120, 320, 700, 1200].forEach((delayMs) => {
        window.setTimeout(() => {
          try {
            if (manualQualityLockRef.current && selectedQualityRef.current !== "auto") {
              player.setPlaybackQuality(selectedQualityRef.current as YouTubeQualityLevel);
            }
            refreshYouTubeQualityOptions(player);
          } catch {
            // ignore transient player timing errors
          }
        }, delayMs);
      });
    }
  }

  function seekBy(deltaSeconds: number) {
    showControlsMomentarily();

    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;
      const base = player.getCurrentTime();
      seekTo(base + deltaSeconds);
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;
    seekTo(video.currentTime + deltaSeconds);
  }

  function triggerSeekFeedback(direction: "backward" | "forward") {
    setSeekFx(direction);
    setSeekToast(direction === "backward" ? "-10s" : "+10s");
    window.setTimeout(() => setSeekFx((current) => (current === direction ? null : current)), 320);
    window.setTimeout(() => setSeekToast(null), 520);
  }

  function clearSurfaceClickTimeout() {
    if (surfaceClickTimeoutRef.current) {
      window.clearTimeout(surfaceClickTimeoutRef.current);
      surfaceClickTimeoutRef.current = null;
    }
  }

  function triggerSideSeekFeedback(side: "left" | "right") {
    setSideSeekToast(side);
    window.setTimeout(() => {
      setSideSeekToast((current) => (current === side ? null : current));
    }, 520);
  }

  function setChapterThumbLoadingState(key: string, loading: boolean) {
    setChapterThumbLoading((prev) => {
      if (prev[key] === loading) return prev;
      return { ...prev, [key]: loading };
    });
  }

  function setGeneratedChapterThumb(key: string, value: string | null) {
    chapterThumbCacheRef.current.set(key, value);
    setGeneratedChapterThumbs((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
    if (value) {
      setChapterThumbBroken((prev) => {
        if (!prev[key]) return prev;
        return { ...prev, [key]: false };
      });
    }
  }

  function seekTo(nextTime: number) {
    const hasKnownDuration = Number.isFinite(duration) && duration > 0;
    const safeTime = hasKnownDuration ? Math.max(0, Math.min(nextTime, duration)) : Math.max(0, nextTime);

    if (isYouTube) {
      ytPlayerRef.current?.seekTo(safeTime, true);
      setCurrentTime(safeTime);
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
  }

  function jumpToSegment(
    startSeconds: number,
    options?: {
      autoPlay?: boolean;
      closePanel?: boolean;
    },
  ) {
    seekTo(startSeconds);
    showControlsMomentarily();
    if (options?.autoPlay ?? true) {
      void playWithFullscreen();
    }
    if (options?.closePanel ?? true) {
      setIsLessonPanelOpen(false);
    }
  }

  useEffect(() => {
    if (!isYouTube) {
      setReady(true);
      return;
    }

    setReady(false);
    setError(null);
    setQuality("auto");

    if (!youTubeId) {
      setError("رابط الفيديو غير صالح");
      return;
    }

    let isDisposed = false;

    void loadYouTubeApi()
      .then(() => {
        if (isDisposed || !youtubeMountRef.current || !window.YT?.Player) return;

        ytPlayerRef.current?.destroy();

        ytPlayerRef.current = new window.YT.Player(youtubeMountRef.current, {
          host: "https://www.youtube-nocookie.com",
          videoId: youTubeId,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: Number(CLEAN_YOUTUBE_PLAYER_VARS.controls),
            disablekb: Number(CLEAN_YOUTUBE_PLAYER_VARS.disablekb),
            fs: Number(CLEAN_YOUTUBE_PLAYER_VARS.fs),
            rel: Number(CLEAN_YOUTUBE_PLAYER_VARS.rel),
            showinfo: Number(CLEAN_YOUTUBE_PLAYER_VARS.showinfo),
            modestbranding: Number(CLEAN_YOUTUBE_PLAYER_VARS.modestbranding),
            iv_load_policy: Number(CLEAN_YOUTUBE_PLAYER_VARS.iv_load_policy),
            cc_load_policy: Number(CLEAN_YOUTUBE_PLAYER_VARS.cc_load_policy),
            playsinline: Number(CLEAN_YOUTUBE_PLAYER_VARS.playsinline),
            enablejsapi: Number(CLEAN_YOUTUBE_PLAYER_VARS.enablejsapi),
            origin: window.location.origin,
            widget_referrer: window.location.origin,
          },
          events: {
            onReady: (event: YT.OnReadyEvent) => {
              if (isDisposed) return;
              setReady(true);
              hardenYouTubeIframe();
              scheduleYouTubeHardeningPasses({ withUiShield: true });
              setDuration(event.target.getDuration() || 0);
              event.target.setVolume(volume);

              const availableRates = event.target.getAvailablePlaybackRates();
              if (availableRates.length > 0) {
                setPlaybackRates(availableRates);
              }

              refreshYouTubeQualityOptions(event.target);

              syncProgress();
            },
            onStateChange: (event: YT.OnStateChangeEvent) => {
              if (isDisposed || !window.YT?.PlayerState) return;
              scheduleYouTubeHardeningPasses({ withUiShield: true });
              if (event.data === window.YT.PlayerState.PLAYING) {
                setReady(true);
                setIsPlaying(true);
                setHasStartedPlayback(true);
                startTicker();
                if (manualQualityLockRef.current && selectedQualityRef.current !== "auto") {
                  event.target.setPlaybackQuality(selectedQualityRef.current as YouTubeQualityLevel);
                }
                refreshYouTubeQualityOptions(event.target);
                return;
              }
              if (event.data === window.YT.PlayerState.BUFFERING) {
                setReady(true);
                if (manualQualityLockRef.current && selectedQualityRef.current !== "auto") {
                  event.target.setPlaybackQuality(selectedQualityRef.current as YouTubeQualityLevel);
                }
                refreshYouTubeQualityOptions(event.target);
                return;
              }
              if (event.data === window.YT.PlayerState.ENDED) {
                manualQualityLockRef.current = false;
                selectedQualityRef.current = "auto";
                setQuality("auto");
                event.target.seekTo(0, true);
                event.target.pauseVideo();
                setIsPlaying(false);
                setHasStartedPlayback(false);
                clearTicker();
                syncProgress();
                refreshYouTubeQualityOptions(event.target);
                return;
              }
              if (
                event.data === window.YT.PlayerState.PAUSED ||
                event.data === window.YT.PlayerState.CUED
              ) {
                setReady(true);
                setIsPlaying(false);
                clearTicker();
                syncProgress();
                if (manualQualityLockRef.current && selectedQualityRef.current !== "auto") {
                  event.target.setPlaybackQuality(selectedQualityRef.current as YouTubeQualityLevel);
                }
                refreshYouTubeQualityOptions(event.target);
              }
            },
            onError: () => {
              if (isDisposed) return;
              setError("تعذر تشغيل الفيديو حاليًا");
            },
          },
        });
      })
      .catch(() => {
        if (isDisposed) return;
        setError("تعذر تحميل المشغل");
      });

    return () => {
      isDisposed = true;
      clearTicker();
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
    };
  }, [isYouTube, youTubeId]);

  useEffect(() => {
    if (!isYouTube) return;
    scheduleYouTubeHardeningPasses();

    const mount = youtubeMountRef.current;
    if (!mount) return;

    const observer = new MutationObserver(() => {
      scheduleYouTubeHardeningPasses();
    });
    observer.observe(mount, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    const intervalId = window.setInterval(() => {
      scheduleYouTubeHardeningPasses();
    }, 900);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, [isYouTube, title, youTubeId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        pausePlayback();
        showCaptureProtection("هذا المحتوى محمي. تم إيقاف العرض مؤقتًا أثناء تبديل النافذة.", { sticky: true, autoHideMs: 0 });
      } else {
        protectionLockRef.current = false;
        hideCaptureProtection(320);
      }
    };

    const handleWindowBlur = () => {
      pausePlayback();
      showCaptureProtection("تم إيقاف الفيديو لحماية المحتوى. عد للتطبيق للمتابعة.", { autoHideMs: 1700 });
    };

    const handleWindowFocus = () => {
      hideCaptureProtection(300);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const isPlayerFocused = Boolean(containerRef.current?.contains(document.activeElement)) || isFullscreen;
      const isTargetInsidePlayer = Boolean(target && containerRef.current?.contains(target));
      const canControlPlayer = isPlayerFocused || isTargetInsidePlayer;
      const isTextField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isSuspiciousCaptureShortcut(event) && canControlPlayer) {
        event.preventDefault();
        pausePlayback();
        showCaptureProtection("التقاط الشاشة أو التسجيل غير مسموح لهذا الدرس.", { autoHideMs: 1800 });
        if (key === "printscreen" && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("");
        }
        return;
      }

      if (isTextField) return;
      if (!canControlPlayer) return;

      if (key === " ") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (key === "arrowleft") {
        event.preventDefault();
        seekBy(-10);
        return;
      }
      if (key === "arrowright") {
        event.preventDefault();
        seekBy(10);
        return;
      }
      if (key === "arrowup") {
        event.preventDefault();
        changeVolumeBy(5);
        return;
      }
      if (key === "arrowdown") {
        event.preventDefault();
        changeVolumeBy(-5);
        return;
      }
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (key === "escape") {
        event.preventDefault();
        setIsLessonPanelOpen(false);
        setIsVolumePanelOpen(false);
        if (isElementFullscreen(containerRef.current)) {
          void exitFullscreen();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [duration, isFullscreen, isPlaying, volume]);

  useEffect(() => {
    isVolumeDraggingRef.current = isVolumeDragging;
  }, [isVolumeDragging]);

  useEffect(() => {
    if (!isVolumeDragging) return;

    const stopDragging = () => {
      isVolumeDraggingRef.current = false;
      setIsVolumeDragging(false);
      const wrapper = volumeWrapperRef.current;
      if (wrapper?.matches(":hover") || wrapper?.contains(document.activeElement)) {
        openVolumePanel();
        return;
      }
      scheduleVolumePanelHide(300);
    };

    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("mouseup", stopDragging);
    window.addEventListener("touchend", stopDragging);

    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("touchend", stopDragging);
    };
  }, [isVolumeDragging]);

  useEffect(() => {
    if (!isSeeking) return;

    const stopSeeking = () => {
      setIsSeeking(false);
      setSeekPreviewTime(null);
    };

    window.addEventListener("pointerup", stopSeeking);
    window.addEventListener("mouseup", stopSeeking);
    window.addEventListener("touchend", stopSeeking);

    return () => {
      window.removeEventListener("pointerup", stopSeeking);
      window.removeEventListener("mouseup", stopSeeking);
      window.removeEventListener("touchend", stopSeeking);
    };
  }, [isSeeking]);

  function handleSurfaceTap(event: { target: EventTarget | null }) {
    containerRef.current?.focus({ preventScroll: true });
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-player-control="true"]')) return;
    if (surfaceClickTimeoutRef.current) return;

    surfaceClickTimeoutRef.current = window.setTimeout(() => {
      surfaceClickTimeoutRef.current = null;
      if (!showControls) {
        showControlsMomentarily();
        return;
      }
      if (!ready || error) return;
      togglePlayback();
    }, 220);
  }

  function handleSurfaceDoubleClick(event: {
    target: EventTarget | null;
    clientX: number;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    event.preventDefault();
    event.stopPropagation();
    containerRef.current?.focus({ preventScroll: true });
    clearSurfaceClickTimeout();

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-player-control="true"]')) return;
    if (!ready || error) return;

    const surface = videoSurfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0) return;

    const clickX = event.clientX - rect.left;
    const isLeftHalf = clickX < rect.width / 2;
    if (isLeftHalf) {
      seekBy(-10);
      triggerSideSeekFeedback("left");
      return;
    }

    seekBy(10);
    triggerSideSeekFeedback("right");
  }

  useEffect(() => {
    if (!panelAvailable && isLessonPanelOpen) {
      setIsLessonPanelOpen(false);
    }
  }, [panelAvailable, isLessonPanelOpen]);

  useEffect(() => {
    if (!overlayVisible && isLessonPanelOpen) {
      setIsLessonPanelOpen(false);
    }
  }, [overlayVisible, isLessonPanelOpen]);

  useEffect(() => {
    if (!isLessonPanelOpen && !isVolumePanelOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (lessonPanelRef.current?.contains(target)) return;
      if (lessonPanelToggleRef.current?.contains(target)) return;
      if (volumeWrapperRef.current?.contains(target)) return;
      if (volumePanelRef.current?.contains(target)) return;
      setIsLessonPanelOpen(false);
      setIsVolumePanelOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLessonPanelOpen(false);
        setIsVolumePanelOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isLessonPanelOpen, isVolumePanelOpen]);

  useEffect(() => {
    if (isYouTube) {
      setQualityLevels(FALLBACK_QUALITY_LEVELS);
    } else {
      setQualityLevels([]);
    }
  }, [isYouTube]);

  useEffect(() => {
    setYouTubePosterQuality("maxres");
    setPreferCustomPoster(true);
    setHasStartedPlayback(false);
  }, [youTubeId, customPosterUrl]);

  useEffect(() => {
    chapterThumbObjectUrlRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    chapterThumbObjectUrlRef.current.clear();
    chapterThumbCacheRef.current.clear();
    setGeneratedChapterThumbs({});
    setChapterThumbLoading({});
    setChapterThumbBroken({});
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      chapterThumbObjectUrlRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      chapterThumbObjectUrlRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(isElementFullscreen(containerRef.current));
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
    document.addEventListener("MSFullscreenChange", syncFullscreenState as EventListener);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState as EventListener);
      document.removeEventListener("MSFullscreenChange", syncFullscreenState as EventListener);
    };
  }, []);

  useEffect(() => {
    selectedQualityRef.current = quality;
  }, [quality]);

  useEffect(() => {
    if (!isYouTube || !isPlaying) return;

    const intervalId = window.setInterval(() => {
      if (!manualQualityLockRef.current) return;
      const selected = selectedQualityRef.current;
      if (selected === "auto") return;

      const player = ytPlayerRef.current;
      if (!player) return;

      try {
        const active = player.getPlaybackQuality();
        if (active !== selected) {
          player.setPlaybackQuality(selected as YouTubeQualityLevel);
        }
      } catch {
        // ignore transient iframe API states
      }
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [isYouTube, isPlaying]);

  useEffect(() => {
    showControlsMomentarily();
    // We only need to re-evaluate hide timer when play state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      clearTicker();
      if (hideControlsTimeoutRef.current) {
        window.clearTimeout(hideControlsTimeoutRef.current);
      }
      clearSurfaceClickTimeout();
      clearVolumeHideTimeout();
      clearCaptureShieldTimeout();
      clearYouTubeUiShieldTimeout();
      protectionLockRef.current = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockText(formatBadgeClock(new Date()));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const nativeWindow = window as Window & {
      webkit?: {
        messageHandlers?: {
          screenProtection?: {
            postMessage?: (payload: unknown) => void;
          };
        };
      };
    };

    try {
      nativeWindow.AndroidSecure?.setSecure?.(true);
    } catch {
      // noop: bridge not available on web
    }

    try {
      nativeWindow.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "SCREEN_PROTECTION_ENABLE" }));
    } catch {
      // noop: bridge not available on web
    }

    try {
      nativeWindow.webkit?.messageHandlers?.screenProtection?.postMessage?.({ enabled: true });
    } catch {
      // noop: bridge not available on web
    }

    return () => {
      try {
        nativeWindow.AndroidSecure?.setSecure?.(false);
      } catch {
        // noop
      }
      try {
        nativeWindow.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "SCREEN_PROTECTION_DISABLE" }));
      } catch {
        // noop
      }
      try {
        nativeWindow.webkit?.messageHandlers?.screenProtection?.postMessage?.({ enabled: false });
      } catch {
        // noop
      }
    };
  }, []);

  const displayQualityLevels = useMemo(() => {
    if (qualityLevels.length > 0) return qualityLevels;
    return ["auto", "hd1080", "hd720", "large", "medium"];
  }, [qualityLevels]);
  const displayPlaybackRates = useMemo(() => {
    const defaults = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    return Array.from(new Set([...defaults, ...playbackRates])).sort((a, b) => a - b);
  }, [playbackRates]);

  const segmentEntries = useMemo(() => {
    return normalizedSegments.map((segment, index) => {
      const nextStart = normalizedSegments[index + 1]?.startSeconds;
      const fallbackEnd = segment.startSeconds + 45;
      const endSeconds = nextStart ?? (duration > 0 ? duration : fallbackEnd);
      return { ...segment, endSeconds };
    });
  }, [duration, normalizedSegments]);

  const groupedSegmentEntries = useMemo(() => {
    const groups: Record<VideoSegmentType, typeof segmentEntries> = {
      parts: [],
      topics: [],
      questions: [],
    };
    segmentEntries.forEach((entry) => {
      groups[entry.segmentType].push(entry);
    });
    return groups;
  }, [segmentEntries]);

  const chapterEntries = useMemo(() => {
    const providedChapters = Array.isArray(chapters)
      ? chapters
          .filter((chapter) => chapter && Number.isFinite(Number(chapter.startTime)))
          .map((chapter, index) => ({
            id: String(chapter.id || `chapter-${index + 1}`),
            title: (chapter.title || "").trim() || `القسم ${index + 1}`,
            description: chapter.description?.trim() || undefined,
            startSeconds: Math.max(0, Math.floor(Number(chapter.startTime) || 0)),
            endSecondsProvided: Number.isFinite(Number(chapter.endTime)) ? Math.max(0, Math.floor(Number(chapter.endTime))) : undefined,
            durationSecondsProvided: Number.isFinite(Number(chapter.duration)) ? Math.max(0, Math.floor(Number(chapter.duration))) : undefined,
            thumbnailUrl: sanitizeChapterThumbnailUrl(chapter.thumbnailUrl, isYouTube),
            order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : index,
          }))
      : [];

    const fallbackFromSegments = normalizedSegments.map((segment, index) => ({
      id: `segment-${segment.id ?? index + 1}-${segment.startSeconds}`,
      title: segment.title || `القسم ${index + 1}`,
      description: undefined as string | undefined,
      startSeconds: segment.startSeconds,
      endSecondsProvided: undefined as number | undefined,
      durationSecondsProvided: undefined as number | undefined,
      thumbnailUrl: segment.thumbnailUrl,
      order: Number.isFinite(Number(segment.orderIndex)) ? Number(segment.orderIndex) : index,
    }));

    const base = providedChapters.length > 0 ? providedChapters : fallbackFromSegments;
    const sorted = [...base].sort((a, b) => (a.order - b.order) || (a.startSeconds - b.startSeconds));

    return sorted.map((chapter, index) => {
      const nextStart = sorted[index + 1]?.startSeconds;
      const byDuration = chapter.durationSecondsProvided !== undefined
        ? chapter.startSeconds + chapter.durationSecondsProvided
        : undefined;

      let endSeconds =
        chapter.endSecondsProvided ??
        byDuration ??
        nextStart ??
        (duration > 0 ? duration : chapter.startSeconds + 45);

      if (!Number.isFinite(endSeconds) || endSeconds <= chapter.startSeconds) {
        endSeconds = chapter.startSeconds + 1;
      }

      const durationSeconds =
        chapter.durationSecondsProvided ??
        (chapter.endSecondsProvided !== undefined
          ? Math.max(0, chapter.endSecondsProvided - chapter.startSeconds)
          : nextStart !== undefined
          ? Math.max(0, nextStart - chapter.startSeconds)
          : duration > 0
          ? Math.max(0, duration - chapter.startSeconds)
          : undefined);

      return {
        ...chapter,
        endSeconds,
        durationSeconds,
      };
    });
  }, [chapters, duration, isYouTube, normalizedSegments]);

  useEffect(() => {
    if (chapterEntries.length === 0) return;
    const token = window.localStorage.getItem("ofouq_token");
    if (!token) return;

    const chaptersWithProtectedThumb = chapterEntries.filter((chapter) => {
      const sourceUrl = chapter.thumbnailUrl?.trim();
      return Boolean(sourceUrl && isProtectedSegmentThumbnailUrl(sourceUrl));
    });
    if (chaptersWithProtectedThumb.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      for (const chapter of chaptersWithProtectedThumb) {
        if (cancelled) break;
        const sourceUrl = chapter.thumbnailUrl?.trim();
        if (!sourceUrl) continue;

        const thumbKey = `${videoUrl}::${chapter.id}::${chapter.startSeconds}`;
        if (chapterThumbCacheRef.current.has(thumbKey)) {
          const cached = chapterThumbCacheRef.current.get(thumbKey) ?? null;
          setGeneratedChapterThumbs((prev) => {
            if (prev[thumbKey] === cached) return prev;
            return { ...prev, [thumbKey]: cached };
          });
          continue;
        }

        setChapterThumbLoadingState(thumbKey, true);
        setChapterThumbBroken((prev) => {
          if (!prev[thumbKey]) return prev;
          return { ...prev, [thumbKey]: false };
        });

        try {
          const response = await fetch(sourceUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`thumb-fetch-failed-${response.status}`);
          }

          const blob = await response.blob();
          if (!blob.type.startsWith("image/")) {
            throw new Error("thumb-invalid-content-type");
          }

          // Backend sends an SVG placeholder when generation fails. Do not treat that
          // placeholder as a final thumbnail; prefer a practical YouTube fallback.
          if (blob.type.includes("svg")) {
            const svgText = await blob.text();
            if (svgText.includes("معاينة الدرس")) {
              if (isYouTube && youTubeId) {
                const ytFallback = buildYouTubeChapterFallbackThumbnail(youTubeId, chapter.startSeconds);
                setGeneratedChapterThumb(thumbKey, ytFallback);
                continue;
              }
              throw new Error("thumb-generation-placeholder");
            }
          }

          const objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            break;
          }

          const previousObjectUrl = chapterThumbObjectUrlRef.current.get(thumbKey);
          if (previousObjectUrl && previousObjectUrl !== objectUrl) {
            URL.revokeObjectURL(previousObjectUrl);
          }
          chapterThumbObjectUrlRef.current.set(thumbKey, objectUrl);
          setGeneratedChapterThumb(thumbKey, objectUrl);
        } catch (error) {
          if ((error as { name?: string })?.name === "AbortError") break;
          if (isYouTube && youTubeId) {
            const ytFallback = buildYouTubeChapterFallbackThumbnail(youTubeId, chapter.startSeconds);
            setGeneratedChapterThumb(thumbKey, ytFallback);
            setChapterThumbBroken((prev) => {
              if (!prev[thumbKey]) return prev;
              return { ...prev, [thumbKey]: false };
            });
          } else {
            setGeneratedChapterThumb(thumbKey, null);
            setChapterThumbBroken((prev) => {
              if (prev[thumbKey]) return prev;
              return { ...prev, [thumbKey]: true };
            });
          }
        } finally {
          setChapterThumbLoadingState(thumbKey, false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chapterEntries, isYouTube, videoUrl, youTubeId]);

  useEffect(() => {
    if (videoType !== "upload") return;
    if (!videoUrl || chapterEntries.length === 0) return;

    let cancelled = false;
    const offscreenVideo = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    offscreenVideo.preload = "auto";
    offscreenVideo.muted = true;
    offscreenVideo.playsInline = true;
    offscreenVideo.crossOrigin = "anonymous";
    offscreenVideo.src = videoUrl;
    offscreenVideo.setAttribute("muted", "true");
    offscreenVideo.setAttribute("playsinline", "true");

    const waitForEvent = (eventName: string, timeoutMs: number) =>
      new Promise<void>((resolve, reject) => {
        const onSuccess = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`offscreen video event failed: ${eventName}`));
        };
        const timeoutId = window.setTimeout(() => {
          cleanup();
          reject(new Error(`offscreen video timeout: ${eventName}`));
        }, timeoutMs);

        const cleanup = () => {
          window.clearTimeout(timeoutId);
          offscreenVideo.removeEventListener(eventName, onSuccess);
          offscreenVideo.removeEventListener("error", onError);
        };

        offscreenVideo.addEventListener(eventName, onSuccess, { once: true });
        offscreenVideo.addEventListener("error", onError, { once: true });
      });

    const setThumbLoading = (key: string, loading: boolean) => {
      setChapterThumbLoading((prev) => {
        if (prev[key] === loading) return prev;
        return { ...prev, [key]: loading };
      });
    };

    const setGeneratedThumb = (key: string, value: string | null) => {
      chapterThumbCacheRef.current.set(key, value);
      setGeneratedChapterThumbs((prev) => {
        if (prev[key] === value) return prev;
        return { ...prev, [key]: value };
      });
      if (value) {
        setChapterThumbBroken((prev) => {
          if (!prev[key]) return prev;
          return { ...prev, [key]: false };
        });
      }
    };

    void (async () => {
      try {
        if (offscreenVideo.readyState < 1) {
          await waitForEvent("loadedmetadata", 8000);
        }
      } catch {
        return;
      }

      for (const chapter of chapterEntries) {
        if (cancelled) break;
        const chapterThumbnailSource = chapter.thumbnailUrl?.trim();
        if (chapterThumbnailSource && !isProtectedSegmentThumbnailUrl(chapterThumbnailSource)) continue;

        const thumbKey = `${videoUrl}::${chapter.id}::${chapter.startSeconds}`;
        if (chapterThumbCacheRef.current.has(thumbKey)) {
          const cached = chapterThumbCacheRef.current.get(thumbKey) ?? null;
          setGeneratedChapterThumbs((prev) => {
            if (prev[thumbKey] === cached) return prev;
            return { ...prev, [thumbKey]: cached };
          });
          continue;
        }

        setThumbLoading(thumbKey, true);
        setChapterThumbBroken((prev) => {
          if (!prev[thumbKey]) return prev;
          return { ...prev, [thumbKey]: false };
        });

        try {
          const knownDuration =
            Number.isFinite(offscreenVideo.duration) && offscreenVideo.duration > 0
              ? offscreenVideo.duration
              : duration;
          const maxTime = knownDuration > 0 ? Math.max(0, knownDuration - 0.15) : chapter.startSeconds;
          const targetTime = Math.min(Math.max(0, chapter.startSeconds), maxTime);

          if (Math.abs(offscreenVideo.currentTime - targetTime) > 0.06) {
            const seekedPromise = waitForEvent("seeked", 7000);
            offscreenVideo.currentTime = targetTime;
            await seekedPromise;
          } else if (offscreenVideo.readyState < 2) {
            await waitForEvent("loadeddata", 4000);
          }

          const width = offscreenVideo.videoWidth || 640;
          const height = offscreenVideo.videoHeight || 360;
          if (width < 2 || height < 2) {
            throw new Error("invalid capture dimensions");
          }

          canvas.width = width;
          canvas.height = height;
          context.drawImage(offscreenVideo, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.74);
          setGeneratedThumb(thumbKey, dataUrl);
        } catch {
          setGeneratedThumb(thumbKey, null);
        } finally {
          setThumbLoading(thumbKey, false);
        }
      }
    })();

    return () => {
      cancelled = true;
      offscreenVideo.src = "";
    };
  }, [chapterEntries, duration, videoType, videoUrl]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-[34px] border border-white/10 shadow-[0_40px_120px_rgba(2,8,40,0.55)] select-none bg-[radial-gradient(circle_at_28%_22%,rgba(122,168,255,0.35),transparent_42%),radial-gradient(circle_at_76%_70%,rgba(72,122,228,0.3),transparent_48%),linear-gradient(135deg,#031337,#0b2f67_52%,#041a43)]"
      dir="rtl"
      tabIndex={0}
      onMouseMove={showControlsMomentarily}
      onTouchStart={showControlsMomentarily}
      onPointerDown={() => containerRef.current?.focus({ preventScroll: true })}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      aria-label={`مشغل فيديو تعليمي: ${title}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_50%,rgba(187,221,255,0.16),transparent_52%)]" />

      <div className="relative w-full aspect-video p-2 sm:p-4 md:p-6">
        <div
          ref={videoSurfaceRef}
          data-video-surface="true"
          onClick={handleSurfaceTap}
          onDoubleClick={handleSurfaceDoubleClick}
          className="relative h-full w-full overflow-hidden rounded-[24px] sm:rounded-[30px] border border-white/15 bg-black/55 backdrop-blur-md"
        >
          {isYouTube ? (
            <div
              ref={youtubeMountRef}
              className="absolute inset-0 h-full w-full overflow-hidden pointer-events-none z-0"
              aria-hidden
            />
          ) : (
            <video
              ref={uploadVideoRef}
              src={videoUrl}
              className="absolute inset-0 h-full w-full object-contain z-0"
              poster={posterUrl ?? undefined}
              playsInline
              preload="metadata"
              controls={false}
              disablePictureInPicture
              controlsList="nodownload noplaybackrate noremoteplayback"
              onLoadedMetadata={() => {
                setReady(true);
                syncProgress();
                applyVolume(volume);
                applyRate(playbackRate);
              }}
              onPlay={() => {
                setIsPlaying(true);
                setHasStartedPlayback(true);
                startTicker();
              }}
              onPause={() => {
                setIsPlaying(false);
                clearTicker();
              }}
              onTimeUpdate={syncProgress}
              onError={() => setError("تعذر تشغيل الفيديو حاليًا")}
            />
          )}

          {isYouTube ? (
            <div
              className="absolute inset-0 z-[2] bg-transparent"
              aria-hidden
            />
          ) : null}

          <div
            className={`pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/18 via-transparent to-black/12 transition-opacity duration-300 ${
              overlayVisible || !hasStartedPlayback ? "opacity-100" : "opacity-0"
            }`}
          />

          {showYouTubePausedCover ? (
            <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
              {pausedCoverPosterUrl ? (
                <img
                  src={pausedCoverPosterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => {
                    if (preferCustomPoster && customPosterUrl) {
                      setPreferCustomPoster(false);
                      return;
                    }
                    if (youTubePosterQuality === "maxres") {
                      setYouTubePosterQuality("hq");
                    }
                  }}
                />
              ) : null}
              <div className="absolute inset-0 bg-black/30" />
            </div>
          ) : null}

          {showYouTubeBrandGuards ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-16 bg-black/84" />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-28 bg-gradient-to-b from-black/72 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-16 bg-black/86" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-24 bg-gradient-to-t from-black/68 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[4] w-10 bg-gradient-to-r from-black/62 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[4] w-10 bg-gradient-to-l from-black/62 to-transparent" />
            </>
          ) : null}

          {isYouTubeUiShieldVisible ? (
            <div className="pointer-events-none absolute inset-0 z-[5] bg-black/38 transition-opacity duration-220" />
          ) : null}

          {watermarkLabel ? (
            <div className="pointer-events-none absolute left-4 top-4 z-[7] max-w-[calc(100%-6.25rem)] truncate rounded-xl border border-white/20 bg-slate-950/44 px-2.5 py-1 text-[10px] font-bold text-white/90 backdrop-blur-xl">
              {watermarkLabel}
            </div>
          ) : null}

          <button
            data-player-control="true"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void toggleFullscreen();
            }}
            className={`absolute right-4 top-4 z-[14] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-slate-950/40 text-white backdrop-blur-xl transition duration-200 hover:scale-[1.04] hover:bg-slate-900/70 active:scale-95 ${overlayVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            aria-label={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>

          <div
            className={`absolute inset-0 z-[8] flex items-center justify-center transition-opacity duration-200 ${
              ready && !error && !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              data-player-control="true"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                togglePlayback();
              }}
              className="flex h-[84px] w-[84px] items-center justify-center rounded-full border border-white/40 bg-white/95 text-slate-950 shadow-[0_14px_36px_rgba(0,0,0,0.56)] transition duration-200 hover:scale-[1.04] hover:bg-white active:scale-95"
              aria-label="تشغيل الفيديو"
            >
              <Play className="h-9 w-9 translate-x-[1px]" />
            </button>
          </div>

          {seekToast ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-[12] -translate-x-1/2 -translate-y-1/2">
              <span className="inline-flex rounded-full border border-white/35 bg-black/58 px-3 py-1 text-xs font-bold text-white animate-[ofqSeekToast_520ms_ease-out_forwards]">
                {seekToast}
              </span>
            </div>
          ) : null}

          {sideSeekToast ? (
            <div
              className={`pointer-events-none absolute top-1/2 z-[12] -translate-y-1/2 ${
                sideSeekToast === "left" ? "left-6 sm:left-8" : "right-6 sm:right-8"
              }`}
            >
              <span className="inline-flex rounded-full border border-white/35 bg-black/58 px-3 py-1 text-xs font-bold text-white animate-[ofqSeekToast_520ms_ease-out_forwards]">
                {sideSeekToast === "left" ? "-10s" : "+10s"}
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 z-[11] flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center text-white">
              <AlertTriangle className="h-7 w-7 text-amber-300" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : null}

          {showCaptureShield && captureNotice ? (
            <div className="pointer-events-none absolute inset-0 z-[11] flex items-center justify-center bg-black/22 backdrop-blur-sm">
              <p className="rounded-2xl border border-white/22 bg-slate-950/72 px-4 py-2 text-center text-xs font-bold text-white sm:text-sm">
                {captureNotice}
              </p>
            </div>
          ) : null}

          {!ready && !error ? (
            <div className="absolute inset-0 z-[10] flex items-center justify-center bg-black/55 text-sm text-white/90">
              جاري تجهيز المشغل...
            </div>
          ) : null}
        </div>

        {panelAvailable && isLessonPanelOpen ? (
          <div
            ref={lessonPanelRef}
            data-player-control="true"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            className="absolute z-[15] left-3 right-3 bottom-24 max-h-[52vh] overflow-hidden rounded-3xl border border-white/15 bg-slate-950/82 shadow-[0_22px_54px_rgba(0,0,0,0.55)] backdrop-blur-xl animate-[ofqPanelIn_220ms_cubic-bezier(0.22,1,0.36,1)] sm:left-auto sm:right-6 sm:top-20 sm:bottom-28 sm:w-[390px] sm:max-h-none"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
              <p className="text-sm font-bold">هيكل الدروس</p>
              <button
                type="button"
                onClick={() => setIsLessonPanelOpen(false)}
                className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold hover:bg-white/10"
                aria-label="إغلاق قائمة الدروس"
              >
                إغلاق
              </button>
            </div>

            <div className="max-h-[44vh] overflow-y-auto p-3 sm:max-h-[62vh]">
              {hasSegments ? (
                <div className="space-y-4">
                  {(["parts", "topics", "questions"] as VideoSegmentType[]).map((segmentType) => {
                    const list = groupedSegmentEntries[segmentType];
                    if (list.length === 0) return null;

                    return (
                      <div key={segmentType} className="space-y-2">
                        <p className="px-1 text-[11px] font-bold text-sky-100/90">{segmentTypeLabel(segmentType)}</p>
                        {list.map((segment) => {
                          const active = currentTime >= segment.startSeconds && currentTime < segment.endSeconds;
                          const completed = currentTime >= segment.endSeconds - 0.2;
                          const rawSpan = Math.max(1, segment.endSeconds - segment.startSeconds);
                          const rawProgress = ((currentTime - segment.startSeconds) / rawSpan) * 100;
                          const progress = completed ? 100 : active ? Math.min(100, Math.max(0, rawProgress)) : 0;
                          return (
                            <button
                              key={`${segment.id}-${segment.startSeconds}-${segment.orderIndex}`}
                              type="button"
                              onClick={() => jumpToSegment(segment.startSeconds)}
                              className={`w-full rounded-2xl border p-3 text-right transition ${
                                active
                                  ? "border-sky-300/60 bg-sky-500/18"
                                  : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{segment.title}</p>
                                  <p className="text-xs text-white/65">{formatSegmentTime(segment.startSeconds)}</p>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${segmentTypeBadgeClass(segment.segmentType)}`}>
                                  {segmentTypeLabel(segment.segmentType)}
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                                <div
                                  className={`h-full rounded-full ${completed ? "bg-emerald-300" : "bg-sky-300"}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {chapterEntries.map((chapter, index) => {
                    const active = currentTime >= chapter.startSeconds && currentTime < chapter.endSeconds;
                    return (
                      <button
                        key={`${chapter.id}-${index}`}
                        type="button"
                        onClick={() => jumpToSegment(chapter.startSeconds)}
                        className={`w-full rounded-2xl border p-3 text-right transition ${
                          active
                            ? "border-sky-300/60 bg-sky-500/18"
                            : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                        }`}
                      >
                        <p className="truncate text-sm font-semibold text-white">{chapter.title}</p>
                        <p className="mt-1 text-xs text-white/65">{formatSegmentTime(chapter.startSeconds)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div
          className={`absolute inset-x-0 bottom-3 z-[14] transform-gpu transition-all duration-300 sm:bottom-5 ${
            overlayVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <div className="mx-auto w-[calc(100%-0.75rem)] sm:w-[calc(100%-1.75rem)]">
            <div
              data-player-control="true"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              className="rounded-full border border-white/12 bg-[#131518]/92 px-3 py-2.5 text-white shadow-[0_20px_48px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:px-4"
            >
              <div className="flex flex-wrap items-center gap-2 sm:gap-3" dir="ltr">
                <div className="flex min-w-[180px] max-w-[330px] items-center gap-2 sm:min-w-[210px]">
                  <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-white/20 bg-white/10">
                    {lessonThumb ? (
                      <img src={lessonThumb} alt={title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-700/60 text-[11px] font-bold text-white/80">
                        درس
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 text-right" dir="rtl">
                    <p className="truncate text-sm font-semibold">{title}</p>
                    {displaySubtitle ? <p className="truncate text-xs text-white/65">{displaySubtitle}</p> : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    triggerSeekFeedback("backward");
                    seekBy(-10);
                  }}
                  className={`control-icon-btn seek-backward ${seekFx === "backward" ? "seek-active" : ""}`}
                  aria-label="رجوع 10 ثوانٍ"
                >
                  <SeekTenIcon forward={false} />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePlayback();
                  }}
                  className="play-main-btn"
                  aria-label={isPlaying ? "إيقاف الفيديو" : "تشغيل الفيديو"}
                >
                  <span className="relative inline-flex h-5 w-5 items-center justify-center">
                    <Play
                      className={`absolute h-5 w-5 translate-x-[1px] transition-all duration-200 ${
                        isPlaying ? "scale-75 opacity-0" : "scale-100 opacity-100"
                      }`}
                    />
                    <Pause
                      className={`absolute h-5 w-5 transition-all duration-200 ${
                        isPlaying ? "scale-100 opacity-100" : "scale-75 opacity-0"
                      }`}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    triggerSeekFeedback("forward");
                    seekBy(10);
                  }}
                  className={`control-icon-btn seek-forward ${seekFx === "forward" ? "seek-active" : ""}`}
                  aria-label="تقديم 10 ثوانٍ"
                >
                  <SeekTenIcon forward />
                </button>

                <div className="order-10 basis-full lg:order-none lg:basis-auto lg:flex-1 lg:min-w-[170px]">
                  <div className="relative w-full">
                    {isSeeking && seekPreviewTime !== null ? (
                      <div
                        className="pointer-events-none absolute -top-7 z-[17] -translate-x-1/2 rounded-md border border-white/20 bg-black/78 px-2 py-0.5 text-[10px] font-semibold text-white animate-[ofqFadeIn_150ms_ease-out]"
                        style={{ left: `${previewPercent}%` }}
                      >
                        {formatTime(seekPreviewTime)}
                      </div>
                    ) : null}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(duration, 0.0001)}
                      step={0.1}
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(event) => {
                        event.stopPropagation();
                        const value = Number.parseFloat(event.target.value);
                        setSeekPreviewTime(value);
                        seekTo(value);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setIsSeeking(true);
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        setIsSeeking(true);
                      }}
                      onTouchStart={(event) => {
                        event.stopPropagation();
                        setIsSeeking(true);
                      }}
                      className="w-full ofq-progress-slider"
                      dir="ltr"
                      aria-label="شريط التقدم"
                      style={{
                        background: `linear-gradient(to right, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.96) ${progressPercent}%, rgba(203,213,225,0.32) ${progressPercent}%, rgba(203,213,225,0.32) 100%)`,
                      }}
                    />
                  </div>
                </div>

                <span className="min-w-[94px] text-center text-xs font-semibold tracking-wide text-white/90">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <select
                  value={quality}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    applyQuality(event.target.value);
                  }}
                  className="control-select w-[74px]"
                  aria-label="اختيار الجودة"
                >
                  {displayQualityLevels.map((level) => (
                    <option key={level} value={level} className="text-black">
                      {labelQuality(level)}
                    </option>
                  ))}
                </select>

                <select
                  value={playbackRate}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    applyRate(Number.parseFloat(event.target.value));
                  }}
                  className="control-select w-[58px]"
                  aria-label="سرعة التشغيل"
                >
                  {displayPlaybackRates.map((rate) => (
                    <option key={rate} value={rate} className="text-black">
                      {rate}x
                    </option>
                  ))}
                </select>

                <div
                  ref={volumeWrapperRef}
                  data-player-control="true"
                  className="relative"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseEnter={openVolumePanel}
                  onMouseLeave={() => scheduleVolumePanelHide(300)}
                  onFocusCapture={openVolumePanel}
                  onBlurCapture={(event) => {
                    const next = event.relatedTarget as Node | null;
                    if (next && volumeWrapperRef.current?.contains(next)) return;
                    scheduleVolumePanelHide(300);
                  }}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMute();
                      openVolumePanel();
                    }}
                    className="control-icon-btn"
                    aria-label={volume === 0 ? "إلغاء كتم الصوت" : "كتم الصوت"}
                  >
                    <VolumeLevelIcon volume={volume} />
                  </button>

                  <div
                    ref={volumePanelRef}
                    className={`absolute bottom-[calc(100%+10px)] left-1/2 z-[16] flex h-40 w-14 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/20 bg-slate-950/92 px-2 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-bottom ${
                      isVolumePanelOpen ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"
                    }`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={volume}
                      onChange={(event) => {
                        event.stopPropagation();
                        applyVolume(Number.parseInt(event.target.value, 10));
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setIsVolumeDragging(true);
                        isVolumeDraggingRef.current = true;
                        openVolumePanel();
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        setIsVolumeDragging(true);
                        isVolumeDraggingRef.current = true;
                        openVolumePanel();
                      }}
                      onTouchStart={(event) => {
                        event.stopPropagation();
                        setIsVolumeDragging(true);
                        isVolumeDraggingRef.current = true;
                        openVolumePanel();
                      }}
                      className="ofq-volume-slider ofq-volume-slider-vertical"
                      aria-label="مستوى الصوت"
                      dir="ltr"
                      style={{
                        background: `linear-gradient(to right, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.96) ${volume}%, rgba(203,213,225,0.3) ${volume}%, rgba(203,213,225,0.3) 100%)`,
                      }}
                    />
                  </div>
                </div>

                <button
                  ref={lessonPanelToggleRef}
                  type="button"
                  disabled={!panelAvailable}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsLessonPanelOpen((open) => !open);
                  }}
                  className={`control-icon-btn disabled:cursor-not-allowed disabled:opacity-45 ${
                    isLessonPanelOpen ? "bg-white/16 border-white/35 scale-[1.02]" : ""
                  }`}
                  aria-label="فتح قائمة الدروس"
                >
                  <ListVideo className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isFullscreen ? (
        <div
          data-player-control="true"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          className="border-t border-white/10 bg-slate-950/28 px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4"
          dir="rtl"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-white/95">أقسام الدرس</p>
            <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70">
              {chapterEntries.length}
            </span>
          </div>

          {chapterEntries.length > 0 ? (
            <div className="space-y-2.5">
              {chapterEntries.map((chapter, index) => {
                const active = currentTime >= chapter.startSeconds && currentTime < chapter.endSeconds;
                const thumbKey = `${videoUrl}::${chapter.id}::${chapter.startSeconds}`;
                const generatedThumbnail = generatedChapterThumbs[thumbKey];
                const isThumbnailLoading = chapterThumbLoading[thumbKey] ?? false;
                const isThumbnailBroken = chapterThumbBroken[thumbKey] ?? false;
                const chapterThumbnailSource = chapter.thumbnailUrl?.trim();
                const isProtectedThumbnail = Boolean(chapterThumbnailSource && isProtectedSegmentThumbnailUrl(chapterThumbnailSource));
                const thumbnail =
                  generatedThumbnail ||
                  (!isProtectedThumbnail ? chapterThumbnailSource : undefined) ||
                  chapterFallbackThumb;
                const showThumbnailSkeleton = isThumbnailLoading && !generatedThumbnail;

                return (
                  <button
                    key={`${chapter.id}-${chapter.startSeconds}-${index}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      jumpToSegment(chapter.startSeconds, { autoPlay: true, closePanel: true });
                    }}
                    className={`group w-full rounded-2xl border px-2.5 py-2 text-right transition-all duration-200 sm:px-3 sm:py-2.5 ${
                      active
                        ? "border-sky-300/70 bg-sky-500/14 shadow-[0_0_0_1px_rgba(147,197,253,0.18)]"
                        : "border-white/12 bg-white/[0.04] hover:border-white/24 hover:bg-white/[0.08]"
                    }`}
                    aria-label={`الانتقال إلى ${chapter.title}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative h-[68px] w-[118px] flex-shrink-0 overflow-hidden rounded-xl border border-white/14 bg-slate-900/60 sm:h-[72px] sm:w-[128px]">
                        {showThumbnailSkeleton ? (
                          <div className="h-full w-full animate-pulse bg-white/10" />
                        ) : thumbnail && !isThumbnailBroken ? (
                          <img
                            src={thumbnail}
                            alt={chapter.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            onError={() => {
                              setChapterThumbBroken((prev) => {
                                if (prev[thumbKey]) return prev;
                                return { ...prev, [thumbKey]: true };
                              });
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-800/80 text-[11px] font-bold text-white/70">
                            معاينة الدرس
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 rounded-md border border-white/25 bg-black/60 px-1.5 py-[2px] text-[10px] font-bold text-white">
                          {formatSegmentTime(chapter.startSeconds)}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{chapter.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/70">
                          <span className="rounded-full bg-white/10 px-2 py-0.5">
                            يبدأ: {formatSegmentTime(chapter.startSeconds)}
                          </span>
                        </div>
                        {chapter.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-white/65">{chapter.description}</p>
                        ) : null}
                      </div>

                      <span
                        className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-all ${
                          active
                            ? "border-sky-200/65 bg-sky-300/18 text-sky-100"
                            : "border-white/18 bg-white/[0.05] text-white/85 group-hover:bg-white/12"
                        }`}
                        aria-hidden
                      >
                        <Play className="h-[18px] w-[18px] translate-x-[1px]" strokeWidth={2.25} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/18 bg-white/[0.03] px-4 py-4 text-center text-sm font-semibold text-white/70">
              لا توجد أقسام متاحة لهذا الدرس حتى الآن.
            </div>
          )}
        </div>
      ) : null}

      <style>{`
        .control-icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.05);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(248, 250, 252, 0.95);
          overflow: visible;
          transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
        }
        .control-icon-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.32);
          transform: scale(1.04);
        }
        .control-icon-btn:active {
          transform: scale(0.94);
        }
        .seek-active {
          animation-duration: 300ms;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          animation-fill-mode: both;
        }
        .seek-forward.seek-active {
          animation-name: ofqSeekForward;
        }
        .seek-backward.seek-active {
          animation-name: ofqSeekBackward;
        }
        .control-icon-btn:focus-visible,
        .play-main-btn:focus-visible,
        .control-select:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.86);
          outline-offset: 2px;
        }
        .play-main-btn {
          width: 48px;
          height: 48px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.68);
          background: rgba(255, 255, 255, 0.96);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(8, 12, 20, 0.94);
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.33);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .play-main-btn:hover {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
        }
        .play-main-btn:active {
          transform: scale(0.94);
        }
        .control-select {
          height: 32px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.05);
          color: white;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          text-align: center;
          text-align-last: center;
          padding: 0 9px;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          background-image: none !important;
          transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
          cursor: pointer;
        }
        .control-select::-ms-expand {
          display: none;
        }
        .control-select:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
          transform: scale(1.02);
        }
        .ofq-progress-slider,
        .ofq-volume-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 9999px;
          outline: none;
          border: 0;
          background: rgba(203, 213, 225, 0.32);
          transition: background 130ms linear;
        }
        .ofq-progress-slider::-webkit-slider-thumb,
        .ofq-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.42);
          cursor: pointer;
          transition: transform 160ms ease;
        }
        .ofq-progress-slider::-moz-range-thumb,
        .ofq-volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.42);
          cursor: pointer;
          transition: transform 160ms ease;
        }
        .ofq-progress-slider:hover::-webkit-slider-thumb,
        .ofq-progress-slider:active::-webkit-slider-thumb,
        .ofq-progress-slider:hover::-moz-range-thumb,
        .ofq-progress-slider:active::-moz-range-thumb {
          transform: scale(1.2);
        }
        .ofq-progress-slider::-moz-range-track,
        .ofq-volume-slider::-moz-range-track {
          height: 4px;
          border-radius: 9999px;
          border: 0;
          background: rgba(203, 213, 225, 0.32);
        }
        .ofq-volume-slider-vertical {
          width: 112px;
          transform: rotate(-90deg);
          transform-origin: center;
        }
        @keyframes ofqSeekForward {
          0% { transform: scale(1) rotate(0deg); }
          45% { transform: scale(0.92) rotate(18deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes ofqSeekBackward {
          0% { transform: scale(1) rotate(0deg); }
          45% { transform: scale(0.92) rotate(-18deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes ofqSeekToast {
          0% { opacity: 0; transform: translateY(8px) scale(0.92); }
          20% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(0.97); }
        }
        @keyframes ofqPanelIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ofqFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default CustomVideoPlayer;
