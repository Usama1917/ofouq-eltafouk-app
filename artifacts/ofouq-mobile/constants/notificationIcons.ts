import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type FeatherIconName = ComponentProps<typeof Feather>["name"];

// Mobile copy of the notification badge-icon palette. Keys MUST stay in sync with:
//   backend: artifacts/api-server/src/lib/notification-icons.ts
//   web:     artifacts/ofouq-eltafouk/src/lib/notification-icons.ts
// The value is the Feather glyph rendered on the notification card. A missing/unknown
// key means "auto" — the card falls back to the tone-derived glyph (the old look).
export const NOTIFICATION_ICON_GLYPHS: Record<string, FeatherIconName> = {
  bell: "bell",
  check: "check-circle",
  clock: "clock",
  alert: "alert-circle",
  award: "award",
  star: "star",
  gift: "gift",
  zap: "zap",
  heart: "heart",
  book: "book-open",
  play: "play-circle",
  target: "target",
  thumbsup: "thumbs-up",
  video: "video",
  message: "message-circle",
  trending: "trending-up",
  // study / education themed additions
  pencil: "edit-3",
  checksquare: "check-square",
  calendar: "calendar",
  bookmark: "bookmark",
  flag: "flag",
  sun: "sun",
  moon: "moon",
  barchart: "bar-chart-2",
  dollar: "dollar-sign",
  unlock: "unlock",
  xcircle: "x-circle",
  headphones: "headphones",
  smile: "smile",
  warning: "alert-triangle",
};

/** Resolve an owner-chosen icon key to a Feather glyph, or null when unset/unknown. */
export function resolveNotificationIconGlyph(key: unknown): FeatherIconName | null {
  if (typeof key !== "string") return null;
  return NOTIFICATION_ICON_GLYPHS[key] ?? null;
}
