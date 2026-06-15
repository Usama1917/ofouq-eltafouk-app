# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Ofouq Eltafouk (أفق التفوق)** — Arabic RTL education platform. One Express 5 + PostgreSQL (Drizzle) API serves two clients: `artifacts/ofouq-eltafouk` (React/Vite admin+owner web) and `artifacts/ofouq-mobile` (Expo SDK 54 student app). pnpm monorepo, Node 24. Target scale: 1,000–5,000 students watching lessons concurrently (videos on YouTube for now). Owner is non-technical — explain in plain Egyptian Arabic.

**Commands:** `pnpm run typecheck` before commits; `pnpm db:local:up` then `PORT=8080 pnpm --filter @workspace/api-server run dev`. Full local stack (Docker DB :55432, API :8080, Expo, web :18936) in `local-run-runbook` memory.

**Security (top priority):** `api-server/src/lib/auth.ts` = scrypt passwords + HMAC-signed 30-day tokens; `AUTH_SECRET` required in prod. Authenticate via `getSessionUserId`; never gate a root-mounted router without a path prefix. Subscription paywall on videos/academic (admin/owner bypass); helmet, CORS allowlist, rate limits.

**Web `/`:** `AppShell` (App.tsx) gates home — signed-out → public `Landing` (`src/pages/landing.tsx`, own ivory theme); signed-in → Dashboard. One `<Layout>` must wrap all in-app pages; don't re-wrap or the sidebar remounts. Register hides the `parent` role in the UI (kept in code). Brand = cyan wordmark logo.

**Mobile (`ofouq-mobile`):** lesson video = custom `components/AcademicVideoPlayer` — YouTube embed in a `WebView` (`controls:0`, our own RN controls overlay; centre-tap toggles play/pause, double-tap left/right = ∓10s seek); screen-capture blocked (Android full, iOS recording-only). **The WebView HTML is memoised by `videoId`, so any edit to the in-page player JS (`buildYouTubeHtml`) needs a FULL app reload, not Fast Refresh.** Lists use the `useRefetchOnFocus` hook (RN's window-focus refetch never fires) so newly published content appears on return; a foreground push invalidates the notifications query. Keep platform fonts split (iOS system / Android NotoSansArabic). Deep player conventions live in the `video-player-conventions` memory.

**UX:** RTL/i18n everywhere (Western digits); 401 → auto sign-out + redirect on both clients; refresh must not bounce logged-in users; respect `prefers-reduced-motion`; `SOFT_LAUNCH_MODE` hides Books+AI.

**Performance:** keep video/list endpoints paginated and cache-safe; DB pool tuned in `lib/db`. `replit.md` is stale on auth.
