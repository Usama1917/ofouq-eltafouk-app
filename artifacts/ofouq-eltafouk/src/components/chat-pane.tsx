import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MessagesSquare, X, ArrowRight, Send, ImagePlus, Users, Crown,
  Pencil, Trash2, Check, AtSign, Loader2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { resolveMediaUrl } from "@/lib/media";
import { dirOf } from "@/lib/text-direction";
import { ImageLightbox } from "@/components/image-lightbox";
import { RoleIcon } from "@/components/role-icon";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const apiPath = (p: string) => `${BASE}${p}`;
export const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export type ConversationItem = {
  key: string; id: number | null; type: "owners" | "all" | "direct"; title: string;
  counterpart: { id: number; name: string; avatarUrl: string | null; role: string } | null;
  lastMessage: { id: number; preview: string; senderId: number | null; senderName?: string | null; createdAt: string } | null;
  lastMessageAt: string | null; unreadCount: number;
};
type ChatMessage = {
  id: number; conversationId: number; senderId: number | null; senderRole: string;
  senderName: string | null; senderAvatar: string | null; body: string | null;
  imageUrl: string | null; mentions: number[]; editedAt: string | null;
  deletedAt: string | null; createdAt: string;
};
type Member = { id: number; name: string; role: string; avatarUrl: string | null };
type Me = { id: number; role: string; name: string };

export async function chatReq(path: string, init?: RequestInit) {
  const res = await fetch(apiPath(`/api/internal-chat${path}`), {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || "خطأ");
  return data;
}

function timeLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}
function initials(name: string) { return (name || "?").trim().charAt(0); }

