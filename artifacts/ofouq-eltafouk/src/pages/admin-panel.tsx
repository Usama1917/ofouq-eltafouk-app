import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { 
  LayoutDashboard, Users, BookOpen, Video, MessageSquare, 
  Flag, Megaphone, Plus, Edit, Trash2, Eye, Check, X, ArrowUp, ArrowDown,
  TrendingUp, Coins, Award, FileText, LogOut, Crown, GraduationCap, ImagePlus, TicketPercent, Truck, Send, ChevronDown,
  Sun, Moon, Bot, Search, Info, Phone, MapPin, BookMarked, Activity, Bell, Smartphone, Mail, CalendarClock, ShieldCheck
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import {
  useGetAdminStats, useListAdminUsers, useDeleteAdminUser, useUpdateAdminUser, useCreateAdminUser,
  useListAdminBooks, useCreateAdminBook, useUpdateAdminBook, useDeleteAdminBook,
  useListModeratorPosts, useDeleteModeratorPost,
  useListAdminReports, useResolveAdminReport,
  useListAdminBanners, useCreateAdminBanner, useUpdateAdminBanner, useDeleteAdminBanner,
  customFetch,
} from "@workspace/api-client-react";
import { Logo } from "@/components/logo";
import { AcademicTab } from "./admin-academic";
import { toEnglishDigits } from "@/lib/format";

type Tab = "dashboard" | "users" | "books" | "posts" | "reports" | "banners" | "academic" | "subscriptionRequests" | "supportMessages" | "broadcastMessages" | "materials";
type TabMotionCustom = { direction: number; reduceMotion: boolean };
type Material = { id: number; name: string; classification?: string; sortOrder?: number; createdAt?: string };
type SubjectInsightItem = {
  subjectId: number;
  subjectName: string;
  subjectIcon?: string | null;
  yearName: string;
  subscribersCount: number;
  watchedSeconds: number;
};
type SupportConversationItem = {
  id: number | null;
  status: string;
  lastMessageAt: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    phone?: string | null;
    avatarUrl?: string | null;
  };
  lastMessage?: {
    id: number;
    body: string;
    senderRole: string;
    source?: string;
    automationKey?: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
};
type SupportMessageItem = {
  id: number;
  conversationId: number;
  senderId?: number | null;
  senderRole: string;
  body: string;
  source?: string;
  automationKey?: string | null;
  createdAt: string;
};
type AutomaticSupportMessageReportItem = {
  id: number;
  conversationId?: number | null;
  messageId?: number | null;
  automationKey: string;
  triggerLabel: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    phone?: string | null;
    avatarUrl?: string | null;
  };
};
type QuickReplyLanguage = "ar" | "en";
type QuickReplyItem = {
  id: string;
  body: string;
};
type AdminTheme = "light" | "dark";
type SubscriptionRequestItem = {
  id: number;
  code: string;
  codeImageUrl?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string;
  submittedAt: string;
  reviewedAt?: string | null;
  student: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
  };
  year: {
    id: number;
    name: string;
  };
  subject: {
    id: number;
    name: string;
  };
  codeTracking?: {
    normalizedCode: string;
    isDuplicate: boolean;
    usageCount: number;
    firstUsedAt: string;
    firstUsedBy: {
      id: number;
      name: string;
      email: string;
    };
    requestIds: number[];
  };
};
type BroadcastAudience =
  | "all"
  | "subscribed_subjects"
  | "not_subscribed_any"
  | "unopened_lessons"
  | "with_push_token"
  | "without_push_token";
type BroadcastActionType = "none" | "external_link" | "support_chat" | "subject_units" | "subject_subscribe" | "lesson";
type BroadcastSubjectOption = {
  id: number;
  name: string;
  unitLabel: string;
  isPublished: boolean;
};
type BroadcastYearOption = {
  id: number;
  name: string;
  isPublished: boolean;
  subjects: BroadcastSubjectOption[];
};
type BroadcastLessonOption = {
  id: number;
  title: string;
  isPublished: boolean;
  unitId: number;
  unitName: string;
  subjectId: number;
  subjectName: string;
  yearId: number;
  yearName: string;
  videoId?: number | null;
  videoTitle?: string | null;
  videoPublishStatus?: string | null;
};
type BroadcastPreviewSummary = {
  total: number;
  withPushToken: number;
  withoutPushToken: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
  sample: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    status: string;
    hasPushToken: boolean;
  }>;
};
type AdminUserListItem = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  avatarUrl?: string | null;
  joinedAt?: string | Date;
  lastActiveAt?: string | Date | null;
};
type SupportDraftTarget = {
  userId: number;
  requestKey: string;
  draft: string;
};

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "users", label: "المستخدمون", icon: Users },
  { id: "academic", label: "المحتوى الأكاديمي", icon: GraduationCap },
  { id: "subscriptionRequests", label: "طلبات الاشتراك", icon: TicketPercent },
  { id: "supportMessages", label: "رسائل المستخدمين", icon: MessageSquare },
  { id: "broadcastMessages", label: "إرسال الرسائل", icon: Send },
  { id: "books", label: "الكتب", icon: BookOpen },
  { id: "posts", label: "المنشورات", icon: MessageSquare },
  { id: "reports", label: "التقارير", icon: Flag },
  { id: "banners", label: "البنرات", icon: Megaphone },
];

const TAB_TRANSITION_ORDER: Tab[] = [
  "dashboard",
  "users",
  "academic",
  "subscriptionRequests",
  "supportMessages",
  "broadcastMessages",
  "materials",
  "books",
  "posts",
  "reports",
  "banners",
];

const adminTabContentVariants: Variants = {
  initial: ({ direction, reduceMotion }: TabMotionCustom) =>
    reduceMotion
      ? { opacity: 0 }
      : {
          opacity: 0,
          x: direction > 0 ? -28 : 28,
          y: 10,
          scale: 0.985,
          filter: "blur(8px)",
        },
  animate: ({ reduceMotion }: TabMotionCustom) =>
    reduceMotion
      ? { opacity: 1, transition: { duration: 0.12 } }
      : {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          transition: {
            type: "spring",
            stiffness: 340,
            damping: 34,
            mass: 0.8,
            opacity: { duration: 0.16 },
            filter: { duration: 0.18 },
          },
        },
  exit: ({ direction, reduceMotion }: TabMotionCustom) =>
    reduceMotion
      ? { opacity: 0, transition: { duration: 0.1 } }
      : {
          opacity: 0,
          x: direction > 0 ? 22 : -22,
          y: -8,
          scale: 0.99,
          filter: "blur(6px)",
          transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
        },
};

function getTabTransitionIndex(tab: Tab) {
  const index = TAB_TRANSITION_ORDER.indexOf(tab);
  return index >= 0 ? index : 0;
}

const DEFAULT_MATERIAL_OPTIONS = ["علوم", "رياضيات", "لغة عربية", "لغة إنجليزية", "تاريخ", "برمجة"];
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const QUICK_REPLIES_STORAGE_KEY = "ofouq-admin-support-quick-replies:v1";
const ADMIN_THEME_STORAGE_KEY = "ofouq-admin-theme:v1";
const ADMIN_DATE_LOCALE = "ar-EG-u-nu-latn";

const DEFAULT_QUICK_REPLIES: Record<QuickReplyLanguage, QuickReplyItem[]> = {
  ar: [
    {
      id: "ar-greeting",
      body: "أهلًا بك، شكرًا لتواصلك معنا. أرسل لنا تفاصيل المشكلة وسنساعدك في أسرع وقت.",
    },
    {
      id: "ar-received",
      body: "تم استلام رسالتك، سنراجع طلبك ونعود إليك بالتحديث المناسب.",
    },
    {
      id: "ar-screenshot",
      body: "من فضلك أرسل صورة واضحة للخطأ أو كود الاشتراك حتى نتمكن من فحص الطلب بدقة.",
    },
    {
      id: "ar-relogin",
      body: "يرجى تجربة تسجيل الخروج ثم تسجيل الدخول مرة أخرى. وإذا استمرت المشكلة سنكمل معك خطوة بخطوة.",
    },
    {
      id: "ar-resolved",
      body: "تم حل المشكلة من طرفنا. جرّب الآن وأخبرنا إذا كان كل شيء يعمل بشكل طبيعي.",
    },
    {
      id: "ar-escalate",
      body: "نعتذر عن الإزعاج، سنصعّد الحالة للفريق المختص ونتابع معك حتى يتم حلها.",
    },
  ],
  en: [
    {
      id: "en-greeting",
      body: "Hello, thank you for contacting us. Please share the issue details and we will help as soon as possible.",
    },
    {
      id: "en-received",
      body: "Your message has been received. We will review your request and get back to you with an update.",
    },
    {
      id: "en-screenshot",
      body: "Please send a clear screenshot of the issue or subscription code so we can check it accurately.",
    },
    {
      id: "en-relogin",
      body: "Please try signing out and signing in again. If the issue continues, we will guide you step by step.",
    },
    {
      id: "en-resolved",
      body: "The issue has been resolved on our side. Please try again and let us know if everything works correctly.",
    },
    {
      id: "en-escalate",
      body: "We apologize for the inconvenience. We will escalate this case to the relevant team and follow up with you.",
    },
  ],
};

function countUnreadSupportChats(conversations: SupportConversationItem[]) {
  return conversations.filter((conversation) => Number(conversation.unreadCount) > 0).length;
}

function formatAdminNumber(value: unknown, fallback = "—") {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : fallback;
}

function formatAdminDate(value: unknown, fallback = "—") {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return fallback;
  return toEnglishDigits(date.toLocaleDateString(ADMIN_DATE_LOCALE));
}

function formatAdminDateTime(value: unknown, fallback = "—") {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return fallback;
  return toEnglishDigits(date.toLocaleString(ADMIN_DATE_LOCALE));
}

function formatWatchHours(seconds: unknown) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (safeSeconds < 60) return "0 ساعة";

  const minutes = Math.ceil(safeSeconds / 60);
  if (minutes < 60) return `${formatAdminNumber(minutes)} دقيقة`;

  const hours = safeSeconds / 3600;
  const roundedHours = Math.round(hours * 10) / 10;
  return `${formatAdminNumber(roundedHours)} ساعة`;
}

function isAutomaticSupportMessage(message?: { source?: string; automationKey?: string | null } | null) {
  return message?.source === "automatic" || Boolean(message?.automationKey);
}

function isDirectAdminSupportMessage(message?: { source?: string } | null) {
  return message?.source === "admin_direct";
}

function parseAdminDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getUserActivityInfo(value: unknown, activeWithinDays: number) {
  const date = parseAdminDate(value);
  if (!date) {
    return {
      isActive: false,
      label: "لا يوجد نشاط",
      meta: "لم يتم تسجيل نشاط بعد",
    };
  }

  const ageMs = Date.now() - date.getTime();
  const isActive = ageMs <= activeWithinDays * 24 * 60 * 60 * 1000;
  return {
    isActive,
    label: isActive ? "نشط" : "غير نشط",
    meta: `آخر نشاط: ${formatAdminDateTime(date)}`,
  };
}

function renderSupportMessageBody(body: string) {
  return body.split("\n").map((line, index) => {
    const subjectMatch = line.match(/^(بخصوص طلب الإشتراك الخاص بكم لمادة )(.*)$/);
    const codeMatch = line.match(/^(بكود )(.*)$/);
    const match = subjectMatch || codeMatch;

    return (
      <span key={`${index}-${line}`}>
        {index > 0 ? <br /> : null}
        {match ? (
          <>
            {match[1]}
            <strong className="font-black">{match[2]}</strong>
          </>
        ) : (
          line
        )}
      </span>
    );
  });
}

function getInitialQuickReplies(): Record<QuickReplyLanguage, QuickReplyItem[]> {
  if (typeof window === "undefined") return DEFAULT_QUICK_REPLIES;

  try {
    const stored = window.localStorage.getItem(QUICK_REPLIES_STORAGE_KEY);
    if (!stored) return DEFAULT_QUICK_REPLIES;

    const parsed = JSON.parse(stored) as Partial<Record<QuickReplyLanguage, QuickReplyItem[]>>;
    const sanitize = (items: unknown, fallback: QuickReplyItem[]) => {
      if (!Array.isArray(items)) return fallback;
      return items
        .map((item) => ({
          id: String((item as QuickReplyItem)?.id ?? ""),
          body: String((item as QuickReplyItem)?.body ?? "").trim(),
        }))
        .filter((item) => item.id && item.body);
    };

    return {
      ar: sanitize(parsed.ar, DEFAULT_QUICK_REPLIES.ar),
      en: sanitize(parsed.en, DEFAULT_QUICK_REPLIES.en),
    };
  } catch {
    return DEFAULT_QUICK_REPLIES;
  }
}

function createQuickReplyId(language: QuickReplyLanguage) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${language}-${crypto.randomUUID()}`;
  }
  return `${language}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getInitialAdminTheme(): AdminTheme {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : "light";
}

