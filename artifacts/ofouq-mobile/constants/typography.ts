import { Platform } from "react-native";
import type { TextStyle } from "react-native";

// Font naming. Android renders Arabic in IBM Plex Sans Arabic (open-source OFL, full weights,
// close to the iOS system look). iOS keeps its native system font (San Francisco / SF Arabic)
// with a numeric fontWeight. IBM Plex Sans Arabic tops out at Bold (700), so the 800/900 slots
// map to Bold too. Each weight is its OWN family (weight baked into the name), which is the
// reliable way to get real bold on Android without the single-weight `fontWeight` fallback.

// FONT_FAMILY: raw Android family-name strings, matching the `useFonts()` keys in _layout.
export const FONT_FAMILY = {
  regular: "IBMPlexSansArabic_400Regular",
  medium: "IBMPlexSansArabic_500Medium",
  semiBold: "IBMPlexSansArabic_600SemiBold",
  bold: "IBMPlexSansArabic_700Bold",
  extraBold: "IBMPlexSansArabic_700Bold",
  black: "IBMPlexSansArabic_700Bold",
} as const;

type FontWeight = TextStyle["fontWeight"];

// Return type is intentionally left to inference (a narrow
// `{ fontWeight } | { fontFamily }` union) so spreading `...FONT.x` stays
// assignable to narrow style slots like tabBarLabelStyle, instead of widening
// to the full TextStyle (which carries extra props that break those slots).
// Android maps each weight to its own IBM Plex Sans Arabic family (weight baked into the
// family name, so NO `fontWeight` is passed — that avoids the single-weight fallback bug and
// gives real bold from the dedicated Bold file). iOS uses `fontWeight` over its native system
// font. Each family is registered in _layout via useFonts and matches FONT_FAMILY above.
const font = (weight: FontWeight, androidFamily: string) =>
  Platform.OS === "ios"
    ? { fontWeight: weight }
    : { fontFamily: androidFamily };

// FONT: platform-aware style objects. Spread into a style, e.g. `...FONT.bold`.
// iOS -> { fontWeight } over the system font; Android -> { fontFamily: Noto* }.
export const FONT = {
  regular: font("400", FONT_FAMILY.regular),
  medium: font("500", FONT_FAMILY.medium),
  semiBold: font("600", FONT_FAMILY.semiBold),
  bold: font("700", FONT_FAMILY.bold),
  extraBold: font("800", FONT_FAMILY.extraBold),
  black: font("900", FONT_FAMILY.black),
} as const;
