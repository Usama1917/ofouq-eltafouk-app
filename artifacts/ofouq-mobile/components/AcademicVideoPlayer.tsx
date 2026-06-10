import { Feather } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as NavigationBar from "expo-navigation-bar";
import * as ScreenCapture from "expo-screen-capture";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  StatusBar,
  StyleSheet,
  StyleProp,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { usePreferences } from "@/contexts/PreferencesContext";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { toEnglishDigits } from "@/lib/format";

type VideoType = "youtube" | "upload";

export type AcademicVideoSegment = {
  id?: number;
  title: string;
  titleEn?: string | null;
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
  // Optional content rendered between the player and the inline "lesson
  // segments" list (e.g. the video summary card). Lets the host slot custom UI
  // directly under the video without losing the segments below it.
  belowPlayerContent?: React.ReactNode;
  watermarkText?: string;
  initialSeekSeconds?: number | null;
  autoPlayOnLoad?: boolean;
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
      statusBarTranslucent
      navigationBarTranslucent
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
const DEFAULT_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const FALLBACK_QUALITY_LEVELS = ["hd720", "large", "medium", "auto"];
const IS_ANDROID = Platform.OS === "android";

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

function labelQuality(value: string) {
  const labels: Record<string, string> = {
    highres: "High",
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

// ─── Premium player sheets (translated from the "Implement Smooth Animations"
// Figma design): a full-width bottom sheet in portrait, a centered floating
// panel in landscape. Speed / Quality / Lesson-segments share the same body. ──

type SheetKind = "speed" | "quality" | "segments";

function clampRate(value: number) {
  return Math.max(0.25, Math.min(3, Math.round(value * 4) / 4));
}

function getActiveSegmentIndex(segments: { startSeconds: number }[], time: number) {
  let index = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (time >= segments[i].startSeconds) index = i;
  }
  return index;
}

function SheetSlider({ value, onChange }: { value: number; onChange: (rate: number) => void }) {
  const widthRef = useRef(1);
  const ratio = Math.max(0, Math.min(1, (value - 0.25) / (3 - 0.25)));
  const apply = (locationX: number) => {
    const width = widthRef.current;
    const next = Math.max(0, Math.min(1, locationX / width));
    onChange(clampRate(0.25 + next * (3 - 0.25)));
  };
  return (
    <View
      style={styles.sliderTrack}
      onLayout={(event) => {
        widthRef.current = Math.max(1, event.nativeEvent.layout.width);
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => apply(event.nativeEvent.locationX)}
      onResponderMove={(event) => apply(event.nativeEvent.locationX)}
    >
      <View style={styles.sliderBase} />
      <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
      <View style={[styles.sliderKnob, { left: `${ratio * 100}%` }]} />
    </View>
  );
}

function PlayerSheet({
  progress,
  isLandscape,
  insetsBottom,
  onClose,
  children,
}: {
  progress: Animated.Value;
  isLandscape: boolean;
  insetsBottom: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [sheetHeight, setSheetHeight] = useState(360);
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, isLandscape ? 0.5 : 0.55],
  });

  if (isLandscape) {
    const panelStyle = {
      opacity: progress,
      transform: [
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      ],
    };
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]} />
        </Pressable>
        <View style={styles.sheetLandscapeWrap} pointerEvents="box-none">
          <Animated.View style={[styles.sheetLandscapePanel, { marginBottom: insetsBottom + 16 }, panelStyle]}>
            {children}
          </Animated.View>
        </View>
      </View>
    );
  }

  const sheetStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight + 48, 0] }) },
    ],
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]} />
      </Pressable>
      <Animated.View
        style={[styles.sheetPortrait, { paddingBottom: insetsBottom + 18 }, sheetStyle]}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          if (next > 0) setSheetHeight((current) => (Math.abs(current - next) < 1 ? current : next));
        }}
      >
        <View style={styles.sheetHandle} />
        {children}
      </Animated.View>
    </View>
  );
}

