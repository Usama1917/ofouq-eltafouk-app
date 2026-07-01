// Validation for owner-chosen notification badge colours. The colour is stored as a
// normalized lowercase "#rrggbb" hex string on the notification's `data.color` (and on
// automated_messages.color). Null = "auto" (colour derived from the tone). Custom
// colours the owner adds live in the `notification_colors` table (shared globally).

/** Normalize a hex colour to lowercase "#rrggbb", expanding "#rgb" shorthand. Null if invalid. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  const short = raw.match(/^#?([0-9a-f]{3})$/);
  if (short) {
    return "#" + short[1].split("").map((c) => c + c).join("");
  }
  const full = raw.match(/^#?([0-9a-f]{6})$/);
  if (full) {
    return "#" + full[1];
  }
  return null;
}
