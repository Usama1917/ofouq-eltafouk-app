import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessagesSquare, X, ExternalLink, BellOff, Bell } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { ChatPane, chatReq, apiPath, type ConversationItem } from "@/components/chat-pane";
import { RoleIcon } from "@/components/role-icon";

const SIZE_KEY = "ofouq-team-chat-size:v1";
const MUTE_KEY = "ofouq-team-chat-mute-until:v1";
const MUTE_MS = 10 * 60 * 1000; // mute window = 10 minutes
const MIN_W = 380;
const MIN_H = 560;

function loadSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s?.w && s?.h) return { w: Math.max(MIN_W, s.w), h: Math.max(MIN_H, s.h) }; }
  } catch { /* ignore */ }
  return { w: MIN_W, h: MIN_H };
}

// "Muted until" epoch-ms, or 0 when not muted / already expired.
function loadMuteUntil(): number {
  try { const v = Number(localStorage.getItem(MUTE_KEY)); return Number.isFinite(v) && v > Date.now() ? v : 0; } catch { return 0; }
}

export function InternalChatWidget({ isDark }: { isDark?: boolean }) {
  const { user, token } = useAuth();
  const isStaff = Boolean(user && (user.role === "admin" || user.role === "owner") && token);

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [size, setSize] = useState(loadSize);
  // Toast: a newly-arrived message slides out next to the button, holds ~2s, collapses.
  const [toast, setToast] = useState<{ key: number; title: string; preview: string; role?: string | null } | null>(null);
  // Right-click menu anchor (viewport coords) + "notifications muted until" timestamp.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [mutedUntil, setMutedUntil] = useState<number>(loadMuteUntil);
  const mutedUntilRef = useRef(mutedUntil);
  useEffect(() => { mutedUntilRef.current = mutedUntil; }, [mutedUntil]);
  const resizing = useRef<null | { startX: number; startY: number; startW: number; startH: number }>(null);
  const meIdRef = useRef<number | null>(null);
  const lastSeenMsgIdRef = useRef<number | null>(null); // highest message id already handled
  const toastTimer = useRef<number | null>(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  const showToast = useCallback((title: string, preview: string, role?: string | null) => {
    if (Date.now() < mutedUntilRef.current) return; // notifications muted for now
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ key: Date.now(), title, preview, role });
    // ~0.5s appear + ~4s hold, then drop it → AnimatePresence plays the collapse.
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  // Poll the conversation list: drives the unread badge AND surfaces a toast for any
  // newly-arrived message from someone else (only while the panel is closed).
  const refreshChat = useCallback(async () => {
    if (!isStaff) return;
    try {
      const d = await chatReq("/conversations");
      const convs: ConversationItem[] = d.conversations ?? [];
      const meId: number | null = d.me?.id ?? meIdRef.current ?? null;
      meIdRef.current = meId;
      setUnread(convs.reduce((s, c) => s + (c.unreadCount || 0), 0));

      // Find the newest message across all conversations.
      let newest: { id: number; title: string; preview: string; senderId: number | null; role: string | null } | null = null;
      for (const c of convs) {
        const lm = c.lastMessage;
        if (!lm) continue;
        if (!newest || lm.id > newest.id) {
          // role: only direct chats expose the counterpart's role (group lastMessage doesn't carry it).
          newest = { id: lm.id, title: lm.senderName || c.counterpart?.name || c.title, preview: lm.preview, senderId: lm.senderId, role: c.counterpart?.role ?? null };
        }
      }
      if (!newest) return;
      if (lastSeenMsgIdRef.current === null) {
        lastSeenMsgIdRef.current = newest.id; // first load: prime, don't replay history
        return;
      }
      if (newest.id > lastSeenMsgIdRef.current) {
        lastSeenMsgIdRef.current = newest.id;
        if (!openRef.current && newest.senderId !== meId) {
          showToast(newest.title, newest.preview || "رسالة جديدة", newest.role);
        }
      }
    } catch { /* keep */ }
  }, [isStaff, showToast]);

  // Badge + toast polling — always (so the count shows even while the panel is closed).
  useEffect(() => {
    if (!isStaff) return;
    void refreshChat();
    const t = window.setInterval(refreshChat, 8000);
    return () => window.clearInterval(t);
  }, [isStaff, refreshChat]);

  // While open, refresh a bit faster too.
  useEffect(() => {
    if (!isStaff || !open) return;
    const t = window.setInterval(refreshChat, 5000);
    return () => window.clearInterval(t);
  }, [isStaff, open, refreshChat]);

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

  // Single click toggles instantly — the old double-click wait (230ms) made open
  // feel sluggish. Right-click opens a small options menu instead.
  const onButtonClick = () => {
    setOpen((o) => !o);
    void refreshChat();
  };
  const onButtonContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };
  const muteFor10 = () => {
    const until = Date.now() + MUTE_MS;
    setMutedUntil(until);
    try { localStorage.setItem(MUTE_KEY, String(until)); } catch { /* ignore */ }
    setMenu(null);
    sonnerToast.success("تم كتم إشعارات المحادثات لمدة 10 دقائق");
  };
  const unmute = () => {
    setMutedUntil(0);
    try { localStorage.removeItem(MUTE_KEY); } catch { /* ignore */ }
    setMenu(null);
    sonnerToast("تم إلغاء كتم الإشعارات");
  };

  // Close the right-click menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  if (!isStaff) return null;
  const isMuted = mutedUntil > Date.now();

  // Morph palette: the panel literally grows out of the FAB, so it starts at the
  // button's exact blue (mirrors --primary in index.css — light 217 91% 45%,
  // dark 209 100% 52%) and lightens into the card's surface colour for the theme.
  const fabColor = isDark ? "rgb(10, 137, 255)" : "rgb(10, 90, 219)";
  const cardColor = isDark ? "rgba(17, 21, 27, 0.97)" : "rgba(255, 255, 255, 0.95)";
  const cardBorder = isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.60)";
  // Geometry endpoints: a 56px circle sitting exactly over the FAB (bottom-6) ⇄
  // the full card lifted to bottom-24, growing upward and lightening as it goes.
  const fabBox = { width: 56, height: 56, bottom: 24, borderRadius: 28, backgroundColor: fabColor, borderColor: "rgba(255, 255, 255, 0)" };
  const cardBox = { width: size.w, height: size.h, bottom: 96, borderRadius: 24, backgroundColor: cardColor, borderColor: cardBorder };

  return (
    <>
      <button
        onClick={onButtonClick}
        onContextMenu={onButtonContextMenu}
        aria-label="محادثات الفريق (كليك يمين للمزيد من الخيارات)"
        title="محادثات الفريق — كليك يمين لخيارات الكتم والفتح في تبويب مستقل"
        className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 transition-transform hover:-translate-y-0.5 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessagesSquare className="h-6 w-6" />}
        {!open && isMuted ? (
          // Muted indicator — bottom-left corner (the unread badge owns top-right).
          <span className="absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white ring-2 ring-white dark:ring-[#11151b]">
            <BellOff className="h-3 w-3" />
          </span>
        ) : null}
        {!open && unread > 0 ? (
          // Re-keying on `unread` replays the pop each time the count changes.
          <motion.span
            key={unread}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-black text-white ring-2 ring-white dark:ring-[#11151b]"
          >
            {unread > 99 ? "99+" : unread}
          </motion.span>
        ) : null}
      </button>

      {/* New-message toast — slides out from behind the button, holds ~2s, collapses. */}
      <AnimatePresence>
        {toast && !open ? (
          <motion.div
            key={toast.key}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-6 z-40 flex h-14 items-center overflow-hidden rounded-full border border-white/60 bg-white/95 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#11151b]/95"
          >
            <div className="flex flex-col justify-center gap-0.5 whitespace-nowrap py-1 pl-[4.75rem] pr-5 text-right">
              <p className="flex items-center gap-1 text-xs font-black leading-tight text-foreground">{toast.title}<RoleIcon role={toast.role} className="h-3.5 w-3.5" /></p>
              <p className="max-w-[240px] truncate text-[11px] leading-tight text-muted-foreground">{toast.preview}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Right-click options menu — anchored at the cursor, grows upward (the FAB
          lives in the bottom-left corner). Two actions: mute notifications for
          10 minutes (or unmute), and open the chat in a standalone tab. */}
      <AnimatePresence>
        {menu ? (
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              style={{ left: Math.min(menu.x, window.innerWidth - 248), bottom: Math.max(12, window.innerHeight - menu.y) }}
              className="fixed z-[61] w-56 origin-bottom-left overflow-hidden rounded-2xl border border-white/60 bg-white/97 p-1.5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#11151b]/97"
              dir="rtl"
            >
              {isMuted ? (
                <button onClick={unmute} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm font-semibold text-foreground transition-colors hover:bg-muted/70">
                  <Bell className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1">إلغاء كتم الإشعارات</span>
                </button>
              ) : (
                <button onClick={muteFor10} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm font-semibold text-foreground transition-colors hover:bg-muted/70">
                  <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">كتم الإشعارات 10 دقائق</span>
                </button>
              )}
              <button onClick={() => { openInNewTab(); setMenu(null); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm font-semibold text-foreground transition-colors hover:bg-muted/70">
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">فتح في تبويب مستقل</span>
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* The panel grows straight out of the FAB: it mounts as a blue circle sitting
          on top of the button, then rises to bottom-24 while widening and fading to
          the card colour — uncovering the FAB beneath it, which now reads as the
          close button (same spot the chat button sat when closed). */}
      <AnimatePresence>
        {open ? (
          <motion.div
            key="chat-card"
            initial={fabBox}
            animate={cardBox}
            exit={fabBox}
            transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.36 }}
            style={{ left: 24 }}
            className="fixed z-[51] max-h-[calc(100vh-7rem)] max-w-[calc(100vw-3rem)] overflow-hidden border shadow-2xl backdrop-blur-xl"
          >
            {/* Contents fade in only once the box has grown (and out fast before it
                collapses) so the chat never shows squished inside the circle phase. */}
            <motion.div
              variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.16, delay: 0.18 } }, gone: { opacity: 0, transition: { duration: 0.1 } } }}
              initial="hidden" animate="shown" exit="gone"
              style={{ width: size.w, height: size.h }}
              className="relative"
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
