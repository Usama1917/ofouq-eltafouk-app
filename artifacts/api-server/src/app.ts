import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "./routes";
import { logger } from "./lib/logger";
import { getSessionUserId } from "./lib/auth";

const app: Express = express();

// Trust the reverse proxy (nginx / DO load balancer) so client IPs (used by the
// rate limiter) and protocol are read from X-Forwarded-* headers.
app.set("trust proxy", 1);

// ── CORS allowlist ────────────────────────────────────────────────────────────
// In production, restrict to the configured origins (comma-separated ALLOWED_ORIGINS).
// Requests with no Origin (mobile apps, curl, same-origin) are always allowed.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0) {
      // No allowlist configured: permissive in dev, but warn so prod doesn't ship open.
      if (process.env.NODE_ENV === "production") {
        logger.warn("ALLOWED_ORIGINS is not set — refusing cross-origin browser request in production");
        return callback(null, false);
      }
      return callback(null, true);
    }
    return callback(null, ALLOWED_ORIGINS.includes(origin));
  },
  credentials: true,
};
// API clients in this app expect JSON bodies for successful reads.
// Disable ETag/304 responses to avoid first-load stale conditional requests
// causing empty-body states in route-level data loaders.
app.disable("etag");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet({
  // The API serves JSON + static uploads (not an HTML app), so the default CSP
  // (which targets HTML) is unnecessary and would only risk breaking media URLs.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict limiter on auth endpoints (brute-force / credential-stuffing defence),
// plus a generous global limiter to blunt abuse without hurting normal use.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." },
});
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "طلبات كثيرة. حاول مرة أخرى بعد قليل." },
});

// Stricter limiter for the public (pre-account) profile-photo upload, which writes
// a 5MB file to disk per request (review B-22).
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "محاولات رفع كثيرة. حاول مرة أخرى بعد قليل." },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/profile-photo/upload", uploadLimiter);
app.use("/api", globalLimiter);

// Defense-in-depth (review B-41): gate the entire /api/admin namespace at the app
// level so an /admin route in ANY router that forgets its own requireAdmin can't be
// reached without an admin/owner session. Per-handler checks remain as a second layer.
app.use("/api/admin", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const [actor] = await db
      .select({ role: usersTable.role, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!actor || actor.status === "suspended" || (actor.role !== "admin" && actor.role !== "owner")) {
      res.status(403).json({ error: "غير مصرح لك بالوصول" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Payment-proof screenshots must not be world-readable (review B-03): require a
// session before serving anything under uploads/subscription-codes.
app.use("/api/uploads/subscription-codes", (req: Request, res: Response, next: NextFunction) => {
  if (!getSessionUserId(req)) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  next();
});

app.use(
  "/api/uploads",
  express.static(path.resolve(process.cwd(), "uploads"), { dotfiles: "deny", index: false }),
);

app.use("/api", router);

// 404 JSON fallback for unknown API routes so clients always get the { error } shape
// instead of Express's default HTML (review B-36).
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "غير موجود" });
});

// Terminal error handler (review B-36): always respond with the app's JSON shape and
// never leak a stack trace / raw message in production. Catches body-parser failures
// (malformed/oversized JSON) that throw before any route's try/catch runs.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  (req as Request & { log?: { error?: (...a: unknown[]) => void } }).log?.error?.({ err }, "Unhandled request error");
  if (res.headersSent) return next(err);
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "حجم الطلب كبير جدًا" });
    return;
  }
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    res.status(400).json({ error: "صيغة الطلب غير صحيحة" });
    return;
  }
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: "خطأ في الخادم" });
});

export default app;
