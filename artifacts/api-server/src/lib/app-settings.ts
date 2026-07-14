import { asc } from "drizzle-orm";
import { db, appSettingsTable, type AppSettings } from "@workspace/db";

// Load the single app-settings row, creating it (with safe defaults) on first use.
// orderBy(asc id) so every reader/writer resolves to the SAME (lowest) row even if a
// first-call race ever created a duplicate — the singleton stays deterministic.
export async function ensureAppSettings(): Promise<AppSettings> {
  const [existing] = await db.select().from(appSettingsTable).orderBy(asc(appSettingsTable.id)).limit(1);
  if (existing) return existing;
  await db.insert(appSettingsTable).values({}).onConflictDoNothing();
  const [row] = await db.select().from(appSettingsTable).orderBy(asc(appSettingsTable.id)).limit(1);
  if (!row) throw new Error("app_settings row missing after insert");
  return row;
}
