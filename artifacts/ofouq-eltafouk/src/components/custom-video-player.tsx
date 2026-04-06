import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from "lucide-react";

type PlayerVideoType = "youtube" | "upload";
type VideoSegmentType = "questions" | "parts" | "topics";
type PlayerVideoSegment = {
  id?: number;
  title: string;
  startSeconds: number;
  segmentType: VideoSegmentType;
  orderIndex?: number;
};

type CustomVideoPlayerProps = {
  videoUrl: string;
  videoType: PlayerVideoType;
  title: string;
  posterUrl?: string | null;
  segments?: PlayerVideoSegment[] | null;
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
  modestbranding: "1",
  iv_load_policy: "3",
  cc_load_policy: "0",
  playsinline: "1",
  enablejsapi: "1",
};
const YOUTUBE_IFRAME_CROP = {
  top: 20,
  bottom: 20,
  side: 4,
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
  if (!Number.isFinite(seconds) || seconds <= 0) return "0د";

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}س ${String(minutes).padStart(2, "0")}د`;
  }

  return `${totalMinutes}د`;
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
    auto: "تلقائي",
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

function DynamicVolumeIcon({ volume }: { volume: number }) {
  const activeWaves = volume <= 0 ? 0 : volume < 34 ? 1 : volume < 67 ? 2 : 3;
  const waveClass = (idx: number) =>
    `transition-opacity duration-200 ${activeWaves >= idx ? "opacity-100" : "opacity-25"}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className="w-6 h-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10v4h4l5 4V6L7 10H3z" fill="currentColor" stroke="none" />
      <path className={waveClass(1)} d="M14.4 10.2a2.6 2.6 0 0 1 0 3.6" />
      <path className={waveClass(2)} d="M16.9 8.2a5.2 5.2 0 0 1 0 7.6" />
      <path className={waveClass(3)} d="M19.5 6.1a8.4 8.4 0 0 1 0 11.8" />
      {volume <= 0 ? <path d="M4 4l16 16" className="opacity-90" /> : null}
    </svg>
  );
}

function CenterActionIcon({ isPlaying }: { isPlaying: boolean }) {
  return isPlaying ? (
    <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4.4" height="14" rx="1.4" />
      <rect x="13.6" y="5" width="4.4" height="14" rx="1.4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="currentColor" aria-hidden>
      <path d="M8 5.2c0-.9 1-1.5 1.9-1l8.1 4.9a1.2 1.2 0 0 1 0 2.1l-8.1 4.9c-.9.5-1.9-.1-1.9-1V5.2z" />
    </svg>
  );
}

function CenterSeekIcon({ forward }: { forward: boolean }) {
  return (
    <span className="relative flex items-center justify-center w-10 h-10 text-white">
      {forward ? <ChevronsRight className="w-8 h-8" /> : <ChevronsLeft className="w-8 h-8" />}
      <span className="absolute -bottom-2 text-[9px] font-black tracking-wide">10ث</span>
    </span>
  );
}

