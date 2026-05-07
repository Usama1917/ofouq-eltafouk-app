const primary = "#1D4ED8";
const primaryDark = "#1E3A8A";
const accent = "#F59E0B";
const accentLight = "#FCD34D";

export const COLORS = {
  primary,
  primaryDark,
  primaryLight: "#3B82F6",
  accent,
  accentLight,
  success: "#10B981",
  error: "#EF4444",
  warning: "#F59E0B",
  darkIconFrame: {
    background: "rgba(37,99,235,0.24)",
    border: "rgba(96,165,250,0.38)",
    foreground: "#60A5FA",
  },

  light: {
    background: "#F0F4FF",
    surface: "#FFFFFF",
    surfaceSecondary: "#EEF2FF",
    text: "#0F172A",
    textSecondary: "#64748B",
    textTertiary: "#94A3B8",
    border: "rgba(30,58,138,0.12)",
    tint: primary,
    tabIconDefault: "#94A3B8",
    tabIconSelected: primary,
    card: "rgba(255,255,255,0.85)",
    overlay: "rgba(15,23,42,0.4)",
  },

  dark: {
    background: "#000000",
    surface: "#1C1C1E",
    surfaceSecondary: "#2C2C2E",
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    border: "rgba(255,255,255,0.14)",
    tint: "#60A5FA",
    tabIconDefault: "#475569",
    tabIconSelected: "#60A5FA",
    card: "rgba(28,28,30,0.98)",
    overlay: "rgba(0,0,0,0.6)",
  },
};

export default {
  light: COLORS.light,
  dark: COLORS.dark,
};
