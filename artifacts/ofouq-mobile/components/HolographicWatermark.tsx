import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  SensorType,
  interpolate,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";

const LOGO = require("@/assets/images/logo-watermark.png");

// ── Geometry ────────────────────────────────────────────────────────────────
// A rounded chip the same width/radius as the add-to-cart button (owner's call —
// it should read as one of the page's pills, not an edge-to-edge stripe).
const BAND_H = 44; // half the first cut
const BAND_RADIUS = 16; // matches styles.addBtn in the book screen
const TILE_W = 62;
const LOGO_RATIO = 360 / 134; // the exported artwork's aspect
const TILE_H = Math.round(TILE_W / LOGO_RATIO);
const TILE_GAP_X = 16;
const TILE_GAP_Y = 6;
const GRID_TILT = "-12deg";
// How far the layers may travel, in px. Small on purpose: the illusion comes from
// the layers moving by DIFFERENT amounts, not from big movement.
const TILE_SHIFT = 7;
const SHEEN_TRAVEL = 0.85; // × band width, each way

// ── Tilt source ─────────────────────────────────────────────────────────────
// GRAVITY, not ROTATION: near-vertical (how a phone is actually held) the rotation
// quaternion's roll goes gimbal-degenerate and jitters, while the gravity vector
// stays perfectly well-behaved at every angle. Normalising by its own magnitude
// also erases the platform unit difference (iOS reports G's, Android m/s²).
// Android's vector points the opposite way to iOS's (reaction force vs gravity),
// hence the sign flip.
const FLIP = Platform.OS === "android" ? -1 : 1;
// Lean (normalised gravity x ≈ sine of the sideways tilt) that sweeps the sheen
// fully across: ±0.45 ≈ ±26° — the wrist range of "angling it to catch the light".
const TILT_SPAN = 0.45;
// Screen-normal component at a typical reading grip (~35-40° from vertical); the
// forward/back drift is centred here so it rests at zero in the hand, not on a desk.
const REST_NZ = -0.6;

const SENSOR_CONFIG = { interval: 16 } as const;

type Props = {
  /** The line printed across the watermark. */
  text: string;
  /** Width of the chip — the caller passes the same width as the add-to-cart pill. */
  width: number;
  isDark: boolean;
  /** True → everything holds still. The band still renders, it just doesn't move. */
  reduceMotion: boolean;
};

/**
 * A "security paper" chip: the brand mark tiled faintly across it, a specular sheen
 * that slides as the phone is TILTED, a faint holographic colour cast, and the tile
 * layer drifting slightly against the sheen. The parallax between the layers is what
 * makes the eye read the mark as embedded in the surface rather than printed on it.
 *
 * Sensor plumbing gotcha (the bug that shipped a "canned" shimmer to real phones):
 * useAnimatedSensor registers the sensor in ITS OWN effect, where it REPLACES its
 * result object — flag and shared value both — without triggering any re-render.
 * The object captured on the first render therefore stays `isAvailable: false` with
 * a dead shared value forever. The forced re-render below swaps the live object in;
 * without it the component permanently falls back to the automatic loop.
 *
 * Degrades on purpose:
 *   • genuinely no sensor (rare, budget Android) → a slow automatic shimmer
 *   • reduce-motion on → completely still, no sensor read, no loop
 */
