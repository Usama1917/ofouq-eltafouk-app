import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { ChatPane } from "@/components/chat-pane";

const ADMIN_THEME_STORAGE_KEY = "ofouq-admin-theme:v1";

// Standalone full-window version of the team chat (opened via double-click on
// the floating button or the header "open in new tab" action).
export default function TeamChatPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === "dark",
  );

  // Keep in sync if the theme changes in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_THEME_STORAGE_KEY) setIsDark(e.newValue === "dark");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isStaff = Boolean(user && (user.role === "admin" || user.role === "owner"));

  useEffect(() => {
    if (!isLoading && !isStaff) setLocation("/login");
  }, [isLoading, isStaff, setLocation]);

  if (isLoading || !isStaff) return null;

  return (
    <div className={`admin-dashboard ${isDark ? "dark" : ""} h-screen bg-background text-foreground`} dir="rtl">
      <div className="mx-auto flex h-full max-w-3xl flex-col border-x border-border/40 bg-white/95 dark:bg-[#11151b]/97">
        <ChatPane />
      </div>
    </div>
  );
}
