import {
  Bell,
  CheckCircle,
  Clock,
  AlertCircle,
  Award,
  Star,
  Gift,
  Zap,
  Heart,
  BookOpen,
  PlayCircle,
  Target,
  ThumbsUp,
  Video,
  MessageCircle,
  TrendingUp,
  Pencil,
  CheckSquare,
  Calendar,
  Bookmark,
  Flag,
  Sun,
  Moon,
  BarChart2,
  DollarSign,
  Unlock,
  XCircle,
  Headphones,
  Smile,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

// Web copy of the notification badge-icon palette. Keys MUST stay in sync with:
//   backend: artifacts/api-server/src/lib/notification-icons.ts
//   mobile:  artifacts/ofouq-mobile/constants/notificationIcons.ts
// A null key means "auto" — the mobile app derives the glyph from the tone.
export interface NotificationIconDef {
  key: string;
  label: string; // Arabic label shown in the picker tooltip
  Icon: LucideIcon;
}

export const NOTIFICATION_ICONS: NotificationIconDef[] = [
  { key: "bell", label: "جرس", Icon: Bell },
  { key: "check", label: "صح", Icon: CheckCircle },
  { key: "clock", label: "ساعة", Icon: Clock },
  { key: "alert", label: "تنبيه", Icon: AlertCircle },
  { key: "award", label: "وسام", Icon: Award },
  { key: "star", label: "نجمة", Icon: Star },
  { key: "gift", label: "هدية", Icon: Gift },
  { key: "zap", label: "برق", Icon: Zap },
  { key: "heart", label: "قلب", Icon: Heart },
  { key: "book", label: "كتاب", Icon: BookOpen },
  { key: "play", label: "تشغيل", Icon: PlayCircle },
  { key: "target", label: "هدف", Icon: Target },
  { key: "thumbsup", label: "إعجاب", Icon: ThumbsUp },
  { key: "video", label: "فيديو", Icon: Video },
  { key: "message", label: "رسالة", Icon: MessageCircle },
  { key: "trending", label: "تقدّم", Icon: TrendingUp },
  { key: "pencil", label: "قلم / واجب", Icon: Pencil },
  { key: "checksquare", label: "مهمة", Icon: CheckSquare },
  { key: "calendar", label: "تقويم / موعد", Icon: Calendar },
  { key: "bookmark", label: "حفظ", Icon: Bookmark },
  { key: "flag", label: "علم / هدف", Icon: Flag },
  { key: "sun", label: "نهار", Icon: Sun },
  { key: "moon", label: "مسائي", Icon: Moon },
  { key: "barchart", label: "إحصائيات", Icon: BarChart2 },
  { key: "dollar", label: "نقاط", Icon: DollarSign },
  { key: "unlock", label: "تفعيل", Icon: Unlock },
  { key: "xcircle", label: "رفض", Icon: XCircle },
  { key: "headphones", label: "دعم", Icon: Headphones },
  { key: "smile", label: "ابتسامة", Icon: Smile },
  { key: "warning", label: "تحذير", Icon: AlertTriangle },
];

export const NOTIFICATION_ICON_BY_KEY = new Map(NOTIFICATION_ICONS.map((i) => [i.key, i]));
