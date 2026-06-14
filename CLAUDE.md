# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Ofouq Eltafouk (أفق التفوق)** — Arabic RTL education platform. One Express 5 + PostgreSQL (Drizzle) API serves two clients: `artifacts/ofouq-eltafouk` (React/Vite admin+owner web) and `artifacts/ofouq-mobile` (Expo SDK 54 student app). pnpm monorepo, Node 24. Target scale: 1,000–5,000 students watching lessons concurrently (videos on YouTube for now). Owner is non-technical — explain in plain Egyptian Arabic.

**Commands:** `pnpm run typecheck` before commits; `pnpm db:local:up` then `PORT=8080 pnpm --filter @workspace/api-server run dev` to run. See `local-run-runbook` memory for the full local stack (Docker DB :55432, API :8080, Expo, web :18936).

**Security (top priority):** `api-server/src/lib/auth.ts` = scrypt passwords + HMAC-signed 30-day tokens; `AUTH_SECRET` required in prod. Authenticate via `getSessionUserId`; never gate a root-mounted router without a path prefix. Subscription paywall on videos/academic (admin/owner bypass); helmet, CORS allowlist, rate limits.

**UX:** RTL/i18n everywhere; 401 → auto sign-out + redirect on both clients; refresh must not bounce logged-in users; `SOFT_LAUNCH_MODE` hides Books+AI.

**Performance:** keep video/list endpoints paginated and cache-safe; DB pool tuned in `lib/db`. `replit.md` is stale on auth.
