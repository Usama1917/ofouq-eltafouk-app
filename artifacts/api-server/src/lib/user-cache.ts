import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// review B-34: every authenticated request re-loads the caller's row just to check
// role/status — one mandatory DB round-trip per call. This caches that {id, role,
// status} lookup for a short TTL to remove the round-trip on the hot student paths
// (watch-progress, lesson/list loads). Staleness after a suspend / role change is
// bounded by the TTL, and is made immediate by invalidateUserAuth() called from the
// admin user-mutation handlers.
export type CachedUserAuth = { id: number; role: string; status: string };

const TTL_MS = 10_000;
const cache = new Map<number, { value: CachedUserAuth | null; expires: number }>();

export async function getUserAuth(userId: number): Promise<CachedUserAuth | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expires > now) return hit.value;

  const [row] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const value: CachedUserAuth | null = row ?? null;
  cache.set(userId, { value, expires: now + TTL_MS });

  // Opportunistic cleanup so the map can't grow without bound.
  if (cache.size > 10_000) {
    for (const [key, entry] of cache) {
      if (entry.expires <= now) cache.delete(key);
    }
  }
  return value;
}

/** Drop a user's cached auth so a role/status change takes effect immediately. */
export function invalidateUserAuth(userId: number): void {
  cache.delete(userId);
}