// The full chat experience (conversation list ↔ thread ↔ composer). Fills its
// parent; used both inside the floating widget and the standalone /team-chat tab.
export function ChatPane({ onClose, headerActions }: { onClose?: () => void; headerActions?: ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [active, setActive] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [input, setInput] = useState("");
  const [pendingMentions, setPendingMentions] = useState<Member[]>([]);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const loadConversations = useCallback(async () => {
    try { const d = await chatReq("/conversations"); setConversations(d.conversations || []); setMe(d.me || null); } catch { /* keep */ }
  }, []);

  const loadThread = useCallback(async (conv: ConversationItem, markActive = false) => {
    try {
      const path = conv.id
        ? `/conversations/${conv.id}/messages`
        : `/open?type=${conv.type}${conv.counterpart ? `&counterpartId=${conv.counterpart.id}` : ""}`;
      const d = await chatReq(path);
      setMessages(d.messages || []);
      setMembers(d.members || []);
      if (markActive && d.conversation?.id) setActive((cur) => (cur ? { ...cur, id: d.conversation.id } : cur));
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر التحميل"); }
  }, []);

  useEffect(() => { void loadConversations(); const t = window.setInterval(loadConversations, 8000); return () => window.clearInterval(t); }, [loadConversations]);

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => { void loadThread(active); }, 6000);
    return () => window.clearInterval(t);
  }, [active, loadThread]);

  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, active]);

  const openConversation = useCallback(async (conv: ConversationItem) => {
    setActive(conv); setMessages([]); setMembers([]); setInput(""); setPendingMentions([]); setEditing(null); setError(null);
    await loadThread(conv, true); void loadConversations();
  }, [loadThread, loadConversations]);

  const backToList = () => { setActive(null); setMessages([]); setEditing(null); void loadConversations(); };

  const myId = me?.id ?? user?.id;
  const mentionables = useMemo(() => members.filter((m) => m.id !== myId), [members, myId]);

  const send = async () => {
    if (!active) return;
    const body = input.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    try {
      if (editing) {
        await chatReq(`/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
        setEditing(null);
      } else {
        const usedMentions = pendingMentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
        await chatReq("/messages", { method: "POST", body: JSON.stringify({ type: active.type, counterpartId: active.counterpart?.id, body, mentions: usedMentions }) });
      }
      setInput(""); setPendingMentions([]);
      await loadThread(active, true); void loadConversations();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر الإرسال"); }
    finally { setSending(false); }
  };

  const onPickImage = async (file: File) => {
    if (!active || uploading) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); fd.append("image", file);
      const up = await fetch(apiPath("/api/internal-chat/upload-image"), { method: "POST", headers: authHeader(), body: fd });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upData?.error || "تعذّر رفع الصورة");
      await chatReq("/messages", { method: "POST", body: JSON.stringify({ type: active.type, counterpartId: active.counterpart?.id, imageUrl: upData.url }) });
      await loadThread(active, true); void loadConversations();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر رفع الصورة"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const startEdit = (m: ChatMessage) => { setEditing(m); setInput(m.body || ""); textRef.current?.focus(); };
  const cancelEdit = () => { setEditing(null); setInput(""); };
  const remove = async (m: ChatMessage) => {
    if (!window.confirm("حذف هذه الرسالة؟")) return;
    try { await chatReq(`/messages/${m.id}`, { method: "DELETE" }); if (active) await loadThread(active); void loadConversations(); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذّر الحذف"); }
  };

  const pickMention = (m: Member) => {
    setInput((cur) => cur.replace(/@(\S*)$/u, "") + `@${m.name} `);
    setPendingMentions((cur) => (cur.some((c) => c.id === m.id) ? cur : [...cur, m]));
    setMentionOpen(false); textRef.current?.focus();
  };
  const onInputChange = (v: string) => { setInput(v); setMentionOpen(/(^|\s)@\S*$/u.test(v) && mentionables.length > 0); };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        {active ? (
          <button onClick={backToList} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="رجوع"><ArrowRight className="h-4 w-4" /></button>
        ) : <MessagesSquare className="h-5 w-5 text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-foreground">{active ? active.title : "محادثات الفريق"}</p>
          {active ? (
            <p className="truncate text-[11px] text-muted-foreground">{active.type === "owners" ? "مجموعة الملّاك" : active.type === "all" ? "كل المشرفين والملّاك" : (active.counterpart?.role === "owner" ? "مالك" : "مشرف")}</p>
          ) : <p className="text-[11px] text-muted-foreground">تواصل الملّاك والمشرفين</p>}
        </div>
        {headerActions}
        {onClose ? <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="إغلاق"><X className="h-4 w-4" /></button> : null}
      </div>

      {error ? <div className="bg-rose-50 px-4 py-1.5 text-[11px] font-bold text-rose-600 dark:bg-rose-500/10">{error}</div> : null}

      {!active ? (
        <ConversationList conversations={conversations} onOpen={openConversation} />
      ) : (
        <>
          <div ref={threadRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">ابدأ المحادثة — لا توجد رسائل بعد</p>
            ) : messages.map((m) => {
              const mine = m.senderId === myId;
              const mentionsMe = !m.deletedAt && Array.isArray(m.mentions) && myId != null && m.mentions.includes(myId);
              return (
                <MessageBubble key={m.id} m={m} mine={mine} mentionsMe={mentionsMe}
                  showSender={!mine && (active.type === "owners" || active.type === "all")}
                  onImage={(src) => setLightbox(src)} onEdit={() => startEdit(m)} onDelete={() => remove(m)} />
              );
            })}
          </div>

          {/* Composer */}
          <div className="relative border-t border-border/60 p-2.5">
            {mentionOpen && mentionables.length > 0 ? (
              <div className="absolute bottom-full left-2.5 right-2.5 mb-1 max-h-44 overflow-y-auto rounded-2xl border border-white/70 bg-white/97 p-1 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-[#171c24]/97">
                {mentionables.map((mb) => (
                  <button key={mb.id} onClick={() => pickMention(mb)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-right hover:bg-muted">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{initials(mb.name)}</span>
                    <span className="flex-1 truncate text-xs font-bold text-foreground">{mb.name}</span>
                    <span className="text-[10px] text-muted-foreground">{mb.role === "owner" ? "مالك" : "مشرف"}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {editing ? (
              <div className="mb-1.5 flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10">
                <span>تعديل الرسالة…</span><button onClick={cancelEdit}><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : null}

            <div className="flex items-end gap-1.5">
              <button onClick={() => void send()} disabled={sending || !input.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-40">
                {editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </button>
              <textarea ref={textRef} value={input} onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                dir={dirOf(input)} rows={1} placeholder="اكتب رسالة… (Ctrl+Enter للإرسال)"
                className="max-h-28 flex-1 resize-none rounded-2xl border border-border/80 bg-white/80 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 dark:bg-white/[0.06]" />
              {!editing ? (
                <>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} title="إرسال صورة" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  </button>
                  <button onClick={() => setMentionOpen((o) => !o)} title="منشن" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-primary"><AtSign className="h-4 w-4" /></button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickImage(f); }} />
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      {lightbox ? <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

function ConversationList({ conversations, onOpen }: { conversations: ConversationItem[]; onOpen: (c: ConversationItem) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-2">
      {conversations.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">لا توجد محادثات</p>
      ) : conversations.map((c) => (
        <button key={c.key} onClick={() => onOpen(c)} className="flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-right transition-colors hover:bg-muted/60">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${c.type === "direct" ? "bg-primary/10 text-primary" : c.type === "owners" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15" : "bg-violet-100 text-violet-700 dark:bg-violet-500/15"}`}>
            {c.type === "direct" ? (c.counterpart?.avatarUrl ? <img src={resolveMediaUrl(c.counterpart.avatarUrl) || ""} alt="" className="h-full w-full rounded-2xl object-cover" /> : initials(c.title)) : c.type === "owners" ? <Crown className="h-5 w-5" /> : <Users className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="truncate text-sm font-bold text-foreground">{c.title}</span>
                <RoleIcon role={c.counterpart?.role} className="h-3.5 w-3.5" />
              </span>
              {c.lastMessageAt ? <span className="shrink-0 text-[10px] text-muted-foreground">{timeLabel(c.lastMessageAt)}</span> : null}
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className="flex-1 truncate text-xs text-muted-foreground">{c.lastMessage?.preview || "—"}</span>
              {c.unreadCount > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span> : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function renderBody(body: string) {
  return body.split(/(@\S+)/g).map((p, i) => (p.startsWith("@") ? <span key={i} className="font-bold underline decoration-dotted">{p}</span> : <span key={i}>{p}</span>));
}

function MessageBubble({ m, mine, mentionsMe, showSender, onImage, onEdit, onDelete }: {
  m: ChatMessage; mine: boolean; mentionsMe: boolean; showSender: boolean;
  onImage: (src: string) => void; onEdit: () => void; onDelete: () => void;
}) {
  const deleted = Boolean(m.deletedAt);
  const imgSrc = m.imageUrl ? resolveMediaUrl(m.imageUrl) : null;
  // mine → right side (RTL items-start), flatten bottom-RIGHT corner.
  // received → left side (items-end), flatten bottom-LEFT corner.
  return (
    <div className={`group flex flex-col ${mine ? "items-start" : "items-end"}`}>
      {showSender && !deleted ? <span className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-bold text-muted-foreground">{m.senderName}<RoleIcon role={m.senderRole} className="h-3 w-3" /></span> : null}
      <div className={`relative max-w-[82%] rounded-2xl border px-3 py-2 text-sm ${
        deleted
          ? "rounded-br-md border-dashed border-border bg-transparent italic text-muted-foreground"
          : mine
            ? "rounded-br-md border-primary bg-primary text-white"
            : `rounded-bl-md border-slate-300/70 bg-slate-200 text-slate-900 dark:border-white/10 dark:bg-[#272c34] dark:text-slate-100 ${mentionsMe ? "ring-2 ring-amber-400" : ""}`
      }`}>
        {deleted ? <span>تم حذف الرسالة</span> : (
          <>
            {imgSrc ? <img src={imgSrc} alt="" onClick={() => onImage(imgSrc)} className="mb-1 max-h-52 cursor-zoom-in rounded-xl object-cover" /> : null}
            {m.body ? <p dir={dirOf(m.body)} className="whitespace-pre-wrap break-words leading-relaxed">{renderBody(m.body)}</p> : null}
            <div className={`mt-0.5 flex items-center gap-1.5 text-[9px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
              <span>{timeLabel(m.createdAt)}</span>{m.editedAt ? <span>· معدّلة</span> : null}
            </div>
            {mine ? (
              <div className="absolute -top-2 left-1 hidden gap-0.5 group-hover:flex">
                <button onClick={onEdit} title="تعديل" className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-white text-muted-foreground shadow hover:text-primary dark:bg-[#1a1f27]"><Pencil className="h-3 w-3" /></button>
                <button onClick={onDelete} title="حذف" className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-white text-muted-foreground shadow hover:text-rose-500 dark:bg-[#1a1f27]"><Trash2 className="h-3 w-3" /></button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
