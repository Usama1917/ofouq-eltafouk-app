import { useCallback, useEffect, useState } from "react";

// Notification badge colours. A fixed preset palette lives here in the client; the
// owner can also add custom colours by hex code (persisted globally in the DB and
// shared across all admins) and delete them. A null value means "auto" — the colour
// is derived from the message tone (the original look).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface PresetColor {
  hex: string;
  label: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { hex: "#1d4ed8", label: "أزرق" },
  { hex: "#10b981", label: "أخضر" },
  { hex: "#f59e0b", label: "برتقالي" },
  { hex: "#ef4444", label: "أحمر" },
  { hex: "#8b5cf6", label: "بنفسجي" },
  { hex: "#ec4899", label: "وردي" },
  { hex: "#06b6d4", label: "سماوي" },
  { hex: "#f97316", label: "برتقالي غامق" },
  { hex: "#6366f1", label: "نيلي" },
  { hex: "#14b8a6", label: "تركوازي" },
];

export interface CustomColor {
  id: number;
  hex: string;
}

/** Normalize a hex colour to lowercase "#rrggbb", expanding "#rgb". Null if invalid. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().toLowerCase();
  const short = raw.match(/^#?([0-9a-f]{3})$/);
  if (short) return "#" + short[1].split("").map((c) => c + c).join("");
  const full = raw.match(/^#?([0-9a-f]{6})$/);
  if (full) return "#" + full[1];
  return null;
}

/** Shared custom-colour list + add/delete, backed by /admin/notification-colors. */
export function useNotificationColors() {
  const [colors, setColors] = useState<CustomColor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiPath("/api/admin/notification-colors"), { headers: authHeader() });
      const data = await res.json().catch(() => ({}));
      setColors(Array.isArray(data.colors) ? data.colors : []);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addColor = useCallback(async (hex: string): Promise<CustomColor | null> => {
    const res = await fetch(apiPath("/api/admin/notification-colors"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ hex }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "تعذّر إضافة اللون");
    const color: CustomColor | null = data.color ?? null;
    if (color) setColors((prev) => (prev.some((c) => c.id === color.id) ? prev : [color, ...prev]));
    return color;
  }, []);

  const deleteColor = useCallback(async (id: number) => {
    setColors((prev) => prev.filter((c) => c.id !== id));
    await fetch(apiPath(`/api/admin/notification-colors/${id}`), { method: "DELETE", headers: authHeader() }).catch(
      () => undefined,
    );
  }, []);

  return { colors, loading, addColor, deleteColor };
}
