import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Video, MessageSquare, Bot,
  Gamepad2, Gift, LayoutDashboard, Coins,
  ChevronLeft, User, ShieldCheck, Crown, LogIn, ShoppingCart, Truck, History,
} from "lucide-react";
import { useGetPoints } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Logo } from "@/components/logo";

type NavSubItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  children?: NavSubItem[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  {
    href: "/books",
    label: "المكتبة",
    icon: BookOpen,
    children: [
      { href: "/books", label: "إضافة إلى السلة", icon: BookOpen },
      { href: "/books/cart", label: "السلة", icon: ShoppingCart },
      { href: "/books/tracking", label: "تتبع الأوردرات", icon: Truck },
      { href: "/books/orders", label: "سجل الأوردرات", icon: History },
    ],
  },
  { href: "/videos", label: "الدروس المرئية", icon: Video },
  { href: "/social", label: "المجتمع", icon: MessageSquare },
  { href: "/ai-chat", label: "Ai التفوق", icon: Bot },
  { href: "/games", label: "المسابقات", icon: Gamepad2 },
  { href: "/rewards", label: "المكافآت", icon: Gift },
];

function UserBadge() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) {
    return (
      <Link href="/login">
        <motion.div whileHover={{ y: -1 }}
          className="glass-card cursor-pointer p-3.5 flex items-center gap-3 bg-gradient-to-br from-primary/5 to-blue-50/60 border-primary/20 hover:border-primary/40 transition-all">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <LogIn className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">غير مسجّل</p>
            <p className="text-sm font-bold text-primary">تسجيل الدخول</p>
          </div>
        </motion.div>
      </Link>
    );
  }

  const ROLE_LABELS: Record<string, string> = { student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", owner: "مالك" };
  const ROLE_COLORS: Record<string, string> = {
    student: "from-blue-500 to-indigo-600",
    teacher: "from-emerald-500 to-teal-600",
    parent: "from-amber-500 to-orange-600",
    admin: "from-violet-500 to-purple-700",
    owner: "from-rose-400 to-pink-600",
  };

  return (
    <div className="space-y-2">
      <Link href="/profile">
        <motion.div whileHover={{ y: -1 }}
          className="glass-card cursor-pointer p-3.5 flex items-center gap-3 hover:border-primary/30 transition-all mt-[10px] mb-[10px]">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ROLE_COLORS[user.role] || ROLE_COLORS.student} flex items-center justify-center text-white font-display font-black text-sm`}>
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
          <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </motion.div>
      </Link>
      {(user.role === "admin" || user.role === "owner") && (
        <div className="flex gap-2">
          {(user.role === "admin" || user.role === "owner") && (
            <Link href="/admin" className="flex-1">
              <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-50 border border-violet-200/50 text-violet-700 font-bold text-xs hover:bg-violet-100 transition-all cursor-pointer">
                <ShieldCheck className="w-3.5 h-3.5" /> لوحة المشرف
              </div>
            </Link>
          )}
          {user.role === "owner" && (
            <Link href="/owner" className="flex-1">
              <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 border border-amber-200/50 text-amber-700 font-bold text-xs hover:bg-amber-100 transition-all cursor-pointer">
                <Crown className="w-3.5 h-3.5" /> لوحة المالك
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: pointsData } = useGetPoints();
  const { user } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "/books": location.startsWith("/books"),
  });

  useEffect(() => {
    if (!location.startsWith("/books")) return;
    setExpandedGroups((prev) => ({ ...prev, "/books": true }));
  }, [location]);

  const isRouteActive = (href: string) => location === href || (href !== "/" && location.startsWith(href));

  return (
    <div className="min-h-screen flex flex-col md:flex-row" dir="rtl">
      {/* Ambient mesh background */}
      <div className="mesh-bg" aria-hidden />
      {/* ── Sidebar (desktop) ────────────────────────────────── */}
      <aside className="
        hidden md:flex flex-col
        fixed top-0 right-0 h-screen w-72 z-40
        glass-panel
        border-l border-white/60
      ">
        {/* Logo */}
        <div className="px-6 pt-7 pb-5">
          <Link href="/">
            <div className="cursor-pointer">
              <Logo size={40} />
            </div>
          </Link>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

        {/* Nav items */}
        <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto hide-scrollbar">
          {NAV_ITEMS.map((item) => {
            const hasChildren = Array.isArray(item.children) && item.children.length > 0;
            const isActive = isRouteActive(item.href);
            if (!hasChildren) {
              return (
                <Link key={item.href} href={item.href}>
                  <motion.div
                    whileHover={{ x: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className={`
                      relative flex items-center gap-3.5 px-4 py-3.5 rounded-2xl cursor-pointer
                      transition-all duration-200 select-none
                      ${isActive
                        ? "bg-primary text-white shadow-lg shadow-primary/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/60"
                      }
                    `}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-2xl bg-primary"
                        style={{ zIndex: -1 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-white/90" : ""}`} />
                    <span className={`font-semibold text-sm ${isActive ? "text-white" : ""}`}>
                      {item.label}
                    </span>
                    {isActive && (
                      <ChevronLeft className="w-3.5 h-3.5 mr-auto text-white/70" />
                    )}
                  </motion.div>
                </Link>
              );
            }

            const isExpanded = Boolean(expandedGroups[item.href]);
            return (
              <div key={item.href} className="space-y-1">
                <motion.button
                  type="button"
                  whileHover={{ x: -3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (!location.startsWith(item.href)) {
                      setLocation(item.href);
                      setExpandedGroups((prev) => ({ ...prev, [item.href]: true }));
                      return;
                    }
                    setExpandedGroups((prev) => ({ ...prev, [item.href]: !prev[item.href] }));
                  }}
                  className={`
                    relative w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl cursor-pointer
                    transition-all duration-200 select-none
                    ${isActive
                      ? "bg-primary text-white shadow-lg shadow-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/60"
                    }
                  `}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-2xl bg-primary"
                      style={{ zIndex: -1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-white/90" : ""}`} />
                  <span className={`font-semibold text-sm ${isActive ? "text-white" : ""}`}>
                    {item.label}
                  </span>
                  <ChevronLeft className={`w-3.5 h-3.5 mr-auto transition-transform ${isActive ? "text-white/70" : "text-muted-foreground"} ${isExpanded ? "rotate-[-90deg]" : ""}`} />
                </motion.button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden pl-1 pr-5"
                    >
                      <div className="space-y-1.5 border-r border-white/50 pr-3 mr-3">
                        {item.children!.map((child) => {
                          const isChildActive =
                            child.href === "/books"
                              ? location === "/books"
                              : location === child.href || location.startsWith(`${child.href}/`);
                          return (
                            <Link key={child.href} href={child.href}>
                              <motion.div
                                whileHover={{ x: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className={`
                                  flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all text-xs font-semibold
                                  ${isChildActive
                                    ? "bg-primary/12 text-primary border border-primary/15"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/55 border border-transparent"
                                  }
                                `}
                              >
                                <child.icon className={`w-4 h-4 flex-shrink-0 ${isChildActive ? "text-primary" : ""}`} />
                                <span>{child.label}</span>
                              </motion.div>
                            </Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-4 pb-6 space-y-3">
          <div className="mx-2 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          {/* Points badge */}
          {user && (
            <Link href="/points">
              <motion.div whileHover={{ y: -2 }}
                className="glass-card cursor-pointer p-4 bg-gradient-to-br from-amber-50/80 to-orange-50/60 border-amber-200/40 mt-[9px] mb-[9px]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">رصيد النقاط</p>
                    <p className="font-display font-black text-2xl text-foreground">
                      {pointsData?.balance ?? 0}
                      <span className="text-sm font-sans text-muted-foreground font-normal mr-1">نقطة</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-amber-400/20 flex items-center justify-center">
                    <Coins className="w-5 h-5 text-amber-500" />
                  </div>
                </div>
              </motion.div>
            </Link>
          )}

          {/* User badge */}
          <UserBadge />
        </div>
      </aside>
      {/* ── Mobile Header ────────────────────────────────────── */}
      <header className="
        md:hidden fixed top-0 left-0 right-0 z-50
        glass-panel border-b border-white/60
        px-4 py-3 flex items-center justify-between
      ">
        <Link href="/">
          <div className="cursor-pointer">
            <Logo size={32} showText />
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/points">
                <div className="flex items-center gap-1.5 bg-amber-400/15 text-amber-600 px-3 py-1.5 rounded-full font-bold text-sm border border-amber-200/50 cursor-pointer">
                  <Coins className="w-4 h-4" />
                  {pointsData?.balance ?? 0}
                </div>
              </Link>
              <Link href="/profile">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white text-sm font-bold cursor-pointer">
                  {user.name.charAt(0)}
                </div>
              </Link>
            </>
          ) : (
            <Link href="/login">
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1.5 rounded-full font-bold text-sm border border-primary/20 cursor-pointer">
                <LogIn className="w-4 h-4" />
                دخول
              </div>
            </Link>
          )}
        </div>
      </header>
      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 md:mr-72 pt-16 md:pt-0 pb-24 md:pb-0 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      {/* ── Mobile bottom nav ────────────────────────────────── */}
      <nav className="
        md:hidden fixed bottom-0 left-0 right-0 z-50
        glass-panel border-t border-white/60
        flex items-center justify-around px-2 py-2
      ">
        {NAV_ITEMS.slice(0, 6).map((item) => {
          const isActive = location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={`
                flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all cursor-pointer
                ${isActive ? "text-primary" : "text-muted-foreground"}
              `}>
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? "bg-primary/10" : ""}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className={`text-[9px] font-bold leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {item.label.split(" ")[0]}
                </span>
              </div>
            </Link>
          );
        })}
        <Link href="/profile">
          <div className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all cursor-pointer ${location === "/profile" ? "text-primary" : "text-muted-foreground"}`}>
            <div className={`p-1.5 rounded-xl transition-all ${location === "/profile" ? "bg-primary/10" : ""}`}>
              <User className="w-5 h-5" />
            </div>
            <span className={`text-[9px] font-bold leading-none ${location === "/profile" ? "text-primary" : "text-muted-foreground"}`}>
              حسابي
            </span>
          </div>
        </Link>
      </nav>
    </div>
  );
}
