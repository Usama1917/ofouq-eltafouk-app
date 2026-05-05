import { Feather } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Pressable,
  PressableProps,
  ScrollView,
  StyleSheet,
  StyleProp,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";

type VideoType = "youtube" | "upload";

export type AcademicVideoSegment = {
  id?: number;
  title: string;
  startSeconds: number;
  segmentType?: "questions" | "parts" | "topics";
  orderIndex?: number;
  thumbnailUrl?: string | null;
};

type AcademicVideoPlayerProps = {
  videoUrl: string;
  videoType: VideoType;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  thumbnailUrl?: string | null;
  segments?: AcademicVideoSegment[] | null;
  watermarkText?: string;
  initialSeekSeconds?: number | null;
  onProgressUpdate?: (progress: {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    hasStarted: boolean;
  }) => void;
};

type PendingSeek = {
  target: number;
  requestedAt: number;
};

type MeasuredRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FullscreenOrientation = "portrait" | "landscape";
type ControlOptionMenu = "quality" | "speed";

function PlayerHost({
  fullscreen,
  onRequestClose,
  children,
}: {
  fullscreen: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  if (!fullscreen) return <>{children}</>;

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
      onRequestClose={onRequestClose}
    >
      <View style={styles.fullscreenBackdrop}>{children}</View>
    </Modal>
  );
}

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

