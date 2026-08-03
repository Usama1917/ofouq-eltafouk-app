import app from "./app";
import { logger } from "./lib/logger";
import { assertRequiredTablesExist, databaseUrlSource, waitForDatabase } from "@workspace/db";
import { startGamificationAutomationWorker } from "./lib/automated-messages";
import { startErpWorker } from "./lib/erp-worker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  const dbReadyTimeoutMs = Number.parseInt(process.env.DB_READY_TIMEOUT_MS ?? "45000", 10);
  const timeoutMs = Number.isFinite(dbReadyTimeoutMs) && dbReadyTimeoutMs > 0 ? dbReadyTimeoutMs : 45000;

  try {
    await waitForDatabase({ timeoutMs, intervalMs: 1000 });
    await assertRequiredTablesExist([
      "users",
      "materials",
      "academic_years",
      "subjects",
      "units",
      "lessons",
      "videos",
      "subject_subscription_requests",
      "subject_subscriptions",
      "notifications",
      "push_notification_tokens",
      "lesson_watch_progress",
      "support_conversations",
      "support_messages",
      "support_automatic_messages",
    ]);
    logger.info(
      { db: { source: databaseUrlSource, readyTimeoutMs: timeoutMs } },
      "Database is ready",
    );
  } catch (err) {
    logger.error(
      { err, db: { source: databaseUrlSource, readyTimeoutMs: timeoutMs } },
      "Database is not ready. API startup aborted.",
    );
    process.exit(1);
  }

  const server = app.listen(port, "0.0.0.0", (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ host: "0.0.0.0", port }, "Server listening");

    // v2 Phase 1: seed the automated-message defaults and start the daily worker that
    // sends the evening streak reminder at its configured Cairo hour.
    startGamificationAutomationWorker();
    // Retries orders that couldn't reach ERPNext and keeps book stock in step
    // with the warehouse. No-ops when the integration isn't configured.
    startErpWorker();
  });

  // Graceful shutdown (review B-14): stop accepting new connections and let
  // in-flight requests drain before exiting, so deploys/restarts don't drop
  // students mid-request. Force-exit if draining hangs.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down gracefully");
    const forceTimer = setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 25_000);
    forceTimer.unref();
    server.close((closeErr) => {
      if (closeErr) {
        logger.error({ err: closeErr }, "Error during server close");
        process.exit(1);
      }
      logger.info("Server closed");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Last-resort safety nets (review B-37): route through the structured logger
// (which redacts auth headers) instead of Node's bare default, and exit cleanly on
// a fatal uncaught exception so the process manager can restart us.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});

void start();