export default function HolographicWatermark({ text, width, isDark, reduceMotion }: Props) {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, SENSOR_CONFIG);

  // The post-mount re-render that makes the hook's mutations visible (see above):
  // once right after the sensor registered, and once more a beat later for devices
  // whose registration lands late.
  const [, bump] = useState(0);
  useEffect(() => {
    bump((n) => n + 1);
    const late = setTimeout(() => bump((n) => n + 1), 400);
    return () => clearTimeout(late);
  }, []);

  const live = gravity.isAvailable && !reduceMotion;

  // Fallback driver for phones with no usable sensor: a plain 0→1 loop that walks
  // the sheen across on its own.
  const auto = useSharedValue(0);
  const autoRunning = !gravity.isAvailable && !reduceMotion;
  useEffect(() => {
    if (!autoRunning) {
      auto.value = 0;
      return;
    }
    auto.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [autoRunning, auto]);

  // The grid is drawn oversized so the -12° tilt and the parallax drift both stay
  // covered; `overflow: hidden` on the band crops it back to the rounded chip.
  const gridW = width + TILE_W * 2;
  const gridH = BAND_H + TILE_H * 2;
  const cols = Math.ceil(gridW / (TILE_W + TILE_GAP_X)) + 1;
  const rows = Math.ceil(gridH / (TILE_H + TILE_GAP_Y));
  const grid = useMemo(() => Array.from({ length: rows }, (_, r) => ({ r, offset: r % 2 === 0 ? 0 : (TILE_W + TILE_GAP_X) / 2 })), [rows]);

  // Normalised sideways lean in [-1, 1] across ±TILT_SPAN — the one number every
  // layer below derives from, so they always agree on where the "light" is.
  const sheenStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ translateX: 0 }, { rotate: "18deg" }], opacity: 0.35 };
    let t: number;
    if (live) {
      const g = gravity.sensor.value;
      const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
      const nx = mag > 0.001 ? (g.x / mag) * FLIP : 0;
      t = interpolate(nx, [-TILT_SPAN, TILT_SPAN], [1, -1], Extrapolation.CLAMP);
    } else {
      t = interpolate(auto.value, [0, 1], [1, -1]);
    }
    return {
      transform: [{ translateX: t * width * SHEEN_TRAVEL }, { rotate: "18deg" }],
      // Brightest facing the "light" straight on, dimmer angled away — like a real
      // foil. A flat, evenly-lit watermark is the one that looks fake.
      opacity: interpolate(Math.abs(t), [0, 1], [0.9, 0.25], Extrapolation.CLAMP),
    };
  });

  // Tiles drift the OPPOSITE way, and much less far — the parallax that reads as depth.
  const tileStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ rotate: GRID_TILT }, { translateX: 0 }, { translateY: 0 }] };
    let nx: number;
    let nz: number;
    if (live) {
      const g = gravity.sensor.value;
      const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
      nx = mag > 0.001 ? (g.x / mag) * FLIP : 0;
      nz = mag > 0.001 ? (g.z / mag) * FLIP : REST_NZ;
    } else {
      nx = interpolate(auto.value, [0, 1], [-TILT_SPAN, TILT_SPAN]);
      nz = REST_NZ;
    }
    return {
      transform: [
        { rotate: GRID_TILT },
        { translateX: interpolate(nx, [-TILT_SPAN, TILT_SPAN], [-TILE_SHIFT, TILE_SHIFT], Extrapolation.CLAMP) },
        // Forward/back lean, centred on the natural grip so it idles at zero.
        { translateY: interpolate(nz, [REST_NZ - 0.4, REST_NZ + 0.4], [TILE_SHIFT / 2, -TILE_SHIFT / 2], Extrapolation.CLAMP) },
      ],
    };
  });

  // The colour cast swings in as the phone leans — the giveaway of a holographic
  // foil rather than flat ink.
  const holoStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0.12 };
    let nx: number;
    if (live) {
      const g = gravity.sensor.value;
      const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
      nx = mag > 0.001 ? (g.x / mag) * FLIP : 0;
    } else {
      nx = interpolate(auto.value, [0, 1], [-TILT_SPAN, TILT_SPAN]);
    }
    return { opacity: interpolate(Math.abs(nx), [0, TILT_SPAN], [0.05, 0.3], Extrapolation.CLAMP) };
  });

  return (
    <View style={[styles.band, { width, height: BAND_H, backgroundColor: isDark ? "#12203a" : "#eef3ff" }]}>
      {/* Tiled brand mark */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.gridWrap,
          { width: gridW, height: gridH, left: -TILE_W, top: -TILE_H, opacity: isDark ? 0.16 : 0.13 },
          tileStyle,
        ]}
      >
        {grid.map(({ r, offset }) => (
          <View key={r} style={[styles.tileRow, { height: TILE_H, marginBottom: TILE_GAP_Y, marginLeft: offset }]}>
            {Array.from({ length: cols }, (_, c) => (
              <Image
                key={c}
                source={LOGO}
                style={{ width: TILE_W, height: TILE_H, marginRight: TILE_GAP_X }}
                contentFit="contain"
                // A bundled asset — no network, no cache policy needed, and no fade:
                // the tiles must be there on the first frame or the band flashes empty.
                transition={0}
              />
            ))}
          </View>
        ))}
      </Animated.View>

      {/* Holographic colour cast */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, holoStyle]}>
        <LinearGradient
          colors={["#00c6ff", "#6a5cff", "#00e5c0"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Specular sheen — a narrow bright band raked across the strip */}
      <Animated.View pointerEvents="none" style={[styles.sheen, { width: width * 0.55, height: BAND_H * 2.4, top: -BAND_H * 0.7 }, sheenStyle]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", isDark ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* The line itself, over everything */}
      <View style={[styles.content, { flexDirection: "row", direction: "ltr" }]}>
        <Ionicons name="lock-open" size={15} color={COLORS.primary} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.text, { color: COLORS.primary }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: "hidden", justifyContent: "center", borderRadius: BAND_RADIUS, alignSelf: "center" },
  gridWrap: { position: "absolute" },
  tileRow: { flexDirection: "row" },
  sheen: { position: "absolute", left: 0 },
  content: { alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  text: { ...FONT.bold, fontSize: 14, textAlign: "center", flexShrink: 1 },
});
