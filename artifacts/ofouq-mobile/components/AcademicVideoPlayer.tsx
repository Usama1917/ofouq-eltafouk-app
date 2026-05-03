import { Feather } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  GestureResponderEvent,
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
};

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
}: AcademicVideoPlayerProps) {
  const { colors } = usePreferences();
  const { width, height } = useWindowDimensions();
  const videoRef = useRef<Video>(null);
  const webViewRef = useRef<WebView>(null);
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(null);
  const segmentPanelProgress = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(videoType === "upload" ? false : false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingFullscreenPlay, setPendingFullscreenPlay] = useState(false);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [segmentPanelOpen, setSegmentPanelOpen] = useState(false);
  const [segmentPanelVisible, setSegmentPanelVisible] = useState(false);
  const [seekToast, setSeekToast] = useState<"-10s" | "+10s" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressTrackWidth, setProgressTrackWidth] = useState(1);
  const [volume, setVolume] = useState(78);
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
  const resolvedPosterUrl = resolveMediaUrl(posterUrl) ?? resolveMediaUrl(thumbnailUrl);
  const playerWidth = Math.min(width - 36, 760);
  const playerHeight = playerWidth * PLAYER_RATIO;
  const shellWidth = isFullscreen ? width : playerWidth;
  const shellHeight = isFullscreen ? height : playerHeight;
  const isSideways = rotationDegrees % 180 !== 0;
  const mediaWidth = isSideways ? shellHeight : shellWidth;
  const mediaHeight = isSideways ? shellWidth : shellHeight;
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

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const watermarkLabel = watermarkText ? `${watermarkText} · ${clockText}` : null;
  const segmentPanelAnimatedStyle = {
    opacity: segmentPanelProgress,
    transform: [
      {
        translateX: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [Math.min(width * 0.42, 220), 0],
        }),
      },
      {
        translateY: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [150, 0],
        }),
      },
      {
        scale: segmentPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.08, 1],
        }),
      },
    ],
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setClockText(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timeout = setTimeout(() => setShowControls(false), 2600);
    return () => clearTimeout(timeout);
  }, [isPlaying, showControls, currentTime]);

  useEffect(() => {
    if (!ready) return;
    if (isYouTube) {
      inject(`window.__ofqPlayer && window.__ofqPlayer.setVolume(${volume})`);
      return;
    }
    void videoRef.current?.setVolumeAsync(volume / 100);
  }, [isYouTube, ready, volume]);

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

  async function play() {
    if (!isFullscreen) {
      openFullscreen({ autoPlay: true });
      return;
    }
    setHasStarted(true);
    setShowControls(true);
    if (isYouTube) {
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
    setIsFullscreen(true);
    setReady(false);
    setIsPlaying(false);
    setPendingFullscreenPlay(autoPlay);
    setPendingSeekSeconds(seekToSeconds);
  }

  async function closeFullscreen() {
    await pause();
    closeSegmentPanel();
    setShowControls(true);
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

  async function seekTo(seconds: number, autoPlay = false) {
    if (autoPlay && !isFullscreen) {
      openFullscreen({ autoPlay: true, seekToSeconds: seconds });
      return;
    }
    const target = Math.max(0, Math.min(duration || seconds, seconds));
    setCurrentTime(target);
    setShowControls(true);
    if (isYouTube) {
      inject(`window.__ofqPlayer && window.__ofqPlayer.seekTo(${target})`);
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

  function seekFromProgressEvent(event: GestureResponderEvent) {
    if (duration <= 0) return;
    const x = event.nativeEvent.locationX;
    const ratio = Math.min(1, Math.max(0, x / progressTrackWidth));
    void seekTo(ratio * duration, isPlaying);
  }

  function toggleMute() {
    setVolume((value) => (value > 0 ? 0 : 78));
  }

  function rotateVideo() {
    setRotationDegrees((value) => (value + 90) % 360);
    setShowControls(true);
  }

  function openSegmentPanel() {
    if (normalizedSegments.length === 0) return;
    setSegmentPanelVisible(true);
    setSegmentPanelOpen(true);
    Animated.timing(segmentPanelProgress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function closeSegmentPanel() {
    setSegmentPanelOpen(false);
    Animated.timing(segmentPanelProgress, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSegmentPanelVisible(false);
    });
  }

  function cyclePlaybackRate() {
    const options = displayPlaybackRates;
    const index = options.findIndex((value) => Math.abs(value - playbackRate) < 0.01);
    const next = options[(index + 1 + options.length) % options.length] ?? 1;
    setPlaybackRate(next);
    setShowControls(true);
  }

  function cycleQuality() {
    const options = displayQualityLevels;
    const index = options.indexOf(quality);
    const next = options[(index + 1 + options.length) % options.length] ?? "auto";
    setQuality(next);
    setShowControls(true);
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
        setDuration(Number(payload.duration) || 0);
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
        setCurrentTime(Number(payload.currentTime) || 0);
        setDuration(Number(payload.duration) || duration);
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
    setDuration((status.durationMillis ?? 0) / 1000);
    setCurrentTime(status.positionMillis / 1000);
    if (status.isPlaying) setHasStarted(true);
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
              transform: [{ rotate: `${rotationDegrees}deg` }],
            },
          ]}
        >
        {isYouTube ? (
          youTubeId ? (
            <WebView
              ref={webViewRef}
              source={{ html: webHtml, baseUrl: "https://www.youtube-nocookie.com" }}
              originWhitelist={["*"]}
              javaScriptEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={false}
              scrollEnabled={false}
              bounces={false}
              onMessage={handleWebMessage}
              style={styles.webView}
            />
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

        {resolvedPosterUrl && (!isFullscreen || !hasStarted) ? (
          <View pointerEvents="none" style={styles.posterOverlay}>
            <Image source={{ uri: resolvedPosterUrl }} style={styles.posterImage} contentFit="cover" />
            <View style={styles.posterScrim} />
          </View>
        ) : null}

        <View pointerEvents="none" style={styles.brandGuardTop} />
        <View pointerEvents="none" style={styles.brandGuardBottom} />
        <View pointerEvents="none" style={styles.brandGuardLeft} />
        <View pointerEvents="none" style={styles.brandGuardRight} />

        {watermarkLabel ? (
          <View
            pointerEvents="none"
            style={[styles.watermark, isFullscreen ? styles.watermarkFullscreen : null]}
          >
            <Text style={styles.watermarkText} numberOfLines={1}>{toEnglishDigits(watermarkLabel)}</Text>
          </View>
        ) : null}
        </View>

        <Pressable style={StyleSheet.absoluteFill} onPress={handleSurfacePress} />

        {!isFullscreen ? <View pointerEvents="none" style={styles.previewCleanLayer} /> : null}

        {seekToast ? (
          <View pointerEvents="none" style={styles.seekToast}>
            <Text style={styles.seekToastText}>{seekToast}</Text>
          </View>
        ) : null}

        {!isFullscreen ? (
          <AnimatedPressable style={styles.previewPlayButton} onPress={() => void play()} pressedScale={0.9}>
            <Feather name="play" size={36} color="#fff" />
          </AnimatedPressable>
        ) : null}

        {error ? (
          <View style={styles.errorOverlay}>
            <Feather name="alert-triangle" size={24} color="#FDE68A" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isFullscreen ? (
          <AnimatedPressable style={styles.fullscreenCloseButton} onPress={closeFullscreen} pressedScale={0.9}>
            <Feather name="x" size={24} color="#fff" />
          </AnimatedPressable>
        ) : null}

        {isFullscreen && showControls ? (
          <BlurView intensity={44} tint="dark" style={[styles.controls, isCompactControls ? styles.controlsCompact : null]}>
            <View style={[styles.controlsTopRow, isCompactControls ? styles.controlsTopRowCompact : null]}>
              <AnimatedPressable
                style={[styles.controlIcon, styles.topRightControl]}
                onPress={openSegmentPanel}
                disabled={normalizedSegments.length === 0}
              >
                <Feather name="list" size={22} color={normalizedSegments.length > 0 ? "#fff" : "rgba(255,255,255,0.35)"} />
              </AnimatedPressable>

              <View style={styles.transportRow}>
                <AnimatedPressable style={styles.seekTenButton} onPress={() => seekBy(10)} pressedScale={0.88}>
                  <Feather name="rotate-cw" size={26} color="#E5E7EB" />
                  <Text style={styles.seekTenText}>10</Text>
                </AnimatedPressable>
                <AnimatedPressable style={styles.playButton} onPress={togglePlayback} disabled={!ready && isYouTube} pressedScale={0.9}>
                  <Feather name={isPlaying ? "pause" : "play"} size={30} color="#0F172A" />
                </AnimatedPressable>
                <AnimatedPressable style={styles.seekTenButton} onPress={() => seekBy(-10)} pressedScale={0.88}>
                  <Feather name="rotate-ccw" size={26} color="#E5E7EB" />
                  <Text style={styles.seekTenText}>10</Text>
                </AnimatedPressable>
              </View>

              <AnimatedPressable style={[styles.controlIcon, styles.topLeftControl]} onPress={rotateVideo}>
                <Feather name="rotate-cw" size={20} color="#fff" />
              </AnimatedPressable>
            </View>

            <View style={[styles.controlsBottomRow, isCompactControls ? styles.controlsBottomRowCompact : null]}>
              <View style={styles.timelineGroup}>
                <Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
                <View
                  style={styles.progressTrack}
                  onLayout={(event) => setProgressTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={seekFromProgressEvent}
                  onResponderMove={seekFromProgressEvent}
                >
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  <View style={[styles.progressKnob, { left: `${progress}%` }]} />
                </View>
              </View>

              <View style={styles.bottomControlsRow}>
                <AnimatedPressable style={styles.volumeChip} onPress={toggleMute}>
                  <Text style={styles.volumeText}>{volume}%</Text>
                  <Feather name={volume === 0 ? "volume-x" : "volume-2"} size={19} color="#fff" />
                </AnimatedPressable>

                <AnimatedPressable style={styles.optionChip} onPress={cycleQuality}>
                  <Text style={styles.optionText}>{labelQuality(quality)}</Text>
                </AnimatedPressable>
                <AnimatedPressable style={styles.optionChip} onPress={cyclePlaybackRate}>
                  <Text style={styles.optionText}>{formatRate(playbackRate)}</Text>
                </AnimatedPressable>
              </View>
            </View>
          </BlurView>
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
              style={[styles.segmentPanel, segmentPanelAnimatedStyle]}
            >
              <View style={styles.segmentPanelHeader}>
                <Text style={styles.segmentPanelTitle}>تقسيمات الدرس</Text>
                <AnimatedPressable style={styles.segmentClose} onPress={closeSegmentPanel} pressedScale={0.88}>
                  <Feather name="x" size={16} color="#fff" />
                </AnimatedPressable>
              </View>
              <ScrollView style={styles.segmentPanelList} showsVerticalScrollIndicator={false}>
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
  previewPlayButton: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 74,
    height: 74,
    marginLeft: -37,
    marginTop: -37,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  fullscreenCloseButton: {
    position: "absolute",
    top: 64,
    right: 18,
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
    zIndex: 30,
  },
  controls: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    minHeight: 118,
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(10,13,18,0.9)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
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
  controlsBottomRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  controlsBottomRowCompact: {
    justifyContent: "center",
  },
  volumeChip: {
    minWidth: 76,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  volumeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  timelineGroup: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 6,
    direction: "ltr",
  },
  timeText: {
    alignSelf: "flex-start",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.84)",
    textAlign: "left",
  },
  progressTrack: {
    width: "100%",
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    overflow: "visible",
    direction: "ltr",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 9.5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  progressKnob: {
    position: "absolute",
    top: 4,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  bottomControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  optionChip: {
    minWidth: 62,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  optionText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  segmentPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 18,
  },
  segmentPanel: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 154,
    maxHeight: 230,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(15,23,42,0.94)",
    overflow: "hidden",
    zIndex: 19,
  },
  segmentPanelHeader: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmentPanelTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
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
    padding: 10,
  },
  segmentRow: {
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
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
    flex: 1,
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
