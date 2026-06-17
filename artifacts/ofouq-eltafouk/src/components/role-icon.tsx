import { Crown, ShieldCheck } from "lucide-react";

// A small marker shown next to a user's name anywhere in the staff portal so the
// owner / admins are recognisable at a glance:
//   owner            → crown   (amber)
//   admin / moderator → shield  (violet)
//   everyone else     → nothing
// `shrink-0` keeps it visible even when the name next to it truncates.
export function RoleIcon({ role, className = "h-4 w-4" }: { role?: string | null; className?: string }) {
  if (role === "owner") {
    return <Crown className={`shrink-0 text-amber-500 ${className}`} aria-label="مالك" />;
  }
  if (role === "admin" || role === "moderator") {
    return <ShieldCheck className={`shrink-0 text-violet-500 ${className}`} aria-label="مشرف" />;
  }
  return null;
}
