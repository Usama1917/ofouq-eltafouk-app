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
    background: "#0A0F1E",
    surface: "#111827",
    surfaceSecondary: "#1E2A45",
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    border: "rgba(255,255,255,0.08)",
    tint: "#60A5FA",
    tabIconDefault: "#475569",
    tabIconSelected: "#60A5FA",
    card: "rgba(17,24,39,0.85)",
    overlay: "rgba(0,0,0,0.6)",
  },
};

export default {
  light: COLORS.light,
  dark: COLORS.dark,
};
