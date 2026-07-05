// Canonical palette of notification badge icons the owner can pick per message
// (automated messages + manual broadcasts). The KEY is stored in the notification's
// `data.icon` (and on automated_messages.icon); the mobile app maps the key to a
// Feather glyph and the web dashboard maps it to a matching lucide glyph. A null /
// unknown key means "auto" — the mobile app falls back to deriving the glyph from
// the tone (the original behaviour), so old notifications keep working.
//
// Keep these keys in sync with the two client copies:
//   web:    artifacts/ofouq-eltafouk/src/lib/notification-icons.ts
//   mobile: artifacts/ofouq-mobile/constants/notificationIcons.ts
export const NOTIFICATION_ICON_KEYS = [
  "bell",
  "check",
  "clock",
  "alert",
  "award",
  "star",
  "gift",
  "zap",
  "heart",
  "book",
  "play",
  "target",
  "thumbsup",
  "video",
  "message",
  "trending",
  // study / education themed additions
  "pencil",
  "checksquare",
  "calendar",
  "bookmark",
  "flag",
  "sun",
  "moon",
  "barchart",
  "dollar",
  "unlock",
  "xcircle",
  "headphones",
  "smile",
  "warning",
] as const;

export type NotificationIconKey = (typeof NOTIFICATION_ICON_KEYS)[number];

const ICON_SET = new Set<string>(NOTIFICATION_ICON_KEYS);

/** Validate an owner-supplied icon key; returns the key if known, else null ("auto"). */
export function normalizeNotificationIcon(value: unknown): NotificationIconKey | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return ICON_SET.has(key) ? (key as NotificationIconKey) : null;
}