// ── Preview Modal ──────────────────────────────────────────────────────────
function PreviewModal({ title, content, onConfirm, onCancel }: {
  title: string; content: React.ReactNode; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between bg-muted/20">
          <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" /> معاينة قبل النشر
          </h3>
          <button onClick={onCancel} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-muted/30 rounded-2xl p-4">
            <p className="text-xs font-bold text-muted-foreground mb-3">معاينة المحتوى كما سيظهر للمستخدمين</p>
            {content}
          </div>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 btn-primary justify-center py-3 text-sm">
              <Check className="w-4 h-4" /> تأكيد النشر
            </button>
            <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all">
              <X className="w-4 h-4 inline-block ml-1.5" /> إلغاء
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ImageLightbox({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-md sm:p-5"
      onClick={onClose}
      dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/25 bg-white/95 shadow-2xl ring-1 ring-primary/10 backdrop-blur-xl dark:bg-slate-950/95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-white/80 px-4 py-3.5 dark:bg-white/10 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">{title || "معاينة الصورة"}</p>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">صورة طلب الاشتراك المرفوعة من الطالب</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary dark:bg-white/10"
            aria-label="إغلاق معاينة الصورة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative flex min-h-[42vh] flex-1 items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-100 p-3 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:p-4">
          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-primary">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/15 border-t-primary" />
              <p className="text-xs font-black">جاري تحميل الصورة...</p>
            </div>
          ) : null}
          {status === "error" ? (
            <div className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/80 p-6 text-center text-rose-700">
              <ImagePlus className="mb-3 h-9 w-9" />
              <p className="text-sm font-black">تعذر تحميل الصورة</p>
              <p className="mt-1 text-xs font-semibold">قد تكون الصورة غير موجودة أو الرابط لم يعد متاحًا.</p>
            </div>
          ) : (
            <img
              src={src}
              alt={title || "preview"}
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
              className={`max-h-[76vh] w-full rounded-2xl border border-white/80 bg-white object-contain shadow-inner transition-opacity duration-200 ${
                status === "loaded" ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function RequestImagePreviewButton({
  src,
  title,
  onOpen,
}: {
  src: string;
  title: string;
  onOpen: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 248,
    height: 174,
    originTop: 0,
    originLeft: 0,
    originWidth: 14,
    originHeight: 14,
    arrowLeft: 124,
  });
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const openPreview = () => {
    if (typeof window === "undefined") return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (!isPreviewOpen) {
      const rect = iconRef.current?.getBoundingClientRect() ?? buttonRef.current?.getBoundingClientRect();
      if (rect) {
        const previewWidth = 248;
        const previewHeight = 174;
        const anchorCenterX = rect.left + rect.width / 2;
        const preferredLeft = anchorCenterX - previewWidth / 2;
        const nextLeft = Math.min(Math.max(12, preferredLeft), window.innerWidth - previewWidth - 12);
        setPosition({
          top: Math.max(12, rect.top - previewHeight - 10),
          left: nextLeft,
          width: previewWidth,
          height: previewHeight,
          originTop: rect.top,
          originLeft: rect.left,
          originWidth: rect.width,
          originHeight: rect.height,
          arrowLeft: Math.min(Math.max(18, anchorCenterX - nextLeft), previewWidth - 18),
        });
      }
      setPreviewStatus("loading");
    }
    setIsPreviewOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setIsPreviewOpen(false);
      closeTimerRef.current = null;
    }, 260);
  };

  const preview = (
    <AnimatePresence>
      {isPreviewOpen ? (
        <motion.div
          initial={{
            top: position.originTop,
            left: position.originLeft,
            width: position.originWidth,
            height: position.originHeight,
            opacity: 0.92,
            borderRadius: 8,
          }}
          animate={{
            top: position.top,
            left: position.left,
            width: position.width,
            height: position.height,
            opacity: 1,
            borderRadius: 16,
          }}
          exit={{
            top: position.originTop,
            left: position.originLeft,
            width: position.originWidth,
            height: position.originHeight,
            opacity: 0,
            borderRadius: 8,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.72 }}
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClose}
          className="fixed z-[60] overflow-hidden border border-white/70 bg-white/95 p-2 shadow-2xl shadow-primary/15 ring-1 ring-primary/10 backdrop-blur-xl dark:border-white/15 dark:bg-slate-950/95"
          style={{ transformOrigin: "50% 100%" }}
          dir="rtl"
        >
          <div
            className="absolute bottom-[-6px] h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/70 bg-white/95 dark:border-white/15 dark:bg-slate-950/95"
            style={{ left: position.arrowLeft }}
          />
          <div className="mb-2 flex h-5 items-center gap-2 px-1">
            <span className="h-2 w-2 rounded-full bg-primary ring-4 ring-primary/10" />
            <p className="truncate text-[11px] font-black text-foreground">{title}</p>
          </div>
          <div className="relative flex h-[136px] items-center justify-center overflow-hidden rounded-xl border border-primary/10 bg-slate-50 dark:bg-white/5">
            {previewStatus === "loading" ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-primary">
                <div className="h-7 w-7 animate-spin rounded-full border-3 border-primary/15 border-t-primary" />
                <span className="text-[11px] font-black">تحميل...</span>
              </div>
            ) : null}
            {previewStatus === "error" ? (
              <div className="flex flex-col items-center justify-center px-4 text-center text-rose-600">
                <ImagePlus className="mb-2 h-6 w-6" />
                <p className="text-[11px] font-black">تعذر عرض الصورة</p>
              </div>
            ) : (
              <img
                src={src}
                alt={title}
                onLoad={() => setPreviewStatus("loaded")}
                onError={() => setPreviewStatus("error")}
                className={`h-full w-full object-contain transition-opacity duration-200 ${previewStatus === "loaded" ? "opacity-100" : "opacity-0"}`}
              />
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        onMouseEnter={openPreview}
        onMouseLeave={scheduleClose}
        onFocus={openPreview}
        onBlur={scheduleClose}
        className="group inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary/10 px-2.5 py-1.5 text-xs font-black text-primary shadow-sm shadow-primary/5 transition-all hover:-translate-y-0.5 hover:bg-primary/20 hover:shadow-md hover:shadow-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {isPreviewOpen ? (
            <span className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <span
              ref={iconRef}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-md"
            >
              <Eye className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
            </span>
          )}
        </span>
        فتح الصورة
      </button>

      {typeof document !== "undefined" ? createPortal(preview, document.body) : preview}
    </>
  );
}

// ── Stats Card ────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div className={`admin-stat-card glass-card p-5 bg-gradient-to-br ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <div className={`w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <p className={`font-display font-black text-4xl ${color}`}>{formatAdminNumber(value)}</p>
    </div>
  );
}

function SubjectInsightsTimeline({
  items,
  loading,
  error,
}: {
  items: SubjectInsightItem[];
  loading: boolean;
  error: string;
}) {
  const maxWatchSeconds = Math.max(1, ...items.map((item) => Number(item.watchedSeconds) || 0));

  return (
    <div className="glass-card p-5 border-primary/15">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-black text-foreground">بيانات المواد</h3>
          <p className="text-xs font-semibold text-muted-foreground">المشتركين وساعات المشاهدة لكل مادة</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
          <TrendingUp className="h-3.5 w-3.5" />
          {formatAdminNumber(items.length, "0")} مادة
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-white/45 px-4 py-6 text-center text-sm font-semibold text-muted-foreground">
          جاري تحميل بيانات المواد...
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-white/45 px-4 py-6 text-center text-sm font-semibold text-muted-foreground">
          لا توجد مواد لعرضها حاليا
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const watchedSeconds = Number(item.watchedSeconds) || 0;
            const watchPercent = watchedSeconds > 0 ? Math.max(6, Math.round((watchedSeconds / maxWatchSeconds) * 100)) : 0;

            return (
              <div
                key={item.subjectId}
                className="relative overflow-hidden rounded-[1.65rem] border border-white/70 bg-slate-200/55 shadow-sm ring-1 ring-slate-900/5 dark:bg-white/10 dark:ring-white/10"
              >
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 rounded-[1.65rem] bg-gradient-to-l from-primary/35 via-sky-400/25 to-cyan-300/10 transition-[width] duration-500 ease-out"
                  style={{ width: `${watchPercent}%` }}
                />
                <div className="relative flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-xl">
                      {item.subjectIcon || "📚"}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-base font-black text-foreground">{item.subjectName}</h4>
                      <p className="mt-0.5 truncate text-xs font-bold text-muted-foreground">{item.yearName}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center">
                    <div className="rounded-2xl border border-white/70 bg-white/60 px-3 py-2 text-right shadow-sm backdrop-blur dark:bg-slate-950/25">
                      <p className="text-[11px] font-bold text-muted-foreground">النشاط</p>
                      <p className="mt-0.5 text-base font-black text-primary">{formatAdminNumber(watchPercent, "0")}%</p>
                    </div>
                    <div className="rounded-2xl border border-primary/15 bg-white/55 px-3 py-2 text-right shadow-sm backdrop-blur dark:bg-slate-950/20">
                      <p className="text-[11px] font-bold text-primary/80">المشتركين</p>
                      <p className="mt-0.5 text-base font-black text-primary">{formatAdminNumber(item.subscribersCount, "0")}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-200/70 bg-white/55 px-3 py-2 text-right shadow-sm backdrop-blur dark:bg-slate-950/20">
                      <p className="text-[11px] font-bold text-sky-700">ساعات المشاهدة</p>
                      <p className="mt-0.5 text-base font-black text-sky-700">{formatWatchHours(watchedSeconds)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────
function DashboardTab({ onOpenMaterials }: { onOpenMaterials: () => void }) {
  const { data: stats } = useGetAdminStats();
  const [subjectInsights, setSubjectInsights] = useState<SubjectInsightItem[]>([]);
  const [subjectInsightsLoading, setSubjectInsightsLoading] = useState(false);
  const [subjectInsightsError, setSubjectInsightsError] = useState("");

  const loadSubjectInsights = async () => {
    try {
      setSubjectInsightsLoading(true);
      setSubjectInsightsError("");
      const res = await fetch(apiPath("/api/admin/subject-insights"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل بيانات المواد");
      }
      if (!Array.isArray(data)) {
        throw new Error("استجابة غير متوقعة من الخادم");
      }
      setSubjectInsights(data);
    } catch (err: any) {
      setSubjectInsightsError(err?.message || "تعذر تحميل بيانات المواد");
      setSubjectInsights([]);
    } finally {
      setSubjectInsightsLoading(false);
    }
  };

  useEffect(() => {
    void loadSubjectInsights();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-display font-bold">نظرة عامة على المنصة</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="المستخدمون" value={stats?.totalUsers} icon={Users} color="text-primary" bg="from-blue-50/80 to-indigo-50/60" />
        <StatCard label="الكتب" value={stats?.totalBooks} icon={BookOpen} color="text-violet-600" bg="from-violet-50/80 to-purple-50/60" />
        <StatCard label="الفيديوهات" value={stats?.totalVideos} icon={Video} color="text-sky-600" bg="from-sky-50/80 to-cyan-50/60" />
        <StatCard label="المنشورات" value={stats?.totalPosts} icon={MessageSquare} color="text-orange-500" bg="from-orange-50/80 to-amber-50/60" />
        <StatCard label="المسابقات" value={stats?.totalGames} icon={Award} color="text-emerald-600" bg="from-emerald-50/80 to-teal-50/60" />
        <StatCard label="المكافآت" value={stats?.totalRewards} icon={Award} color="text-amber-500" bg="from-amber-50/80 to-yellow-50/60" />
        <StatCard label="النقاط المتداولة" value={stats?.totalPointsCirculating} icon={Coins} color="text-amber-600" bg="from-amber-50/80 to-orange-50/60" />
        <StatCard label="التقارير المعلقة" value={stats?.pendingReports} icon={Flag} color="text-rose-500" bg="from-rose-50/80 to-pink-50/60" />
      </div>
      <SubjectInsightsTimeline items={subjectInsights} loading={subjectInsightsLoading} error={subjectInsightsError} />
      <div className="glass-card p-5 border-primary/20">
        <button
          onClick={onOpenMaterials}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary font-bold hover:bg-primary/15 transition-all"
        >
          <span className="text-base">إدارة المواد (إضافة / حذف / ترتيب)</span>
          <FileText className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Materials Tab ────────────────────────────────────────────────────────
function MaterialsTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reorderLoadingId, setReorderLoadingId] = useState<number | null>(null);
  const [newMaterialForm, setNewMaterialForm] = useState({ name: "", classification: "" });

  const loadMaterials = async () => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await fetch(apiPath("/api/admin/materials"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل المواد");
      }
      if (!Array.isArray(data)) {
        throw new Error("استجابة غير متوقعة من الخادم");
      }
      setMaterials(data);
    } catch (err: any) {
      setLoadError(err?.message || "تعذر تحميل المواد");
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMaterials();
  }, []);

  const handleCreate = async () => {
    const name = newMaterialForm.name.trim();
    const classification = newMaterialForm.classification.trim();
    if (!name) {
      alert("اكتب اسم المادة أولًا");
      return;
    }
    if (!classification) {
      alert("اكتب التصنيف أولًا");
      return;
    }
    try {
      setCreating(true);
      const res = await fetch(apiPath("/api/admin/materials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, classification }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "تعذر إضافة المادة");
      }
      setNewMaterialForm({ name: "", classification: "" });
      await loadMaterials();
    } catch (err: any) {
      alert(err?.message || "تعذر إضافة المادة");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (material: Material) => {
    if (!confirm(`حذف المادة "${material.name}"؟`)) return;
    try {
      const res = await fetch(apiPath(`/api/admin/materials/${material.id}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "تعذر حذف المادة");
      }
      await loadMaterials();
    } catch (err: any) {
      alert(err?.message || "تعذر حذف المادة");
    }
  };

  const handleReorderMaterial = async (materialId: number, direction: "up" | "down") => {
    const currentIndex = materials.findIndex((material) => material.id === materialId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= materials.length) return;

    const reordered = [...materials];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;
    const orderedIds = reordered.map((material) => material.id);

    try {
      setReorderLoadingId(materialId);
      const res = await fetch(apiPath("/api/admin/materials/reorder"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "تعذر حفظ ترتيب المواد");
      }
      await loadMaterials();
    } catch (err: any) {
      alert(err?.message || "تعذر حفظ ترتيب المواد");
    } finally {
      setReorderLoadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">إدارة المواد ({materials.length})</h2>
      </div>

      <div className="glass-card p-5 border-primary/20 space-y-3">
        <h3 className="font-bold text-foreground">إضافة مادة جديدة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">اسم المادة</label>
            <input
              value={newMaterialForm.name}
              onChange={(e) => setNewMaterialForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="مثال: الأحياء الصف الثالث الثانوي"
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
            <input
              value={newMaterialForm.classification}
              onChange={(e) => setNewMaterialForm((prev) => ({ ...prev, classification: e.target.value }))}
              placeholder="مثال: الأحياء"
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div className="flex justify-start">
          <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm py-2.5 px-5 disabled:opacity-60">
            {creating ? "جاري الإضافة..." : "إضافة المادة"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">سيتم استخدام التصنيف مباشرة في فلترة الكتب واختيارات مادة الكتب والفيديوهات.</p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
          فشل تحميل المواد: {loadError}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-white/40">
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">اسم المادة</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">التصنيف</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">تاريخ الإضافة</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/30">
            {materials.map((material, rowIndex) => (
              <tr key={material.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-foreground">{material.name}</td>
                <td className="px-5 py-3.5">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary whitespace-nowrap">{material.classification || material.name}</span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {formatAdminDate(material.createdAt)}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReorderMaterial(material.id, "up")}
                      disabled={rowIndex === 0 || reorderLoadingId === material.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleReorderMaterial(material.id, "down")}
                      disabled={rowIndex === materials.length - 1 || reorderLoadingId === material.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(material)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && materials.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">
                  لا توجد مواد حتى الآن
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────
// ── Student / user details drawer ─────────────────────────────────────────
type StudentDetailsResponse = {
  user: {
    id: number; name: string; email: string; role: string; status: string;
    avatarUrl?: string | null; phone?: string | null; parentPhone?: string | null;
    age?: number | null; address?: string | null; governorate?: string | null;
    specialty?: string | null; qualifications?: string | null; howDidYouHear?: string | null;
    supportNeeded?: string | null; bio?: string | null;
    joinedAt?: string | null; lastActiveAt?: string | null;
  };
  hasActiveAccess: boolean;
  subscriptions: Array<{ id: number; status: string; source?: string | null; createdAt?: string | null; updatedAt?: string | null; subjectName?: string | null; subjectIcon?: string | null; yearName?: string | null }>;
  subscriptionRequests: Array<{ id: number; status: string; reviewNotes?: string | null; codeImageUrl?: string | null; submittedAt?: string | null; reviewedAt?: string | null; subjectName?: string | null; yearName?: string | null }>;
  activity: { watchedLessonsCount: number; completedLessonsCount: number; lastWatchedAt?: string | null; lastWatchedLessonTitle?: string | null; recent: Array<{ lessonTitle?: string | null; subjectName?: string | null; completed: boolean; progressPercent?: number | null; lastWatchedAt?: string | null }> };
  support: { hasConversation: boolean; status?: string | null; messagesCount: number; unreadCount: number; lastMessageAt?: string | null; lastMessagePreview?: string | null };
  notifications: { total: number; unread: number };
  devices: Array<{ id: number; platform: string; deviceName?: string | null; tokenPreview: string; enabled: boolean; lastRegisteredAt?: string | null; lastSeenAt?: string | null }>;
  onboarding?: {
    completed: boolean;
    completedAt?: string | null;
    heardAboutUs?: string | null;
    gradeLevel?: string | null;
    interestedSubjects?: string[] | null;
    mainGoal?: string | null;
    currentLevel?: string | null;
    learningPreference?: string | null;
    preferredStudyTime?: string | null;
  } | null;
};

// Maps stable onboarding option keys -> Arabic labels for the dashboard.
const ONBOARDING_LABELS: Record<string, Record<string, string>> = {
  heardAboutUs: { facebook: "فيسبوك", instagram: "إنستجرام", tiktok: "تيك توك", youtube: "يوتيوب", friend: "صديق / قريب", teacher: "مدرس / سنتر", sponsored_ad: "إعلان ممول", google: "بحث جوجل", other: "أخرى" },
  gradeLevel: { secondary_1: "الصف الأول الثانوي", secondary_2: "الصف الثاني الثانوي", secondary_3: "الصف الثالث الثانوي" },
  interestedSubjects: { physics: "الفيزياء", chemistry: "الكيمياء", biology: "الأحياء" },
  mainGoal: { follow_lessons: "متابعة شرح الدروس", more_exercises: "حل تدريبات أكثر", exam_review: "مراجعة قبل الامتحان", improve_level: "تحسين المستوى", catch_up: "تعويض دروس فاتته", organize_study: "تنظيم المذاكرة" },
  currentLevel: { excellent: "ممتاز", good: "جيد", average: "متوسط", need_help: "محتاج مساعدة" },
  learningPreference: { short_videos: "فيديوهات قصيرة", detailed_long: "شرح تفصيلي طويل", summaries: "ملخصات ومراجعات", questions_exercises: "أسئلة وتدريبات", live_sessions: "بث مباشر / حصص مباشرة", mix: "خليط من كل ده" },
  preferredStudyTime: { morning: "صباحًا", afternoon: "بعد الظهر", evening: "مساءً", night: "ليلًا", not_sure: "غير محدد" },
};
function onboardingLabel(group: string, key?: string | null) {
  if (!key) return null;
  return ONBOARDING_LABELS[group]?.[key] ?? key;
}

const DETAIL_ROLE_LABELS: Record<string, string> = { student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", moderator: "مشرف", owner: "مالك" };
const DETAIL_ROLE_COLORS: Record<string, string> = { student: "bg-blue-100 text-blue-700", teacher: "bg-emerald-100 text-emerald-700", parent: "bg-amber-100 text-amber-700", admin: "bg-violet-100 text-violet-700", moderator: "bg-violet-100 text-violet-700", owner: "bg-rose-100 text-rose-700" };

function detailStatusBadge(status?: string | null): { label: string; cls: string } {
  switch (status) {
    case "active": return { label: "نشط", cls: "bg-emerald-100 text-emerald-700" };
    case "approved": return { label: "مقبول", cls: "bg-emerald-100 text-emerald-700" };
    case "pending": return { label: "قيد المراجعة", cls: "bg-amber-100 text-amber-700" };
    case "rejected": return { label: "مرفوض", cls: "bg-red-100 text-red-600" };
    case "suspended": return { label: "موقوف", cls: "bg-red-100 text-red-600" };
    case "expired": return { label: "منتهٍ", cls: "bg-slate-100 text-slate-600" };
    case "open": return { label: "مفتوحة", cls: "bg-emerald-100 text-emerald-700" };
    case "closed": return { label: "مغلقة", cls: "bg-slate-100 text-slate-600" };
    default: return { label: status || "—", cls: "bg-muted text-muted-foreground" };
  }
}

function DetailRow({ label, value, icon: Icon }: { label: string; value?: React.ReactNode; icon?: any }) {
  const empty = value == null || value === "";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}{label}
      </span>
      <span className={`text-left text-sm ${empty ? "text-muted-foreground/60" : "font-semibold text-foreground"}`} dir="auto">
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function DetailSection({ title, icon: Icon, children, badge }: { title: string; icon: any; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-black text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</h4>
        {badge}
      </div>
      {children}
    </div>
  );
}

function DetailEmpty({ text }: { text: string }) {
  return <p className="py-2 text-center text-xs text-muted-foreground">{text}</p>;
}

function StudentDetailsDrawer({ user, onClose }: { user: AdminUserListItem | null; onClose: () => void }) {
  const open = user != null;
  const { data, isLoading, isError, refetch } = useQuery<StudentDetailsResponse>({
    queryKey: ["/api/admin/users", user?.id, "details"],
    queryFn: () => customFetch<StudentDetailsResponse>(`/api/admin/users/${user!.id}/details`, { method: "GET" }),
    enabled: open,
    staleTime: 30_000,
  });

  const u = data?.user ?? (user ? { ...user } : null);
  const role = u?.role ?? "";
  const title = role === "student" || role === "" ? "تفاصيل الطالب" : "تفاصيل المستخدم";
  const statusInfo = detailStatusBadge(u?.status);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex justify-start bg-slate-950/45 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.22 }}
            className="h-full w-full max-w-xl overflow-y-auto border-l border-white/60 bg-[#f6f8fc] text-right shadow-2xl dark:border-white/10 dark:bg-[#17181b]"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/50 bg-[#f6f8fc]/90 px-5 py-4 backdrop-blur dark:bg-[#17181b]/90">
              <h3 className="text-lg font-black text-foreground">{title}</h3>
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-foreground" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Header card */}
              <div className="glass-card flex items-center gap-4 p-4">
                {u?.avatarUrl ? (
                  <img src={u.avatarUrl} alt={u.name} className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-black text-primary">
                    {(u?.name || "?").trim().charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black text-foreground">{u?.name || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">{u?.email || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${DETAIL_ROLE_COLORS[role] || "bg-muted text-muted-foreground"}`}>{DETAIL_ROLE_LABELS[role] || role || "—"}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusInfo.cls}`}>{statusInfo.label}</span>
                    {data ? (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${data.hasActiveAccess ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {data.hasActiveAccess ? "مشترك حاليًا" : "بدون اشتراك"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="glass-card space-y-3 p-4">
                      <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="glass-card p-6 text-center">
                  <p className="text-sm font-bold text-red-600">تعذّر تحميل تفاصيل المستخدم.</p>
                  <button onClick={() => refetch()} className="mt-3 rounded-lg bg-muted px-4 py-2 text-xs font-bold hover:bg-muted/80">إعادة المحاولة</button>
                </div>
              ) : data ? (
                <>
                  {/* Section 1: account info */}
                  <DetailSection title="بيانات الحساب" icon={ShieldCheck}>
                    <DetailRow label="معرّف المستخدم" value={`#${data.user.id}`} />
                    <DetailRow label="الدور" value={DETAIL_ROLE_LABELS[data.user.role] || data.user.role} />
                    <DetailRow label="الحالة" value={<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusInfo.cls}`}>{statusInfo.label}</span>} />
                    <DetailRow label="البريد الإلكتروني" icon={Mail} value={<span dir="ltr">{data.user.email}</span>} />
                    <DetailRow label="رقم الهاتف" icon={Phone} value={data.user.phone ? <span dir="ltr">{data.user.phone}</span> : null} />
                    <DetailRow label="تاريخ الانضمام" icon={CalendarClock} value={formatAdminDateTime(data.user.joinedAt)} />
                    <DetailRow label="آخر نشاط" icon={Activity} value={data.user.lastActiveAt ? formatAdminDateTime(data.user.lastActiveAt) : null} />
                  </DetailSection>

                  {/* Section 2: profile data */}
                  <DetailSection title="بيانات الطالب" icon={Info}>
                    {[data.user.parentPhone, data.user.address, data.user.governorate, data.user.age, data.user.specialty, data.user.qualifications, data.user.howDidYouHear, data.user.supportNeeded, data.user.bio].every((v) => v == null || v === "") ? (
                      <DetailEmpty text="لا توجد بيانات إضافية" />
                    ) : (
                      <>
                        <DetailRow label="هاتف ولي الأمر" icon={Phone} value={data.user.parentPhone ? <span dir="ltr">{data.user.parentPhone}</span> : null} />
                        <DetailRow label="المحافظة" icon={MapPin} value={data.user.governorate} />
                        <DetailRow label="العنوان" icon={MapPin} value={data.user.address} />
                        <DetailRow label="السن" value={data.user.age != null ? String(data.user.age) : null} />
                        <DetailRow label="التخصص" value={data.user.specialty} />
                        <DetailRow label="المؤهلات" value={data.user.qualifications} />
                        <DetailRow label="كيف عرف عنا" value={data.user.howDidYouHear} />
                        <DetailRow label="الدعم المطلوب" value={data.user.supportNeeded} />
                        <DetailRow label="نبذة" value={data.user.bio} />
                      </>
                    )}
                  </DetailSection>

                  {/* Onboarding / Student Preferences */}
                  <DetailSection title="بيانات الانترو / تفضيلات الطالب" icon={GraduationCap}>
                    {data.onboarding ? (
                      <>
                        <DetailRow label="كيف عرف عنا" value={onboardingLabel("heardAboutUs", data.onboarding.heardAboutUs)} />
                        <DetailRow label="الصف الدراسي" value={onboardingLabel("gradeLevel", data.onboarding.gradeLevel)} />
                        <DetailRow
                          label="المواد المهتم بها"
                          value={
                            (data.onboarding.interestedSubjects ?? [])
                              .map((k) => onboardingLabel("interestedSubjects", k))
                              .filter(Boolean)
                              .join("، ") || null
                          }
                        />
                        <DetailRow label="الهدف الأساسي" value={onboardingLabel("mainGoal", data.onboarding.mainGoal)} />
                        <DetailRow label="المستوى الحالي" value={onboardingLabel("currentLevel", data.onboarding.currentLevel)} />
                        <DetailRow label="طريقة التعلم المفضلة" value={onboardingLabel("learningPreference", data.onboarding.learningPreference)} />
                        <DetailRow label="وقت المذاكرة المفضل" value={onboardingLabel("preferredStudyTime", data.onboarding.preferredStudyTime)} />
                        <DetailRow label="تاريخ إكمال الانترو" icon={CalendarClock} value={data.onboarding.completedAt ? formatAdminDateTime(data.onboarding.completedAt) : null} />
                      </>
                    ) : (
                      <DetailEmpty text="لم يكمل الطالب بيانات الانترو بعد" />
                    )}
                  </DetailSection>

                  {/* Section 3: subscriptions */}
                  <DetailSection title="الاشتراكات" icon={BookMarked}
                    badge={<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{formatAdminNumber(data.subscriptions.length)}</span>}>
                    {data.subscriptions.length === 0 ? (
                      <DetailEmpty text="لا توجد اشتراكات" />
                    ) : (
                      <div className="space-y-2">
                        {data.subscriptions.map((s) => {
                          const sb = detailStatusBadge(s.status);
                          return (
                            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-foreground">{s.subjectIcon ? `${s.subjectIcon} ` : ""}{s.subjectName || "—"}</p>
                                <p className="text-[11px] text-muted-foreground">{s.yearName || ""} · {formatAdminDateTime(s.createdAt)}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${sb.cls}`}>{sb.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {data.subscriptionRequests.length > 0 ? (
                      <div className="mt-3 border-t border-border/40 pt-3">
                        <p className="mb-2 text-xs font-bold text-muted-foreground">طلبات الاشتراك</p>
                        <div className="space-y-2">
                          {data.subscriptionRequests.map((r) => {
                            const rb = detailStatusBadge(r.status);
                            return (
                              <div key={r.id} className="rounded-xl bg-muted/40 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-bold text-foreground">{r.subjectName || "—"}</p>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${rb.cls}`}>{rb.label}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{formatAdminDateTime(r.submittedAt)}</p>
                                {r.reviewNotes ? <p className="mt-1 text-[11px] text-muted-foreground">ملاحظة: {r.reviewNotes}</p> : null}
                                {r.codeImageUrl ? <a href={r.codeImageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-bold text-primary hover:underline">عرض إثبات الدفع</a> : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </DetailSection>

                  {/* Section 4: learning activity */}
                  <DetailSection title="النشاط التعليمي" icon={Activity}>
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-muted/40 p-3 text-center">
                        <p className="text-lg font-black text-foreground">{formatAdminNumber(data.activity.watchedLessonsCount)}</p>
                        <p className="text-[11px] text-muted-foreground">دروس تمت مشاهدتها</p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3 text-center">
                        <p className="text-lg font-black text-foreground">{formatAdminNumber(data.activity.completedLessonsCount)}</p>
                        <p className="text-[11px] text-muted-foreground">دروس مكتملة</p>
                      </div>
                    </div>
                    <DetailRow label="آخر درس" value={data.activity.lastWatchedLessonTitle} />
                    <DetailRow label="آخر مشاهدة" value={data.activity.lastWatchedAt ? formatAdminDateTime(data.activity.lastWatchedAt) : null} />
                    {data.activity.recent.length === 0 ? (
                      <DetailEmpty text="لا يوجد نشاط حديث" />
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {data.activity.recent.map((r, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-1.5">
                            <p className="min-w-0 truncate text-xs font-semibold text-foreground">{r.lessonTitle || "—"}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{r.completed ? "مكتمل" : r.progressPercent != null ? `${r.progressPercent}%` : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>

                  {/* Section 5: support + notifications */}
                  <DetailSection title="الدعم والرسائل" icon={MessageSquare}
                    badge={data.support.unreadCount > 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">{formatAdminNumber(data.support.unreadCount)} غير مقروء</span> : undefined}>
                    {data.support.hasConversation ? (
                      <>
                        <DetailRow label="حالة المحادثة" value={<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${detailStatusBadge(data.support.status).cls}`}>{detailStatusBadge(data.support.status).label}</span>} />
                        <DetailRow label="عدد الرسائل" value={formatAdminNumber(data.support.messagesCount)} />
                        <DetailRow label="آخر رسالة" value={data.support.lastMessageAt ? formatAdminDateTime(data.support.lastMessageAt) : null} />
                        {data.support.lastMessagePreview ? <DetailRow label="نص آخر رسالة" value={data.support.lastMessagePreview} /> : null}
                      </>
                    ) : (
                      <DetailEmpty text="لا توجد محادثات دعم" />
                    )}
                    <div className="mt-2 border-t border-border/40 pt-2">
                      <DetailRow label="الإشعارات" icon={Bell} value={`${formatAdminNumber(data.notifications.total)} (${formatAdminNumber(data.notifications.unread)} غير مقروء)`} />
                    </div>
                  </DetailSection>

                  {/* Section 6: devices + push */}
                  <DetailSection title="الأجهزة والإشعارات" icon={Smartphone}
                    badge={<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{formatAdminNumber(data.devices.length)}</span>}>
                    {data.devices.length === 0 ? (
                      <DetailEmpty text="لا توجد أجهزة مسجّلة" />
                    ) : (
                      <div className="space-y-2">
                        {data.devices.map((d) => (
                          <div key={d.id} className="rounded-xl bg-muted/40 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-foreground">{d.deviceName || d.platform}</p>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${d.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{d.enabled ? "مفعّل" : "معطّل"}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{d.platform} · <span dir="ltr">{d.tokenPreview}</span></p>
                            <p className="text-[11px] text-muted-foreground">آخر ظهور: {formatAdminDateTime(d.lastSeenAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>
                </>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function UsersTab({
  selectedUserIds,
  onSelectedUserIdsChange,
  onSendNotification,
  onSendSupportMessage,
}: {
  selectedUserIds: number[];
  onSelectedUserIdsChange: (ids: number[]) => void;
  onSendNotification: (users: AdminUserListItem[]) => void;
  onSendSupportMessage: (users: AdminUserListItem[]) => void;
}) {
  const { data: rawUsers = [], refetch } = useListAdminUsers();
  const users = rawUsers as AdminUserListItem[];
  const deleteUser = useDeleteAdminUser();
  const updateUser = useUpdateAdminUser();
  const createUser = useCreateAdminUser();
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "student" });
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [activityMode, setActivityMode] = useState<"all" | "active" | "inactive">("all");
  const [activityDaysPreset, setActivityDaysPreset] = useState("7");
  const [customActivityDays, setCustomActivityDays] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<AdminUserListItem | null>(null);

  const ROLE_COLORS: Record<string, string> = { student: "bg-blue-100 text-blue-700", teacher: "bg-emerald-100 text-emerald-700", parent: "bg-amber-100 text-amber-700", admin: "bg-violet-100 text-violet-700", owner: "bg-rose-100 text-rose-700" };
  const ROLE_LABELS: Record<string, string> = { student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", owner: "مالك" };
  const selectedIdSet = new Set(selectedUserIds);
  const activityDays =
    activityDaysPreset === "custom"
      ? Math.max(1, Number.parseInt(customActivityDays || "7", 10) || 7)
      : Math.max(1, Number.parseInt(activityDaysPreset, 10) || 7);
  const selectedUsers = users.filter((user) => selectedIdSet.has(user.id));
  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    if (actionFilter === "suspendable" && user.status !== "active") return false;
    if (actionFilter === "activatable" && user.status === "active") return false;

    const activity = getUserActivityInfo(user.lastActiveAt, activityDays);
    if (activityMode === "active" && !activity.isActive) return false;
    if (activityMode === "inactive" && activity.isActive) return false;
    return true;
  });
  const visibleSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedIdSet.has(user.id));

  useEffect(() => {
    const currentIds = new Set(users.map((user) => user.id));
    const nextIds = selectedUserIds.filter((id) => currentIds.has(id));
    if (nextIds.length !== selectedUserIds.length) {
      onSelectedUserIdsChange(nextIds);
    }
  }, [users.length, selectedUserIds.join(",")]);

  const toggleUserSelection = (userId: number) => {
    onSelectedUserIdsChange(
      selectedIdSet.has(userId)
        ? selectedUserIds.filter((id) => id !== userId)
        : [...selectedUserIds, userId],
    );
  };

  const toggleVisibleSelection = () => {
    const visibleIds = filteredUsers.map((user) => user.id);
    if (visibleSelected) {
      onSelectedUserIdsChange(selectedUserIds.filter((id) => !visibleIds.includes(id)));
      return;
    }
    onSelectedUserIdsChange(Array.from(new Set([...selectedUserIds, ...visibleIds])));
  };

  const handleContactAction = (kind: "notification" | "support") => {
    if (selectedUsers.length === 0) {
      alert("حدد مستخدمًا واحدًا على الأقل أولًا");
      return;
    }
    setContactOpen(false);
    if (kind === "notification") {
      onSendNotification(selectedUsers);
    } else {
      onSendSupportMessage(selectedUsers);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-display font-bold">المستخدمون ({filteredUsers.length})</h2>
          {selectedUsers.length > 0 ? (
            <p className="mt-1 text-xs font-bold text-primary">
              تم تحديد {formatAdminNumber(selectedUsers.length)} مستخدم
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setContactOpen(true)}
            disabled={selectedUsers.length === 0}
            className="h-11 rounded-2xl border border-primary/25 bg-primary/10 px-4 text-sm font-black text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            تواصل
          </button>
          <button onClick={() => setAdding(true)} className="btn-primary h-11 text-sm px-5">
            <Plus className="w-4 h-4" /> مستخدم جديد
          </button>
        </div>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold text-foreground">إضافة مستخدم جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[["name","الاسم","نص"],["email","البريد الإلكتروني","بريد"],].map(([k,l,t]) => (
              <div key={k} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input type={t === "بريد" ? "email" : "text"} value={newUser[k as "name"|"email"]} onChange={e => setNewUser(p => ({...p,[k]:e.target.value}))}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">الدور</label>
              <select value={newUser.role} onChange={e => setNewUser(p => ({...p,role:e.target.value}))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                {Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { createUser.mutate({ data: newUser as any }, { onSuccess: () => { refetch(); setAdding(false); setNewUser({name:"",email:"",role:"student"}); }}); }} className="btn-primary text-sm py-2">
              <Check className="w-4 h-4" /> إضافة
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b border-white/40">
              <th className="w-14 px-5 py-4">
                <input
                  type="checkbox"
                  checked={visibleSelected}
                  onChange={toggleVisibleSelection}
                  aria-label="تحديد كل المستخدمين الظاهرين"
                  className="h-4 w-4"
                />
              </th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">الاسم</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">البريد</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">
                <div className="space-y-2">
                  <span>الدور</span>
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                    className="h-9 w-32 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground outline-none"
                  >
                    <option value="all">كل الأدوار</option>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </th>
              <th className="min-w-56 px-5 py-4 font-bold text-muted-foreground text-xs">
                <div className="space-y-2">
                  <span>النشاط</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={activityMode}
                      onChange={(event) => setActivityMode(event.target.value as typeof activityMode)}
                      className="h-9 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground outline-none"
                    >
                      <option value="all">الكل</option>
                      <option value="active">نشط</option>
                      <option value="inactive">غير نشط</option>
                    </select>
                    <select
                      value={activityDaysPreset}
                      onChange={(event) => setActivityDaysPreset(event.target.value)}
                      className="h-9 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground outline-none"
                    >
                      <option value="1">آخر يوم</option>
                      <option value="7">آخر 7 أيام</option>
                      <option value="30">آخر 30 يوم</option>
                      <option value="90">آخر 90 يوم</option>
                      <option value="custom">مخصص</option>
                    </select>
                    {activityDaysPreset === "custom" ? (
                      <input
                        value={customActivityDays}
                        onChange={(event) => setCustomActivityDays(event.target.value.replace(/[^\d]/g, ""))}
                        placeholder="أيام"
                        inputMode="numeric"
                        className="h-9 w-16 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground outline-none"
                      />
                    ) : null}
                  </div>
                </div>
              </th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">
                <div className="space-y-2">
                  <span>إجراءات</span>
                  <select
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
                    className="h-9 w-32 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground outline-none"
                  >
                    <option value="all">كل الإجراءات</option>
                    <option value="suspendable">تعليق</option>
                    <option value="activatable">تفعيل</option>
                  </select>
                </div>
              </th>
            </tr></thead>
            <tbody className="divide-y divide-white/30">
              {filteredUsers.map(u => {
                const activity = getUserActivityInfo(u.lastActiveAt, activityDays);
                return (
                <tr key={u.id} className={`hover:bg-white/30 transition-colors ${selectedIdSet.has(u.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(u.id)}
                      onChange={() => toggleUserSelection(u.id)}
                      aria-label={`تحديد ${u.name}`}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-foreground">{u.name}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground"}`}>{ROLE_LABELS[u.role] || u.role}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="space-y-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${activity.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{activity.label}</span>
                      <p className="text-[11px] text-muted-foreground">{activity.meta}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div dir="ltr" className="flex flex-nowrap items-center justify-between gap-2 whitespace-nowrap">
                      <button onClick={() => setDetailUser(u)} title="تفاصيل الطالب" aria-label="تفاصيل الطالب"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all"><Info className="h-3.5 w-3.5" />تفاصيل</button>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateUser.mutate({ id: u.id, data: { status: u.status === "active" ? "suspended" : "active" } as any }, { onSuccess: () => refetch() })}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition-all">{u.status === "active" ? "تعليق" : "تفعيل"}</button>
                        <button onClick={() => { if(confirm("هل أنت متأكد؟")) deleteUser.mutate({ id: u.id }, { onSuccess: () => refetch() }); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                      </div>
                    </div>
                  </td>
                </tr>
              );})}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    لا يوجد مستخدمون مطابقون للفلاتر الحالية.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {contactOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setContactOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-5 text-right shadow-2xl dark:bg-[#202124]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-foreground">تواصل مع المستخدمين</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    اختر طريقة التواصل مع {formatAdminNumber(selectedUsers.length)} مستخدم محدد.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setContactOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => handleContactAction("notification")}
                  className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-right transition-all hover:bg-primary/15"
                >
                  <div className="flex items-center gap-3">
                    <Send className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-black text-foreground">إرسال إشعار</p>
                      <p className="mt-1 text-xs text-muted-foreground">يفتح صفحة إرسال الرسائل والجمهور جاهز على المحددين.</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleContactAction("support")}
                  className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-right transition-all hover:bg-sky-100 dark:border-sky-400/20 dark:bg-sky-400/10"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-sky-600" />
                    <div>
                      <p className="text-sm font-black text-foreground">رسالة داخل التطبيق</p>
                      <p className="mt-1 text-xs text-muted-foreground">يفتح رسائل المستخدمين مع حقل إرسال جماعي مميز.</p>
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <StudentDetailsDrawer user={detailUser} onClose={() => setDetailUser(null)} />

    </div>
  );
}

// ── Books Tab ─────────────────────────────────────────────────────────────
function BooksTab() {
  const { data: booksData = [], refetch } = useListAdminBooks();
  const books = Array.isArray(booksData) ? (booksData as any[]) : [];
  const createBook = useCreateAdminBook();
  const updateBook = useUpdateAdminBook();
  const deleteBook = useDeleteAdminBook();
  const [adding, setAdding] = useState(false);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const [preview, setPreview] = useState<null | Record<string, string | boolean>>(null);
  const [pending, setPending] = useState<null | Record<string, string | boolean>>(null);
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [reorderLoadingId, setReorderLoadingId] = useState<number | null>(null);
  const [voucherForm, setVoucherForm] = useState({
    bookId: "",
    code: "",
    discountType: "percent",
    discountValue: "10",
    usageLimit: "",
    expiresAt: "",
    active: true,
  });
  const [newBook, setNewBook] = useState({
    title: "",
    subject: DEFAULT_MATERIAL_OPTIONS[0],
    description: "",
    priceEgp: "250",
    originalPriceEgp: "300",
    freeShipping: false,
    coverUrl: "",
  });
  const set = (k: string, v: string) => setNewBook((p) => ({ ...p, [k]: v }));
  const setVoucher = (k: string, v: string | boolean) => setVoucherForm((p) => ({ ...p, [k]: v }));
  const materialClassifications =
    materials.length > 0
      ? Array.from(
          new Set(
            materials.map((material) => String(material.classification ?? "").trim() || material.name).filter(Boolean),
          ),
        )
      : DEFAULT_MATERIAL_OPTIONS;
  const materialOptions = materialClassifications.includes(newBook.subject)
    ? materialClassifications
    : [newBook.subject, ...materialClassifications];

  const resetBookEditor = () => {
    setEditingBookId(null);
    setPreview(null);
    setPending(null);
    setCoverUploadProgress(null);
    setNewBook({
      title: "",
      subject: materialClassifications[0] ?? DEFAULT_MATERIAL_OPTIONS[0],
      description: "",
      priceEgp: "250",
      originalPriceEgp: "300",
      freeShipping: false,
      coverUrl: "",
    });
  };

  const buildBookPayload = (bookForm: Record<string, string | boolean>) => ({
    title: bookForm.title,
    description: bookForm.description,
    subject: bookForm.subject,
    category: bookForm.subject,
    priceEgp: parseInt(String(bookForm.priceEgp || 0), 10),
    originalPriceEgp: parseInt(String(bookForm.originalPriceEgp || 0), 10),
    pointsPrice: parseInt(String(bookForm.priceEgp || 0), 10),
    freeShipping: Boolean(bookForm.freeShipping),
    coverUrl: bookForm.coverUrl || undefined,
    author: "غير محدد",
  });

  const loadVouchers = async () => {
    try {
      setVoucherLoading(true);
      const res = await fetch(apiPath("/api/admin/book-vouchers"));
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setVouchers(data);
      }
    } catch {
      // no-op
    } finally {
      setVoucherLoading(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await fetch(apiPath("/api/admin/materials"));
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setMaterials(data);
      }
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    void loadMaterials();
    void loadVouchers();
  }, []);

  useEffect(() => {
    if (!materialOptions.includes(newBook.subject)) {
      setNewBook((prev) => ({ ...prev, subject: materialOptions[0] ?? DEFAULT_MATERIAL_OPTIONS[0] }));
    }
  }, [materialOptions, newBook.subject]);

  useEffect(() => {
    if (!voucherForm.bookId && books.length > 0) {
      setVoucherForm((p) => ({ ...p, bookId: String(books[0].id) }));
    }
  }, [books, voucherForm.bookId]);

  const handleCoverUpload = (file: File) => {
    const fd = new FormData();
    fd.append("cover", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiPath("/api/admin/books/upload-cover"));
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      setCoverUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setCoverUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        set("coverUrl", data.url);
      } else {
        alert("فشل رفع صورة الغلاف");
      }
    };
    xhr.onerror = () => {
      setCoverUploadProgress(null);
      alert("فشل رفع صورة الغلاف");
    };
    xhr.send(fd);
  };

  const handlePreview = () => {
    if (!newBook.title.trim()) {
      alert("عنوان الكتاب مطلوب");
      return;
    }
    setPending({ ...newBook });
    setPreview({ ...newBook });
  };

  const handleConfirm = () => {
    if (!pending) return;
    const payload = buildBookPayload(pending);

    if (editingBookId !== null) {
      updateBook.mutate({ id: editingBookId, data: payload as any }, {
        onSuccess: () => {
          refetch();
          setAdding(false);
          resetBookEditor();
        },
      });
      return;
    }

    createBook.mutate({ data: payload as any }, {
      onSuccess: () => {
        refetch();
        setAdding(false);
        resetBookEditor();
      },
    });
  };

  const handleEditBook = (book: any) => {
    setEditingBookId(book.id);
    setAdding(true);
    setPreview(null);
    setPending(null);
    setCoverUploadProgress(null);
    setNewBook({
      title: book.title ?? "",
      subject: book.subject ?? book.category ?? "علوم",
      description: book.description ?? "",
      priceEgp: String(book.priceEgp ?? book.pointsPrice ?? 0),
      originalPriceEgp: String(book.originalPriceEgp ?? book.priceEgp ?? book.pointsPrice ?? 0),
      freeShipping: Boolean(book.freeShipping),
      coverUrl: book.coverUrl ?? "",
    });
  };

  const handleCreateVoucher = async () => {
    try {
      if (!voucherForm.bookId) {
        alert("اختر الكتاب أولًا");
        return;
      }
      if (!voucherForm.code.trim()) {
        alert("اكتب كود الخصم");
        return;
      }

      const discountType = String(voucherForm.discountType || "percent");
      let discountValue = Number.parseInt(String(voucherForm.discountValue || "0"), 10) || 0;
      if (discountType === "percent") {
        discountValue = Math.max(1, Math.min(100, discountValue));
      } else if (discountType === "amount") {
        discountValue = Math.max(1, discountValue);
      } else {
        discountValue = 0;
      }

      const res = await fetch(apiPath("/api/admin/book-vouchers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: parseInt(voucherForm.bookId, 10),
          code: voucherForm.code,
          discountType,
          discountValue,
          discountPercent: discountType === "percent" ? discountValue : 0,
          usageLimit: voucherForm.usageLimit ? parseInt(voucherForm.usageLimit, 10) : null,
          expiresAt: voucherForm.expiresAt || null,
          active: voucherForm.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "فشل إنشاء الكود");
      setVoucherForm({
        bookId: books.length > 0 ? String(books[0].id) : "",
        code: "",
        discountType: "percent",
        discountValue: "10",
        usageLimit: "",
        expiresAt: "",
        active: true,
      });
      await loadVouchers();
    } catch (err: any) {
      alert(err?.message || "فشل إنشاء كود الخصم");
    }
  };

  const handleDeleteVoucher = async (id: number) => {
    if (!confirm("حذف كود الخصم؟")) return;
    await fetch(apiPath(`/api/admin/book-vouchers/${id}`), { method: "DELETE" });
    await loadVouchers();
  };

  const handleReorderBook = async (bookId: number, direction: "up" | "down") => {
    const currentIndex = books.findIndex((book) => book.id === bookId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= books.length) return;

    const reorderedBooks = [...books];
    const temp = reorderedBooks[currentIndex];
    reorderedBooks[currentIndex] = reorderedBooks[targetIndex];
    reorderedBooks[targetIndex] = temp;
    const orderedIds = reorderedBooks.map((book) => book.id);

    try {
      setReorderLoadingId(bookId);
      const res = await fetch(apiPath("/api/admin/books/reorder"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "فشل حفظ ترتيب الكتب");
      await refetch();
    } catch (err: any) {
      alert(err?.message || "فشل ترتيب الكتب");
    } finally {
      setReorderLoadingId(null);
    }
  };

  const discountLabel = voucherForm.discountType === "amount" ? "الخصم (ج.م)" : voucherForm.discountType === "free_shipping" ? "نوع الخصم" : "الخصم (%)";

  const formatVoucherDiscount = (voucher: any) => {
    const type = String(voucher.discountType ?? "percent");
    const percentFallback = Number(voucher.discountPercent ?? 0);
    const rawValue = Number(voucher.discountValue ?? 0);
    const value = type === "percent" && rawValue <= 0 ? percentFallback : rawValue;
    if (type === "amount") return `${formatAdminNumber(value, "0")} ج.م`;
    if (type === "free_shipping") return "شحن مجاني";
    return `${value}%`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">الكتب ({books.length})</h2>
        <button
          onClick={() => {
            if (adding) {
              setAdding(false);
              resetBookEditor();
              return;
            }
            resetBookEditor();
            setAdding(true);
          }}
          className="btn-primary text-sm py-2.5 px-5"
        >
          <Plus className="w-4 h-4" /> {adding ? "إغلاق النموذج" : "إضافة كتاب"}
        </button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold">{editingBookId !== null ? "تعديل كتاب منشور" : "إضافة كتاب جديد"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","عنوان الكتاب"],["description","الوصف"],["priceEgp","سعر البيع (ج.م)"],["originalPriceEgp","السعر قبل الخصم (ج.م)"]].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${k==="description"?"sm:col-span-2":""}`}>
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input value={String(newBook[k as keyof typeof newBook] ?? "")} onChange={e => set(k,e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">المادة</label>
              <select value={newBook.subject} onChange={e => set("subject",e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                {materialOptions.map((materialName) => <option key={materialName} value={materialName}>{materialName}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">صورة الغلاف</label>
              <label className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 cursor-pointer hover:bg-white transition-all">
                <div className="flex items-center gap-2 text-sm">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <span>{newBook.coverUrl ? "تم رفع صورة الغلاف" : "اختر صورة الغلاف"}</span>
                </div>
                {newBook.coverUrl && <img src={newBook.coverUrl} alt="cover" className="w-10 h-14 object-cover rounded-md border border-white/70" />}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleCoverUpload(file);
                  }}
                />
              </label>
              {coverUploadProgress !== null && (
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${coverUploadProgress}%` }} />
                </div>
              )}
            </div>
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={newBook.freeShipping}
                onChange={e => setNewBook(p => ({ ...p, freeShipping: e.target.checked }))}
                className="w-4 h-4 rounded border-border"
              />
              تفعيل الشحن المجاني لهذا الكتاب
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePreview} className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-amber-400/20 text-amber-700 border border-amber-200/50 font-semibold text-sm hover:bg-amber-400/30 transition-all">
              <Eye className="w-4 h-4" /> {editingBookId !== null ? "معاينة التعديلات" : "معاينة قبل النشر"}
            </button>
            {editingBookId !== null && (
              <button
                onClick={() => resetBookEditor()}
                className="px-4 py-2 rounded-xl border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/5 transition-all"
              >
                بدء إضافة كتاب جديد
              </button>
            )}
            <button
              onClick={() => {
                setAdding(false);
                resetBookEditor();
              }}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
      {preview && (
        <PreviewModal
          title="معاينة الكتاب"
          content={
            <div className="flex gap-4">
              {preview.coverUrl ? (
                <img src={String(preview.coverUrl)} alt="preview" className="w-20 h-28 rounded-xl object-cover border border-white/70 flex-shrink-0" />
              ) : (
                <div className="w-20 h-28 rounded-xl bg-gradient-to-br from-indigo-100 to-primary/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-8 h-8 text-primary/40" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-xl text-foreground mb-1">{preview.title}</h3>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-bold">{preview.subject}</span>
                <p className="text-sm text-foreground mt-2">{preview.description}</p>
                <p className="text-muted-foreground line-through text-xs mt-2">{preview.originalPriceEgp} ج.م</p>
                <p className="text-amber-500 font-bold">{preview.priceEgp} ج.م</p>
                {Boolean(preview.freeShipping) && <p className="text-emerald-600 text-xs font-bold mt-1 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> شحن مجاني</p>}
              </div>
            </div>
          }
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b border-white/40">
            {["العنوان","المادة","سعر البيع","قبل الخصم","شحن مجاني","إجراءات"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/30">
            {books.map((b, rowIndex) => (
              <tr key={b.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-foreground">
                  <div className="flex items-center gap-2">
                    {b.coverUrl ? <img src={b.coverUrl} alt={b.title} className="w-8 h-10 rounded object-cover border border-white/70" /> : null}
                    <span>{b.title}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="inline-flex max-w-[260px] px-2.5 py-1 rounded-2xl text-xs font-bold bg-primary/10 text-primary leading-relaxed whitespace-normal break-words"
                    title={b.subject || b.category}
                  >
                    {b.subject || b.category}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-bold text-amber-600">{formatAdminNumber(b.priceEgp ?? b.pointsPrice ?? 0, "0")} ج.م</td>
                <td className="px-5 py-3.5 text-muted-foreground">{formatAdminNumber(b.originalPriceEgp ?? b.priceEgp ?? b.pointsPrice ?? 0, "0")} ج.م</td>
                <td className="px-5 py-3.5">{b.freeShipping ? <span className="text-emerald-600 font-bold text-xs">مفعل</span> : <span className="text-muted-foreground text-xs">غير مفعل</span>}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReorderBook(b.id, "up")}
                      disabled={rowIndex === 0 || reorderLoadingId === b.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleReorderBook(b.id, "down")}
                      disabled={rowIndex === books.length - 1 || reorderLoadingId === b.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEditBook(b)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all inline-flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      تعديل
                    </button>
                    <button onClick={() => { if(confirm("حذف الكتاب؟")) deleteBook.mutate({ id: b.id }, { onSuccess: () => refetch() }); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><TicketPercent className="w-5 h-5 text-primary" /> أكواد الخصم (Voucher)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الكتاب المستهدف</label>
            <select
              value={voucherForm.bookId}
              onChange={e => setVoucher("bookId", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            >
              {books.length === 0 && <option value="">لا توجد كتب</option>}
              {books.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الكود</label>
            <input value={voucherForm.code} onChange={e => setVoucher("code", e.target.value)}
              placeholder="SAVE20"
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">نوع الخصم</label>
            <select
              value={voucherForm.discountType}
              onChange={e => setVoucher("discountType", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            >
              <option value="percent">نسبة مئوية</option>
              <option value="amount">مبلغ ثابت</option>
              <option value="free_shipping">شحن مجاني</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{discountLabel}</label>
            <input
              value={voucherForm.discountType === "free_shipping" ? "" : voucherForm.discountValue}
              onChange={e => setVoucher("discountValue", e.target.value)}
              disabled={voucherForm.discountType === "free_shipping"}
              placeholder={voucherForm.discountType === "amount" ? "مثال: 50" : voucherForm.discountType === "percent" ? "مثال: 20" : "لا يحتاج قيمة"}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">حد الاستخدام (اختياري)</label>
            <input value={voucherForm.usageLimit} onChange={e => setVoucher("usageLimit", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">تاريخ الانتهاء (اختياري)</label>
            <input type="datetime-local" value={voucherForm.expiresAt} onChange={e => setVoucher("expiresAt", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="flex items-end gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground pb-2">
              <input type="checkbox" checked={voucherForm.active} onChange={e => setVoucher("active", e.target.checked)} />
              مفعل
            </label>
            <button onClick={handleCreateVoucher} className="btn-primary text-sm py-2.5 px-4" disabled={books.length === 0}>إضافة الكود</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/50">
          <table className="w-full text-sm text-right">
            <thead className="bg-white/50">
              <tr>
                {["الكود","الكتاب","الخصم","الاستخدام","ينتهي","الحالة","إجراء"].map(h => <th key={h} className="px-4 py-3 text-xs font-bold text-muted-foreground">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {vouchers.map((v) => (
                <tr key={v.id} className="hover:bg-white/30">
                  <td className="px-4 py-3 font-bold text-foreground">{v.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.bookTitle || `#${v.bookId ?? "-"}`}</td>
                  <td className="px-4 py-3 text-primary font-bold">{formatVoucherDiscount(v)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.usedCount}/{v.usageLimit ?? "∞"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.expiresAt ? formatAdminDateTime(v.expiresAt) : "غير محدد"}</td>
                  <td className="px-4 py-3">{v.active ? <span className="text-emerald-600 text-xs font-bold">مفعل</span> : <span className="text-rose-600 text-xs font-bold">متوقف</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDeleteVoucher(v.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                  </td>
                </tr>
              ))}
              {!voucherLoading && vouchers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-sm">لا توجد أكواد خصم حتى الآن</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Posts Tab ─────────────────────────────────────────────────────────────
function PostsTab() {
  const { data: posts = [], refetch } = useListModeratorPosts();
  const deletePost = useDeleteModeratorPost();
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-display font-bold">إدارة المنشورات ({posts.length})</h2>
      <div className="space-y-3">
        {posts.map(p => (
          <div key={p.id} className="glass-card p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {p.authorName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-foreground">{p.authorName}</span>
                <span className="text-xs text-muted-foreground">{formatAdminDate(p.createdAt)}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{p.content}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{p.likesCount} إعجاب</span>
                <span>{p.commentsCount} تعليق</span>
              </div>
            </div>
            <button onClick={() => { if(confirm("حذف المنشور؟")) deletePost.mutate({ id: p.id }, { onSuccess: () => refetch() }); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all flex-shrink-0">حذف</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────
function ReportsTab() {
  const { data: reports = [], refetch } = useListAdminReports();
  const resolveReport = useResolveAdminReport();
  const STATUS_COLORS: Record<string, string> = { pending: "bg-amber-100 text-amber-700", resolved: "bg-emerald-100 text-emerald-700", dismissed: "bg-gray-100 text-gray-600", escalated: "bg-red-100 text-red-700" };
  const STATUS_LABELS: Record<string, string> = { pending: "قيد الانتظار", resolved: "تم الحل", dismissed: "مرفوض", escalated: "مُصعَّد" };
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-display font-bold">التقارير ({reports.length})</h2>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b border-white/40">
            {["النوع","السبب","الحالة","تاريخ الإبلاغ","إجراء"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/30">
            {reports.map(r => (
              <tr key={r.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold">{r.targetType}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{r.reason}</td>
                <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[r.status]||""}`}>{STATUS_LABELS[r.status]||r.status}</span></td>
                <td className="px-5 py-3.5 text-muted-foreground">{formatAdminDate(r.createdAt)}</td>
                <td className="px-5 py-3.5">
                  {r.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button onClick={() => resolveReport.mutate({ id: r.id, data: { status: "resolved", resolvedBy: "admin" } }, { onSuccess: () => refetch() })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all">حل</button>
                      <button onClick={() => resolveReport.mutate({ id: r.id, data: { status: "dismissed", resolvedBy: "admin" } }, { onSuccess: () => refetch() })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">رفض</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Banners Tab ───────────────────────────────────────────────────────────
function BannersTab() {
  const { data: banners = [], refetch } = useListAdminBanners();
  const createBanner = useCreateAdminBanner();
  const deleteBanner = useDeleteAdminBanner();
  const updateBanner = useUpdateAdminBanner();
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<null|Record<string,string>>(null);
  const [pending, setPending] = useState<null|Record<string,string>>(null);
  const [form, setForm] = useState({ title: "", description: "", linkUrl: "" });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));

  const handleConfirm = () => {
    if(!pending) return;
    createBanner.mutate({ data: { ...pending, active: true } as any }, {
      onSuccess: () => { refetch(); setAdding(false); setPreview(null); setPending(null); setForm({title:"",description:"",linkUrl:""}); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">البنرات والإعلانات ({banners.length})</h2>
        <button onClick={() => setAdding(!adding)} className="btn-primary text-sm py-2.5 px-5"><Plus className="w-4 h-4" /> إضافة بنر</button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold">إضافة بنر جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","عنوان البنر"],["description","الوصف"],["linkUrl","رابط الوجهة"]].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${k==="description"?"sm:col-span-2":""}`}>
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input value={form[k as keyof typeof form]} onChange={e=>set(k,e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPending({...form}); setPreview({...form}); }}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-amber-400/20 text-amber-700 border border-amber-200/50 font-semibold text-sm hover:bg-amber-400/30 transition-all">
              <Eye className="w-4 h-4" /> معاينة قبل النشر
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}
      {preview && (
        <PreviewModal
          title="معاينة البنر"
          content={
            <div className="w-full h-24 rounded-2xl bg-gradient-to-r from-primary to-blue-600 flex items-center justify-center text-white p-5">
              <div className="text-center">
                <p className="font-display font-black text-xl">{preview.title}</p>
                <p className="text-sm text-white/80 mt-1">{preview.description}</p>
              </div>
            </div>
          }
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {banners.map(b => (
          <div key={b.id} className={`glass-card p-5 flex items-start gap-4 ${!b.active?"opacity-50":""}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-foreground">{b.title}</h3>
                {!b.active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">غير نشط</span>}
              </div>
              <p className="text-sm text-muted-foreground">{b.description}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => updateBanner.mutate({ id: b.id, data: { active: !b.active } as any }, { onSuccess: () => refetch() })}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition-all">{b.active?"إيقاف":"تفعيل"}</button>
              <button onClick={() => { if(confirm("حذف البنر؟")) deleteBanner.mutate({ id: b.id }, { onSuccess: () => refetch() }); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubscriptionRequestsTab({
  token,
  onContactRequest,
}: {
  token: string | null;
  onContactRequest: (request: SubscriptionRequestItem) => void;
}) {
  const [requests, setRequests] = useState<SubscriptionRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; title?: string } | null>(null);
  const [expandedStudentIds, setExpandedStudentIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const loadRequests = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(apiPath("/api/admin/subscription-requests"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل طلبات الاشتراك");
      }
      if (!Array.isArray(data)) {
        throw new Error("استجابة غير متوقعة من الخادم");
      }
      setRequests(data);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل طلبات الاشتراك");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [token]);

  useEffect(() => {
    const nextIds = Array.from(new Set(requests.map((request) => request.student.id)));
    setExpandedStudentIds((current) => {
      if (nextIds.length === 0) return [];
      if (current.length === 0) return nextIds;
      return current.filter((id) => nextIds.includes(id));
    });
  }, [requests]);

  const handleReview = async (requestId: number, status: "approved" | "rejected") => {
    if (!token) return;
    const request = requests.find((item) => item.id === requestId);

    if (status === "approved" && request?.codeTracking?.isDuplicate) {
      const shouldContinue = confirm(
        `تحذير: هذا الكود مُستخدم ${request.codeTracking.usageCount} مرات من قبل. هل تريد اعتماد الطلب رغم التكرار؟`,
      );
      if (!shouldContinue) return;
    }

    let reviewNotes = "";
    if (status === "rejected") {
      reviewNotes = prompt("سبب الرفض (اختياري):")?.trim() ?? "";
    }

    try {
      setProcessingId(requestId);
      const res = await fetch(apiPath(`/api/admin/subscription-requests/${requestId}/status`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, reviewNotes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحديث حالة الطلب");
      }
      await loadRequests();
    } catch (err: any) {
      alert(err?.message || "تعذر تحديث حالة الطلب");
    } finally {
      setProcessingId(null);
    }
  };

  type StudentRequestGroup = {
    student: SubscriptionRequestItem["student"];
    latestSubmittedAt: string;
    requests: SubscriptionRequestItem[];
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredRequests = normalizedSearchTerm
    ? requests.filter((request) =>
        [
          request.student.name,
          request.student.email,
          request.subject.name,
          request.code,
          request.codeTracking?.normalizedCode ?? "",
        ].some((value) => value.toLowerCase().includes(normalizedSearchTerm)),
      )
    : requests;

  const studentGroups = Array.from(
    filteredRequests
      .reduce<Map<number, StudentRequestGroup>>((groups, request) => {
        const existing = groups.get(request.student.id);
        if (!existing) {
          groups.set(request.student.id, {
            student: request.student,
            latestSubmittedAt: request.submittedAt,
            requests: [request],
          });
          return groups;
        }

        existing.requests.push(request);
        if (new Date(request.submittedAt).getTime() > new Date(existing.latestSubmittedAt).getTime()) {
          existing.latestSubmittedAt = request.submittedAt;
        }
        return groups;
      }, new Map())
      .values(),
  ).sort((a, b) => new Date(b.latestSubmittedAt).getTime() - new Date(a.latestSubmittedAt).getTime());

  const toggleStudentSlide = (studentId: number) => {
    setExpandedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId],
    );
  };

  const handleContactRequest = (request: SubscriptionRequestItem) => {
    onContactRequest(request);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">
          طلبات الاشتراك ({filteredRequests.length}) · الطلاب ({studentGroups.length})
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative w-72 max-w-[52vw]">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="بحث بالاسم أو الإيميل أو المادة أو الكود"
              className="h-10 w-full rounded-xl border border-border bg-white/65 py-2 pl-3 pr-9 text-sm font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-white focus:ring-2 focus:ring-primary/10 dark:bg-white/10 dark:focus:bg-white/15"
              dir="rtl"
            />
          </div>
          <button onClick={() => void loadRequests()} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-all">
            تحديث
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {loading && requests.length === 0 ? (
          <div className="glass-card p-7 text-center text-sm text-muted-foreground">جاري تحميل طلبات الاشتراك...</div>
        ) : null}

        {!loading && requests.length === 0 ? (
          <div className="glass-card p-7 text-center text-sm text-muted-foreground">لا توجد طلبات اشتراك حالياً</div>
        ) : null}

        {!loading && requests.length > 0 && studentGroups.length === 0 ? (
          <div className="glass-card p-7 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للبحث</div>
        ) : null}

        {studentGroups.map((group) => {
          const isExpanded = expandedStudentIds.includes(group.student.id);
          const pendingCount = group.requests.filter((request) => request.status === "pending").length;
          const approvedCount = group.requests.filter((request) => request.status === "approved").length;
          const rejectedCount = group.requests.filter((request) => request.status === "rejected").length;
          const duplicateCount = group.requests.filter((request) => request.codeTracking?.isDuplicate).length;

          return (
            <div key={group.student.id} className="glass-card overflow-hidden">
              <button
                type="button"
                onClick={() => toggleStudentSlide(group.student.id)}
                className="flex w-full flex-col gap-4 px-5 py-4 text-right transition-all hover:bg-white/25 md:flex-row md:items-center md:justify-between"
                aria-expanded={isExpanded}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-black text-primary">
                    {group.student.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-black text-foreground">{group.student.name}</h3>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
                        {formatAdminNumber(group.requests.length)} طلب
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{group.student.email}</p>
                    {group.student.phone ? <p className="mt-0.5 text-xs text-muted-foreground">{group.student.phone}</p> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700">
                    قيد المراجعة {formatAdminNumber(pendingCount)}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                    مقبول {formatAdminNumber(approvedCount)}
                  </span>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-700">
                    مرفوض {formatAdminNumber(rejectedCount)}
                  </span>
                  {duplicateCount > 0 ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-black text-red-700">
                      مكرر {formatAdminNumber(duplicateCount)}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    آخر طلب: {formatAdminDateTime(group.latestSubmittedAt)}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/35 px-3 pb-3">
                      <div className="overflow-x-auto pt-3">
                        <table className="w-full min-w-[900px] text-sm text-right">
                          <thead>
                            <tr className="border-b border-white/35">
                              <th className="px-3 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">السنة / المادة</th>
                              <th className="px-3 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">الكود</th>
                              <th className="px-3 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">الصورة</th>
                              <th className="px-3 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">الحالة</th>
                              <th className="px-3 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">التاريخ</th>
                              <th className="px-3 py-3 text-xs font-bold text-muted-foreground whitespace-nowrap">إجراء</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/25">
                            {group.requests.map((request) => (
                              <tr key={request.id} className="align-middle transition-colors hover:bg-white/25">
                                <td className="px-3 py-3.5 min-w-[190px] leading-relaxed">
                                  <p className="font-semibold text-foreground">{request.year.name}</p>
                                  <p className="text-xs text-muted-foreground">{request.subject.name}</p>
                                </td>
                                <td className="px-3 py-3.5 min-w-[220px]">
                                  <p className="font-mono text-xs">{request.code}</p>
                                  {request.codeTracking?.isDuplicate ? (
                                    <div className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 leading-relaxed break-words">
                                      <p className="font-bold">تحذير: كود مكرر ({request.codeTracking.usageCount} مرات)</p>
                                      <p>
                                        أول استخدام: {request.codeTracking.firstUsedBy.name} ·{" "}
                                        {formatAdminDate(request.codeTracking.firstUsedAt)}
                                      </p>
                                      <p className="font-mono">الطلبات: {request.codeTracking.requestIds.map((id) => `#${id}`).join("، ")}</p>
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-[11px] text-emerald-700">الاستخدام الأول لهذا الكود</p>
                                  )}
                                </td>
                                <td className="px-3 py-3.5 min-w-[120px]">
                                  {request.codeImageUrl ? (
                                    <RequestImagePreviewButton
                                      src={apiPath(request.codeImageUrl)}
                                      title={`${request.student.name} · ${request.subject.name}`}
                                      onOpen={() =>
                                        setPreviewImage({
                                          src: apiPath(request.codeImageUrl || ""),
                                          title: `${request.student.name} · ${request.subject.name}`,
                                        })
                                      }
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">لا توجد صورة</span>
                                  )}
                                </td>
                                <td className="px-3 py-3.5 min-w-[170px]">
                                  <span
                                    className={`inline-flex min-h-[2.1rem] max-w-[8.5rem] items-center justify-center rounded-full px-2.5 py-1 text-center text-xs font-bold leading-[1.35] whitespace-normal break-words ${
                                      request.status === "approved"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : request.status === "rejected"
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-amber-100 text-amber-700"
                                    }`}
                                  >
                                    {request.status === "approved" ? "مقبول" : request.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                                  </span>
                                  {request.reviewNotes ? <p className="mt-1 max-w-[210px] text-xs leading-relaxed text-muted-foreground">{request.reviewNotes}</p> : null}
                                </td>
                                <td className="px-3 py-3.5 min-w-[170px] whitespace-nowrap text-xs text-muted-foreground">
                                  {formatAdminDateTime(request.submittedAt)}
                                </td>
                                <td className="px-3 py-3.5 min-w-[130px]">
                                  <div className="flex min-w-[120px] flex-col gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleContactRequest(request)}
                                      className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20"
                                    >
                                      التواصل
                                    </button>
                                    <button
                                      onClick={() => void handleReview(request.id, "approved")}
                                      disabled={processingId === request.id || request.status === "approved"}
                                      className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-200 disabled:opacity-50"
                                    >
                                      اعتماد
                                    </button>
                                    <button
                                      onClick={() => void handleReview(request.id, "rejected")}
                                      disabled={processingId === request.id || request.status === "rejected"}
                                      className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700 transition-all hover:bg-rose-200 disabled:opacity-50"
                                    >
                                      رفض
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {previewImage ? (
          <ImageLightbox
            src={previewImage.src}
            title={previewImage.title}
            onClose={() => setPreviewImage(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BroadcastMessagesTab({
  token,
  targetUsers = [],
  onClearTargetUsers,
  onTargetUsersChange,
}: {
  token: string | null;
  targetUsers?: AdminUserListItem[];
  onClearTargetUsers?: () => void;
  onTargetUsersChange?: (users: AdminUserListItem[]) => void;
}) {
  const [years, setYears] = useState<BroadcastYearOption[]>([]);
  const [lessonOptions, setLessonOptions] = useState<BroadcastLessonOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<BroadcastPreviewSummary | null>(null);
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [role, setRole] = useState<"all" | "student" | "teacher" | "admin" | "owner">("student");
  const [status, setStatus] = useState<"active" | "suspended" | "all">("active");
  const [push, setPush] = useState<"any" | "has" | "none">("any");
  const [joinedWithinDays, setJoinedWithinDays] = useState("");
  const [selectedYearIds, setSelectedYearIds] = useState<number[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageTitleEn, setMessageTitleEn] = useState("");
  const [messageBodyEn, setMessageBodyEn] = useState("");
  const [tone, setTone] = useState<"primary" | "success" | "warning" | "danger">("primary");
  const [actionType, setActionType] = useState<BroadcastActionType>("none");
  const [externalUrl, setExternalUrl] = useState("");
  const [actionSubjectId, setActionSubjectId] = useState("");
  const [actionLessonId, setActionLessonId] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientMatches, setRecipientMatches] = useState<AdminUserListItem[]>([]);
  const [recipientSearchLoading, setRecipientSearchLoading] = useState(false);
  const allSubjects = years.flatMap((year) => year.subjects.map((subject) => ({ ...subject, yearId: year.id, yearName: year.name })));
  const selectedActionLesson = lessonOptions.find((lesson) => String(lesson.id) === actionLessonId) ?? null;
  const targetUserIds = targetUsers.map((user) => user.id);
  const targetUserKey = targetUserIds.join(",");
  const normalizedRecipientSearch = recipientSearch.trim();

  const audienceLabels: Record<BroadcastAudience, string> = {
    all: "الكل",
    subscribed_subjects: "مشتركين في مواد بعينها",
    not_subscribed_any: "غير مشتركين في أي مادة",
    unopened_lessons: "مشتركين وعندهم دروس لم يفتحوها",
    with_push_token: "لديهم إشعارات جهاز مفعلة",
    without_push_token: "ليس لديهم إشعارات جهاز مفعلة",
  };

  function buildFilters() {
    if (targetUserIds.length > 0) {
      return {
        audience: "all",
        role: "all",
        status: "all",
        push: "any",
        yearIds: [],
        subjectIds: [],
        joinedWithinDays: null,
        selectedUserIds: targetUserIds,
      };
    }

    return {
      audience,
      role,
      status,
      push,
      yearIds: selectedYearIds,
      subjectIds: selectedSubjectIds,
      joinedWithinDays: joinedWithinDays.trim() ? Number(joinedWithinDays) : null,
      selectedUserIds: targetUserIds,
    };
  }

  function buildAction() {
    if (actionType === "external_link") return { type: actionType, url: externalUrl.trim() };
    if (actionType === "subject_units" || actionType === "subject_subscribe") {
      return { type: actionType, subjectId: actionSubjectId ? Number(actionSubjectId) : null };
    }
    if (actionType === "lesson") {
      return { type: actionType, lessonId: actionLessonId ? Number(actionLessonId) : null };
    }
    return { type: actionType };
  }

  function selectIndividualRecipient(user: AdminUserListItem) {
    onTargetUsersChange?.([user]);
    setRecipientSearch("");
    setRecipientMatches([]);
    setSuccess("");
    setError("");
  }

  async function loadOptions() {
    if (!token) return;
    try {
      setLoadingOptions(true);
      setError("");
      const res = await fetch(apiPath("/api/admin/notifications/options"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "تعذر تحميل اختيارات الإرسال");
      setYears(Array.isArray((data as any).years) ? (data as any).years : []);
      setLessonOptions(Array.isArray((data as any).lessons) ? (data as any).lessons : []);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل اختيارات الإرسال");
    } finally {
      setLoadingOptions(false);
    }
  }

  async function loadPreview() {
    if (!token) return;
    try {
      setPreviewLoading(true);
      setError("");
      const res = await fetch(apiPath("/api/admin/notifications/preview"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filters: buildFilters() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "تعذر حساب الجمهور");
      setPreview((data as any).summary ?? null);
    } catch (err: any) {
      setError(err?.message || "تعذر حساب الجمهور");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    void loadOptions();
  }, [token]);

  useEffect(() => {
    if (!token || normalizedRecipientSearch.length < 2) {
      setRecipientMatches([]);
      setRecipientSearchLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setRecipientSearchLoading(true);
        setError("");
        const res = await fetch(
          apiPath(`/api/admin/notifications/recipients?q=${encodeURIComponent(normalizedRecipientSearch)}`),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error((data as any)?.error || "تعذر البحث عن المستخدم");
        if (active) setRecipientMatches(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (active) {
          setRecipientMatches([]);
          setError(err?.message || "تعذر البحث عن المستخدم");
        }
      } finally {
        if (active) setRecipientSearchLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, normalizedRecipientSearch]);

  useEffect(() => {
    if (targetUsers.length === 0) return;
    setAudience("all");
    setRole("all");
    setStatus("all");
    setPush("any");
    setJoinedWithinDays("");
    setSelectedYearIds([]);
    setSelectedSubjectIds([]);
  }, [targetUserKey]);

  useEffect(() => {
    void loadPreview();
  }, [token, audience, role, status, push, joinedWithinDays, selectedYearIds.join(","), selectedSubjectIds.join(","), targetUserKey]);

  function toggleId(id: number, selected: number[], setter: (value: number[]) => void) {
    setter(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function toggleYearSubjects(year: BroadcastYearOption) {
    const subjectIds = year.subjects.map((subject) => subject.id);
    const allSelected = subjectIds.every((id) => selectedSubjectIds.includes(id));
    setSelectedSubjectIds(
      allSelected
        ? selectedSubjectIds.filter((id) => !subjectIds.includes(id))
        : Array.from(new Set([...selectedSubjectIds, ...subjectIds])),
    );
  }

  async function sendBroadcast() {
    if (!token || sending) return;
    if (!messageTitle.trim() || !messageBody.trim()) {
      setError("اكتب عنوان الرسالة ومحتواها بالعربية قبل الإرسال");
      return;
    }
    if (!messageTitleEn.trim() || !messageBodyEn.trim()) {
      setError("اكتب عنوان الرسالة ومحتواها بالإنجليزية قبل الإرسال");
      return;
    }
    if (actionType === "external_link" && !/^https?:\/\//i.test(externalUrl.trim())) {
      setError("الرابط الخارجي يجب أن يبدأ بـ http أو https");
      return;
    }

    const count = preview?.total ?? 0;
    if (count <= 0) {
      setError("لا يوجد مستخدمون مطابقون للفلاتر الحالية");
      return;
    }

    const confirmed = confirm(`سيتم إرسال الرسالة إلى ${formatAdminNumber(count)} مستخدم. هل تريد المتابعة؟`);
    if (!confirmed) return;

    try {
      setSending(true);
      setError("");
      setSuccess("");
      const res = await fetch(apiPath("/api/admin/notifications/send"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: messageTitle.trim(),
          body: messageBody.trim(),
          titleEn: messageTitleEn.trim(),
          bodyEn: messageBodyEn.trim(),
          tone,
          filters: buildFilters(),
          action: buildAction(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "تعذر إرسال الرسالة");
      const notificationCount = Number((data as any).notificationCount ?? 0);
      const pushRegisteredCount = Number((data as any).pushRegisteredCount ?? 0);
      const pushSentCount = Number((data as any).pushSentCount ?? 0);
      const pushTicketErrorCount = Number((data as any).pushTicketErrorCount ?? 0);
      const pushErrorMessages = Array.isArray((data as any).pushErrorMessages)
        ? (data as any).pushErrorMessages.filter((message: unknown) => typeof message === "string" && message.trim())
        : [];
      const pushStatus =
        pushRegisteredCount <= 0
          ? " لا توجد أجهزة مسجلة لاستقبال إشعارات خارج التطبيق."
          : pushTicketErrorCount > 0
            ? ` أخطاء Expo: ${formatAdminNumber(pushTicketErrorCount)}${pushErrorMessages.length ? ` (${pushErrorMessages.join(" / ")})` : ""}.`
            : "";
      setSuccess(
        `تم إرسال ${formatAdminNumber(notificationCount)} إشعار. إشعارات الجهاز المرسلة: ${formatAdminNumber(pushSentCount)}.${pushStatus}`,
      );
      setMessageTitle("");
      setMessageBody("");
      setMessageTitleEn("");
      setMessageBodyEn("");
      await loadPreview();
    } catch (err: any) {
      setError(err?.message || "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-display font-bold">إرسال الرسائل للمستخدمين</h2>
          <p className="text-sm text-muted-foreground mt-1">فلتر الجمهور، اكتب الرسالة، واختر لينك أو وصول سريع داخل التطبيق.</p>
        </div>
        <button
          onClick={() => void loadPreview()}
          className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-all disabled:opacity-50"
          disabled={previewLoading}
        >
          {previewLoading ? "جاري الحساب..." : "تحديث المعاينة"}
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-lg">محتوى الرسالة</h3>
          </div>

          <p className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] font-bold text-primary">
            تُرسَل الرسالة لكل مستخدم بلغته: من لغة جهازه عربية تصله النسخة العربية، ومن لغته إنجليزية تصله النسخة الإنجليزية.
          </p>

          <label className="space-y-1.5 block">
            <span className="text-xs font-bold text-muted-foreground">عنوان الرسالة (عربي)</span>
            <input
              value={messageTitle}
              onChange={(event) => setMessageTitle(event.target.value)}
              dir="rtl"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
              placeholder="مثال: تنبيه مهم بخصوص مادة الأحياء"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-bold text-muted-foreground">Message title (English)</span>
            <input
              value={messageTitleEn}
              onChange={(event) => setMessageTitleEn(event.target.value)}
              dir="ltr"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
              placeholder="e.g. Important notice about Biology"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-bold text-muted-foreground">محتوى الرسالة (عربي)</span>
            <textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              dir="rtl"
              className="min-h-[140px] w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 outline-none focus:border-primary"
              placeholder="اكتب محتوى الرسالة الذي سيظهر للمستخدم في صفحة الإشعارات وعلى إشعار الجهاز..."
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-bold text-muted-foreground">Message body (English)</span>
            <textarea
              value={messageBodyEn}
              onChange={(event) => setMessageBodyEn(event.target.value)}
              dir="ltr"
              className="min-h-[140px] w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 outline-none focus:border-primary"
              placeholder="Write the message shown in the notifications screen and the device push..."
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-muted-foreground">لون/نوع التنبيه</span>
              <select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold">
                <option value="primary">عادي</option>
                <option value="success">نجاح</option>
                <option value="warning">تحذير</option>
                <option value="danger">عاجل</option>
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-muted-foreground">الإجراء عند الضغط</span>
              <select value={actionType} onChange={(event) => setActionType(event.target.value as BroadcastActionType)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold">
                <option value="none">بدون إجراء</option>
                <option value="external_link">فتح لينك خارجي</option>
                <option value="subject_units">فتح مادة داخل التطبيق</option>
                <option value="subject_subscribe">فتح طلب اشتراك مادة</option>
                <option value="lesson">فتح درس برقم الدرس</option>
                <option value="support_chat">فتح شات الدعم</option>
              </select>
            </label>
          </div>

          {actionType === "external_link" ? (
            <input
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              placeholder="https://example.com"
              dir="ltr"
            />
          ) : null}

          {actionType === "subject_units" || actionType === "subject_subscribe" ? (
            <select value={actionSubjectId} onChange={(event) => setActionSubjectId(event.target.value)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold">
              <option value="">اختر المادة</option>
              {allSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.yearName} - {subject.name}
                </option>
              ))}
            </select>
          ) : null}

          {actionType === "lesson" ? (
            <div className="space-y-2">
              <select
                value={actionLessonId}
                onChange={(event) => setActionLessonId(event.target.value)}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold"
              >
                <option value="">اختر الدرس</option>
                {lessonOptions.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    درس #{lesson.id} - {lesson.title} - {lesson.yearName} / {lesson.subjectName} / {lesson.unitName}
                    {lesson.videoId ? ` - فيديو #${lesson.videoId}` : " - بلا فيديو"}
                  </option>
                ))}
              </select>
              {selectedActionLesson ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-bold text-primary">
                  رقم الدرس: {formatAdminNumber(selectedActionLesson.id)}
                  {" · "}
                  رقم الفيديو: {selectedActionLesson.videoId ? formatAdminNumber(selectedActionLesson.videoId) : "لا يوجد فيديو مرتبط"}
                  {" · "}
                  {selectedActionLesson.yearName} / {selectedActionLesson.subjectName} / {selectedActionLesson.unitName}
                </div>
              ) : lessonOptions.length === 0 ? (
                <p className="text-xs font-semibold text-muted-foreground">لا توجد دروس متاحة بعد. أضف درسًا من المحتوى الأكاديمي أولًا.</p>
              ) : (
                <p className="text-xs font-semibold text-muted-foreground">اختر الدرس من القائمة بدل كتابة رقمه يدويًا.</p>
              )}
            </div>
          ) : null}

          <button
            onClick={() => void sendBroadcast()}
            disabled={sending || !messageTitle.trim() || !messageBody.trim() || !messageTitleEn.trim() || !messageBodyEn.trim() || (preview?.total ?? 0) <= 0}
            className="w-full rounded-2xl bg-primary px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "جاري الإرسال..." : `إرسال إلى ${formatAdminNumber(preview?.total ?? 0)} مستخدم`}
          </button>
        </div>

        <div className="space-y-5">
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">فلترة الجمهور</h3>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                {targetUsers.length > 0 ? "مستخدمون محددون" : audienceLabels[audience]}
              </span>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div>
                <p className="text-sm font-black text-foreground">إرسال لمستخدم محدد</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ابحث بالبريد الإلكتروني أو رقم الهاتف المسجل، ثم اختر المستخدم.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-background py-3 pr-10 pl-4 text-sm outline-none focus:border-primary"
                  placeholder="البريد الإلكتروني أو رقم الهاتف"
                  dir="auto"
                />
              </div>
              {normalizedRecipientSearch.length >= 2 ? (
                <div className="space-y-2 pt-1">
                  {recipientSearchLoading ? <p className="text-xs text-muted-foreground">جاري البحث...</p> : null}
                  {!recipientSearchLoading && recipientMatches.length === 0 ? (
                    <p className="text-xs font-semibold text-muted-foreground">لا يوجد مستخدم مطابق لهذا البريد أو الرقم.</p>
                  ) : null}
                  {recipientMatches.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => selectIndividualRecipient(user)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-right transition-all hover:border-primary/35 hover:bg-primary/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p>
                        {user.phone ? <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.phone}</p> : null}
                      </div>
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
                        اختيار
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {targetUsers.length > 0 ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-primary">
                      {targetUsers.length === 1
                        ? `سيتم الإرسال إلى ${targetUsers[0].name} فقط`
                        : `جاهز للإرسال إلى ${formatAdminNumber(targetUsers.length)} مستخدم محدد`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      عند تحديد مستخدم، لا تُطبق فلاتر الجمهور الموجودة بالأسفل.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClearTargetUsers}
                    className="rounded-xl bg-white/75 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all hover:text-foreground"
                  >
                    مسح
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {targetUsers.slice(0, 6).map((user) => (
                    <div key={user.id} className="rounded-xl bg-background/80 px-2.5 py-1 text-[11px] font-bold text-foreground">
                      <p>{user.name}</p>
                      <p className="font-medium text-muted-foreground" dir="ltr">{user.email}</p>
                      {user.phone ? <p className="font-medium text-muted-foreground" dir="ltr">{user.phone}</p> : null}
                    </div>
                  ))}
                  {targetUsers.length > 6 ? (
                    <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                      +{formatAdminNumber(targetUsers.length - 6)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className={targetUsers.length > 0 ? "pointer-events-none space-y-4 opacity-45" : "space-y-4"}>
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-muted-foreground">الجمهور الأساسي</span>
              <select value={audience} onChange={(event) => setAudience(event.target.value as BroadcastAudience)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold">
                <option value="all">الكل</option>
                <option value="subscribed_subjects">المشتركين في مواد بعينها</option>
                <option value="not_subscribed_any">غير مشتركين في أي مادة</option>
                <option value="unopened_lessons">مشتركين ولديهم دروس لم يفتحوها</option>
                <option value="with_push_token">لديهم إشعارات جهاز مفعلة</option>
                <option value="without_push_token">ليس لديهم إشعارات جهاز مفعلة</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">نوع الحساب</span>
                <select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold">
                  <option value="student">الطلاب</option>
                  <option value="teacher">المدرسين</option>
                  <option value="admin">الأدمن</option>
                  <option value="owner">المالك</option>
                  <option value="all">كل الأدوار</option>
                </select>
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">حالة الحساب</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold">
                  <option value="active">نشط</option>
                  <option value="suspended">موقوف</option>
                  <option value="all">كل الحالات</option>
                </select>
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">إشعارات الجهاز</span>
                <select value={push} onChange={(event) => setPush(event.target.value as typeof push)} className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm font-semibold">
                  <option value="any">الكل</option>
                  <option value="has">مفعلة فقط</option>
                  <option value="none">غير مفعلة فقط</option>
                </select>
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">انضموا خلال آخر</span>
                <input
                  value={joinedWithinDays}
                  onChange={(event) => setJoinedWithinDays(event.target.value.replace(/[^\d]/g, ""))}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm"
                  placeholder="مثال: 30 يوم"
                  inputMode="numeric"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-black text-muted-foreground">المواد والسنة الدراسية</p>
                <button
                  onClick={() => {
                    setSelectedYearIds([]);
                    setSelectedSubjectIds([]);
                  }}
                  className="text-xs font-bold text-primary"
                >
                  مسح الاختيار
                </button>
              </div>
              <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
                {loadingOptions ? <p className="text-sm text-muted-foreground">جاري التحميل...</p> : null}
                {years.map((year) => (
                  <div key={year.id} className="rounded-xl border border-border/60 bg-card/60 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={selectedYearIds.includes(year.id)}
                          onChange={() => toggleId(year.id, selectedYearIds, setSelectedYearIds)}
                        />
                        {year.name}
                      </label>
                      <button onClick={() => toggleYearSubjects(year)} className="mr-auto text-[11px] font-bold text-primary">
                        تحديد مواد السنة
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {year.subjects.map((subject) => (
                        <label key={subject.id} className="flex items-center gap-2 rounded-lg bg-background/70 px-2 py-1.5 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={selectedSubjectIds.includes(subject.id)}
                            onChange={() => toggleId(subject.id, selectedSubjectIds, setSelectedSubjectIds)}
                          />
                          <span className="truncate">{subject.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>

          <div className="glass-card p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-primary/10 p-3">
                <p className="text-2xl font-black text-primary">{formatAdminNumber(preview?.total ?? 0)}</p>
                <p className="text-[11px] font-bold text-muted-foreground">مطابق للفلاتر</p>
              </div>
              <div className="rounded-2xl bg-emerald-500/10 p-3">
                <p className="text-2xl font-black text-emerald-600">{formatAdminNumber(preview?.withPushToken ?? 0)}</p>
                <p className="text-[11px] font-bold text-muted-foreground">Push مفعل</p>
              </div>
              <div className="rounded-2xl bg-amber-500/10 p-3">
                <p className="text-2xl font-black text-amber-600">{formatAdminNumber(preview?.withoutPushToken ?? 0)}</p>
                <p className="text-[11px] font-bold text-muted-foreground">داخل التطبيق فقط</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black text-muted-foreground">عينة من المستخدمين</p>
              {previewLoading ? <p className="text-sm text-muted-foreground">جاري حساب المعاينة...</p> : null}
              {!previewLoading && preview?.sample?.length === 0 ? <p className="text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون.</p> : null}
              <div className="space-y-2">
                {preview?.sample?.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-black ${user.hasPushToken ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {user.hasPushToken ? "Push" : "App"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportMessagesTab({
  token,
  onUnreadChatCountChange,
  targetUsers = [],
  onClearTargetUsers,
  draftTarget,
  onDraftTargetHandled,
}: {
  token: string | null;
  onUnreadChatCountChange?: (count: number) => void;
  targetUsers?: AdminUserListItem[];
  onClearTargetUsers?: () => void;
  draftTarget?: SupportDraftTarget | null;
  onDraftTargetHandled?: () => void;
}) {
  const [conversations, setConversations] = useState<SupportConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<SupportMessageItem[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [conversationSearchTerm, setConversationSearchTerm] = useState("");
  const [debouncedConversationSearchTerm, setDebouncedConversationSearchTerm] = useState("");
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [quickReplyLanguage, setQuickReplyLanguage] = useState<QuickReplyLanguage>("ar");
  const [quickReplies, setQuickReplies] = useState<Record<QuickReplyLanguage, QuickReplyItem[]>>(getInitialQuickReplies);
  const [customQuickReply, setCustomQuickReply] = useState("");
  const [automaticReportOpen, setAutomaticReportOpen] = useState(false);
  const [automaticReports, setAutomaticReports] = useState<AutomaticSupportMessageReportItem[]>([]);
  const [automaticReportsLoading, setAutomaticReportsLoading] = useState(false);
  const [automaticReportsError, setAutomaticReportsError] = useState("");
  const [directMessageBody, setDirectMessageBody] = useState("");
  const [directMessageSending, setDirectMessageSending] = useState(false);
  const [directMessageSuccess, setDirectMessageSuccess] = useState("");
  const [messageActionId, setMessageActionId] = useState<number | null>(null);

  const selectedConversation = conversations.find((item) => item.id === selectedId) ?? null;
  const activeQuickReplies = quickReplies[quickReplyLanguage] ?? [];
  const quickReplyDirection = quickReplyLanguage === "ar" ? "rtl" : "ltr";
  const targetUserIds = targetUsers.map((user) => user.id);
  const draftTargetKey = draftTarget?.requestKey ?? "";
  const activeConversationSearchTerm = debouncedConversationSearchTerm.trim();

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  const loadMessages = async (conversationId: number) => {
    if (!token) return;
    try {
      setMessagesLoading(true);
      const res = await fetch(apiPath(`/api/admin/support/conversations/${conversationId}/messages`), {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل الرسائل");
      }
      setMessages(Array.isArray((data as any).messages) ? (data as any).messages : []);
      setAutomaticReports((current) => (
        current.filter((item) => item.conversationId !== conversationId)
      ));
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل الرسائل");
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const loadConversations = async (preferredSelectedId = selectedId) => {
    if (!token) return;
    try {
      setLoading(true);
      setError("");
      const searchQuery = activeConversationSearchTerm;
      const res = await fetch(apiPath(`/api/admin/support/conversations${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`), {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل محادثات الدعم");
      }
      const items = Array.isArray(data) ? data : [];

      const nextSelectedId = preferredSelectedId && items.some((item) => item.id === preferredSelectedId)
        ? preferredSelectedId
        : items[0]?.id ?? null;
      setSelectedId(nextSelectedId);

      let nextItems = items;
      if (nextSelectedId) {
        await loadMessages(nextSelectedId);
        nextItems = items.map((item) => (
          item.id === nextSelectedId ? { ...item, unreadCount: 0 } : item
        ));
      } else {
        setMessages([]);
      }

      setConversations(nextItems);
      if (!searchQuery) {
        onUnreadChatCountChange?.(countUnreadSupportChats(nextItems));
      }
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل محادثات الدعم");
      setConversations([]);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAutomaticReports = async () => {
    if (!token) return;
    try {
      setAutomaticReportsLoading(true);
      setAutomaticReportsError("");
      const res = await fetch(apiPath("/api/admin/support/automatic-messages"), {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل تقارير الرسائل التلقائية");
      }
      setAutomaticReports(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setAutomaticReportsError(err?.message || "تعذر تحميل تقارير الرسائل التلقائية");
      setAutomaticReports([]);
    } finally {
      setAutomaticReportsLoading(false);
    }
  };

  const openAutomaticReports = async () => {
    setAutomaticReportOpen(true);
    await loadAutomaticReports();
  };

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => {
      void loadConversations();
    }, 9000);
    return () => window.clearInterval(timer);
  }, [token, selectedId, activeConversationSearchTerm]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedConversationSearchTerm(conversationSearchTerm.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [conversationSearchTerm]);

  useEffect(() => {
    if (!token || !draftTarget) return;

    let cancelled = false;
    const openDraftConversation = async () => {
      try {
        setError("");
        const res = await fetch(apiPath("/api/admin/support/conversations/open"), {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: draftTarget.userId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as any)?.error || "تعذر فتح محادثة الطالب");
        }

        const conversationId = Number((data as any)?.conversation?.id);
        if (!Number.isFinite(conversationId) || conversationId <= 0) {
          throw new Error("استجابة غير متوقعة من الخادم");
        }

        if (cancelled) return;
        setReply(draftTarget.draft);
        setQuickRepliesOpen(false);
        await loadConversations(conversationId);
      } catch (err: any) {
        if (!cancelled) {
          alert(err?.message || "تعذر فتح محادثة الطالب");
        }
      } finally {
        if (!cancelled) {
          onDraftTargetHandled?.();
        }
      }
    };

    void openDraftConversation();
    return () => {
      cancelled = true;
    };
  }, [token, draftTargetKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(quickReplies));
    } catch {
      // Keeping quick replies available in memory is enough if storage is blocked.
    }
  }, [quickReplies]);

  const selectConversationById = async (conversationId: number) => {
    setSelectedId(conversationId);
    await loadConversations(conversationId);
  };

  const handleSelectConversation = async (conversation: SupportConversationItem) => {
    // Existing conversation — open it directly.
    if (conversation.id != null) {
      await selectConversationById(conversation.id);
      return;
    }

    // User has no conversation yet — materialize one on demand so the admin can
    // start chatting even though nothing was exchanged before.
    if (!token) return;
    try {
      setMessagesLoading(true);
      const res = await fetch(apiPath("/api/admin/support/conversations/open"), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: conversation.user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر فتح محادثة المستخدم");
      }
      const conversationId = Number((data as any)?.conversation?.id);
      if (!Number.isFinite(conversationId) || conversationId <= 0) {
        throw new Error("استجابة غير متوقعة من الخادم");
      }
      await selectConversationById(conversationId);
    } catch (err: any) {
      setError(err?.message || "تعذر فتح محادثة المستخدم");
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleOpenAutomaticReportChat = async (item: AutomaticSupportMessageReportItem) => {
    if (!item.conversationId) return;
    setAutomaticReportOpen(false);
    await selectConversationById(item.conversationId);
  };

  const handleSendReply = async () => {
    if (!token || !selectedId) return;
    const body = reply.trim();
    if (!body) return;

    try {
      setSending(true);
      const res = await fetch(apiPath(`/api/admin/support/conversations/${selectedId}/messages`), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر إرسال الرد");
      }
      setReply("");
      await loadMessages(selectedId);
      await loadConversations();
    } catch (err: any) {
      alert(err?.message || "تعذر إرسال الرد");
    } finally {
      setSending(false);
    }
  };

  const handleEditSupportMessage = async (message: SupportMessageItem) => {
    if (!token || !selectedId) return;
    const nextBody = prompt("تعديل الرسالة:", message.body)?.trim();
    if (!nextBody || nextBody === message.body.trim()) return;

    try {
      setMessageActionId(message.id);
      const res = await fetch(apiPath(`/api/admin/support/messages/${message.id}`), {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: nextBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تعديل الرسالة");
      }
      await loadMessages(selectedId);
      await loadConversations(selectedId);
    } catch (err: any) {
      alert(err?.message || "تعذر تعديل الرسالة");
    } finally {
      setMessageActionId(null);
    }
  };

  const handleDeleteSupportMessage = async (message: SupportMessageItem) => {
    if (!token || !selectedId) return;
    if (!confirm("حذف هذه الرسالة من المحادثة؟")) return;

    try {
      setMessageActionId(message.id);
      const res = await fetch(apiPath(`/api/admin/support/messages/${message.id}`), {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر حذف الرسالة");
      }
      await loadMessages(selectedId);
      await loadConversations(selectedId);
    } catch (err: any) {
      alert(err?.message || "تعذر حذف الرسالة");
    } finally {
      setMessageActionId(null);
    }
  };

  const handleSendDirectSupportMessage = async () => {
    if (!token || targetUsers.length === 0) return;
    const body = directMessageBody.trim();
    if (!body) return;

    try {
      setDirectMessageSending(true);
      setDirectMessageSuccess("");
      const res = await fetch(apiPath("/api/admin/support/direct-messages"), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: targetUserIds, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر إرسال الرسالة");
      }

      const sentCount = Number((data as any)?.sentCount ?? 0);
      const firstConversationId = Array.isArray((data as any)?.conversations)
        ? Number((data as any).conversations[0]?.conversationId)
        : null;
      setDirectMessageBody("");
      setDirectMessageSuccess(`تم إرسال الرسالة إلى ${formatAdminNumber(sentCount)} مستخدم.`);
      await loadConversations(Number.isFinite(firstConversationId) && firstConversationId ? firstConversationId : selectedId);
    } catch (err: any) {
      alert(err?.message || "تعذر إرسال الرسالة");
    } finally {
      setDirectMessageSending(false);
    }
  };

  const insertQuickReply = (body: string) => {
    const cleanBody = body.trim();
    if (!cleanBody) return;

    setReply((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed}\n${cleanBody}` : cleanBody;
    });
    setQuickRepliesOpen(false);
  };

  const addCustomQuickReply = () => {
    const body = customQuickReply.trim();
    if (!body) return;

    setQuickReplies((current) => ({
      ...current,
      [quickReplyLanguage]: [
        { id: createQuickReplyId(quickReplyLanguage), body },
        ...(current[quickReplyLanguage] ?? []),
      ],
    }));
    setCustomQuickReply("");
  };

  const removeQuickReply = (id: string) => {
    setQuickReplies((current) => ({
      ...current,
      [quickReplyLanguage]: (current[quickReplyLanguage] ?? []).filter((item) => item.id !== id),
    }));
  };

  if (!token) {
    return (
      <div className="glass-card p-6 text-center text-muted-foreground">
        يجب تسجيل الدخول كمشرف لعرض رسائل المستخدمين.
      </div>
    );
  }

  return (
    <div className="space-y-5 xl:flex xl:h-[calc(100vh-4rem)] xl:flex-col xl:overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-bold">رسائل المستخدمين</h2>
          <p className="text-sm text-muted-foreground mt-1">تابع محادثات دعم التطبيق ورد على المستخدمين من هنا.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => void openAutomaticReports()}
            disabled={automaticReportsLoading}
            className="h-10 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 transition-all disabled:opacity-60 flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {automaticReportsLoading ? "جاري التحميل..." : "تقارير الرسائل التلقائية"}
          </button>
          <button
            onClick={() => void loadConversations()}
            disabled={loading}
            className="h-10 px-4 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-all disabled:opacity-60"
          >
            {loading ? "جاري التحديث..." : "تحديث"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="glass-card p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-xl">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={conversationSearchTerm}
              onChange={(event) => setConversationSearchTerm(event.target.value)}
              placeholder="بحث باسم المستخدم أو الإيميل أو رقم الهاتف أو محتوى الرسالة"
              className="h-11 w-full rounded-2xl border border-border bg-white/70 py-2 pl-10 pr-10 text-sm font-semibold text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-white focus:ring-2 focus:ring-primary/10 dark:bg-white/10 dark:focus:bg-white/15"
              dir="rtl"
            />
            {conversationSearchTerm.trim() ? (
              <button
                type="button"
                onClick={() => setConversationSearchTerm("")}
                className="absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all hover:text-foreground"
                aria-label="مسح البحث"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {activeConversationSearchTerm ? (
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
              نتائج البحث: {formatAdminNumber(conversations.length, "0")}
            </span>
          ) : null}
        </div>
      </div>

      {targetUsers.length > 0 ? (
        <div className="glass-card border-sky-200/70 bg-sky-50/70 p-4 dark:border-sky-400/20 dark:bg-sky-400/10">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-base font-black text-foreground">رسالة مباشرة إلى {formatAdminNumber(targetUsers.length)} مستخدم</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                ستظهر في شات الدعم كرسالة تواصل مباشر مميزة.
              </p>
            </div>
            <button
              type="button"
              onClick={onClearTargetUsers}
              className="h-9 rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-sky-700 transition-all hover:bg-sky-100 dark:bg-background"
            >
              مسح التحديد
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {targetUsers.slice(0, 8).map((user) => (
              <span key={user.id} className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-foreground dark:bg-background/80">
                {user.name}
              </span>
            ))}
            {targetUsers.length > 8 ? (
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground dark:bg-background/80">
                +{formatAdminNumber(targetUsers.length - 8)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <textarea
              value={directMessageBody}
              onChange={(event) => setDirectMessageBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void handleSendDirectSupportMessage();
                }
              }}
              rows={3}
              placeholder="اكتب محتوى الرسالة التي ستصل داخل شات الدعم..."
              className="min-h-24 flex-1 resize-y rounded-2xl border border-sky-200 bg-white/90 px-4 py-3 text-sm leading-7 outline-none focus:border-sky-400 dark:bg-background"
            />
            <button
              type="button"
              onClick={() => void handleSendDirectSupportMessage()}
              disabled={directMessageSending || directMessageBody.trim().length === 0}
              className="h-12 rounded-2xl bg-sky-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-600/20 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              {directMessageSending ? "جاري الإرسال..." : "إرسال"}
            </button>
          </div>
          {directMessageSuccess ? (
            <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              {directMessageSuccess}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <div className="glass-card flex min-h-[580px] flex-col p-3 xl:h-full xl:min-h-0 xl:overflow-hidden">
          <div className="px-2 pb-3 flex shrink-0 items-center justify-between">
            <p className="text-sm font-bold text-foreground">المحادثات</p>
            <span className="text-xs text-muted-foreground">{conversations.length}</span>
          </div>
          <div className="space-y-2 max-h-[520px] overflow-y-auto overscroll-contain hide-scrollbar xl:max-h-none xl:min-h-0 xl:flex-1">
            {conversations.map((conversation) => {
              const active = conversation.id != null && conversation.id === selectedId;
              const lastText = conversation.lastMessage?.body ?? "لا توجد رسائل بعد";
              const automaticLastMessage = isAutomaticSupportMessage(conversation.lastMessage);
              const directLastMessage = isDirectAdminSupportMessage(conversation.lastMessage);
              return (
                <button
                  key={conversation.id ?? `user-${conversation.user.id}`}
                  onClick={() => void handleSelectConversation(conversation)}
                  className={`w-full text-right rounded-2xl p-3 transition-all border ${
                    automaticLastMessage
                      ? active
                        ? "bg-amber-100/80 border-amber-300"
                        : "bg-amber-50/80 border-amber-200 hover:bg-amber-100/70"
                      : directLastMessage
                        ? active
                          ? "bg-sky-100/80 border-sky-300"
                          : "bg-sky-50/80 border-sky-200 hover:bg-sky-100/70"
                      : active
                        ? "bg-primary/10 border-primary/20"
                        : "bg-white/45 border-white/50 hover:bg-white/70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                      {conversation.user.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm text-foreground truncate">{conversation.user.name}</p>
                        {conversation.unreadCount > 0 ? (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{conversation.user.email}</p>
                      {automaticLastMessage ? (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          <Bot className="h-3 w-3" />
                          رسالة تلقائية
                        </span>
                      ) : null}
                      {directLastMessage ? (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-200/70 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                          <Send className="h-3 w-3" />
                          تواصل مباشر
                        </span>
                      ) : null}
                      <p className="text-xs text-muted-foreground truncate mt-2">{lastText}</p>
                      {conversation.lastMessageAt ? (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          {formatAdminDateTime(conversation.lastMessageAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}

            {!loading && conversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {activeConversationSearchTerm ? "لا توجد نتائج مطابقة للبحث." : "لا يوجد مستخدمون بعد."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="glass-card min-h-[580px] flex flex-col overflow-hidden xl:h-full xl:min-h-0">
          {selectedConversation ? (
            <>
              <div className="relative z-10 p-4 border-b border-slate-200/80 shadow-[0_10px_24px_rgba(15,23,42,0.06)] flex shrink-0 items-center justify-between gap-3 bg-white/70 backdrop-blur">
                <div>
                  <p className="font-bold text-foreground">{selectedConversation.user.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedConversation.user.email}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  {selectedConversation.status === "open" ? "مفتوحة" : selectedConversation.status}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white/15 p-4">
                {messagesLoading ? (
                  <div className="text-center text-sm text-muted-foreground py-8">جاري تحميل الرسائل...</div>
                ) : null}
                {messages.map((message) => {
                  const fromUser = message.senderRole === "user";
                  const automaticMessage = isAutomaticSupportMessage(message);
                  const directAdminMessage = isDirectAdminSupportMessage(message);
                  const actionBusy = messageActionId === message.id;
                  const actionButtonClass =
                    fromUser || automaticMessage || directAdminMessage
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
                      : "bg-white/15 text-white/85 hover:bg-white/25 hover:text-white disabled:opacity-50";
                  return (
                    <div key={message.id} className="w-full">
                      <div
                        className={`max-w-[76%] rounded-2xl px-4 py-3 border ${
                          fromUser
                            ? "ml-auto bg-white/95 border-slate-300/90 rounded-br-md shadow-sm shadow-slate-900/5"
                            : automaticMessage
                              ? "mr-auto bg-amber-50 text-amber-950 border-amber-200 rounded-bl-md shadow-sm shadow-amber-900/5"
                              : directAdminMessage
                                ? "mr-auto bg-sky-50 text-sky-950 border-sky-200 rounded-bl-md shadow-sm shadow-sky-900/5"
                              : "mr-auto bg-primary text-white border-primary rounded-bl-md"
                        }`}
                      >
                        {automaticMessage ? (
                          <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <Bot className="h-3 w-3" />
                            رسالة تلقائية من النظام
                          </div>
                        ) : null}
                        {directAdminMessage ? (
                          <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-sky-200/70 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                            <Send className="h-3 w-3" />
                            رسالة تواصل مباشر
                          </div>
                        ) : null}
                        <div className="mb-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleEditSupportMessage(message)}
                            disabled={actionBusy}
                            className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${actionButtonClass}`}
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSupportMessage(message)}
                            disabled={actionBusy}
                            className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${actionButtonClass}`}
                          >
                            حذف
                          </button>
                        </div>
                        <p
                          dir="auto"
                          className={`text-sm leading-6 ${
                            fromUser ? "text-foreground" : automaticMessage ? "text-amber-950" : directAdminMessage ? "text-sky-950" : "text-white"
                          }`}
                        >
                          {renderSupportMessageBody(message.body)}
                        </p>
                        <p
                          className={`text-[10px] mt-2 ${
                            fromUser ? "text-muted-foreground" : automaticMessage ? "text-amber-700" : directAdminMessage ? "text-sky-700" : "text-white/70"
                          }`}
                        >
                          {formatAdminDateTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {!messagesLoading && messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    لا توجد رسائل في هذه المحادثة.
                  </div>
                ) : null}
              </div>

              <div className="relative z-10 shrink-0 p-4 border-t border-slate-200/80 bg-white/70 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="flex items-end gap-3">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setQuickRepliesOpen((open) => !open)}
                      className={`relative h-12 w-12 rounded-2xl border text-primary transition-all ${
                        quickRepliesOpen
                          ? "border-primary/35 bg-primary/15 shadow-[0_10px_26px_rgba(37,99,235,0.18)]"
                          : "border-primary/20 bg-white/85 hover:bg-primary/10"
                      }`}
                      aria-label="الردود السريعة"
                    >
                      <MessageSquare className="mx-auto h-5 w-5" />
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    </button>

                    <AnimatePresence>
                      {quickRepliesOpen ? (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.16 }}
                          dir="rtl"
                          className="absolute bottom-[calc(100%+0.75rem)] right-0 z-30 w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur"
                        >
                          <div className="border-b border-slate-200/80 bg-gradient-to-l from-primary/10 to-white px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-foreground">ردود سريعة</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">قوالب جاهزة للمحادثات اليومية</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setQuickRepliesOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-muted-foreground transition-colors hover:text-foreground"
                                aria-label="إغلاق"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/80 p-1">
                              {([
                                ["ar", "العربية"],
                                ["en", "English"],
                              ] as const).map(([language, label]) => (
                                <button
                                  key={language}
                                  type="button"
                                  onClick={() => {
                                    setQuickReplyLanguage(language);
                                    setCustomQuickReply("");
                                  }}
                                  className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                    quickReplyLanguage === language
                                      ? "bg-primary text-white shadow-sm"
                                      : "text-slate-500 hover:bg-white/80 hover:text-slate-900"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="max-h-72 space-y-2 overflow-y-auto overscroll-contain p-3">
                            {activeQuickReplies.map((item) => (
                              <div
                                key={item.id}
                                className="group flex items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 transition-all hover:border-primary/25 hover:bg-primary/[0.03]"
                              >
                                <button
                                  type="button"
                                  onClick={() => insertQuickReply(item.body)}
                                  dir={quickReplyDirection}
                                  className="min-w-0 flex-1 rounded-xl px-2 py-1 text-start text-sm leading-6 text-foreground"
                                >
                                  {item.body}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeQuickReply(item.id)}
                                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground opacity-70 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                                  aria-label="حذف الرد السريع"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}

                            {activeQuickReplies.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-muted-foreground">
                                {quickReplyLanguage === "ar" ? "لا توجد ردود محفوظة لهذه اللغة." : "No saved replies for this language."}
                              </div>
                            ) : null}
                          </div>

                          <div className="border-t border-slate-200/80 bg-slate-50/80 p-3">
                            <textarea
                              value={customQuickReply}
                              onChange={(event) => setCustomQuickReply(event.target.value)}
                              dir={quickReplyDirection}
                              rows={3}
                              placeholder={quickReplyLanguage === "ar" ? "أضف نص رد سريع..." : "Add a quick reply..."}
                              className="w-full resize-none rounded-2xl border border-white/80 bg-white px-3 py-2 text-sm outline-none focus:border-primary/35 focus:ring-4 focus:ring-primary/10"
                            />
                            <button
                              type="button"
                              onClick={addCustomQuickReply}
                              disabled={customQuickReply.trim().length === 0}
                              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-white transition-all disabled:opacity-50"
                            >
                              <Plus className="h-4 w-4" />
                              {quickReplyLanguage === "ar" ? "إضافة رد سريع" : "Add quick reply"}
                            </button>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        void handleSendReply();
                      }
                    }}
                    placeholder="اكتب ردك هنا..."
                    dir="rtl"
                    rows={2}
                    className="flex-1 resize-none rounded-2xl border border-slate-300/90 bg-white/90 px-4 py-3 text-right text-sm outline-none placeholder:text-right placeholder:text-slate-400 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  />
                  <button
                    onClick={() => void handleSendReply()}
                    disabled={sending || reply.trim().length === 0}
                    className="h-12 px-5 rounded-2xl bg-primary text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "إرسال..." : "إرسال"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8 text-muted-foreground">
              اختر محادثة لعرض الرسائل والرد عليها.
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {automaticReportOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAutomaticReportOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="automatic-report-modal flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="automatic-report-header flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-amber-50/80 px-5 py-4">
                <div>
                  <h3 className="automatic-report-title text-lg font-bold text-foreground">تقارير الرسائل التلقائية</h3>
                  <p className="automatic-report-subtitle mt-1 text-xs text-muted-foreground">
                    الحسابات التي وصل لها follow-up الخط الساخن ومحتوى الرسالة ووقت الإرسال.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadAutomaticReports()}
                    disabled={automaticReportsLoading}
                    className="automatic-report-refresh h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-amber-800 transition-all hover:bg-amber-100 disabled:opacity-60"
                  >
                    {automaticReportsLoading ? "تحميل..." : "تحديث"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutomaticReportOpen(false)}
                    className="automatic-report-close flex h-9 w-9 items-center justify-center rounded-xl bg-white text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="إغلاق"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="automatic-report-body min-h-0 flex-1 overflow-y-auto p-4">
                {automaticReportsError ? (
                  <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {automaticReportsError}
                  </div>
                ) : null}

                {automaticReportsLoading ? (
                  <div className="automatic-report-loading py-10 text-center text-sm text-muted-foreground">جاري تحميل التقارير...</div>
                ) : null}

                {!automaticReportsLoading && automaticReports.length === 0 ? (
                  <div className="automatic-report-empty rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
                    لا توجد رسائل تلقائية مرسلة حتى الآن.
                  </div>
                ) : null}

                <div className="space-y-2">
                  {automaticReports.map((item) => {
                    const sentAt = item.sentAt ?? item.createdAt;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleOpenAutomaticReportChat(item)}
                        disabled={!item.conversationId}
                        className="automatic-report-row w-full rounded-2xl border border-slate-200 bg-white p-4 text-right transition-all hover:border-amber-300 hover:bg-amber-50/70 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex items-start gap-3">
                          <div className="automatic-report-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-sm font-black text-amber-800">
                            {item.user.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="automatic-report-name truncate text-sm font-bold text-foreground">{item.user.name}</p>
                                <p className="automatic-report-meta truncate text-[11px] text-muted-foreground">
                                  {item.user.email}{item.user.phone ? ` · ${item.user.phone}` : ""}
                                </p>
                              </div>
                              <span className="automatic-report-time rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                                {formatAdminDateTime(sentAt)}
                              </span>
                            </div>
                            <p dir="auto" className="automatic-report-message mt-3 text-sm leading-6 text-foreground">
                              {item.body}
                            </p>
                            <p className="automatic-report-link mt-2 text-[11px] font-bold text-primary">
                              فتح الشات
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Main Admin Panel ──────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, token, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [transitionDirection, setTransitionDirection] = useState(1);
  const [supportUnreadChatCount, setSupportUnreadChatCount] = useState(0);
  const [adminTheme, setAdminTheme] = useState<AdminTheme>(getInitialAdminTheme);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [broadcastTargetUsers, setBroadcastTargetUsers] = useState<AdminUserListItem[]>([]);
  const [supportTargetUsers, setSupportTargetUsers] = useState<AdminUserListItem[]>([]);
  const [supportDraftTarget, setSupportDraftTarget] = useState<SupportDraftTarget | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const isAdminUser = Boolean(user && (user.role === "admin" || user.role === "owner"));
  const isDarkAdmin = adminTheme === "dark";

  const selectTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    setTransitionDirection(getTabTransitionIndex(nextTab) >= getTabTransitionIndex(tab) ? 1 : -1);
    setTab(nextTab);
  };

  const openBroadcastForUsers = (users: AdminUserListItem[]) => {
    setBroadcastTargetUsers(users);
    setSupportTargetUsers([]);
    setSupportDraftTarget(null);
    selectTab("broadcastMessages");
  };

  const openSupportForUsers = (users: AdminUserListItem[]) => {
    setSupportTargetUsers(users);
    setBroadcastTargetUsers([]);
    setSupportDraftTarget(null);
    selectTab("supportMessages");
  };

  const openSupportDraftForSubscriptionRequest = (request: SubscriptionRequestItem) => {
    setBroadcastTargetUsers([]);
    setSupportTargetUsers([]);
    setSupportDraftTarget({
      userId: request.student.id,
      requestKey: `${request.id}:${request.code}`,
      draft: `بخصوص طلب الإشتراك الخاص بكم لمادة ${request.subject.name}\nبكود ${request.code}\n\n`,
    });
    selectTab("supportMessages");
  };

  useEffect(() => {
    if (!token || !isAdminUser) {
      setSupportUnreadChatCount(0);
      return;
    }

    let active = true;

    const loadUnreadSupportChats = async () => {
      try {
        const res = await fetch(apiPath("/api/admin/support/conversations"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(data)) return;
        if (active) {
          setSupportUnreadChatCount(countUnreadSupportChats(data));
        }
      } catch {
        // keep the last known count
      }
    };

    void loadUnreadSupportChats();
    const timer = window.setInterval(() => {
      void loadUnreadSupportChats();
    }, 12000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, isAdminUser]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, adminTheme);
  }, [adminTheme]);

  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    setLocation("/admin-login");
    return null;
  }

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab onOpenMaterials={() => selectTab("materials")} />,
    users: (
      <UsersTab
        selectedUserIds={selectedUserIds}
        onSelectedUserIdsChange={setSelectedUserIds}
        onSendNotification={openBroadcastForUsers}
        onSendSupportMessage={openSupportForUsers}
      />
    ),
    academic: <AcademicTab />,
    subscriptionRequests: <SubscriptionRequestsTab token={token} onContactRequest={openSupportDraftForSubscriptionRequest} />,
    supportMessages: (
      <SupportMessagesTab
        token={token}
        onUnreadChatCountChange={setSupportUnreadChatCount}
        targetUsers={supportTargetUsers}
        onClearTargetUsers={() => setSupportTargetUsers([])}
        draftTarget={supportDraftTarget}
        onDraftTargetHandled={() => setSupportDraftTarget(null)}
      />
    ),
    broadcastMessages: (
      <BroadcastMessagesTab
        token={token}
        targetUsers={broadcastTargetUsers}
        onClearTargetUsers={() => setBroadcastTargetUsers([])}
        onTargetUsersChange={setBroadcastTargetUsers}
      />
    ),
    materials: <MaterialsTab />,
    books: <BooksTab />,
    posts: <PostsTab />,
    reports: <ReportsTab />,
    banners: <BannersTab />,
  };

  return (
    <div className={`admin-dashboard ${isDarkAdmin ? "dark" : ""} min-h-screen flex bg-background text-foreground`} dir="rtl">
      <div className="mesh-bg" />

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col fixed top-0 right-0 h-screen w-64 z-40 glass-panel border-l border-white/60">
        <div className="px-6 pt-7 pb-5">
          <Logo size={36} />
          <div className="mt-3 inline-flex items-center gap-1.5 bg-violet-100 text-violet-700 border border-violet-200/60 rounded-full px-3 py-1 text-xs font-bold dark:bg-violet-400/10 dark:text-violet-200 dark:border-violet-300/20">
            <Crown className="w-3.5 h-3.5" />
            لوحة تحكم المشرف
          </div>
        </div>
        <div className="mx-5 h-px bg-gradient-to-l from-transparent via-border to-transparent mb-3" />
        <nav className="admin-sidebar-nav flex-1 px-3 space-y-1 overflow-y-auto hide-scrollbar">
          {TABS.map(t => {
            const isActive = tab === t.id;
            const Icon = t.icon;

            return (
            <motion.button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              aria-current={isActive ? "page" : undefined}
              whileHover={shouldReduceMotion ? undefined : { x: -2 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
              className={`admin-sidebar-tab relative isolate w-full h-12 overflow-hidden flex items-center gap-3 px-4 rounded-2xl border text-sm font-semibold transition-colors duration-200 ${isActive ? "admin-sidebar-tab-active text-white border-transparent" : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"}`}
            >
              {isActive ? (
                <>
                  <motion.span
                    layoutId="admin-sidebar-active-pill"
                    className="admin-sidebar-active-pill absolute inset-0 rounded-2xl"
                    transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.78 }}
                  />
                  {!shouldReduceMotion ? (
                    <motion.span
                      className="admin-sidebar-active-glint absolute inset-y-0 -right-8 w-2/3 rounded-2xl"
                      initial={{ x: "55%", opacity: 0 }}
                      animate={{ x: "-95%", opacity: [0, 0.45, 0] }}
                      transition={{ duration: 0.72, ease: "easeOut" }}
                    />
                  ) : null}
                </>
              ) : null}
              <motion.span
                className="relative z-10 flex h-5 w-5 items-center justify-center"
                initial={false}
                animate={isActive && !shouldReduceMotion ? { scale: 1.08 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 430, damping: 24 }}
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              </motion.span>
              <span className="relative z-10 truncate">{t.label}</span>
              {t.id === "supportMessages" && supportUnreadChatCount > 0 ? (
                <span
                  className={`relative z-10 mr-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${
                    isActive ? "bg-white text-primary" : "bg-primary text-white"
                  }`}
                >
                  {formatAdminNumber(supportUnreadChatCount, "0")}
                </span>
              ) : null}
            </motion.button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/40">
          <div className="admin-theme-switch relative mb-4 grid h-12 grid-cols-2 overflow-hidden rounded-3xl border border-border/70 bg-muted/55 p-1 shadow-inner" dir="rtl">
            <motion.span
              className="absolute bottom-1 top-1 right-1 rounded-2xl bg-primary shadow-lg shadow-primary/25"
              style={{ width: "calc(50% - 0.25rem)" }}
              initial={false}
              animate={{ x: isDarkAdmin ? "-100%" : "0%" }}
              transition={{ type: "spring", stiffness: 430, damping: 31, mass: 0.8 }}
            />
            <motion.span
              className="pointer-events-none absolute bottom-1 top-1 right-1 rounded-2xl bg-gradient-to-l from-white/0 via-white/35 to-white/0"
              style={{ width: "calc(50% - 0.25rem)" }}
              initial={false}
              animate={{ x: isDarkAdmin ? "-100%" : "0%", opacity: [0.1, 0.7, 0.18] }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
            <button
              type="button"
              onClick={() => setAdminTheme("light")}
              className={`relative z-10 flex h-full items-center justify-center gap-1.5 rounded-2xl text-xs font-black transition-colors duration-200 ${
                adminTheme === "light" ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={adminTheme === "light"}
            >
              <motion.span
                initial={false}
                animate={{ rotate: adminTheme === "light" ? 0 : -18, scale: adminTheme === "light" ? 1.12 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              >
                <Sun className="h-3.5 w-3.5" />
              </motion.span>
              فاتح
            </button>
            <button
              type="button"
              onClick={() => setAdminTheme("dark")}
              className={`relative z-10 flex h-full items-center justify-center gap-1.5 rounded-2xl text-xs font-black transition-colors duration-200 ${
                adminTheme === "dark" ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={adminTheme === "dark"}
            >
              <motion.span
                initial={false}
                animate={{ rotate: adminTheme === "dark" ? -10 : 16, scale: adminTheme === "dark" ? 1.12 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
              >
                <Moon className="h-3.5 w-3.5" />
              </motion.span>
              داكن
            </button>
          </div>
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex gap-2">
            {user.role === "owner" && (
              <button onClick={() => setLocation("/owner")} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 transition-all dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/15">
                <Crown className="w-3.5 h-3.5" /> لوحة المالك
              </button>
            )}
            <button onClick={() => { logout(); setLocation("/"); }}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-all dark:hover:bg-rose-400/10 dark:hover:text-rose-200">
              <LogOut className="w-3.5 h-3.5" /> خروج
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:mr-64 p-5 md:p-8 max-w-full overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false} custom={{ direction: transitionDirection, reduceMotion: Boolean(shouldReduceMotion) }}>
          <motion.div
            key={tab}
            custom={{ direction: transitionDirection, reduceMotion: Boolean(shouldReduceMotion) }}
            variants={adminTabContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="admin-page-transition min-h-[calc(100vh-4rem)]"
          >
            {TAB_CONTENT[tab]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
