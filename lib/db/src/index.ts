import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const DATABASE_URL_CANDIDATES = [
  { key: "DATABASE_URL", value: process.env.DATABASE_URL },
  { key: "POSTGRES_URL", value: process.env.POSTGRES_URL },
  { key: "POSTGRES_URL_NON_POOLING", value: process.env.POSTGRES_URL_NON_POOLING },
  { key: "POSTGRES_PRISMA_URL", value: process.env.POSTGRES_PRISMA_URL },
  { key: "POSTGRESQL_URL", value: process.env.POSTGRESQL_URL },
] as const;

const databaseUrlCandidate = DATABASE_URL_CANDIDATES.find((item) => typeof item.value === "string" && item.value.length > 0);
const DATABASE_URL = databaseUrlCandidate?.value;
const DATABASE_URL_SOURCE = databaseUrlCandidate?.key ?? null;

if (!DATABASE_URL) {
  throw new Error(
    "Database URL is missing. Set DATABASE_URL or POSTGRES_URL.",
  );
}

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle(pool, { schema });
export const databaseUrlSource = DATABASE_URL_SOURCE;

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pingDatabase() {
  await pool.query("select 1");
}

export type WaitForDatabaseOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

export async function waitForDatabase(options: WaitForDatabaseOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await pingDatabase();
      return;
    } catch (err) {
      lastError = err;
      await sleep(intervalMs);
    }
  }

  const causeMessage = getErrorMessage(lastError);
  throw new Error(`Database readiness check timed out after ${timeoutMs}ms: ${causeMessage}`);
}

export async function assertRequiredTablesExist(tableNames: string[]) {
  if (tableNames.length === 0) return;

  const rows = await pool.query<{ tablename: string }>(
    `
      select tablename
      from pg_catalog.pg_tables
      where schemaname = 'public' and tablename = any($1::text[])
    `,
    [tableNames],
  );

  const existing = new Set(rows.rows.map((row) => row.tablename));
  const missing = tableNames.filter((tableName) => !existing.has(tableName));
  if (missing.length > 0) {
    throw new Error(
      `Database schema is missing required tables: ${missing.join(", ")}. Run: pnpm --filter @workspace/db run push`,
    );
  }
}

export * from "./schema";
