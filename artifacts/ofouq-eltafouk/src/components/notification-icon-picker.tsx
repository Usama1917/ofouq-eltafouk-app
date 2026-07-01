import { Sparkles } from "lucide-react";
import { NOTIFICATION_ICONS } from "@/lib/notification-icons";

// Owner-facing picker for a notification's badge glyph. `value` is a palette key or
// null ("auto" = the app derives the glyph from the tone, i.e. the original look).
export function NotificationIconPicker({
  value,
  onChange,
  label = "شكل الأيقونة",
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          title="تلقائي (حسب اللون)"
          aria-pressed={value === null}
          className={`flex h-11 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition ${
            value === null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/40"
          }`}
        >
          <Sparkles className="h-4 w-4" /> تلقائي
        </button>
        {NOTIFICATION_ICONS.map(({ key, label: iconLabel, Icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              title={iconLabel}
              aria-label={iconLabel}
              aria-pressed={active}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
