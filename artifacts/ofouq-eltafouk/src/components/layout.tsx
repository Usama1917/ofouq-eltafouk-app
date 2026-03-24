import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Video, MessageSquare, Bot,
  Gamepad2, Gift, LayoutDashboard, Coins,
  ChevronLeft, Sparkles
} from "lucide-react";
import { useGetPoints } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/books", label: "المكتبة", icon: BookOpen },
  { href: "/videos", label: "الدروس المرئية", icon: Video },
  { href: "/social", label: "المجتمع", icon: MessageSquare },
  { href: "/ai-chat", label: "المساعد الذكي", icon: Bot },
  { href: "/games", label: "المسابقات", icon: Gamepad2 },
  { href: "/rewards", label: "المكافآت", icon: Gift },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: pointsData } = useGetPoints();

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
        <div className="px-7 pt-8 pb-6">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="
                w-10 h-10 rounded-2xl flex items-center justify-center
                bg-gradient-to-br from-primary to-blue-600
                shadow-lg shadow-primary/30
                group-hover:shadow-primary/50 transition-all
                text-white font-display font-black text-lg
              ">
                أ
              </div>
              <div>
                <p className="font-display font-black text-xl text-foreground leading-none">أفق التفوق</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">منصة التعليم المتميز</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

        {/* Nav items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto hide-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
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
          })}
        </nav>

        {/* Points badge */}
        <div className="px-4 pb-6">
          <div className="mx-2 h-px bg-gradient-to-l from-transparent via-border to-transparent mb-5" />
          <Link href="/points">
            <motion.div
              whileHover={{ y: -2 }}
              className="
                glass-card cursor-pointer p-4
                bg-gradient-to-br from-amber-50/80 to-orange-50/60
                border-amber-200/40
              "
            >
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
        </div>
      </aside>

      {/* ── Mobile Header ────────────────────────────────────── */}
      <header className="
        md:hidden fixed top-0 left-0 right-0 z-50
        glass-panel border-b border-white/60
        px-4 py-3.5 flex items-center justify-between
      ">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-display font-black text-sm shadow-md shadow-primary/30">
              أ
            </div>
            <span className="font-display font-black text-lg text-foreground">أفق التفوق</span>
          </div>
        </Link>
        <Link href="/points">
          <div className="flex items-center gap-1.5 bg-amber-400/15 text-amber-600 px-3 py-1.5 rounded-full font-bold text-sm border border-amber-200/50">
            <Coins className="w-4 h-4" />
            {pointsData?.balance ?? 0}
          </div>
        </Link>
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
                flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all
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
      </nav>
    </div>
  );
}
