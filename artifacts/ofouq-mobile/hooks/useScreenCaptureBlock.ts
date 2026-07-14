import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

// Owner-controlled global toggle (web panel → «الإعدادات»): whether protected
// screens (the lesson video player) block screenshots / screen recording.
// FAIL-SAFE: defaults to TRUE (blocked — the app's historical behavior) until
// the server answers, so a network error never lowers protection.
export function useScreenCaptureBlockEnabled(): boolean {
  const { token } = useAuth();
  const { data } = useQuery({
    // token in the key: a cached answer for user A must never apply to user B
    // after an account switch on the same device.
    queryKey: ["app-config", token],
    queryFn: () => apiFetch<{ screenCaptureBlockEnabled: boolean }>("/api/app-config", { token }),
    enabled: !!token,
    staleTime: 60_000,
    // Re-poll while mounted (i.e. while a lesson is open) so an owner toggle reaches
    // a student who STAYS inside the player within ~a minute — staleTime alone never
    // refetches without a mount/focus trigger (adversarial-review finding).
    refetchInterval: 60_000,
  });
  return data?.screenCaptureBlockEnabled ?? true;
}