function SheetSpeedContent({
  rates,
  value,
  onChange,
  strings,
}: {
  rates: number[];
  value: number;
  onChange: (rate: number) => void;
  isRTL: boolean;
  strings: any;
}) {
  return (
    <View style={styles.sheetBody}>
      <Text style={styles.sheetTitle}>{strings.academic.speed}</Text>
      <View style={styles.speedValueRow}>
        <Pressable style={styles.speedStep} onPress={() => onChange(clampRate(value - 0.25))}>
          <Text style={styles.speedStepText}>−</Text>
        </Pressable>
        <Text style={styles.speedValue}>{value === 1 ? "1.00×" : `${value}×`}</Text>
        <Pressable style={styles.speedStep} onPress={() => onChange(clampRate(value + 0.25))}>
          <Text style={styles.speedStepText}>+</Text>
        </Pressable>
      </View>
      <SheetSlider value={value} onChange={onChange} />
      <View style={styles.presetWrap}>
        {rates.map((rate) => {
          const active = Math.abs(rate - value) < 0.001;
          return (
            <Pressable key={rate} onPress={() => onChange(rate)} style={[styles.preset, active ? styles.presetActive : null]}>
              <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>{rate === 1 ? "1.0" : String(rate)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SheetQualityContent({
  levels,
  value,
  onChange,
  isRTL,
  strings,
}: {
  levels: string[];
  value: string;
  onChange: (level: string) => void;
  isRTL: boolean;
  strings: any;
}) {
  return (
    <View style={styles.sheetBody}>
      <Text style={styles.sheetTitle}>{strings.academic.quality}</Text>
      <View style={styles.qualityList}>
        {levels.map((level) => {
          const active = level === value;
          return (
            <Pressable
              key={level}
              onPress={() => onChange(level)}
              style={[styles.qualityRow, { flexDirection: isRTL ? "row-reverse" : "row" }, active ? styles.qualityRowActive : null]}
            >
              <Text style={styles.qualityText}>{labelQuality(level)}</Text>
              {active ? <View style={styles.qualityDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SheetSegmentsContent({
  segments,
  currentTime,
  onSeek,
  segmentLabel,
  language,
  isRTL,
  strings,
}: {
  segments: any[];
  currentTime: number;
  onSeek: (time: number) => void;
  segmentLabel: (type: AcademicVideoSegment["segmentType"]) => string;
  language: string;
  isRTL: boolean;
  strings: any;
}) {
  const activeIndex = getActiveSegmentIndex(segments, currentTime);
  return (
    <View style={[styles.sheetBody, styles.sheetBodySegments]}>
      <Text style={styles.sheetTitle}>{strings.academic.lessonSegments}</Text>
      <ScrollView
        style={styles.segScroll}
        contentContainerStyle={styles.segScrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {segments.map((segment, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={`${segment.id}-${segment.startSeconds}`}
              onPress={() => onSeek(segment.startSeconds)}
              style={[styles.segRow, { flexDirection: isRTL ? "row-reverse" : "row" }, active ? styles.segRowActive : null]}
            >
              <View style={[styles.segBar, active ? styles.segBarActive : null]} />
              <View style={[styles.segBody, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text
                  style={[styles.segTitle, active ? styles.segTitleActive : null, { textAlign: isRTL ? "right" : "left" }]}
                  numberOfLines={1}
                >
                  {localizeAcademicText(segment.title, language, segment.titleEn)}
                </Text>
                <Text style={[styles.segMeta, { textAlign: isRTL ? "right" : "left" }]}>
                  {segmentLabel(segment.segmentType)} · {formatTime(segment.startSeconds)}
                </Text>
              </View>
              {active ? <View style={styles.segDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function AcademicVideoPlayer({
  videoUrl,
  videoType,
  title,
  subtitle,
  posterUrl,
  thumbnailUrl,
  segments,
  belowPlayerContent,
  watermarkText,
  initialSeekSeconds,
  autoPlayOnLoad = false,
  onProgressUpdate,
}: AcademicVideoPlayerProps) {
  const { colors, language, strings, isRTL, direction, textAlign, rowDirection } = usePreferences();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Block screenshots and screen recording while the lesson video player is on
  // screen, on both Android and iOS. Android: applies FLAG_SECURE (screenshots
  // blocked, screen recordings capture a black frame). iOS: the protected
  // content is blanked out while the screen is being recorded. The unique tag
  // keeps prevent/allow balanced so other screens stay unaffected.
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync("academic-video-player").catch(() => undefined);
    return () => {
      ScreenCapture.allowScreenCaptureAsync("academic-video-player").catch(() => undefined);
    };
  }, []);
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
  const autoPlayInitialSeekAppliedRef = useRef(false);
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
  // ── New premium-player sheet (speed / quality / segments) ──
  const [activeSheet, setActiveSheet] = useState<SheetKind | null>(null);
  const [sheetMounted, setSheetMounted] = useState(false);
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const [clockText, setClockText] = useState(() =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
  );

  const isYouTube = videoType === "youtube";
  const youTubeId = useMemo(() => (isYouTube ? parseYouTubeId(videoUrl) : null), [isYouTube, videoUrl]);
  const webHtml = useMemo(() => (youTubeId ? buildYouTubeHtml(youTubeId) : ""), [youTubeId]);
  const resolvedVideoUrl = resolveMediaUrl(videoUrl);
  // The video thumbnail uses the PRIMARY image (thumbnailUrl) first, falling
  // back to the secondary (posterUrl) only if no primary was uploaded.
  const posterCandidateUrl = resolveMediaUrl(thumbnailUrl) ?? resolveMediaUrl(posterUrl);
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
    const ranked = ["highres", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];
    const sourceLevels = qualityLevels.length > 0 ? qualityLevels : FALLBACK_QUALITY_LEVELS;
    const set = new Set(sourceLevels);
    const sorted = ranked.filter((level) => set.has(level));
    const extraLevels = sourceLevels.filter((level) => level !== "auto" && !ranked.includes(level));
    const levels = Array.from(new Set([...sorted, ...extraLevels, ...(set.has("auto") ? ["auto"] : [])]));
    return levels.length > 0 ? levels : FALLBACK_QUALITY_LEVELS;
  }, [isYouTube, qualityLevels]);
  const displayPlaybackRates = useMemo(() => {
    return Array.from(new Set([...(playbackRates.length > 0 ? playbackRates : DEFAULT_PLAYBACK_RATES), 1])).sort((a, b) =>
      IS_ANDROID ? b - a : a - b,
    );
  }, [playbackRates]);
  function segmentLabel(type: AcademicVideoSegment["segmentType"]) {
    if (type === "questions") return strings.academic.segmentTypes.questions;
    if (type === "parts") return strings.academic.segmentTypes.parts;
    if (type === "topics") return strings.academic.segmentTypes.topics;
    return strings.academic.segmentTypes.segment;
  }

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
  const segmentCountLabel = `${toEnglishDigits(normalizedSegments.length)} ${
    normalizedSegments.length === 1 ? strings.academic.segmentItem : strings.academic.segmentItems
  }`;

  const displayedTime = scrubTime ?? currentTime;
  const watermarkLabel = watermarkText ? `${watermarkText} · ${clockText}` : null;
  const segmentPanelWidth = isLandscapeFullscreen ? landscapeSegmentPanelWidth : Math.max(1, width - 36);
  // Lift the panel above the Android system navigation bar / gesture area so its
  // bottom rows are never covered (portrait fullscreen, the reported case).
  const segmentPanelBottom = isLandscapeFullscreen
    ? 12 + insets.bottom
    : isPortraitFullscreen
      ? 16 + insets.bottom + 12
      : 154;
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
    initialSeekAppliedRef.current = false;
    autoPlayInitialSeekAppliedRef.current = false;

    if (safeInitialSeek <= 0) return;

    initialSeekAppliedRef.current = true;
    commitTimelinePosition(safeInitialSeek);
  }, [initialSeekSeconds, resolvedVideoUrl]);

  useEffect(() => {
    const target = Math.max(0, Math.floor(Number(initialSeekSeconds) || 0));
    if (!autoPlayOnLoad || target <= 0 || autoPlayInitialSeekAppliedRef.current) return;

    autoPlayInitialSeekAppliedRef.current = true;
    initialSeekSecondsRef.current = null;
    openFullscreen({ autoPlay: true, seekToSeconds: target });
  }, [autoPlayOnLoad, initialSeekSeconds, resolvedVideoUrl]);

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

  // Immersive fullscreen: while the player is in fullscreen, hide the OS status
  // and navigation bars so the video truly takes over the whole screen. This
  // stops the Android system buttons from covering the controls / close button
  // and stops the underlying page from peeking around the video.
  useEffect(() => {
    if (!isFullscreen) return;
    StatusBar.setHidden(true, "fade");
    if (IS_ANDROID) {
      void NavigationBar.setVisibilityAsync("hidden").catch(() => undefined);
      void NavigationBar.setBehaviorAsync("overlay-swipe").catch(() => undefined);
    }
    return () => {
      StatusBar.setHidden(false, "fade");
      if (IS_ANDROID) {
        void NavigationBar.setVisibilityAsync("visible").catch(() => undefined);
      }
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || !showControls) return;
    measureSegmentButton();
  }, [fullscreenOrientation, height, isFullscreen, showControls, width]);

  useEffect(() => {
    if (!isPlaying) return;
    if (scrubTime !== null) return;
    if (activeSheet) return;
    const timeout = setTimeout(() => setShowControls(false), 2600);
    return () => clearTimeout(timeout);
  }, [activeSheet, currentTime, isPlaying, scrubTime, showControls]);

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

  function closeSheet() {
    Animated.timing(sheetProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSheetMounted(false);
        setActiveSheet(null);
      }
    });
  }

  function openSheet(kind: SheetKind) {
    setShowControls(true);
    setActiveSheet(kind);
    setSheetMounted(true);
    sheetProgress.stopAnimation();
    sheetProgress.setValue(0);
    Animated.timing(sheetProgress, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function toggleSheet(kind: SheetKind) {
    if (activeSheet === kind) closeSheet();
    else openSheet(kind);
  }

  // Back-compat aliases so existing call sites keep closing the new sheet.
  const closeOptionMenu = closeSheet;
  const closeFloatingControlPanels = closeSheet;

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

    if (activeSheet) {
      closeSheet();
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
    openSheet("segments");
  }

  function closeSegmentPanel() {
    closeSheet();
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
    const isAndroidExpandedMenu = IS_ANDROID && (menu === "quality" || menu === "speed");
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
          isAndroidExpandedMenu ? styles.androidOptionMenuPanel : null,
          optionMenuAnimatedStyle,
        ]}
      >
        <Text style={styles.optionMenuTitle}>{isQualityMenu ? strings.academic.quality : strings.academic.speed}</Text>
        {isAndroidExpandedMenu ? (
          <View style={styles.androidOptionMenuList}>
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
          </View>
        ) : (
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
        )}
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
            <View style={styles.videoFallback}><Text style={styles.videoFallbackText}>{strings.academic.invalidVideoUrl}</Text></View>
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
          <View style={styles.videoFallback}><Text style={styles.videoFallbackText}>{strings.academic.invalidVideoUrl}</Text></View>
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
                <Text style={styles.cleanVideoTitle} numberOfLines={2}>{localizeAcademicText(title, language)}</Text>
                {subtitle ? <Text style={styles.cleanVideoSubtitle} numberOfLines={1}>{localizeAcademicText(subtitle, language)}</Text> : null}
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
          </>
        ) : null}

        {watermarkLabel && isFullscreen ? (
          <View
            pointerEvents="none"
            style={[
              styles.watermark,
              isFullscreen ? styles.watermarkFullscreen : null,
              portraitVideoWatermarkStyle,
              isLandscapeFullscreen ? { top: insets.top + 12, left: insets.left + 14, maxWidth: 240 } : null,
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
            style={[
              styles.fullscreenCloseButtonLayer,
              { top: insets.top + 14, right: insets.right + 16 },
              closeButtonAnimatedStyle,
            ]}
          >
            <AnimatedPressable style={styles.fullscreenCloseButton} onPress={closeFullscreen} pressedScale={0.9}>
              <Feather name="x" size={24} color="#fff" />
            </AnimatedPressable>
          </Animated.View>
        ) : null}

        {isFullscreen ? (
          <Animated.View
            pointerEvents={showControls ? "box-none" : "none"}
            style={[StyleSheet.absoluteFill, styles.npOverlay, controlsAnimatedStyle]}
          >
            {/* Bottom scrim keeps the controls readable over any video. */}
            <LinearGradient
              pointerEvents="none"
              colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.82)"]}
              style={[styles.npScrim, { height: isLandscapeFullscreen ? 150 : 190 }]}
            />

            <View
              pointerEvents="box-none"
              style={[
                styles.npControls,
                {
                  left: isLandscapeFullscreen ? landscapeControlInset + insets.left : 16,
                  right: isLandscapeFullscreen ? landscapeControlInset + insets.right : 16,
                  bottom: insets.bottom + (isLandscapeFullscreen ? 10 : 18),
                  gap: isLandscapeFullscreen ? 8 : 11,
                },
              ]}
            >
              {/* Row 1 — time pill (start side) · play + fullscreen (end side) */}
              <View pointerEvents="box-none" style={[styles.npRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View pointerEvents="none" style={styles.npTimePill}>
                  <Text style={styles.npTimePillText}>
                    {toEnglishDigits(`${formatTime(displayedTime)} / ${formatTime(duration)}`)}
                  </Text>
                </View>
                <View pointerEvents="box-none" style={[styles.npRowGroup, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <AnimatedPressable
                    style={styles.npPlayBtn}
                    onPress={togglePlayback}
                    disabled={!ready && isYouTube}
                    pressedScale={0.9}
                  >
                    <Feather
                      name={isPlaying ? "pause" : "play"}
                      size={17}
                      color="#fff"
                      style={isPlaying ? undefined : { marginLeft: 2 }}
                    />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.npIconBtn}
                    onPress={toggleFullscreenOrientation}
                    pressedScale={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={fullscreenOrientation === "landscape" ? "الرجوع للفول سكرين بالطول" : "الفول سكرين بالعرض"}
                  >
                    <Feather name={fullscreenOrientation === "landscape" ? "minimize" : "maximize"} size={15} color="#fff" />
                  </AnimatedPressable>
                </View>
              </View>

              {/* Row 2 — white timeline (kept physically LTR in both languages) */}
              <View pointerEvents="box-none" style={styles.npTimelineRow}>
                <View
                  ref={progressTrackRef}
                  collapsable={false}
                  style={styles.npTrack}
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
                  <View pointerEvents="none" style={styles.npTrackBase} />
                  <Animated.View pointerEvents="none" style={[styles.npTrackFill, { width: timelineProgress }]} />
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.npKnob, { transform: [{ translateX: timelineProgress }] }]}
                  />
                </View>
              </View>

              {/* Row 3 — speed/quality chips (start side) · skip + segments (end side) */}
              <View pointerEvents="box-none" style={[styles.npRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View pointerEvents="box-none" style={[styles.npRowGroup, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <AnimatedPressable
                    style={[styles.npChip, activeSheet === "speed" ? styles.npChipActive : null]}
                    onPress={() => toggleSheet("speed")}
                    pressedScale={0.92}
                  >
                    <Text style={styles.npChipText}>{formatRate(playbackRate)}</Text>
                  </AnimatedPressable>
                  {isYouTube ? (
                    <AnimatedPressable
                      style={[styles.npChip, activeSheet === "quality" ? styles.npChipActive : null]}
                      onPress={() => toggleSheet("quality")}
                      pressedScale={0.92}
                    >
                      <Text style={styles.npChipText}>{labelQuality(quality)}</Text>
                    </AnimatedPressable>
                  ) : null}
                </View>

                {/* Fixed LTR so rewind is always left, forward always right. */}
                <View pointerEvents="box-none" style={styles.npRowGroupFixed}>
                  <AnimatedPressable style={styles.npRoundBtn} onPress={() => seekBy(-10)} pressedScale={0.88}>
                    <Feather name="rotate-ccw" size={15} color="#fff" />
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.npRoundBtn} onPress={() => seekBy(10)} pressedScale={0.88}>
                    <Feather name="rotate-cw" size={15} color="#fff" />
                  </AnimatedPressable>
                  <View ref={segmentButtonRef} collapsable={false} onLayout={measureSegmentButton}>
                    <AnimatedPressable
                      style={[styles.npRoundBtn, activeSheet === "segments" ? styles.npRoundBtnActive : null]}
                      onPress={openSegmentPanel}
                      disabled={normalizedSegments.length === 0}
                      pressedScale={0.88}
                    >
                      <Feather name="list" size={16} color={normalizedSegments.length > 0 ? "#fff" : "rgba(255,255,255,0.35)"} />
                    </AnimatedPressable>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {sheetMounted && isFullscreen ? (
          <PlayerSheet
            progress={sheetProgress}
            isLandscape={isLandscapeFullscreen}
            insetsBottom={insets.bottom}
            onClose={closeSheet}
          >
            {activeSheet === "speed" ? (
              <SheetSpeedContent
                rates={displayPlaybackRates}
                value={playbackRate}
                onChange={(rate) => {
                  setPlaybackRate(rate);
                  setShowControls(true);
                }}
                isRTL={isRTL}
                strings={strings}
              />
            ) : activeSheet === "quality" ? (
              <SheetQualityContent
                levels={displayQualityLevels}
                value={quality}
                onChange={(value) => {
                  setQuality(value);
                  setShowControls(true);
                }}
                isRTL={isRTL}
                strings={strings}
              />
            ) : activeSheet === "segments" ? (
              <SheetSegmentsContent
                segments={normalizedSegments}
                currentTime={currentTime}
                onSeek={(time) => {
                  closeSheet();
                  void seekTo(time, true);
                }}
                segmentLabel={segmentLabel}
                language={language}
                isRTL={isRTL}
                strings={strings}
              />
            ) : null}
          </PlayerSheet>
        ) : null}
      </View>
      </PlayerHost>

      {belowPlayerContent ? (
        <View style={styles.belowPlayerSlot}>{belowPlayerContent}</View>
      ) : null}

      {normalizedSegments.length > 0 ? (
        <View style={styles.externalSegments}>
          <View style={[styles.segmentHeader, { direction }]}>
            <Text style={[styles.segmentHeaderTitle, { color: colors.text }]}>{strings.academic.lessonSegments}</Text>
            <Text style={[styles.segmentHeaderMeta, { color: colors.textSecondary }]}>{segmentCountLabel}</Text>
          </View>
          <View style={styles.segmentList}>
            {normalizedSegments.map((segment) => (
              <Pressable
                key={`${segment.id}-${segment.startSeconds}`}
                onPress={() => void seekTo(segment.startSeconds, true)}
                style={({ pressed }) => [
                  styles.segmentChip,
                  {
                    width: playerWidth,
                    // Force a physical LTR box so RN's automatic RTL flip can't
                    // double-flip this row. We then place things explicitly:
                    // Arabic -> play on the right, Engish -> play on the left.
                    direction: "ltr",
                    flexDirection: isRTL ? "row-reverse" : "row",
                    justifyContent: "flex-start",
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                {segment.thumbnailUrl ? (
                  <Image source={{ uri: segment.thumbnailUrl }} style={styles.segmentThumb} contentFit="cover" />
                ) : (
                  <View style={styles.segmentThumbFallback}>
                    <Feather name="play" size={15} color="#fff" />
                  </View>
                )}
                <View style={[styles.segmentChipText, { direction: "ltr" }]}>
                  <Text style={[styles.segmentChipTitle, { textAlign: isRTL ? "right" : "left", writingDirection: direction, width: "100%" }]} numberOfLines={1}>{localizeAcademicText(segment.title, language, segment.titleEn)}</Text>
                  <Text style={[styles.segmentChipMeta, { textAlign: isRTL ? "right" : "left", writingDirection: direction, width: "100%" }]}>{segmentLabel(segment.segmentType)} · {formatTime(segment.startSeconds)}</Text>
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
  // ── New premium controls / sheets ──
  npTimePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  npTimePillText: {
    ...FONT.semiBold,
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  npOverlay: {
    zIndex: 6,
  },
  npScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  npControls: {
    position: "absolute",
  },
  npRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
  },
  npRowGroup: {
    alignItems: "center",
    gap: 10,
  },
  npRowGroupFixed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    direction: "ltr",
  },
  npPlayBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  npIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  npTimelineRow: {
    width: "100%",
    height: 22,
    justifyContent: "center",
    direction: "ltr",
  },
  npTrack: {
    width: "100%",
    height: 22,
    justifyContent: "center",
  },
  npTrackBase: {
    width: "100%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  npTrackFill: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -1.5,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  npKnob: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -8,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  npChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  npChipActive: {
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  npChipText: {
    ...FONT.semiBold,
    color: "rgba(255,255,255,0.92)",
    fontSize: 12.5,
  },
  npRoundBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  npRoundBtnActive: {
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  sliderTrack: {
    height: 26,
    justifyContent: "center",
    marginHorizontal: 2,
  },
  sliderBase: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -2,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  sliderKnob: {
    position: "absolute",
    top: "50%",
    marginTop: -9,
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  sheetBackdrop: {
    backgroundColor: "#000",
  },
  sheetPortrait: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(18,18,22,0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    zIndex: 50,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 10,
    marginBottom: 2,
  },
  sheetLandscapeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheetLandscapePanel: {
    width: 360,
    maxWidth: "64%",
    maxHeight: "72%",
    backgroundColor: "rgba(16,16,20,0.97)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    zIndex: 50,
  },
  sheetBody: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  sheetBodySegments: {
    paddingTop: 10,
  },
  sheetTitle: {
    ...FONT.semiBold,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 2,
  },
  speedValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  speedStep: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  speedStepText: {
    ...FONT.regular,
    color: "rgba(255,255,255,0.8)",
    fontSize: 22,
    lineHeight: 26,
  },
  speedValue: {
    ...FONT.bold,
    color: "#fff",
    fontSize: 24,
    minWidth: 84,
    textAlign: "center",
  },
  presetWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  preset: {
    minWidth: 52,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  presetActive: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  presetText: {
    ...FONT.semiBold,
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
  },
  presetTextActive: {
    color: "#111827",
  },
  qualityList: {
    gap: 2,
  },
  qualityRow: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  qualityRowActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  qualityText: {
    ...FONT.regular,
    color: "#fff",
    fontSize: 15,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  segScroll: {
    maxHeight: 320,
  },
  segScrollContent: {
    gap: 2,
    paddingBottom: 4,
  },
  segRow: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  segRowActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  segBar: {
    width: 3,
    alignSelf: "stretch",
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  segBarActive: {
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  segBody: {
    flex: 1,
    minWidth: 0,
  },
  segTitle: {
    ...FONT.semiBold,
    color: "rgba(255,255,255,0.66)",
    fontSize: 14,
    width: "100%",
  },
  segTitleActive: {
    color: "rgba(255,255,255,0.96)",
  },
  segMeta: {
    ...FONT.regular,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    marginTop: 2,
    width: "100%",
  },
  segDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  belowPlayerSlot: {
    width: "100%",
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
    ...FONT.bold,
    fontSize: 16,
    lineHeight: 24,
    color: "#0F172A",
  },
  segmentHeaderMeta: {
    ...FONT.semiBold,
    fontSize: 13,
    lineHeight: 20,
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
    flex: 1,
    minWidth: 0,
  },
  segmentChipTitle: {
    ...FONT.bold,
    fontSize: 14,
    lineHeight: 22,
    color: "#fff",
    textAlign: "right",
    writingDirection: "rtl",
  },
  segmentChipMeta: {
    marginTop: 2,
    ...FONT.regular,
    fontSize: 12,
    lineHeight: 18,
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
    ...FONT.bold,
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
    ...FONT.bold,
    fontSize: 17,
    lineHeight: 27,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    writingDirection: "rtl",
  },
  cleanVideoSubtitle: {
    marginTop: 4,
    ...FONT.semiBold,
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
    maxWidth: "60%",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(2,6,23,0.4)",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  watermarkFullscreen: {
    top: 64,
    left: 16,
  },
  watermarkText: {
    ...FONT.bold,
    fontSize: 8,
    color: "rgba(255,255,255,0.78)",
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
    ...FONT.bold,
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
    ...FONT.bold,
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.78)",
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
    ...FONT.bold,
    fontSize: 14,
    color: "#fff",
    textAlign: "right",
    writingDirection: "rtl",
  },
  controlLessonSubtitle: {
    marginTop: -2,
    ...FONT.regular,
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.1)",
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.1)",
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
    ...FONT.bold,
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
    backgroundColor: "rgba(255,255,255,0.97)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
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
    ...FONT.semiBold,
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
    backgroundColor: "rgba(255,255,255,0.24)",
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.1)",
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
    ...FONT.bold,
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
  androidOptionMenuPanel: {
    width: 124,
    marginLeft: -62,
    maxHeight: 380,
  },
  optionMenuTitle: {
    marginBottom: 5,
    ...FONT.bold,
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
  androidOptionMenuList: {
    width: "100%",
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
    ...FONT.bold,
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
    ...FONT.bold,
    fontSize: 16,
    lineHeight: 24,
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
  segmentPanelListAndroid: {
    maxHeight: 170,
    flexGrow: 0,
    flexShrink: 1,
  },
  segmentPanelListAndroidLandscape: {
    maxHeight: 130,
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
    ...FONT.bold,
    fontSize: 14,
    lineHeight: 22,
    color: "#fff",
    textAlign: "right",
  },
  segmentRowMeta: {
    ...FONT.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(255,255,255,0.62)",
    textAlign: "right",
  },
});
