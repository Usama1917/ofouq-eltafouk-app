# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains the **Ofouq Eltafouk** (أفق التفوق) educational platform — a full-stack Arabic educational app with books, videos, social feed, AI assistant, points, educational games, and rewards.

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
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, framer-motion
- **AI**: Replit AI Integrations (OpenAI-compatible, gpt-5.2)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── ofouq-eltafouk/     # React + Vite frontend (Arabic educational platform)
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

1. **Dashboard** - Welcome page with stats, hero banner, quick navigation
2. **Books (المكتبة)** - Browse/search books, reserve or purchase with points
3. **Videos (الدروس)** - Educational video library organized by subject
4. **Social Feed (مجتمع التفوق)** - X/Threads-style social platform for students
5. **AI Assistant (المساعد الذكي)** - Built-in AI chat (Arabic + English)
6. **Points (النقاط)** - Purchase points, earn via games, view history
7. **Games (المسابقات)** - Educational quiz games with points rewards
8. **Rewards (المكافآت)** - Redeem points for books, gifts, vouchers

## Database Schema

- `books` - Book catalog
- `book_reservations` - Book reservations
- `book_purchases` - Book purchases with points
- `videos` - Educational video content
- `posts` - Social feed posts
- `comments` - Comments on posts
- `post_likes` - Post likes tracking
- `points_account` - User points balance
- `points_transactions` - Transaction history
- `games` - Quiz game definitions
- `questions` - Quiz questions with options
- `rewards` - Available rewards
- `redemptions` - Reward redemption history
- `conversations` - AI chat conversations
- `messages` - AI chat messages

## API Routes

All routes under `/api`:
- `/healthz` - Health check
- `/books`, `/books/:id`, `/books/:id/reserve`, `/books/:id/purchase`
- `/videos`, `/videos/:id`
- `/posts`, `/posts/:id`, `/posts/:id/like`, `/posts/:id/comments`
- `/points`, `/points/purchase`, `/points/history`
- `/games`, `/games/:id`, `/games/:id/submit`
- `/rewards`, `/rewards/:id/redeem`, `/rewards/redemptions`
- `/openai/conversations`, `/openai/conversations/:id`, `/openai/conversations/:id/messages`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`.

- `pnpm run typecheck` — runs full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types after spec changes
- `pnpm --filter @workspace/db run push` — push schema changes to DB
