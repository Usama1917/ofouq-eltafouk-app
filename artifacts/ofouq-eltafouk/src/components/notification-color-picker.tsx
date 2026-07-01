import { useState } from "react";
import { Sparkles, Plus, X } from "lucide-react";
import { PRESET_COLORS, normalizeHex, type CustomColor } from "@/lib/notification-colors";

// Owner-facing colour picker: "auto" (tone colour), fixed presets, owner-added custom
// colours (deletable), and an "add by hex" field. `value` is a hex string or null (auto).
export function NotificationColorPicker({
  value,
  onChange,
  customColors,
  onAdd,
  onDelete,
  label = "لون الأيقونة",
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
  customColors: CustomColor[];
  onAdd: (hex: string) => Promise<CustomColor | null>;
  onDelete: (id: number) => void;
  label?: string;
}) {
  const [hexInput, setHexInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const submitHex = async () => {
    const norm = normalizeHex(hexInput);
    if (!norm) {
      setErr("كود غير صالح (مثال: ‎#8B5CF6‎)");
      return;
    }
    setErr("");
    // If the hex is already a fixed preset, just select it — don't store a duplicate.
    if (PRESET_COLORS.some((c) => c.hex === norm)) {
      onChange(norm);
      setHexInput("");
      return;
    }
    setAdding(true);
    try {
      await onAdd(norm);
      onChange(norm);
      setHexInput("");
    } catch (e) {
      setErr((e as Error).message || "تعذّر إضافة اللون");
    } finally {
      setAdding(false);
    }
  };

  const swatchCls = (active: boolean) =>
    `relative h-9 w-9 rounded-xl border-2 transition ${active ? "border-foreground ring-2 ring-primary/50" : "border-border hover:border-foreground/40"}`;

  const isKnown = value === null || PRESET_COLORS.some((c) => c.hex === value) || customColors.some((c) => c.hex === value);

  return (
    <div className="space-y-2">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          title="تلقائي (حسب لون التنبيه)"
          aria-pressed={value === null}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition ${
            value === null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/40"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> تلقائي
        </button>
        {PRESET_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            aria-label={c.label}
            onClick={() => onChange(c.hex)}
            className={swatchCls(value === c.hex)}
            style={{ backgroundColor: c.hex }}
          />
        ))}
        {customColors
          .filter((c) => !PRESET_COLORS.some((p) => p.hex === c.hex))
          .map((c) => (
          <span key={c.id} className="relative inline-flex">
            <button
              type="button"
              title={c.hex}
              aria-label={c.hex}
              onClick={() => onChange(c.hex)}
              className={swatchCls(value === c.hex)}
              style={{ backgroundColor: c.hex }}
            />
            <button
              type="button"
              title="حذف اللون"
              aria-label="حذف اللون"
              onClick={() => {
                onDelete(c.id);
                if (value === c.hex) onChange(null);
              }}
              className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white shadow"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          dir="ltr"
          placeholder="#8B5CF6"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitHex();
            }
          }}
          className="w-28 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={adding}
          onClick={() => void submitHex()}
          className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> إضافة لون بكود
        </button>
        {!isKnown && value ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <span className="inline-block h-6 w-6 rounded-lg border border-border" style={{ backgroundColor: value }} />
            {value}
          </span>
        ) : null}
      </div>
      {err ? <p className="text-[11px] font-bold text-rose-600">{err}</p> : null}
    </div>
  );
}
