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

type CustomVideoPlayerProps = {
  videoUrl: string;
  videoType: PlayerVideoType;
  title: string;
  posterUrl?: string | null;
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
  watermarkText,
}: CustomVideoPlayerProps) {
  const isYouTube = videoType === "youtube";
  const youTubeId = useMemo(() => (isYouTube ? parseYouTubeId(videoUrl) : null), [isYouTube, videoUrl]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const youtubeMountRef = useRef<HTMLDivElement | null>(null);
  const uploadVideoRef = useRef<HTMLVideoElement | null>(null);
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
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const watermarkLabel = watermarkText ? `${watermarkText} · ${clockText}` : null;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const youTubePosterUrl = youTubeId ? buildYouTubePosterUrl(youTubeId, youTubePosterQuality) : null;
  const showYouTubePausedCover = isYouTube && !hasStartedPlayback && !isPlaying && !error && Boolean(youTubePosterUrl);

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
    const safeTime = Math.max(0, Math.min(nextTime, duration || 0));

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
    "relative w-[86px] h-[86px] rounded-[26px] border border-white/45 bg-black/52 backdrop-blur-2xl text-white flex items-center justify-center shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_16px_50px_rgba(8,47,73,0.55)] transition-all duration-200";

  function handleSurfaceTap() {
    if (!showControls) {
      showControlsMomentarily();
    }
  }

  useEffect(() => {
    if (isYouTube) {
      setQualityLevels(FALLBACK_QUALITY_LEVELS);
    } else {
      setQualityLevels([]);
    }
  }, [isYouTube]);

  useEffect(() => {
    setYouTubePosterQuality("maxres");
    setHasStartedPlayback(false);
  }, [youTubeId]);

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
            {youTubePosterUrl ? (
              <img
                src={youTubePosterUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={() => {
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
            <span className="absolute inset-0 rounded-[26px] bg-blue-400/22" />
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
            <span className={`absolute inset-0 rounded-[26px] ${isPlaying ? "bg-white/8" : "bg-blue-400/22"}`} />
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
            <span className="absolute inset-0 rounded-[26px] bg-blue-400/22" />
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
          <div className="bg-gradient-to-t from-black/55 via-black/25 to-transparent pt-14 pb-4 px-4">
            <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-2xl shadow-2xl px-3 py-3 space-y-3">
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
                  background: `linear-gradient(to right, rgba(147,197,253,0.98) 0%, rgba(147,197,253,0.98) ${progressPercent}%, rgba(255,255,255,0.26) ${progressPercent}%, rgba(255,255,255,0.26) 100%)`,
                }}
              />

              <div className="flex flex-wrap items-center gap-2 text-white">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="w-10 h-10 rounded-xl border border-white/25 bg-white/15 backdrop-blur-xl hover:bg-white/25 flex items-center justify-center transition-colors"
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
                    className="h-9 rounded-xl border border-white/25 bg-white/15 backdrop-blur-xl px-2 text-xs"
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
                    className="h-9 rounded-xl border border-white/25 bg-white/15 backdrop-blur-xl px-2 text-xs disabled:opacity-50"
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
                    className="w-10 h-10 rounded-xl border border-white/25 bg-white/15 backdrop-blur-xl hover:bg-white/25 flex items-center justify-center transition-colors"
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
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.24);
          backdrop-filter: blur(8px);
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
          border: 1px solid rgba(255, 255, 255, 0.65);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(191, 219, 254, 0.95));
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
          cursor: pointer;
        }
        .ofq-progress-slider::-moz-range-thumb,
        .ofq-volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.65);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(191, 219, 254, 0.95));
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
          cursor: pointer;
        }
        .ofq-progress-slider::-moz-range-track,
        .ofq-volume-slider::-moz-range-track {
          height: 6px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.24);
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
