import { motion } from "framer-motion";
import { Link } from "wouter";
import { 
  BookOpen, Video, Award, Coins, TrendingUp, 
  Gamepad2, MessageSquare, Gift, Bot, ArrowLeft,
  Sparkles, Star
} from "lucide-react";
import { useGetPoints } from "@workspace/api-client-react";

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.08 } } },
  item: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
  },
};

export default function Dashboard() {
  const { data: pointsData } = useGetPoints();

  const stats = [
    {
      title: "النقاط المكتسبة",
      value: pointsData?.totalEarned ?? 0,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "from-emerald-400/20 to-teal-400/10",
      border: "border-emerald-200/60",
    },
    {
      title: "الرصيد الحالي",
      value: pointsData?.balance ?? 0,
      icon: Coins,
      color: "text-amber-500",
      bg: "from-amber-400/20 to-orange-400/10",
      border: "border-amber-200/60",
    },
    {
      title: "النقاط المستخدمة",
      value: pointsData?.totalSpent ?? 0,
      icon: Award,
      color: "text-primary",
      bg: "from-blue-400/20 to-indigo-400/10",
      border: "border-blue-200/60",
    },
  ];

  const quickLinks = [
    {
      title: "المسابقات",
      desc: "اختبر معلوماتك",
      href: "/games",
      icon: Gamepad2,
      gradient: "from-violet-500 to-indigo-600",
      glow: "shadow-violet-500/25",
    },
    {
      title: "الدروس المرئية",
      desc: "تعلم بالفيديو",
      href: "/videos",
      icon: Video,
      gradient: "from-sky-400 to-blue-600",
      glow: "shadow-sky-500/25",
    },
    {
      title: "المجتمع",
      desc: "شارك وتفاعل",
      href: "/social",
      icon: MessageSquare,
      gradient: "from-orange-400 to-rose-500",
      glow: "shadow-orange-500/25",
    },
    {
      title: "المكافآت",
      desc: "استبدل نقاطك",
      href: "/rewards",
      icon: Gift,
      gradient: "from-emerald-400 to-teal-600",
      glow: "shadow-emerald-500/25",
    },
  ];

  return (
    <motion.div
      variants={stagger.container}
      initial="initial"
      animate="animate"
      className="space-y-10"
    >
      {/* ── Hero ────────────────────────────────────────────── */}
      <motion.div variants={stagger.item} className="relative">
        {/* Glow layers */}
        <div className="absolute -top-10 -right-10 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-56 h-56 rounded-full bg-violet-400/10 blur-3xl pointer-events-none" />

        <div className="glass-float relative overflow-hidden p-8 md:p-12">
          {/* Subtle inner gradient */}
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/5 via-transparent to-violet-500/5 pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-5">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-full px-4 py-1.5 text-sm font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              منصة التعليم المتميز
            </div>

            <h1 className="text-4xl md:text-5xl font-display font-black text-foreground leading-tight">
              مرحباً بك في{" "}
              <span className="text-primary">أفق التفوق</span>
            </h1>

            <p className="text-lg text-muted-foreground font-medium leading-relaxed">
              المنصة التعليمية الشاملة — تعلّم، شارك، واربح المكافآت في رحلة تعليمية فريدة.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/books">
                <button className="btn-primary text-sm">
                  تصفح المكتبة
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </Link>
              <Link href="/ai-chat">
                <button className="
                  inline-flex items-center gap-2 px-6 py-3.5 rounded-full
                  font-semibold text-sm text-foreground
                  bg-white/60 backdrop-blur border border-white/80
                  hover:bg-white/80 transition-all duration-200
                  soft-shadow
                ">
                  <Bot className="w-4 h-4 text-primary" />
                  اسأل المساعد الذكي
                </button>
              </Link>
            </div>
          </div>

          {/* Decorative icon cluster */}
          <div className="absolute left-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-4 opacity-30">
            {[BookOpen, Star, Sparkles].map((Icon, i) => (
              <Icon key={i} className="w-8 h-8 text-primary" />
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Stats ───────────────────────────────────────────── */}
      <motion.div variants={stagger.item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -3 }}
            className={`glass-card p-6 bg-gradient-to-br ${stat.bg} ${stat.border}`}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-muted-foreground">{stat.title}</p>
              <div className={`w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-4.5 h-4.5" />
              </div>
            </div>
            <p className={`font-display font-black text-4xl ${stat.color}`}>
              {stat.value.toLocaleString("ar-EG")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">نقطة</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Quick Access ────────────────────────────────────── */}
      <motion.div variants={stagger.item} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-foreground">استكشف المنصة</h2>
          <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-3 py-1 rounded-full">
            وصول سريع
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map((item, i) => (
            <Link key={i} href={item.href}>
              <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="glass-card p-6 cursor-pointer group"
              >
                <div className={`
                  w-12 h-12 rounded-2xl mb-5
                  bg-gradient-to-br ${item.gradient}
                  flex items-center justify-center text-white
                  shadow-lg ${item.glow}
                  group-hover:shadow-xl transition-all
                `}>
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-foreground text-base mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
                <ArrowLeft className="w-4 h-4 text-muted-foreground/50 mt-3 group-hover:text-primary group-hover:translate-x-[-4px] transition-all" />
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── AI assistant promo ──────────────────────────────── */}
      <motion.div variants={stagger.item}>
        <Link href="/ai-chat">
          <motion.div
            whileHover={{ y: -2 }}
            className="glass-card cursor-pointer p-6 bg-gradient-to-br from-primary/8 to-violet-400/6 border-primary/20 flex items-center gap-6"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-lg shadow-primary/30 flex-shrink-0">
              <Bot className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground text-lg mb-1">المساعد الذكي التعليمي</h3>
              <p className="text-sm text-muted-foreground">
                اسأل أي سؤال تعليمي واحصل على إجابات فورية ومفصّلة بالعربية
              </p>
            </div>
            <ArrowLeft className="w-5 h-5 text-primary flex-shrink-0" />
          </motion.div>
        </Link>
      </motion.div>
    </motion.div>
  );
}
