# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains the **Ofouq Eltafouk** (أفق التفوق) educational platform — a full-stack Arabic educational app with books, videos, social feed, AI assistant, points, educational games, rewards, authentication, admin/owner dashboards, and role-based access.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, framer-motion, recharts
- **AI**: Replit AI Integrations (OpenAI-compatible, gpt-5.2)
- **Auth**: localStorage-based session tokens (`ofouq_user` + `ofouq_token` keys)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── ofouq-eltafouk/     # React + Vite frontend (Arabic educational platform)
│       └── src/
│           ├── contexts/auth-context.tsx   # Auth state + login/register/logout
│           ├── components/
│           │   ├── layout.tsx              # Main app layout with sidebar + auth
│           │   └── logo.tsx                # SVG brand logo (sunrise motif)
│           └── pages/
│               ├── login.tsx               # User login (split design)
│               ├── register.tsx            # Multi-step registration (student/teacher/parent)
│               ├── admin-login.tsx         # Admin login (dark glass)
│               ├── owner-login.tsx         # Owner login (deep dark + gold)
│               ├── profile.tsx             # User profile page
│               ├── admin-panel.tsx         # Admin dashboard (tabbed, own layout)
│               └── owner-panel.tsx         # Owner dashboard (analytics + recharts)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/  # OpenAI AI integration
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Application Features (Ofouq Eltafouk)

### User-facing (main app)
1. **Dashboard** - Welcome page with stats, hero banner, quick navigation
2. **Books (المكتبة)** - Browse/search books, reserve or purchase with points
3. **Videos (الدروس)** - Educational video library organized by subject
4. **Social Feed (مجتمع التفوق)** - X/Threads-style social platform for students
5. **AI Assistant (المساعد الذكي)** - Built-in AI chat (Arabic + English)
6. **Points (النقاط)** - Purchase points, earn via games, view history
7. **Games (المسابقات)** - Educational quiz games with points rewards
8. **Rewards (المكافآت)** - Redeem points for books, gifts, vouchers
9. **Profile (ملفي)** - View/edit personal info, points balance, activity history

### Authentication
- `/login` — Email/password login, demo account quick fill, links to register + admin/owner login
- `/register` — Multi-step registration: Role select → Basic info → Role-specific form (Student/Teacher/Parent)
- `/admin-login` — Admin-only login (dark glassmorphism design)
- `/owner-login` — Owner-only login (deep dark + gold design)
- Auth flow: `POST /api/auth/login` → stores `ofouq_user` + `ofouq_token` in localStorage

### Admin Panel (`/admin`)
Full management dashboard for admins and owners, with tabbed sidebar layout:
- **لوحة التحكم** — Platform stats (users, books, videos, points, reports)
- **المستخدمون** — Users CRUD (add, suspend, delete, change role)
- **الكتب** — Books CRUD with **preview-before-publish** workflow
- **الفيديوهات** — Videos CRUD with **preview-before-publish** workflow
- **المنشورات** — Social posts moderation (view + delete)
- **التقارير** — Reports management (resolve/dismiss)
- **البنرات** — Banners management with **preview-before-publish** workflow

### Owner Panel (`/owner`)
Executive dashboard (owner-role only) with tabbed sidebar + gold styling:
- **الإحصائيات** — Analytics: user growth trend (recharts AreaChart), geographic distribution (BarChart), points flow (BarChart), content performance (PieChart)
- **إدارة المشرفين** — Add/remove admins, promote to owner
- **جميع المستخدمين** — Filterable user table (all roles)
- **تقارير متقدمة** — KPI metrics, content performance comparison chart, top content items

## Auth System

- **Token format**: `session_{userId}` stored in `localStorage` as `ofouq_token`
- **User data**: Full user object stored in `localStorage` as `ofouq_user`
- **API routes**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/profile`, `POST /api/auth/seed-demo`
- **Demo accounts**: Seeded via `/api/auth/seed-demo`. Credentials:
  - `student@demo.com` / `demo123` (role: student)
  - `teacher@demo.com` / `demo123` (role: teacher)
  - `admin@demo.com` / `admin123` (role: admin)
  - `owner@demo.com` / `owner123` (role: owner)
- **AuthContext** in `src/contexts/auth-context.tsx` provides `user`, `token`, `login`, `register`, `logout`, `updateUser`
- Token is automatically attached to all generated API client calls via `setAuthTokenGetter`

## Role System

| Role | Arabic | Description | Panel |
|------|--------|-------------|-------|
| student | طالب | Default learner | Main app |
| teacher | معلم | Content contributor | Main app |
| parent | ولي أمر | Monitors children | Main app |
| admin | مشرف | Content + user management | `/admin` |
| owner | مالك | Full platform authority | `/owner` + `/admin` |

## Database Schema

Extended `users` table includes:
- `id`, `name`, `email`, `password`, `role`, `status`
- `avatarUrl`, `phone`, `age`, `address`, `parentPhone`
- `specialty`, `qualifications`, `howDidYouHear`, `supportNeeded`
- `bio`, `governorate`, `joinedAt`

Other tables: `books`, `book_reservations`, `book_purchases`, `videos`, `posts`, `comments`, `post_likes`, `points_account`, `points_transactions`, `games`, `questions`, `rewards`, `redemptions`, `conversations`, `messages`, `reports`, `banners`

## API Routes

All routes under `/api`:
- `/healthz` - Health check
- `/auth/register`, `/auth/login`, `/auth/me`, `/auth/profile`, `/auth/seed-demo`
- `/books`, `/books/:id`, `/books/:id/reserve`, `/books/:id/purchase`
- `/videos`, `/videos/:id`
- `/posts`, `/posts/:id`, `/posts/:id/like`, `/posts/:id/comments`
- `/points`, `/points/purchase`, `/points/history`
- `/games`, `/games/:id`, `/games/:id/submit`
- `/rewards`, `/rewards/:id/redeem`, `/rewards/redemptions`
- `/openai/conversations`, `/openai/conversations/:id`, `/openai/conversations/:id/messages`
- `/admin/*` — Full CRUD for users, books, videos, reports, rewards, banners, stats
- `/moderator/*` — Posts moderation CRUD

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`.

- `pnpm run typecheck` — runs full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types after spec changes
- `pnpm --filter @workspace/db run push` — push schema changes to DB
- `pnpm --filter @workspace/db run push-force` — force push (use when drizzle detects breaking changes)

## Design System

- **Theme**: Apple-inspired glassmorphism — CSS classes `glass-card`, `glass-panel`, `glass-float`, `glass-tint`
- **Primary color**: `hsl(217 91% 45%)` (deep blue)
- **Accent**: Amber/gold
- **Background**: Soft blue-gray gradient with animated mesh spots (`mesh-bg` class)
- **Typography**: Tajawal (display), Cairo (body), all Arabic RTL (`dir="rtl"`)
- **Direction**: Full RTL, `dir="rtl"` on all pages
- **Logo**: SVG sunrise/horizon motif with blue gradient background