export function CustomVideoPlayer({
  videoUrl,
  videoType,
  title,
  posterUrl,
  segments,
  watermarkText,
}: CustomVideoPlayerProps) {
  const isYouTube = videoType === "youtube";
  const youTubeId = useMemo(() => (isYouTube ? parseYouTubeId(videoUrl) : null), [isYouTube, videoUrl]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const youtubeMountRef = useRef<HTMLDivElement | null>(null);
  const uploadVideoRef = useRef<HTMLVideoElement | null>(null);
  const segmentsPanelRef = useRef<HTMLDivElement | null>(null);
  const segmentsToggleRef = useRef<HTMLButtonElement | null>(null);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const tickerRef = useRef<number | null>(null);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const selectedQualityRef = useRef<string>("auto");
  const manualQualityLockRef = useRef(false);

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
  const [isSegmentsPanelOpen, setIsSegmentsPanelOpen] = useState(false);
  const watermarkLabel = watermarkText ? `${watermarkText} · ${clockText}` : null;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const customPosterUrl = posterUrl?.trim() || null;
  const youTubePosterUrl = youTubeId ? buildYouTubePosterUrl(youTubeId, youTubePosterQuality) : null;
  const pausedCoverPosterUrl = preferCustomPoster && customPosterUrl ? customPosterUrl : youTubePosterUrl;
  const showYouTubePausedCover = isYouTube && !hasStartedPlayback && !isPlaying && !error && Boolean(pausedCoverPosterUrl);
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
      }))
      .filter((segment) => segment.title.length > 0)
      .sort((a, b) => (a.startSeconds - b.startSeconds) || (a.orderIndex - b.orderIndex));
  }, [segments]);
  const hasSegments = normalizedSegments.length > 0;
  const groupedSegments = useMemo(() => {
    const groups: Record<VideoSegmentType, typeof normalizedSegments> = {
      parts: [],
      topics: [],
      questions: [],
    };
    normalizedSegments.forEach((segment) => {
      groups[segment.segmentType].push(segment);
    });
    return groups;
  }, [normalizedSegments]);
  const overlayVisible = showControls || !isPlaying;

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
    if (!isPlaying) {
      await requestFullscreen(containerRef.current).catch(() => undefined);
    }

    if (isYouTube) {
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
    setVolume(nextVolume);

    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;
      player.setVolume(nextVolume);
      if (nextVolume === 0) player.mute();
      else player.unMute();
      return;
    }

    const video = uploadVideoRef.current;
    if (!video) return;
    video.volume = Math.min(Math.max(nextVolume / 100, 0), 1);
    video.muted = nextVolume === 0;
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

  function jumpToSegment(startSeconds: number) {
    seekTo(startSeconds);
    showControlsMomentarily();
    setIsSegmentsPanelOpen(false);
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
    const handleVisibility = () => {
      if (document.hidden) {
        pausePlayback();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blockSaveOrPrint = (event.ctrlKey || event.metaKey) && (key === "s" || key === "p");
      const isPrintScreen = event.key === "PrintScreen";

      if (blockSaveOrPrint || isPrintScreen) {
        event.preventDefault();
        if (isPrintScreen && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const centerControlButtonClass =
    "relative w-[86px] h-[86px] rounded-[24px] border border-white/15 bg-black/80 text-white flex items-center justify-center shadow-[0_12px_28px_rgba(0,0,0,0.5)] hover:bg-black/90 transition-colors duration-150";

  function handleSurfaceTap() {
    if (!showControls) {
      showControlsMomentarily();
    }
  }

  useEffect(() => {
    if (!hasSegments && isSegmentsPanelOpen) {
      setIsSegmentsPanelOpen(false);
    }
  }, [hasSegments, isSegmentsPanelOpen]);

  useEffect(() => {
    if (!overlayVisible && isSegmentsPanelOpen) {
      setIsSegmentsPanelOpen(false);
    }
  }, [overlayVisible, isSegmentsPanelOpen]);

  useEffect(() => {
    if (!isSegmentsPanelOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (segmentsPanelRef.current?.contains(target)) return;
      if (segmentsToggleRef.current?.contains(target)) return;
      setIsSegmentsPanelOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSegmentsPanelOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSegmentsPanelOpen]);

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

  return (
    <div
      ref={containerRef}
      className="relative rounded-[28px] overflow-hidden bg-black/95 border border-white/15 shadow-[0_30px_80px_rgba(2,6,23,0.45)] select-none"
      dir="rtl"
      onMouseMove={showControlsMomentarily}
      onTouchStart={showControlsMomentarily}
      onClick={handleSurfaceTap}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="relative w-full aspect-video bg-black">
        {isYouTube ? (
          <div
            ref={youtubeMountRef}
            className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0"
            aria-hidden
          />
        ) : (
          <video
            ref={uploadVideoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain z-0"
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

        {showYouTubePausedCover ? (
          <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
            {pausedCoverPosterUrl ? (
              <img
                src={pausedCoverPosterUrl}
                alt=""
                className="w-full h-full object-cover"
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
            <div className="absolute inset-0 bg-black/24" />
          </div>
        ) : null}

        {isYouTube ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-black/95" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/95 via-black/72 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/84 via-black/40 to-transparent" />
            <div className="pointer-events-none absolute top-0 right-0 w-40 h-24 bg-gradient-to-bl from-black/84 via-black/48 to-transparent" />
            <div className="pointer-events-none absolute top-0 left-0 w-40 h-24 bg-gradient-to-br from-black/84 via-black/48 to-transparent" />
            <div className="pointer-events-none absolute bottom-0 right-0 w-48 h-24 bg-gradient-to-tl from-black/88 via-black/45 to-transparent" />
          </>
        ) : null}

        {watermarkLabel ? (
          <>
            <div className="pointer-events-none absolute top-4 left-4 px-2.5 py-1 rounded-xl border border-white/20 bg-white/15 backdrop-blur-xl text-white/90 text-[10px] font-bold">
              {watermarkLabel}
            </div>
            <div className="pointer-events-none absolute bottom-20 right-4 px-2.5 py-1 rounded-xl border border-white/20 bg-white/15 backdrop-blur-xl text-white/85 text-[10px] font-bold">
              {watermarkLabel}
            </div>
          </>
        ) : null}

        {hasSegments ? (
          <>
            <button
              ref={segmentsToggleRef}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsSegmentsPanelOpen((open) => !open);
              }}
              className={`absolute right-3 top-3 z-[4] px-3 py-2 rounded-xl border border-white/20 bg-black/82 hover:bg-black/92 text-white text-xs font-bold shadow-lg transition-opacity duration-300 ${overlayVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              aria-label="فتح تقسيمات الفيديو"
            >
              {isSegmentsPanelOpen ? "إغلاق التقسيمات" : "تقسيمات الفيديو"}
            </button>

            {isSegmentsPanelOpen && overlayVisible ? (
              <div
                ref={segmentsPanelRef}
                onClick={(event) => event.stopPropagation()}
                className="absolute z-[5] right-3 top-14 bottom-3 w-[min(88vw,340px)] rounded-2xl border border-white/15 bg-black/90 shadow-2xl p-3 flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15">
                  <p className="text-sm font-bold text-white">فهرس الفيديو</p>
                  <button
                    type="button"
                    onClick={() => setIsSegmentsPanelOpen(false)}
                    className="text-xs px-2 py-1 rounded-lg bg-black/70 border border-white/20 text-white hover:bg-black"
                  >
                    إغلاق
                  </button>
                </div>

                <div className="mt-2 overflow-y-auto space-y-3 pr-1">
                  {(["parts", "topics", "questions"] as VideoSegmentType[]).map((segmentType) => {
                    const list = groupedSegments[segmentType];
                    if (list.length === 0) return null;

                    return (
                      <div key={segmentType} className="space-y-1.5">
                        <p className="text-[11px] font-bold text-white/80">{segmentTypeLabel(segmentType)}</p>
                        {list.map((segment) => (
                          <button
                            key={`${segment.id}-${segment.startSeconds}-${segment.orderIndex}`}
                            type="button"
                            onClick={() => jumpToSegment(segment.startSeconds)}
                            className="w-full text-right rounded-xl border border-white/15 bg-black/75 hover:bg-black transition-colors p-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${segmentTypeBadgeClass(segment.segmentType)}`}>
                                {segmentTypeLabel(segment.segmentType)}
                              </span>
                              <span className="text-[11px] font-mono text-sky-100">{formatSegmentTime(segment.startSeconds)}</span>
                            </div>
                            <p className="mt-1 text-xs text-white font-semibold leading-relaxed">{segment.title}</p>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 transition-opacity duration-250 ${
            ready && !error && (!isPlaying || showControls) ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              seekBy(10);
            }}
            className={centerControlButtonClass}
            aria-label="تقديم 10 ثوانٍ"
          >
            <CenterSeekIcon forward />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              togglePlayback();
            }}
            className={centerControlButtonClass}
            aria-label={isPlaying ? "إيقاف الفيديو" : "تشغيل الفيديو"}
          >
            <CenterActionIcon isPlaying={isPlaying} />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              seekBy(-10);
            }}
            className={centerControlButtonClass}
            aria-label="رجوع 10 ثوانٍ"
          >
            <CenterSeekIcon forward={false} />
          </button>
        </div>

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white px-4 text-center">
            <AlertTriangle className="w-7 h-7 text-amber-300" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : null}

        {!ready && !error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/80 text-sm">جاري تجهيز المشغل...</div>
        ) : null}

        <div
          className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <div className="bg-gradient-to-t from-black/88 via-black/62 to-transparent pt-14 pb-4 px-4">
            <div className="rounded-2xl border border-white/12 bg-black/82 shadow-[0_14px_34px_rgba(0,0,0,0.6)] px-3 py-3 space-y-3">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.0001)}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => seekTo(Number.parseFloat(event.target.value))}
                className="w-full ofq-progress-slider"
                dir="ltr"
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.95) ${progressPercent}%, rgba(255,255,255,0.18) ${progressPercent}%, rgba(255,255,255,0.18) 100%)`,
                }}
              />

              <div className="flex flex-wrap items-center gap-2 text-white">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="w-10 h-10 rounded-xl border border-white/20 bg-black/75 hover:bg-black flex items-center justify-center transition-colors"
                  aria-label={isPlaying ? "إيقاف" : "تشغيل"}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <span className="text-xs font-semibold min-w-[100px] text-center">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex items-center gap-1.5 min-w-[130px]">
                  <DynamicVolumeIcon volume={volume} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volume}
                    onChange={(event) => applyVolume(Number.parseInt(event.target.value, 10))}
                    className="w-full ofq-volume-slider"
                    aria-label="الصوت"
                    dir="ltr"
                    style={{
                      direction: "ltr",
                      background: `linear-gradient(to right, rgba(147, 197, 253, 0.95) 0%, rgba(147, 197, 253, 0.95) ${volume}%, rgba(255, 255, 255, 0.24) ${volume}%, rgba(255, 255, 255, 0.24) 100%)`,
                    }}
                  />
                </div>

                <div className="mr-auto flex items-center gap-2">
                  <label className="text-[11px] text-white/80">السرعة</label>
                  <select
                    value={playbackRate}
                    onChange={(event) => applyRate(Number.parseFloat(event.target.value))}
                    className="h-9 rounded-xl border border-white/20 bg-black/75 px-2 text-xs text-white"
                  >
                    {playbackRates.map((rate) => (
                      <option key={rate} value={rate} className="text-black">
                        {rate}x
                      </option>
                    ))}
                  </select>

                  <label className="text-[11px] text-white/80">الجودة</label>
                  <select
                    value={quality}
                    onChange={(event) => applyQuality(event.target.value)}
                    disabled={!isYouTube || qualityLevels.length <= 1}
                    className="h-9 rounded-xl border border-white/20 bg-black/75 px-2 text-xs text-white disabled:opacity-50"
                  >
                    {(qualityLevels.length > 0 ? qualityLevels : ["auto"]).map((level) => (
                      <option key={level} value={level} className="text-black">
                        {labelQuality(level)}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      void toggleFullscreen();
                    }}
                    className="w-10 h-10 rounded-xl border border-white/20 bg-black/75 hover:bg-black flex items-center justify-center transition-colors"
                    aria-label={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-white/15 bg-white/10 backdrop-blur-xl">
        <p className="text-xs text-foreground/90 font-semibold truncate">{title}</p>
      </div>

      <style>{`
        .ofq-progress-slider,
        .ofq-volume-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 9999px;
          outline: none;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(0, 0, 0, 0.72);
        }
        .ofq-progress-slider {
          direction: ltr;
        }
        .ofq-progress-slider::-webkit-slider-thumb,
        .ofq-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.75);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          cursor: pointer;
        }
        .ofq-progress-slider::-moz-range-thumb,
        .ofq-volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.75);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          cursor: pointer;
        }
        .ofq-progress-slider::-moz-range-track,
        .ofq-volume-slider::-moz-range-track {
          height: 6px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(0, 0, 0, 0.72);
        }
        .ofq-volume-slider {
          direction: ltr !important;
        }
        .ofq-volume-slider::-webkit-slider-runnable-track {
          direction: ltr !important;
        }
        .ofq-volume-slider::-moz-range-track {
          direction: ltr !important;
        }
      `}</style>
    </div>
  );
}

export default CustomVideoPlayer;
