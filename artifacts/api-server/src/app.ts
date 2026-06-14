import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

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

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api", globalLimiter);

app.use("/api/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/api", router);

export default app;
