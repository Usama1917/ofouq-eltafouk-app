import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  BookOpen, Video, MessageSquare, Bot, 
  Award, Gamepad2, Gift, LayoutDashboard,
  Coins
} from "lucide-react";
import { useGetPoints } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/books", label: "المكتبة", icon: BookOpen },
  { href: "/videos", label: "الدروس المرئية", icon: Video },
  { href: "/social", label: "مجتمع التفوق", icon: MessageSquare },
  { href: "/ai-chat", label: "المساعد الذكي", icon: Bot },
  { href: "/games", label: "المسابقات", icon: Gamepad2 },
  { href: "/rewards", label: "المكافآت", icon: Gift },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: pointsData } = useGetPoints();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row" dir="rtl">
      {/* Sidebar (Desktop) & Bottom Nav (Mobile) */}
      <nav className="fixed md:sticky top-0 right-0 z-50 w-full md:w-72 md:h-screen glass-panel md:border-l border-b md:border-b-0 flex flex-col justify-between order-2 md:order-1 bottom-0 md:bottom-auto mt-auto md:mt-0">
        <div className="p-6 hidden md:block">
          <Link href="/">
            <h1 className="font-display text-3xl font-extrabold text-primary cursor-pointer flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-lg">
                أ
              </div>
              أفق التفوق
            </h1>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-2 md:py-6 px-2 md:px-4 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-hidden hide-scrollbar items-center md:items-stretch">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="flex-shrink-0">
                <div className={`
                  flex items-center gap-3 px-4 py-3 md:py-4 rounded-xl transition-all duration-300 cursor-pointer
                  ${isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 translate-x-0 md:-translate-x-2" 
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}
                `}>
                  <item.icon className={`w-6 h-6 ${isActive ? "text-accent" : ""}`} />
                  <span className={`font-semibold hidden md:block ${isActive ? "text-white" : ""}`}>
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 hidden md:block">
          <Link href="/points">
            <div className="bg-gradient-to-r from-accent/20 to-accent/5 border border-accent/20 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 text-accent font-bold mb-1">
                <Coins className="w-5 h-5" />
                رصيد النقاط
              </div>
              <div className="text-2xl font-display font-extrabold text-foreground">
                {pointsData?.balance || 0} <span className="text-sm font-sans text-muted-foreground">نقطة</span>
              </div>
            </div>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden order-1 md:order-2 pb-20 md:pb-0">
        {/* Mobile Header */}
        <header className="md:hidden glass-panel sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
          <h1 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-sm">
              أ
            </div>
            أفق التفوق
          </h1>
          <Link href="/points">
            <div className="flex items-center gap-1.5 bg-accent/10 text-accent px-3 py-1.5 rounded-full font-bold text-sm">
              <Coins className="w-4 h-4" />
              {pointsData?.balance || 0}
            </div>
          </Link>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
