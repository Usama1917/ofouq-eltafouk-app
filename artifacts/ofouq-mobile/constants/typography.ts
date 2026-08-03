import { Platform } from "react-native";
import type { TextStyle } from "react-native";

// Font naming. Android renders Arabic in Teshrin — the owner's brand typeface, the same
// one on the printed books (owner-mandated 2026-08-03, replacing IBM Plex Sans Arabic).
// iOS keeps its native system font (San Francisco / SF Arabic) with a numeric fontWeight.
// Each weight is its OWN family (weight baked into the name), which is the reliable way
// to get real bold on Android without the single-weight `fontWeight` fallback.
//
// Teshrin ships four files whose style NAMES overstate their weight — the OS/2 numbers
// are what the slots below are mapped by:
//   Light = 350 · Medium = 500 · "Bold" = 600 · "Heavy" = 800
// So: regular→350 (a hair light of 400, the closest file), semiBold→600 (exact),
// bold/extraBold/black→800 — the family has nothing between 600 and 800, and titles
// and buttons need clear separation from semiBold labels, so the whole top of the
// scale collapses onto Heavy (mirroring how 800/900 collapsed onto Bold before).

// FONT_FAMILY: raw Android family-name strings, matching the `useFonts()` keys in _layout.
export const FONT_FAMILY = {
  regular: "Teshrin_350Light",
  medium: "Teshrin_500Medium",
  semiBold: "Teshrin_600Bold",
  bold: "Teshrin_800Heavy",
  extraBold: "Teshrin_800Heavy",
  black: "Teshrin_800Heavy",
} as const;

type FontWeight = TextStyle["fontWeight"];

// Return type is intentionally left to inference (a narrow
// `{ fontWeight } | { fontFamily }` union) so spreading `...FONT.x` stays
// assignable to narrow style slots like tabBarLabelStyle, instead of widening
// to the full TextStyle (which carries extra props that break those slots).
// Android maps each weight to its own Teshrin family (weight baked into the family
// name, so NO `fontWeight` is passed — that avoids the single-weight fallback bug and
// gives real bold from the dedicated file). iOS uses `fontWeight` over its native system
// font. Each family is registered in _layout via useFonts and matches FONT_FAMILY above.
const font = (weight: FontWeight, androidFamily: string) =>
  Platform.OS === "ios"
    ? { fontWeight: weight }
    : { fontFamily: androidFamily };

// FONT: platform-aware style objects. Spread into a style, e.g. `...FONT.bold`.
// iOS -> { fontWeight } over the system font; Android -> { fontFamily: Teshrin_* }.
export const FONT = {
  regular: font("400", FONT_FAMILY.regular),
  medium: font("500", FONT_FAMILY.medium),
  semiBold: font("600", FONT_FAMILY.semiBold),
  bold: font("700", FONT_FAMILY.bold),
  extraBold: font("800", FONT_FAMILY.extraBold),
  black: font("900", FONT_FAMILY.black),
} as const;