function AnimatedPressable({
  style,
  pressedScale = 0.94,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function animate(toValue: number) {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 5,
    }).start();
  }

  return (
    <AnimatedPressableBase
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) animate(pressedScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!disabled) animate(1);
        onPressOut?.(event);
      }}
      style={[
        style,
        {
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

const PLAYER_RATIO = 9 / 16;
const DOUBLE_TAP_MS = 280;
const CONTROLS_DISSOLVE_IN_MS = 210;
const CONTROLS_DISSOLVE_OUT_MS = 320;
const SCRUB_LABEL_UPDATE_MS = 120;
const SEEK_CONFIRM_TOLERANCE_SECONDS = 0.85;
const SEEK_CONFIRM_PLAYING_TOLERANCE_SECONDS = 2.5;
const SEEK_RETRY_MS = 900;
const DEFAULT_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FALLBACK_QUALITY_LEVELS = ["hd720", "large", "medium", "auto"];

function resolveMediaUrl(url: string | null | undefined) {
  const value = url?.trim();
  if (!value) return null;
  if (/\/api\/academic\/videos\/\d+\/segments\/\d+\/thumbnail(?:\?|$)/.test(value)) return null;
  if (/^(https?:|data:|file:|blob:)/i.test(value)) return value;
  return `${getBaseUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function parseYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]{11})/);
  return match ? match[1] : null;
}

function isYouTubeHostedImage(url: string | null) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (
      hostname === "i.ytimg.com" ||
      hostname.endsWith(".ytimg.com") ||
      hostname === "img.youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname.endsWith(".youtube-nocookie.com")
    );
  } catch {
    return /(?:ytimg\.com|youtube(?:-nocookie)?\.com)/i.test(url);
  }
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function segmentLabel(type: AcademicVideoSegment["segmentType"]) {
  if (type === "questions") return "سؤال";
  if (type === "parts") return "جزء";
  if (type === "topics") return "موضوع";
  return "تقسيمة";
}

function labelQuality(value: string) {
  const labels: Record<string, string> = {
    hd2160: "2160p",
    hd1440: "1440p",
    hd1080: "1080p",
    hd720: "720p",
    large: "480p",
    medium: "360p",
    small: "240p",
    tiny: "144p",
    auto: "Auto",
  };
  return labels[value] ?? value;
}

function formatRate(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, "")}x`;
}

function buildYouTubeHtml(videoId: string) {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
    #stage { position:fixed; inset:0; overflow:hidden; background:#000; }
    #player { position:absolute; top:-24%; left:-6%; width:112%; height:148%; border:0; pointer-events:none; }
    .guard { position:absolute; pointer-events:none; z-index:3; }
    .top { top:0; left:0; right:0; height:18%; background:linear-gradient(#000, rgba(0,0,0,.58), transparent); }
    .bottom { bottom:0; left:0; right:0; height:20%; background:linear-gradient(transparent, rgba(0,0,0,.7), #000); }
    .left { top:0; bottom:0; left:0; width:9%; background:linear-gradient(90deg,#000,transparent); }
    .right { top:0; bottom:0; right:0; width:9%; background:linear-gradient(270deg,#000,transparent); }
  </style>
</head>
<body>
  <div id="stage">
    <div id="player"></div>
    <div class="guard top"></div>
    <div class="guard bottom"></div>
    <div class="guard left"></div>
    <div class="guard right"></div>
  </div>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    var player;
    var ready = false;
    var tick = null;
    function post(payload) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
    function current() {
      if (!player || !ready) return;
      post({ type: "time", currentTime: player.getCurrentTime() || 0, duration: player.getDuration() || 0 });
    }
    function startTick() {
      if (tick) clearInterval(tick);
      tick = setInterval(current, 250);
    }
    function stopTick() {
      if (tick) clearInterval(tick);
      tick = null;
    }
    window.onYouTubeIframeAPIReady = function() {
      player = new YT.Player("player", {
        host: "https://www.youtube-nocookie.com",
        videoId: "${videoId}",
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          showinfo: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: function(event) {
            ready = true;
            post({
              type: "ready",
              duration: event.target.getDuration() || 0,
              quality: player.getPlaybackQuality ? player.getPlaybackQuality() : "",
              qualityLevels: player.getAvailableQualityLevels ? player.getAvailableQualityLevels() : [],
              playbackRate: player.getPlaybackRate ? player.getPlaybackRate() : 1,
              playbackRates: player.getAvailablePlaybackRates ? player.getAvailablePlaybackRates() : []
            });
            current();
          },
          onStateChange: function(event) {
            if (event.data === YT.PlayerState.PLAYING) {
              post({ type: "playing" });
              startTick();
              current();
            } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED) {
              post({ type: "paused" });
              stopTick();
              current();
            } else if (event.data === YT.PlayerState.ENDED) {
              post({ type: "ended" });
              stopTick();
              current();
            } else if (event.data === YT.PlayerState.BUFFERING) {
              post({ type: "buffering" });
              current();
            }
          },
          onError: function() {
            post({ type: "error", message: "تعذر تشغيل الفيديو حاليًا" });
          }
        }
      });
    };
    window.__ofqPlayer = {
      play: function() { if (player && ready) { player.playVideo(); current(); } },
      pause: function() { if (player && ready) { player.pauseVideo(); current(); } },
      seekTo: function(seconds) { if (player && ready) { player.seekTo(Math.max(0, seconds), true); current(); } },
      seekBy: function(delta) { if (player && ready) { player.seekTo(Math.max(0, (player.getCurrentTime() || 0) + delta), true); current(); } },
      setVolume: function(value) {
        if (!player || !ready) return;
        var safe = Math.max(0, Math.min(100, Math.round(value || 0)));
        player.setVolume(safe);
        if (safe === 0) player.mute();
        else player.unMute();
      },
      setPlaybackRate: function(value) {
        if (!player || !ready || !player.setPlaybackRate) return;
        var safe = Number(value) || 1;
        player.setPlaybackRate(safe);
      },
      setPlaybackQuality: function(value) {
        if (!player || !ready || !player.setPlaybackQuality || !value) return;
        player.setPlaybackQuality(value);
      }
    };
    true;
  </script>
</body>
</html>`;
}

export function AcademicVideoPlayer({
  videoUrl,
  videoType,
  title,
  subtitle,
  posterUrl,
  thumbnailUrl,
  segments,
  watermarkText,
  initialSeekSeconds,
  onProgressUpdate,
}: AcademicVideoPlayerProps) {
  const { colors } = usePreferences();
  const { width, height } = useWindowDimensions();
  const videoRef = useRef<Video>(null);
  const webViewRef = useRef<WebView>(null);
  const segmentButtonRef = useRef<View>(null);
  const progressTrackRef = useRef<View>(null);
  const progressTrackFrameRef = useRef<MeasuredRect | null>(null);
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(null);
  const segmentPanelProgress = useRef(new Animated.Value(0)).current;
  const controlsProgress = useRef(new Animated.Value(1)).current;
  const timelineProgress = useRef(new Animated.Value(0)).current;
  const optionMenuProgress = useRef(new Animated.Value(0)).current;
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const initialSeekSecondsRef = useRef<number | null>(null);
  const initialSeekAppliedRef = useRef(false);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const progressSnapshotRef = useRef({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    hasStarted: false,
  });
  const [ready, setReady] = useState(videoType === "upload" ? false : false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const isScrubbingRef = useRef(false);
  const scrubTimeRef = useRef<number | null>(null);
  const lastScrubLabelUpdateRef = useRef(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingFullscreenPlay, setPendingFullscreenPlay] = useState(false);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);
  const [fullscreenOrientation, setFullscreenOrientation] = useState<FullscreenOrientation>("portrait");
  const [segmentPanelOpen, setSegmentPanelOpen] = useState(false);
  const [segmentPanelVisible, setSegmentPanelVisible] = useState(false);
  const [segmentButtonFrame, setSegmentButtonFrame] = useState<MeasuredRect | null>(null);
  const [segmentPanelSize, setSegmentPanelSize] = useState<{ width: number; height: number } | null>(null);
  const [seekToast, setSeekToast] = useState<"-10s" | "+10s" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionMenu, setOptionMenu] = useState<ControlOptionMenu | null>(null);
  const [optionMenuOpen, setOptionMenuOpen] = useState(false);
  const [progressTrackWidth, setProgressTrackWidth] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackRates, setPlaybackRates] = useState<number[]>(DEFAULT_PLAYBACK_RATES);
  const [quality, setQuality] = useState("hd720");
  const [qualityLevels, setQualityLevels] = useState<string[]>(FALLBACK_QUALITY_LEVELS);
  const [clockText, setClockText] = useState(() =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
  );

  const isYouTube = videoType === "youtube";
  const youTubeId = useMemo(() => (isYouTube ? parseYouTubeId(videoUrl) : null), [isYouTube, videoUrl]);
  const webHtml = useMemo(() => (youTubeId ? buildYouTubeHtml(youTubeId) : ""), [youTubeId]);
  const resolvedVideoUrl = resolveMediaUrl(videoUrl);
  const posterCandidateUrl = resolveMediaUrl(posterUrl) ?? resolveMediaUrl(thumbnailUrl);
  const resolvedPosterUrl = isYouTube && isYouTubeHostedImage(posterCandidateUrl) ? null : posterCandidateUrl;
  const shouldShowCleanYouTubeCover = isYouTube && (!isFullscreen || !hasStarted);
  const shouldShowPosterOverlay = Boolean(
    resolvedPosterUrl && (isYouTube ? shouldShowCleanYouTubeCover : (!isFullscreen || !hasStarted)),
  );
  const playerWidth = Math.min(width - 36, 760);
  const playerHeight = playerWidth * PLAYER_RATIO;
  const shellWidth = isFullscreen ? width : playerWidth;
  const shellHeight = isFullscreen ? height : playerHeight;
  const mediaWidth = shellWidth;
  const mediaHeight = shellHeight;
  const isLandscapeFullscreen = isFullscreen && fullscreenOrientation === "landscape";
  const isPortraitFullscreen = isFullscreen && fullscreenOrientation === "portrait";
  const containedVideoWidth = mediaWidth * PLAYER_RATIO <= mediaHeight ? mediaWidth : mediaHeight / PLAYER_RATIO;
  const containedVideoHeight = containedVideoWidth * PLAYER_RATIO;
  const containedVideoLeft = (mediaWidth - containedVideoWidth) / 2;
  const containedVideoTop = (mediaHeight - containedVideoHeight) / 2;
  const portraitVideoWatermarkStyle = isPortraitFullscreen
    ? {
        top: containedVideoTop + 12,
        left: containedVideoLeft + 12,
        maxWidth: Math.max(140, containedVideoWidth - 24),
      }
    : null;
  const landscapeControlInset = Math.max(28, Math.min(56, width * 0.06));
  const segmentPanelInset = 14;
  const landscapeSegmentPanelWidth = Math.max(320, Math.min(width - 28, (width - segmentPanelInset * 2) / 2));
  const isCompactControls = width < 650;
  const displayQualityLevels = useMemo(() => {
    if (!isYouTube) return ["auto"];
    const ranked = ["hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny", "auto"];
    const set = new Set(qualityLevels.length > 0 ? qualityLevels : FALLBACK_QUALITY_LEVELS);
    const sorted = ranked.filter((level) => set.has(level));
    return sorted.length > 0 ? sorted : FALLBACK_QUALITY_LEVELS;
  }, [isYouTube, qualityLevels]);
  const displayPlaybackRates = useMemo(() => {
    return Array.from(new Set([...(playbackRates.length > 0 ? playbackRates : DEFAULT_PLAYBACK_RATES), 1])).sort((a, b) => a - b);
  }, [playbackRates]);

  const normalizedSegments = useMemo(() => {
    if (!Array.isArray(segments)) return [];
    return segments
      .filter((segment) => segment && String(segment.title ?? "").trim())
      .map((segment, index) => ({
        ...segment,
        id: segment.id ?? index + 1,
        title: String(segment.title).trim(),
        startSeconds: Math.max(0, Math.floor(Number(segment.startSeconds) || 0)),
        orderIndex: Number.isFinite(segment.orderIndex) ? Number(segment.orderIndex) : index,
        thumbnailUrl: resolveMediaUrl(segment.thumbnailUrl),
      }))
      .sort((a, b) => (a.startSeconds - b.startSeconds) || ((a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
  }, [segments]);

  const displayedTime = scrubTime ?? currentTime;
  const watermarkLabel = watermarkText ? `${watermarkText} · ${clockText}` : null;
  const segmentPanelWidth = isLandscapeFullscreen ? landscapeSegmentPanelWidth : Math.max(1, width - 36);
  const segmentPanelBottom = isLandscapeFullscreen ? 12 : isPortraitFullscreen ? 16 : 154;
  const segmentPanelLeft = isLandscapeFullscreen ? width - landscapeControlInset - landscapeSegmentPanelWidth : 18;
  const estimatedSegmentPanelHeight = Math.min(
    isLandscapeFullscreen ? 188 : 230,
    68 + Math.max(1, normalizedSegments.length) * 62,
  );
  const segmentPanelHeight = segmentPanelSize?.height ?? estimatedSegmentPanelHeight;
  const segmentButtonSize = isLandscapeFullscreen ? 36 : isPortraitFullscreen ? 40 : 44;
  const controlsRightInset = isLandscapeFullscreen ? landscapeControlInset : isPortraitFullscreen ? 18 : 12;
  const controlsBottomInset = isLandscapeFullscreen ? 12 : isPortraitFullscreen ? 16 : 14;
  const controlsPaddingX = isLandscapeFullscreen ? 12 : isPortraitFullscreen ? 13 : 14;
  const controlsPaddingY = isLandscapeFullscreen ? 6 : isPortraitFullscreen ? 9 : 12;
  const controlsTopRowHeight = isLandscapeFullscreen ? 40 : isPortraitFullscreen ? 54 : 68;
  const controlsContentGap = isLandscapeFullscreen ? 3 : isPortraitFullscreen ? 5 : 10;
  const timeRowHeight = isLandscapeFullscreen ? 14 : isPortraitFullscreen ? 16 : 18;
  const timelineGap = isLandscapeFullscreen ? 3 : isPortraitFullscreen ? 5 : 8;
  const progressTrackHeight = isLandscapeFullscreen ? 22 : isPortraitFullscreen ? 28 : 34;
  const bottomRowGap = isLandscapeFullscreen ? 4 : isPortraitFullscreen ? 6 : 10;
  const bottomChipHeight = isLandscapeFullscreen ? 30 : isPortraitFullscreen ? 36 : 42;
  const estimatedControlsHeight =
    controlsPaddingY * 2 +
    controlsTopRowHeight +
    controlsContentGap +
    timeRowHeight +
    timelineGap +
    progressTrackHeight +
    bottomRowGap +
    bottomChipHeight;
  const segmentButtonTopOffset = isLandscapeFullscreen ? 2 : isPortraitFullscreen ? 7 : 10;
  const fallbackSegmentButtonFrame = {
    x: width - controlsRightInset - controlsPaddingX - segmentButtonSize,
    y: height - controlsBottomInset - estimatedControlsHeight + controlsPaddingY + segmentButtonTopOffset,
    width: segmentButtonSize,
    height: segmentButtonSize,
  };
  const segmentTransitionButtonFrame = segmentButtonFrame ?? fallbackSegmentButtonFrame;
  const segmentPanelCenterX = segmentPanelLeft + segmentPanelWidth / 2;
  const segmentPanelCenterY = height - segmentPanelBottom - segmentPanelHeight / 2;
  const segmentButtonCenterX = segmentTransitionButtonFrame.x + segmentTransitionButtonFrame.width / 2;
  const segmentButtonCenterY = segmentTransitionButtonFrame.y + segmentTransitionButtonFrame.height / 2;
  const segmentStartScaleX = Math.max(0.06, Math.min(1, segmentTransitionButtonFrame.width / segmentPanelWidth));
  const segmentStartScaleY = Math.max(0.06, Math.min(1, segmentTransitionButtonFrame.height / segmentPanelHeight));
  const segmentPanelAnimatedStyle = {
    opacity: segmentPanelProgress.interpolate({
      inputRange: [0, 0.08, 1],
      outputRange: [0.96, 1, 1],
    }),
    transform: [
      {
        translateX: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [segmentButtonCenterX - segmentPanelCenterX, 0],
        }),
      },
      {
        translateY: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [segmentButtonCenterY - segmentPanelCenterY, 0],
        }),
      },
      {
        scaleX: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [segmentStartScaleX, 1],
        }),
      },
      {
        scaleY: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [segmentStartScaleY, 1],
        }),
      },
    ],
  };
  const segmentPanelContentAnimatedStyle = {
    opacity: segmentPanelProgress.interpolate({
      inputRange: [0, 0.24, 1],
      outputRange: [0, 0, 1],
    }),
  };
  const controlsAnimatedStyle = {
    opacity: controlsProgress,
    transform: [
      {
        scale: controlsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1.025, 1],
        }),
      },
    ],
  };
  const closeButtonAnimatedStyle = {
    opacity: controlsProgress,
    transform: [
      {
        scale: controlsProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1.12, 1],
        }),
      },
    ],
  };
  const optionMenuAnimatedStyle = {
    opacity: optionMenuProgress,
    transform: [
      {
        translateY: optionMenuProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
      {
        scale: optionMenuProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  };

  function emitProgressUpdate() {
    const snapshot = progressSnapshotRef.current;
    if (!onProgressUpdateRef.current) return;
    if (!snapshot.hasStarted || snapshot.duration <= 0) return;
    onProgressUpdateRef.current(snapshot);
  }

  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate;
  }, [onProgressUpdate]);

  useEffect(() => {
    progressSnapshotRef.current = {
      currentTime,
      duration,
      isPlaying,
      hasStarted,
    };
  }, [currentTime, duration, hasStarted, isPlaying]);

  useEffect(() => {
    const safeInitialSeek = Math.max(0, Math.floor(Number(initialSeekSeconds) || 0));
    initialSeekSecondsRef.current = safeInitialSeek > 0 ? safeInitialSeek : null;
    if (safeInitialSeek <= 0 || initialSeekAppliedRef.current) return;

    initialSeekAppliedRef.current = true;
    setCurrentTime(safeInitialSeek);
  }, [initialSeekSeconds]);

  useEffect(() => {
    const interval = setInterval(emitProgressUpdate, 15000);
    return () => {
      clearInterval(interval);
      emitProgressUpdate();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockText(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen || !showControls) return;
    measureSegmentButton();
  }, [fullscreenOrientation, height, isFullscreen, showControls, width]);

  useEffect(() => {
    if (!isPlaying) return;
    if (scrubTime !== null) return;
    if (optionMenu) return;
    const timeout = setTimeout(() => setShowControls(false), 2600);
    return () => clearTimeout(timeout);
  }, [currentTime, isPlaying, optionMenu, scrubTime, showControls]);

  useEffect(() => {
    if (isScrubbingRef.current) return;
    Animated.timing(timelineProgress, {
      toValue: getTimelinePositionForTime(currentTime),
      duration: isPlaying ? 160 : 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentTime, duration, isPlaying, progressTrackWidth, timelineProgress]);

  useEffect(() => {
    Animated.timing(controlsProgress, {
      toValue: isFullscreen && showControls ? 1 : 0,
      duration: showControls ? CONTROLS_DISSOLVE_IN_MS : CONTROLS_DISSOLVE_OUT_MS,
      easing: showControls
        ? Easing.bezier(0.16, 1, 0.3, 1)
        : Easing.bezier(0.7, 0, 0.84, 0),
      useNativeDriver: true,
    }).start();
  }, [controlsProgress, isFullscreen, showControls]);

  useEffect(() => {
    if (!ready) return;
    if (isYouTube) {
      inject(`window.__ofqPlayer && window.__ofqPlayer.setPlaybackRate(${playbackRate})`);
      inject(`window.__ofqPlayer && window.__ofqPlayer.setPlaybackQuality("${quality}")`);
      return;
    }
    void videoRef.current?.setRateAsync(playbackRate, true);
  }, [isYouTube, playbackRate, quality, ready]);

  useEffect(() => {
    if (!isFullscreen || !ready) return;
    if (!pendingFullscreenPlay && pendingSeekSeconds === null) return;

    const target = pendingSeekSeconds;
    const shouldPlay = pendingFullscreenPlay;
    setPendingSeekSeconds(null);
    setPendingFullscreenPlay(false);

    void (async () => {
      if (target !== null) await seekTo(target, false);
      if (shouldPlay) await play();
    })();
  }, [isFullscreen, pendingFullscreenPlay, pendingSeekSeconds, ready]);

  function inject(command: string) {
    webViewRef.current?.injectJavaScript(`${command}; true;`);
  }

  function getOrientationLock(nextOrientation: FullscreenOrientation) {
    return nextOrientation === "landscape"
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
  }

  async function lockFullscreenOrientation(nextOrientation: FullscreenOrientation) {
    setFullscreenOrientation(nextOrientation);
    await ScreenOrientation.lockAsync(getOrientationLock(nextOrientation)).catch(() => undefined);
  }

  async function play() {
    if (!isFullscreen) {
      const initialTarget = initialSeekSecondsRef.current;
      initialSeekSecondsRef.current = null;
      openFullscreen({ autoPlay: true, seekToSeconds: initialTarget });
      return;
    }
    setHasStarted(true);
    setShowControls(true);
    if (isYouTube) {
      const pendingTarget = pendingSeekRef.current?.target;
      if (pendingTarget !== undefined) {
        requestYouTubePlayerSeek(pendingTarget);
      }
      inject("window.__ofqPlayer && window.__ofqPlayer.play()");
      setIsPlaying(true);
      return;
    }
    await videoRef.current?.playAsync();
  }

  function openFullscreen({
    autoPlay = true,
    seekToSeconds = null,
  }: {
    autoPlay?: boolean;
    seekToSeconds?: number | null;
  } = {}) {
    closeSegmentPanel();
    setShowControls(true);
    void lockFullscreenOrientation("portrait");
    setIsFullscreen(true);
    setReady(false);
    setIsPlaying(false);
    setPendingFullscreenPlay(autoPlay);
    setPendingSeekSeconds(seekToSeconds);
  }

  async function closeFullscreen() {
    closeFloatingControlPanels();
    await pause();
    closeSegmentPanel();
    setShowControls(true);
    await lockFullscreenOrientation("portrait");
    setIsFullscreen(false);
  }

  async function pause() {
    setShowControls(true);
    if (isYouTube) {
      inject("window.__ofqPlayer && window.__ofqPlayer.pause()");
      setIsPlaying(false);
      return;
    }
    await videoRef.current?.pauseAsync();
  }

  function togglePlayback() {
    if (isPlaying) void pause();
    else void play();
  }

  function closeOptionMenu() {
    if (!optionMenu) return;
    setOptionMenuOpen(false);
    Animated.timing(optionMenuProgress, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setOptionMenu(null);
    });
  }

  function openOptionMenu(nextMenu: ControlOptionMenu) {
    setShowControls(true);
    closeSegmentPanel();
    if (optionMenu === nextMenu && optionMenuOpen) {
      closeOptionMenu();
      return;
    }
    setOptionMenu(nextMenu);
    setOptionMenuOpen(true);
    optionMenuProgress.setValue(0);
    Animated.timing(optionMenuProgress, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function closeFloatingControlPanels() {
    closeOptionMenu();
  }

  function clampTime(seconds: number) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    return Math.min(duration > 0 ? duration : safeSeconds, safeSeconds);
  }

  function commitTimelinePosition(target: number) {
    const safeTarget = clampTime(target);
    timelineProgress.stopAnimation();
    timelineProgress.setValue(getTimelinePositionForTime(safeTarget));
    setCurrentTime(safeTarget);
    return safeTarget;
  }

  function markPendingSeek(target: number) {
    pendingSeekRef.current = {
      target: clampTime(target),
      requestedAt: Date.now(),
    };
  }

  function requestYouTubePlayerSeek(target: number) {
    inject(`window.__ofqPlayer && window.__ofqPlayer.seekTo(${target})`);
  }

  function retryPendingSeek(pendingSeek: PendingSeek) {
    const now = Date.now();
    if (now - pendingSeek.requestedAt < SEEK_RETRY_MS) return;
    pendingSeek.requestedAt = now;
    if (isYouTube) {
      requestYouTubePlayerSeek(pendingSeek.target);
      return;
    }
    void videoRef.current?.setPositionAsync(pendingSeek.target * 1000);
  }

  function shouldApplyIncomingPlaybackTime(nextTime: number) {
    if (isScrubbingRef.current) return false;
    const pendingSeek = pendingSeekRef.current;
    if (!pendingSeek) return true;

    const seekDelta = nextTime - pendingSeek.target;
    const hasConfirmedSeek =
      Math.abs(seekDelta) <= SEEK_CONFIRM_TOLERANCE_SECONDS ||
      (isPlaying && seekDelta >= 0 && seekDelta <= SEEK_CONFIRM_PLAYING_TOLERANCE_SECONDS);
    if (hasConfirmedSeek) {
      pendingSeekRef.current = null;
      return true;
    }

    retryPendingSeek(pendingSeek);
    return false;
  }

  function updateDuration(nextDuration: number) {
    const safeDuration = Math.max(0, Number(nextDuration) || 0);
    setDuration((current) => (Math.abs(current - safeDuration) < 0.05 ? current : safeDuration));
  }

  async function seekTo(seconds: number, autoPlay = false) {
    initialSeekSecondsRef.current = null;
    if (autoPlay && !isFullscreen) {
      openFullscreen({ autoPlay: true, seekToSeconds: seconds });
      return;
    }
    const target = commitTimelinePosition(seconds);
    markPendingSeek(target);
    setShowControls(true);
    if (isYouTube) {
      if (isFullscreen) setHasStarted(true);
      requestYouTubePlayerSeek(target);
      if (autoPlay) void play();
      return;
    }
    await videoRef.current?.setPositionAsync(target * 1000);
    if (autoPlay) void play();
  }

  function showSeekToast(value: "-10s" | "+10s") {
    setSeekToast(value);
    setTimeout(() => setSeekToast(null), 520);
  }

  function seekBy(delta: number) {
    showSeekToast(delta > 0 ? "+10s" : "-10s");
    void seekTo(currentTime + delta, isPlaying);
  }

  function handleSurfacePress(event: GestureResponderEvent) {
    if (!isFullscreen) {
      openFullscreen({ autoPlay: true });
      return;
    }

    if (optionMenu) {
      closeFloatingControlPanels();
      return;
    }

    const x = event.nativeEvent.locationX;
    const surfaceWidth = isFullscreen ? width : playerWidth;
    const side = x >= surfaceWidth / 2 ? "right" : "left";
    const now = Date.now();
    const lastTap = lastTapRef.current;

    if (lastTap && lastTap.side === side && now - lastTap.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      seekBy(side === "right" ? 10 : -10);
      return;
    }

    lastTapRef.current = { time: now, side };
    setShowControls((value) => !value);
  }

  function rememberProgressTrackFrame(nextFrame: MeasuredRect) {
    progressTrackFrameRef.current = nextFrame;
    setProgressTrackWidth((current) => (Math.abs(current - nextFrame.width) < 0.5 ? current : nextFrame.width));
  }

  function measureProgressTrack() {
    requestAnimationFrame(() => {
      progressTrackRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        if (measuredWidth <= 1 || measuredHeight <= 0) return;
        rememberProgressTrackFrame({
          x,
          y,
          width: measuredWidth,
          height: measuredHeight,
        });
      });
    });
  }

  function handleProgressTrackLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.max(1, event.nativeEvent.layout.width);
    setProgressTrackWidth((current) => (Math.abs(current - nextWidth) < 0.5 ? current : nextWidth));
    measureProgressTrack();
  }

  function getProgressTargetTime(event: GestureResponderEvent) {
    const trackFrame = progressTrackFrameRef.current;
    const trackWidth = trackFrame?.width && trackFrame.width > 1 ? trackFrame.width : progressTrackWidth;
    if (duration <= 0 || trackWidth <= 1) return currentTime;
    const pageX = Number(event.nativeEvent.pageX);
    const localX = trackFrame && Number.isFinite(pageX) ? pageX - trackFrame.x : event.nativeEvent.locationX;
    const ratio = Math.min(1, Math.max(0, localX / trackWidth));
    return ratio * duration;
  }

  function getTimelinePositionForTime(seconds: number) {
    if (duration <= 0 || progressTrackWidth <= 1) return 0;
    const safeSeconds = Math.min(duration, Math.max(0, Number(seconds) || 0));
    return (safeSeconds / duration) * progressTrackWidth;
  }

  function updateScrubPreview(target: number, forceLabelUpdate = false) {
    const safeTarget = Math.min(duration, Math.max(0, Number(target) || 0));
    scrubTimeRef.current = safeTarget;
    timelineProgress.setValue(getTimelinePositionForTime(safeTarget));

    const now = Date.now();
    if (forceLabelUpdate || now - lastScrubLabelUpdateRef.current >= SCRUB_LABEL_UPDATE_MS) {
      lastScrubLabelUpdateRef.current = now;
      setScrubTime(safeTarget);
    }
  }

  function beginProgressScrub(event: GestureResponderEvent) {
    if (duration <= 0) return;
    measureProgressTrack();
    const target = getProgressTargetTime(event);
    isScrubbingRef.current = true;
    pendingSeekRef.current = null;
    timelineProgress.stopAnimation();
    if (isYouTube && isFullscreen) setHasStarted(true);
    updateScrubPreview(target, true);
    setShowControls(true);
  }

  function moveProgressScrub(event: GestureResponderEvent) {
    if (duration <= 0 || !isScrubbingRef.current) return;
    const target = getProgressTargetTime(event);
    updateScrubPreview(target);
  }

  function finishProgressScrub(event?: GestureResponderEvent) {
    if (duration <= 0) {
      isScrubbingRef.current = false;
      scrubTimeRef.current = null;
      setScrubTime(null);
      return;
    }
    const target = scrubTimeRef.current ?? (event ? getProgressTargetTime(event) : null);
    isScrubbingRef.current = false;
    scrubTimeRef.current = null;
    setScrubTime(null);
    if (target === null || target === undefined) return;
    commitTimelinePosition(target);
    setShowControls(true);
    void seekTo(target, isPlaying);
  }

  function toggleFullscreenOrientation() {
    const nextOrientation = fullscreenOrientation === "landscape" ? "portrait" : "landscape";
    closeFloatingControlPanels();
    setShowControls(true);
    void lockFullscreenOrientation(nextOrientation);
  }

  function rememberSegmentButtonFrame(nextFrame: MeasuredRect) {
    setSegmentButtonFrame((current) => {
      if (
        current &&
        Math.abs(current.x - nextFrame.x) < 0.5 &&
        Math.abs(current.y - nextFrame.y) < 0.5 &&
        Math.abs(current.width - nextFrame.width) < 0.5 &&
        Math.abs(current.height - nextFrame.height) < 0.5
      ) {
        return current;
      }
      return nextFrame;
    });
  }

  function measureSegmentButton() {
    requestAnimationFrame(() => {
      segmentButtonRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        if (measuredWidth <= 0 || measuredHeight <= 0) return;
        rememberSegmentButtonFrame({
          x,
          y,
          width: measuredWidth,
          height: measuredHeight,
        });
      });
    });
  }

  function handleSegmentPanelLayout(event: LayoutChangeEvent) {
    const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
    if (measuredWidth <= 0 || measuredHeight <= 0) return;
    setSegmentPanelSize((current) => {
      if (
        current &&
        Math.abs(current.width - measuredWidth) < 0.5 &&
        Math.abs(current.height - measuredHeight) < 0.5
      ) {
        return current;
      }
      return { width: measuredWidth, height: measuredHeight };
    });
  }

  function openSegmentPanel() {
    if (normalizedSegments.length === 0) return;
    closeFloatingControlPanels();
    measureSegmentButton();
    segmentPanelProgress.stopAnimation();
    segmentPanelProgress.setValue(0);
    setSegmentPanelVisible(true);
    setSegmentPanelOpen(true);
    Animated.timing(segmentPanelProgress, {
      toValue: 1,
      duration: 320,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }

  function closeSegmentPanel() {
    setSegmentPanelOpen(false);
    measureSegmentButton();
    segmentPanelProgress.stopAnimation();
    Animated.timing(segmentPanelProgress, {
      toValue: 0,
      duration: 240,
      easing: Easing.bezier(0.7, 0, 0.84, 0),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSegmentPanelVisible(false);
    });
  }

  function selectPlaybackRate(nextRate: number) {
    setPlaybackRate(nextRate);
    setShowControls(true);
    closeOptionMenu();
  }

  function selectQuality(nextQuality: string) {
    setQuality(nextQuality);
    setShowControls(true);
    closeOptionMenu();
  }

  function handleWebMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        type: string;
        currentTime?: number;
        duration?: number;
        quality?: string;
        qualityLevels?: string[];
        playbackRate?: number;
        playbackRates?: number[];
        message?: string;
      };
      if (payload.type === "ready") {
        setReady(true);
        updateDuration(Number(payload.duration) || 0);
        if (Array.isArray(payload.qualityLevels) && payload.qualityLevels.length > 0) {
          setQualityLevels(Array.from(new Set([...payload.qualityLevels, "auto"])));
        }
        if (Array.isArray(payload.playbackRates) && payload.playbackRates.length > 0) {
          setPlaybackRates(payload.playbackRates.filter((value) => Number.isFinite(value) && value > 0));
        }
        if (typeof payload.quality === "string" && payload.quality) {
          setQuality((current) => current || payload.quality || "auto");
        }
        if (Number.isFinite(payload.playbackRate)) {
          setPlaybackRate(Number(payload.playbackRate) || 1);
        }
        return;
      }
      if (payload.type === "time") {
        const nextTime = Number(payload.currentTime) || 0;
        if (shouldApplyIncomingPlaybackTime(nextTime)) {
          setCurrentTime(nextTime);
        }
        updateDuration(Number(payload.duration) || duration);
        return;
      }
      if (payload.type === "playing") {
        setReady(true);
        setHasStarted(true);
        setIsPlaying(true);
        return;
      }
      if (payload.type === "paused" || payload.type === "ended") {
        setIsPlaying(false);
        return;
      }
      if (payload.type === "error") {
        setError(payload.message ?? "تعذر تشغيل الفيديو حاليًا");
      }
    } catch {
      // Ignore malformed WebView messages.
    }
  }

  function handleUploadStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) {
      if ("error" in status && status.error) setError("تعذر تشغيل الفيديو حاليًا");
      return;
    }
    setReady(true);
    setIsPlaying(status.isPlaying);
    updateDuration((status.durationMillis ?? 0) / 1000);
    const nextTime = status.positionMillis / 1000;
    if (shouldApplyIncomingPlaybackTime(nextTime)) {
      setCurrentTime(nextTime);
    }
    if (status.isPlaying) setHasStarted(true);
  }

  function renderOptionMenu(menu: ControlOptionMenu) {
    if (optionMenu !== menu) return null;

    const isQualityMenu = menu === "quality";
    const options = isQualityMenu
      ? displayQualityLevels.map((value) => ({
          key: value,
          label: labelQuality(value),
          active: value === quality,
          onPress: () => selectQuality(value),
        }))
      : displayPlaybackRates.map((value) => ({
          key: String(value),
          label: formatRate(value),
          active: Math.abs(value - playbackRate) < 0.01,
          onPress: () => selectPlaybackRate(value),
        }));

    return (
      <Animated.View
        pointerEvents={optionMenuOpen ? "auto" : "none"}
        style={[
          styles.optionMenuPanel,
          isPortraitFullscreen ? styles.optionMenuPanelPortrait : null,
          isLandscapeFullscreen ? styles.optionMenuPanelLandscape : null,
          optionMenuAnimatedStyle,
        ]}
      >
        <Text style={styles.optionMenuTitle}>{isQualityMenu ? "الجودة" : "السرعة"}</Text>
        <ScrollView
          style={[styles.optionMenuList, isLandscapeFullscreen ? styles.optionMenuListLandscape : null]}
          showsVerticalScrollIndicator={false}
        >
          {options.map((item) => (
            <Pressable
              key={item.key}
              style={[styles.optionMenuItem, item.active ? styles.optionMenuItemActive : null]}
              onPress={item.onPress}
            >
              <Text style={[styles.optionMenuItemText, item.active ? styles.optionMenuItemTextActive : null]}>{item.label}</Text>
              {item.active ? <Feather name="check" size={13} color="#fff" /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      <PlayerHost fullscreen={isFullscreen} onRequestClose={closeFullscreen}>
      <View
        style={[
          styles.playerShell,
          isFullscreen ? styles.fullscreenPlayerShell : null,
          isFullscreen ? { width, height } : { width: playerWidth, height: playerHeight },
        ]}
      >
        <View
          style={[
            styles.mediaLayer,
            {
              width: mediaWidth,
              height: mediaHeight,
              marginLeft: -mediaWidth / 2,
              marginTop: -mediaHeight / 2,
            },
          ]}
        >
        {isYouTube ? (
          youTubeId && isFullscreen ? (
            <WebView
              ref={webViewRef}
              source={{ html: webHtml, baseUrl: "https://www.youtube-nocookie.com" }}
              originWhitelist={["*"]}
              pointerEvents="none"
              javaScriptEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={false}
              scrollEnabled={false}
              bounces={false}
              onMessage={handleWebMessage}
              style={styles.webView}
            />
          ) : youTubeId ? (
            <View style={styles.cleanVideoSurface} />
          ) : (
            <View style={styles.videoFallback}><Text style={styles.videoFallbackText}>رابط الفيديو غير صالح</Text></View>
          )
        ) : resolvedVideoUrl ? (
          <Video
            ref={videoRef}
            source={{ uri: resolvedVideoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls={false}
            isLooping={false}
            posterSource={resolvedPosterUrl ? { uri: resolvedPosterUrl } : undefined}
            usePoster={Boolean(resolvedPosterUrl)}
            onPlaybackStatusUpdate={handleUploadStatus}
          />
        ) : (
          <View style={styles.videoFallback}><Text style={styles.videoFallbackText}>رابط الفيديو غير صالح</Text></View>
        )}

        {shouldShowCleanYouTubeCover ? (
          <View pointerEvents="none" style={styles.posterOverlay}>
            {resolvedPosterUrl ? (
              <>
                <Image source={{ uri: resolvedPosterUrl }} style={styles.posterImage} contentFit="cover" />
                {isFullscreen ? <View style={styles.posterScrim} /> : null}
              </>
            ) : (
              <View style={styles.cleanVideoPlaceholder}>
                <View style={styles.cleanVideoAccent} />
                <Text style={styles.cleanVideoTitle} numberOfLines={2}>{toEnglishDigits(title)}</Text>
                {subtitle ? <Text style={styles.cleanVideoSubtitle} numberOfLines={1}>{toEnglishDigits(subtitle)}</Text> : null}
              </View>
            )}
          </View>
        ) : shouldShowPosterOverlay && resolvedPosterUrl ? (
          <View pointerEvents="none" style={styles.posterOverlay}>
            <Image source={{ uri: resolvedPosterUrl }} style={styles.posterImage} contentFit="cover" />
            {isFullscreen ? <View style={styles.posterScrim} /> : null}
          </View>
        ) : null}

        {isFullscreen ? (
          <>
            <View pointerEvents="none" style={styles.brandGuardTop} />
            <View pointerEvents="none" style={styles.brandGuardBottom} />
            <View pointerEvents="none" style={styles.brandGuardLeft} />
            <View pointerEvents="none" style={styles.brandGuardRight} />
          </>
        ) : null}

        {watermarkLabel && isFullscreen ? (
          <View
            pointerEvents="none"
            style={[
              styles.watermark,
              isFullscreen ? styles.watermarkFullscreen : null,
              portraitVideoWatermarkStyle,
            ]}
          >
            <Text style={styles.watermarkText} numberOfLines={1}>{toEnglishDigits(watermarkLabel)}</Text>
          </View>
        ) : null}
        </View>

        <Pressable style={StyleSheet.absoluteFill} onPress={handleSurfacePress} />

        {seekToast ? (
          <View pointerEvents="none" style={styles.seekToast}>
            <Text style={styles.seekToastText}>{seekToast}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorOverlay}>
            <Feather name="alert-triangle" size={24} color="#FDE68A" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isFullscreen ? (
          <Animated.View
            pointerEvents={showControls ? "auto" : "none"}
            style={[styles.fullscreenCloseButtonLayer, closeButtonAnimatedStyle]}
          >
            <AnimatedPressable style={styles.fullscreenCloseButton} onPress={closeFullscreen} pressedScale={0.9}>
              <Feather name="x" size={24} color="#fff" />
            </AnimatedPressable>
          </Animated.View>
        ) : null}

        {isFullscreen ? (
          <Animated.View
            pointerEvents={showControls ? "auto" : "none"}
            style={[
              styles.controls,
              isCompactControls ? styles.controlsCompact : null,
              isPortraitFullscreen ? styles.controlsPortrait : null,
              isLandscapeFullscreen ? [styles.controlsLandscape, { left: landscapeControlInset, right: landscapeControlInset }] : null,
              controlsAnimatedStyle,
            ]}
          >
            <BlurView
              pointerEvents="none"
              intensity={44}
              tint="dark"
              style={[
                styles.controlsSurface,
                isCompactControls ? styles.controlsSurfaceCompact : null,
                isPortraitFullscreen ? styles.controlsSurfacePortrait : null,
                isLandscapeFullscreen ? styles.controlsSurfaceLandscape : null,
              ]}
            />
            <View
              style={[
                styles.controlsContent,
                isPortraitFullscreen ? styles.controlsContentPortrait : null,
                isLandscapeFullscreen ? styles.controlsContentLandscape : null,
              ]}
            >
            <View
              style={[
                styles.controlsTopRow,
                isCompactControls ? styles.controlsTopRowCompact : null,
                isPortraitFullscreen ? styles.controlsTopRowPortrait : null,
                isLandscapeFullscreen ? styles.controlsTopRowLandscape : null,
              ]}
            >
              {optionMenu ? (
                <Pressable
                  pointerEvents={optionMenuOpen ? "auto" : "none"}
                  style={styles.optionMenuBackdrop}
                  onPress={closeOptionMenu}
                />
              ) : null}

              <View
                ref={segmentButtonRef}
                collapsable={false}
                style={[
                  styles.segmentButtonAnchor,
                  styles.topRightControl,
                  isPortraitFullscreen ? styles.topSideControlPortrait : null,
                  isLandscapeFullscreen ? styles.topSideControlLandscape : null,
                ]}
                onLayout={measureSegmentButton}
              >
                <AnimatedPressable
                  style={[
                    styles.controlIcon,
                    isPortraitFullscreen ? styles.controlIconPortrait : null,
                    isLandscapeFullscreen ? styles.controlIconLandscape : null,
                  ]}
                  onPress={openSegmentPanel}
                  disabled={normalizedSegments.length === 0}
                >
                  <Feather name="list" size={22} color={normalizedSegments.length > 0 ? "#fff" : "rgba(255,255,255,0.35)"} />
                </AnimatedPressable>
              </View>

              <View
                style={[
                  styles.transportRow,
                  isPortraitFullscreen ? styles.transportRowPortrait : null,
                  isLandscapeFullscreen ? styles.transportRowLandscape : null,
                ]}
              >
                <AnimatedPressable
                  style={[
                    styles.seekTenButton,
                    isPortraitFullscreen ? styles.seekTenButtonPortrait : null,
                    isLandscapeFullscreen ? styles.seekTenButtonLandscape : null,
                  ]}
                  onPress={() => seekBy(10)}
                  pressedScale={0.88}
                >
                  <Feather name="rotate-cw" size={isLandscapeFullscreen ? 22 : isPortraitFullscreen ? 23 : 26} color="#E5E7EB" />
                  <Text style={styles.seekTenText}>10</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[
                    styles.playButton,
                    isPortraitFullscreen ? styles.playButtonPortrait : null,
                    isLandscapeFullscreen ? styles.playButtonLandscape : null,
                  ]}
                  onPress={togglePlayback}
                  disabled={!ready && isYouTube}
                  pressedScale={0.9}
                >
                  <Feather name={isPlaying ? "pause" : "play"} size={isLandscapeFullscreen ? 25 : isPortraitFullscreen ? 27 : 30} color="#0F172A" />
                </AnimatedPressable>
                <AnimatedPressable
                  style={[
                    styles.seekTenButton,
                    isPortraitFullscreen ? styles.seekTenButtonPortrait : null,
                    isLandscapeFullscreen ? styles.seekTenButtonLandscape : null,
                  ]}
                  onPress={() => seekBy(-10)}
                  pressedScale={0.88}
                >
                  <Feather name="rotate-ccw" size={isLandscapeFullscreen ? 22 : isPortraitFullscreen ? 23 : 26} color="#E5E7EB" />
                  <Text style={styles.seekTenText}>10</Text>
                </AnimatedPressable>
              </View>

              <AnimatedPressable
                style={[
                  styles.controlIcon,
                  isPortraitFullscreen ? styles.controlIconPortrait : null,
                  isLandscapeFullscreen ? styles.controlIconLandscape : null,
                  styles.topLeftControl,
                  isPortraitFullscreen ? styles.topSideControlPortrait : null,
                  isLandscapeFullscreen ? styles.topSideControlLandscape : null,
                ]}
                onPress={toggleFullscreenOrientation}
                accessibilityRole="button"
                accessibilityLabel={fullscreenOrientation === "landscape" ? "الرجوع للفول سكرين بالطول" : "الفول سكرين بالعرض"}
              >
                <Feather
                  name={fullscreenOrientation === "landscape" ? "minimize-2" : "maximize-2"}
                  size={isLandscapeFullscreen ? 18 : isPortraitFullscreen ? 19 : 20}
                  color="#fff"
                />
              </AnimatedPressable>
            </View>

            <View
              style={[
                styles.controlsBottomRow,
                isCompactControls ? styles.controlsBottomRowCompact : null,
                isPortraitFullscreen ? styles.controlsBottomRowPortrait : null,
                isLandscapeFullscreen ? styles.controlsBottomRowLandscape : null,
              ]}
            >
              <View
                style={[
                  styles.timelineGroup,
                  isPortraitFullscreen ? styles.timelineGroupPortrait : null,
                  isLandscapeFullscreen ? styles.timelineGroupLandscape : null,
                ]}
              >
                <View
                  style={[
                    styles.timeRow,
                    isPortraitFullscreen ? styles.timeRowPortrait : null,
                    isLandscapeFullscreen ? styles.timeRowLandscape : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.timeText,
                      isPortraitFullscreen ? styles.timeTextPortrait : null,
                      isLandscapeFullscreen ? styles.timeTextLandscape : null,
                    ]}
                  >
                    {formatTime(displayedTime)}
                  </Text>
                  <Text
                    style={[
                      styles.timeText,
                      isPortraitFullscreen ? styles.timeTextPortrait : null,
                      isLandscapeFullscreen ? styles.timeTextLandscape : null,
                    ]}
                  >
                    {formatTime(duration)}
                  </Text>
                </View>
                <View
                  ref={progressTrackRef}
                  collapsable={false}
                  style={[
                    styles.progressTrack,
                    isPortraitFullscreen ? styles.progressTrackPortrait : null,
                    isLandscapeFullscreen ? styles.progressTrackLandscape : null,
                  ]}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel="شريط تقدم الفيديو"
                  accessibilityValue={{
                    min: 0,
                    max: Math.max(1, Math.round(duration)),
                    now: Math.round(Math.min(duration || displayedTime, displayedTime)),
                    text: `${formatTime(displayedTime)} / ${formatTime(duration)}`,
                  }}
                  accessibilityActions={[
                    { name: "decrement", label: "رجوع 10 ثوانٍ" },
                    { name: "increment", label: "تقديم 10 ثوانٍ" },
                  ]}
                  onAccessibilityAction={(event) => {
                    if (duration <= 0) return;
                    if (event.nativeEvent.actionName === "increment") {
                      void seekTo(currentTime + 10, isPlaying);
                    }
                    if (event.nativeEvent.actionName === "decrement") {
                      void seekTo(currentTime - 10, isPlaying);
                    }
                  }}
                  onLayout={handleProgressTrackLayout}
                  onStartShouldSetResponder={() => true}
                  onStartShouldSetResponderCapture={() => true}
                  onMoveShouldSetResponder={() => true}
                  onMoveShouldSetResponderCapture={() => true}
                  onResponderGrant={beginProgressScrub}
                  onResponderMove={moveProgressScrub}
                  onResponderRelease={finishProgressScrub}
                  onResponderTerminate={() => finishProgressScrub()}
                  onResponderTerminationRequest={() => false}
                >
                  <View
                    pointerEvents="none"
                    style={[
                      styles.progressBaseLine,
                      isPortraitFullscreen ? styles.progressBaseLinePortrait : null,
                      isLandscapeFullscreen ? styles.progressBaseLineLandscape : null,
                    ]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.progressFill,
                      isPortraitFullscreen ? styles.progressFillPortrait : null,
                      isLandscapeFullscreen ? styles.progressFillLandscape : null,
                      { width: timelineProgress },
                    ]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.progressKnob,
                      isPortraitFullscreen ? styles.progressKnobPortrait : null,
                      isLandscapeFullscreen ? styles.progressKnobLandscape : null,
                      { transform: [{ translateX: timelineProgress }] },
                    ]}
                  />
                </View>
              </View>

              {optionMenu ? (
                <Pressable
                  pointerEvents={optionMenuOpen ? "auto" : "none"}
                  style={styles.optionMenuBackdrop}
                  onPress={closeOptionMenu}
                />
              ) : null}

              <View
                pointerEvents={optionMenu ? "box-none" : "auto"}
                style={[
                  styles.bottomControlsRow,
                  isPortraitFullscreen ? styles.bottomControlsRowPortrait : null,
                  isLandscapeFullscreen ? styles.bottomControlsRowLandscape : null,
                ]}
              >
                <View style={[styles.controlChipAnchor, optionMenu === "quality" ? styles.controlChipAnchorActive : null]}>
                  {renderOptionMenu("quality")}
                  <AnimatedPressable
                    style={[
                      styles.optionChip,
                      isPortraitFullscreen ? styles.mediaChipPortrait : null,
                      isLandscapeFullscreen ? styles.mediaChipLandscape : null,
                      optionMenu === "quality" && optionMenuOpen ? styles.mediaChipActive : null,
                    ]}
                    onPress={() => openOptionMenu("quality")}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isPortraitFullscreen ? styles.mediaChipTextPortrait : null,
                        isLandscapeFullscreen ? styles.mediaChipTextLandscape : null,
                      ]}
                    >
                      {labelQuality(quality)}
                    </Text>
                    <Feather name="chevron-up" size={isLandscapeFullscreen ? 13 : 14} color="rgba(255,255,255,0.82)" />
                  </AnimatedPressable>
                </View>

                <View style={[styles.controlChipAnchor, optionMenu === "speed" ? styles.controlChipAnchorActive : null]}>
                  {renderOptionMenu("speed")}
                  <AnimatedPressable
                    style={[
                      styles.optionChip,
                      isPortraitFullscreen ? styles.mediaChipPortrait : null,
                      isLandscapeFullscreen ? styles.mediaChipLandscape : null,
                      optionMenu === "speed" && optionMenuOpen ? styles.mediaChipActive : null,
                    ]}
                    onPress={() => openOptionMenu("speed")}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isPortraitFullscreen ? styles.mediaChipTextPortrait : null,
                        isLandscapeFullscreen ? styles.mediaChipTextLandscape : null,
                      ]}
                    >
                      {formatRate(playbackRate)}
                    </Text>
                    <Feather name="chevron-up" size={isLandscapeFullscreen ? 13 : 14} color="rgba(255,255,255,0.82)" />
                  </AnimatedPressable>
                </View>
              </View>
            </View>
            </View>
          </Animated.View>
        ) : null}

        {segmentPanelVisible ? (
          <>
            <Pressable
              pointerEvents={segmentPanelOpen ? "auto" : "none"}
              style={styles.segmentPanelBackdrop}
              onPress={closeSegmentPanel}
            />
            <Animated.View
              pointerEvents={segmentPanelOpen ? "auto" : "none"}
              style={[
                styles.segmentPanel,
                isPortraitFullscreen ? styles.segmentPanelPortrait : null,
                isLandscapeFullscreen
                  ? [
                      styles.segmentPanelLandscape,
                      {
                        left: width - landscapeControlInset - landscapeSegmentPanelWidth,
                        bottom: 12,
                        width: landscapeSegmentPanelWidth,
                      },
                    ]
                  : null,
                segmentPanelAnimatedStyle,
              ]}
              onLayout={handleSegmentPanelLayout}
            >
              <BlurView pointerEvents="none" intensity={44} tint="dark" style={styles.segmentPanelSurface} />
              <Animated.View style={[styles.segmentPanelContent, segmentPanelContentAnimatedStyle]}>
                <View style={styles.segmentPanelHeader}>
                  <AnimatedPressable style={styles.segmentClose} onPress={closeSegmentPanel} pressedScale={0.88}>
                    <Feather name="x" size={16} color="#fff" />
                  </AnimatedPressable>
                  <Text style={styles.segmentPanelTitle}>تقسيمات الدرس</Text>
                </View>
                <ScrollView
                  style={styles.segmentPanelList}
                  contentContainerStyle={styles.segmentPanelListContent}
                  showsVerticalScrollIndicator={false}
                >
                  {normalizedSegments.map((segment) => (
                    <AnimatedPressable
                      key={`panel-${segment.id}-${segment.startSeconds}`}
                      style={styles.segmentRow}
                      onPress={() => {
                        closeSegmentPanel();
                        void seekTo(segment.startSeconds, true);
                      }}
                      pressedScale={0.97}
                    >
                      <View style={styles.segmentRowIcon}>
                        <Feather name="play" size={15} color="#fff" />
                      </View>
                      <View style={styles.segmentRowBody}>
                        <Text style={styles.segmentRowTitle} numberOfLines={1}>{toEnglishDigits(segment.title)}</Text>
                        <Text style={styles.segmentRowMeta}>{segmentLabel(segment.segmentType)} · {formatTime(segment.startSeconds)}</Text>
                      </View>
                    </AnimatedPressable>
                  ))}
                </ScrollView>
              </Animated.View>
            </Animated.View>
          </>
        ) : null}
      </View>
      </PlayerHost>

      {normalizedSegments.length > 0 ? (
        <View style={styles.externalSegments}>
          <View style={styles.segmentHeader}>
            <Text style={[styles.segmentHeaderTitle, { color: colors.text }]}>تقسيمات الدرس</Text>
            <Text style={[styles.segmentHeaderMeta, { color: colors.textSecondary }]}>{toEnglishDigits(normalizedSegments.length)} عناصر</Text>
          </View>
          <View style={styles.segmentList}>
            {normalizedSegments.map((segment) => (
              <Pressable
                key={`${segment.id}-${segment.startSeconds}`}
                onPress={() => void seekTo(segment.startSeconds, true)}
                style={({ pressed }) => [styles.segmentChip, { width: playerWidth, opacity: pressed ? 0.72 : 1 }]}
              >
                {segment.thumbnailUrl ? (
                  <Image source={{ uri: segment.thumbnailUrl }} style={styles.segmentThumb} contentFit="cover" />
                ) : (
                  <View style={styles.segmentThumbFallback}>
                    <Feather name="play" size={15} color="#fff" />
                  </View>
                )}
                <View style={styles.segmentChipText}>
                  <Text style={styles.segmentChipTitle} numberOfLines={1}>{toEnglishDigits(segment.title)}</Text>
                  <Text style={styles.segmentChipMeta}>{segmentLabel(segment.segmentType)} · {formatTime(segment.startSeconds)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    alignItems: "center",
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  externalSegments: {
    width: "100%",
    gap: 9,
  },
  segmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    direction: "rtl",
  },
  segmentHeaderTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#0F172A",
  },
  segmentHeaderMeta: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: "#64748B",
  },
  segmentRail: {
    gap: 10,
    paddingVertical: 2,
  },
  segmentList: {
    width: "100%",
    gap: 10,
    alignItems: "center",
  },
  segmentChip: {
    width: 188,
    minHeight: 78,
    borderRadius: 18,
    padding: 10,
    backgroundColor: "rgba(15,23,42,0.86)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 11,
    direction: "rtl",
  },
  segmentThumb: {
    width: 68,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#111827",
  },
  segmentThumbFallback: {
    width: 68,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(37,99,235,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentChipText: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "64%",
    alignItems: "flex-end",
    direction: "rtl",
  },
  segmentChipTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
    textAlign: "right",
    writingDirection: "rtl",
  },
  segmentChipMeta: {
    marginTop: 2,
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.68)",
    textAlign: "right",
    writingDirection: "rtl",
  },
  playerShell: {
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: "#030712",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  fullscreenPlayerShell: {
    borderRadius: 0,
    borderWidth: 0,
  },
  mediaLayer: {
    position: "absolute",
    left: "50%",
    top: "50%",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  webView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  videoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  videoFallbackText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
  cleanVideoSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B1120",
  },
  cleanVideoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#0B1120",
  },
  cleanVideoAccent: {
    width: 54,
    height: 4,
    marginBottom: 13,
    borderRadius: 999,
    backgroundColor: "rgba(37,99,235,0.95)",
  },
  cleanVideoTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    lineHeight: 27,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    writingDirection: "rtl",
  },
  cleanVideoSubtitle: {
    marginTop: 4,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: "rgba(226,232,240,0.7)",
    textAlign: "center",
    writingDirection: "rtl",
  },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  posterScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  brandGuardTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 26,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  brandGuardBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  brandGuardLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 18,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  brandGuardRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 18,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  watermark: {
    position: "absolute",
    top: 42,
    left: 12,
    maxWidth: "72%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(2,6,23,0.48)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  watermarkFullscreen: {
    top: 64,
    left: 16,
  },
  watermarkText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "rgba(255,255,255,0.88)",
  },
  seekToast: {
    position: "absolute",
    alignSelf: "center",
    top: "43%",
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  seekToastText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  errorText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
    textAlign: "center",
  },
  previewCleanLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,6,23,0.42)",
  },
  fullscreenCloseButtonLayer: {
    position: "absolute",
    top: 64,
    right: 18,
    zIndex: 30,
  },
  fullscreenCloseButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(10,13,18,0.72)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  controls: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    minHeight: 118,
    borderRadius: 34,
    overflow: "visible",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    zIndex: 24,
  },
  controlsSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(10,13,18,0.9)",
  },
  controlsSurfacePortrait: {
    borderRadius: 28,
  },
  controlsSurfaceLandscape: {
    borderRadius: 26,
  },
  controlsSurfaceCompact: {
    borderRadius: 26,
  },
  controlsContent: {
    gap: 10,
    zIndex: 2,
  },
  controlsContentPortrait: {
    gap: 5,
  },
  controlsContentLandscape: {
    gap: 3,
  },
  controlsPortrait: {
    left: 18,
    right: 18,
    bottom: 16,
    minHeight: 0,
    borderRadius: 28,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  controlsLandscape: {
    bottom: 12,
    minHeight: 0,
    borderRadius: 26,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  controlsCompact: {
    left: 10,
    right: 10,
    borderRadius: 26,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  controlsTopRow: {
    minHeight: 68,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsTopRowPortrait: {
    minHeight: 54,
  },
  controlsTopRowLandscape: {
    minHeight: 40,
  },
  controlsTopRowCompact: {
    justifyContent: "center",
    rowGap: 9,
  },
  controlLessonInfo: {
    minWidth: 176,
    maxWidth: 250,
    flexShrink: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  controlThumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  controlThumbFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.85)",
  },
  controlLessonText: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  controlLessonTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
    textAlign: "right",
    writingDirection: "rtl",
  },
  controlLessonSubtitle: {
    marginTop: -2,
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.62)",
    textAlign: "right",
    writingDirection: "rtl",
  },
  transportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexShrink: 0,
  },
  transportRowPortrait: {
    gap: 11,
  },
  transportRowLandscape: {
    gap: 9,
  },
  controlIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  controlIconPortrait: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  controlIconLandscape: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  segmentButtonAnchor: {
    position: "absolute",
  },
  controlsActions: {
    minWidth: 144,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  topRightControl: {
    position: "absolute",
    right: 0,
    top: 10,
  },
  topLeftControl: {
    position: "absolute",
    left: 0,
    top: 10,
  },
  topSideControlPortrait: {
    top: 7,
  },
  topSideControlLandscape: {
    top: 2,
  },
  seekTenButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  seekTenButtonPortrait: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  seekTenButtonLandscape: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  seekTenText: {
    position: "absolute",
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "#fff",
    includeFontPadding: false,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  playButtonPortrait: {
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  playButtonLandscape: {
    width: 48,
    height: 48,
    borderRadius: 24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  controlsBottomRow: {
    position: "relative",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  controlsBottomRowPortrait: {
    gap: 6,
  },
  controlsBottomRowLandscape: {
    gap: 4,
  },
  controlsBottomRowCompact: {
    justifyContent: "center",
  },
  timelineGroup: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    direction: "ltr",
  },
  timelineGroupPortrait: {
    gap: 5,
  },
  timelineGroupLandscape: {
    gap: 3,
  },
  timeRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    direction: "ltr",
  },
  timeRowPortrait: {
    minHeight: 16,
  },
  timeRowLandscape: {
    minHeight: 14,
  },
  timeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.84)",
    textAlign: "left",
    includeFontPadding: false,
  },
  timeTextPortrait: {
    fontSize: 11,
  },
  timeTextLandscape: {
    fontSize: 10,
  },
  progressTrack: {
    width: "100%",
    height: 34,
    borderRadius: 999,
    justifyContent: "center",
    overflow: "visible",
    direction: "ltr",
  },
  progressTrackPortrait: {
    height: 28,
  },
  progressTrackLandscape: {
    height: 22,
  },
  progressBaseLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 15,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.46)",
  },
  progressBaseLinePortrait: {
    top: 12,
    height: 3,
  },
  progressBaseLineLandscape: {
    top: 9,
    height: 3,
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 15,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  progressFillPortrait: {
    top: 12,
    height: 3,
  },
  progressFillLandscape: {
    top: 9,
    height: 3,
  },
  progressKnob: {
    position: "absolute",
    left: -9,
    top: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  progressKnobPortrait: {
    left: -8,
    top: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  progressKnobLandscape: {
    left: -7,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  bottomControlsRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 40,
  },
  bottomControlsRowPortrait: {
    gap: 14,
  },
  bottomControlsRowLandscape: {
    gap: 18,
  },
  optionChip: {
    minWidth: 62,
    height: 42,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  controlChipAnchor: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  controlChipAnchorActive: {
    zIndex: 60,
  },
  optionMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 30,
  },
  mediaChipActive: {
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  mediaChipLandscape: {
    minWidth: 54,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 9,
  },
  mediaChipPortrait: {
    minWidth: 64,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 10,
  },
  optionText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  mediaChipTextLandscape: {
    fontSize: 10,
  },
  mediaChipTextPortrait: {
    fontSize: 11,
  },
  optionMenuPanel: {
    position: "absolute",
    bottom: 48,
    left: "50%",
    width: 118,
    marginLeft: -59,
    maxHeight: 148,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(15,23,42,0.96)",
    padding: 7,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    zIndex: 70,
  },
  optionMenuPanelPortrait: {
    bottom: 44,
    width: 112,
    marginLeft: -56,
    maxHeight: 132,
  },
  optionMenuPanelLandscape: {
    bottom: 38,
    width: 108,
    marginLeft: -54,
    maxHeight: 110,
    borderRadius: 16,
    padding: 6,
  },
  optionMenuTitle: {
    marginBottom: 5,
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "rgba(226,232,240,0.72)",
    textAlign: "center",
  },
  optionMenuList: {
    maxHeight: 112,
  },
  optionMenuListLandscape: {
    maxHeight: 78,
  },
  optionMenuItem: {
    minHeight: 32,
    borderRadius: 12,
    paddingHorizontal: 8,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  optionMenuItemActive: {
    backgroundColor: "rgba(37,99,235,0.86)",
  },
  optionMenuItemText: {
    flex: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "rgba(255,255,255,0.78)",
    textAlign: "left",
  },
  optionMenuItemTextActive: {
    color: "#fff",
  },
  segmentPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 82,
  },
  segmentPanel: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 154,
    maxHeight: 230,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(10,13,18,0.9)",
    overflow: "hidden",
    zIndex: 84,
  },
  segmentPanelSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,13,18,0.9)",
  },
  segmentPanelContent: {
    zIndex: 1,
  },
  segmentPanelPortrait: {
    left: 18,
    right: 18,
    bottom: 16,
    borderRadius: 28,
  },
  segmentPanelLandscape: {
    right: undefined,
    maxHeight: 188,
    borderRadius: 26,
  },
  segmentPanelHeader: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    direction: "ltr",
    zIndex: 1,
  },
  segmentPanelTitle: {
    flex: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
    textAlign: "right",
    writingDirection: "rtl",
  },
  segmentClose: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  segmentPanelList: {
    zIndex: 1,
  },
  segmentPanelListContent: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  segmentRow: {
    width: "100%",
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    direction: "rtl",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  segmentRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  segmentRowBody: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  segmentRowTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
    textAlign: "right",
  },
  segmentRowMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.62)",
    textAlign: "right",
  },
});
