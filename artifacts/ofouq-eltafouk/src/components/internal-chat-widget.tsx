import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessagesSquare, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ChatPane, chatReq, apiPath } from "@/components/chat-pane";

const SIZE_KEY = "ofouq-team-chat-size:v1";
const MIN_W = 380;
const MIN_H = 560;

function loadSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s?.w && s?.h) return { w: Math.max(MIN_W, s.w), h: Math.max(MIN_H, s.h) }; }
  } catch { /* ignore */ }
  return { w: MIN_W, h: MIN_H };
}

export function InternalChatWidget({ isDark }: { isDark?: boolean }) {
  const { user, token } = useAuth();
  const isStaff = Boolean(user && (user.role === "admin" || user.role === "owner") && token);

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [size, setSize] = useState(loadSize);
  const resizing = useRef<null | { startX: number; startY: number; startW: number; startH: number }>(null);
  const clickTimer = useRef<number | null>(null);

  const loadUnread = useCallback(async () => {
    if (!isStaff) return;
    try { const d = await chatReq("/unread-count"); setUnread(Number(d.unreadCount || 0)); } catch { /* keep */ }
  }, [isStaff]);

  // Badge polling — always (so the count shows even while the panel is closed).
  useEffect(() => {
    if (!isStaff) return;
    void loadUnread();
    const t = window.setInterval(loadUnread, 8000);
    return () => window.clearInterval(t);
  }, [isStaff, loadUnread]);

  // While open, refresh the badge a bit faster too.
  useEffect(() => {
    if (!isStaff || !open) return;
    const t = window.setInterval(loadUnread, 5000);
    return () => window.clearInterval(t);
  }, [isStaff, open, loadUnread]);

  // ── Drag-to-resize (grip at the top-right corner; panel anchored bottom-left) ──
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = resizing.current;
      if (!r) return;
      const maxW = Math.min(window.innerWidth - 48, 820);
      const maxH = Math.min(window.innerHeight - 120, 940);
      const w = Math.min(maxW, Math.max(MIN_W, r.startW + (e.clientX - r.startX)));
      const h = Math.min(maxH, Math.max(MIN_H, r.startH + (r.startY - e.clientY)));
      setSize({ w, h });
    };
    const onUp = () => {
      if (resizing.current) {
        resizing.current = null;
        try { localStorage.setItem(SIZE_KEY, JSON.stringify(size)); } catch { /* ignore */ }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [size]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
  };

  const openInNewTab = () => {
    window.open(`${window.location.origin}${apiPath("/team-chat")}`, "_blank", "noopener");
  };

  // Single click toggles; double click opens the standalone tab.
  const onButtonClick = () => {
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; return; }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      setOpen((o) => !o);
      void loadUnread();
    }, 230);
  };
  const onButtonDoubleClick = () => {
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
    openInNewTab();
  };

  if (!isStaff) return null;

  return (
    <>
      <button
        onClick={onButtonClick}
        onDoubleClick={onButtonDoubleClick}
        aria-label="محادثات الفريق (دبل-كليك لفتحها في تبويب مستقل)"
        title="محادثات الفريق — دبل-كليك لفتحها في تبويب مستقل"
        className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 transition-transform hover:-translate-y-0.5 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessagesSquare className="h-6 w-6" />}
        {!open && unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-black text-white ring-2 ring-white dark:ring-[#11151b]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.22 }}
            style={{ width: size.w, height: size.h }}
            className="fixed bottom-24 left-6 z-50 max-h-[calc(100vh-7rem)] max-w-[calc(100vw-3rem)] overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#11151b]/97"
          >
            <ChatPane
              onClose={() => setOpen(false)}
              headerActions={
                <button onClick={openInNewTab} title="فتح في تبويب مستقل" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary" aria-label="فتح في تبويب مستقل">
                  <ExternalLink className="h-4 w-4" />
                </button>
              }
            />
            {/* Resize grip — top-right corner (the panel's free corner). A thick,
                round-capped quarter-circle arc that traces the panel's rounded corner. */}
            <div
              onPointerDown={startResize}
              className="group/grip absolute right-0 top-0 z-20 h-7 w-7 cursor-nesw-resize"
              title="اسحب لتغيير الحجم"
            >
              <svg
                viewBox="0 0 24 24"
                className="absolute right-1 top-1 h-5 w-5 text-muted-foreground/45 transition-colors group-hover/grip:text-primary"
                fill="none"
              >
                <path d="M6 4 A14 14 0 0 1 20 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
