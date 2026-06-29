import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, ImageOff } from "lucide-react";
import { makeBackdropClose } from "@/lib/dialog-dismiss";

// Generic full-screen image preview. Click the backdrop or the close button to
// dismiss. Used by the internal chat widget (and reusable elsewhere).
export function ImageLightbox({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => setStatus("loading"), [src]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-5"
      onClick={makeBackdropClose(onClose)}
      dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/25 bg-white/95 shadow-2xl ring-1 ring-primary/10 backdrop-blur-xl dark:bg-slate-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-white/80 px-4 py-3 dark:bg-white/10">
          <p className="truncate text-sm font-black text-foreground">{title || "معاينة الصورة"}</p>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary dark:bg-white/10"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative flex min-h-[40vh] flex-1 items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-3 dark:from-slate-950 dark:to-slate-900">
          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/15 border-t-primary" />
            </div>
          ) : null}
          {status === "error" ? (
            <div className="flex flex-col items-center gap-2 text-rose-600">
              <ImageOff className="h-9 w-9" />
              <p className="text-sm font-black">تعذّر تحميل الصورة</p>
            </div>
          ) : (
            <img
              src={src}
              alt={title || "preview"}
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
              className={`max-h-[78vh] w-full rounded-2xl object-contain transition-opacity duration-200 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
