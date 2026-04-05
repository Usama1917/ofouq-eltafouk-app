import app from "./app";
import { logger } from "./lib/logger";
import { assertRequiredTablesExist, databaseUrlSource, waitForDatabase } from "@workspace/db";

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

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
