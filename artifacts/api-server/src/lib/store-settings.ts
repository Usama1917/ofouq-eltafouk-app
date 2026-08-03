import { asc } from "drizzle-orm";
import { db, storeSettingsTable } from "@workspace/db";

// Store settings are a singleton row. Extracted from routes/store.ts so library
// code (order status, ERP sync) can read them without importing a route module.
export async function getStoreSettings() {
  // orderBy(asc id) so GET + PUT always resolve to the SAME (lowest) row even if a
  // first-call race ever created a duplicate — the singleton stays deterministic.
  const [existing] = await db.select().from(storeSettingsTable).orderBy(asc(storeSettingsTable.id)).limit(1);
  if (existing) return existing;
  await db.insert(storeSettingsTable).values({}).onConflictDoNothing();
  const [row] = await db.select().from(storeSettingsTable).orderBy(asc(storeSettingsTable.id)).limit(1);
  return row;
}
