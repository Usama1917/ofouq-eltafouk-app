import { Platform } from "react-native";
import type { TextStyle } from "react-native";

// Font naming. Android keeps the bundled NotoSansArabic family (weight baked into
// the family name). iOS uses the native system font (San Francisco / SF Arabic)
// with a numeric fontWeight — this matches the per-platform look the app had before
// the typography refactor, instead of forcing NotoSansArabic on both platforms.

// FONT_FAMILY: raw Android family-name strings. Kept for `useFonts()` registration
// and for any place that genuinely needs the Noto family name as a string.
export const FONT_FAMILY = {
  regular: "NotoSansArabic_400Regular",
  medium: "NotoSansArabic_500Medium",
  semiBold: "NotoSansArabic_600SemiBold",
  bold: "NotoSansArabic_700Bold",
  extraBold: "NotoSansArabic_800ExtraBold",
  black: "NotoSansArabic_900Black",
} as const;

type FontWeight = TextStyle["fontWeight"];

// Return type is intentionally left to inference (a narrow
// `{ fontWeight } | { fontFamily }` union) so spreading `...FONT.x` stays
// assignable to narrow style slots like tabBarLabelStyle, instead of widening
// to the full TextStyle (which carries extra props that break those slots).
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
