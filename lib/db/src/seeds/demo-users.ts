import { eq } from "drizzle-orm";
import { db } from "../index";
import { usersTable } from "../schema/users";

export const DEMO_USERS = [
  { name: "أحمد الطالب", email: "student@demo.com", password: "demo123", role: "student", status: "active" },
  { name: "د. سارة المدير", email: "admin@demo.com", password: "admin123", role: "admin", status: "active" },
  { name: "م. خالد المالك", email: "owner@demo.com", password: "owner123", role: "owner", status: "active" },
  { name: "المعلم محمد", email: "teacher@demo.com", password: "demo123", role: "teacher", status: "active" },
] as const;

function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

export type SeedDemoUsersResult = {
  created: number;
  updated: number;
  unchanged: number;
};

export async function seedDemoUsers(): Promise<SeedDemoUsersResult> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const demoUser of DEMO_USERS) {
    const email = normalizeEmail(demoUser.email);
    const [existing] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        password: usersTable.password,
        role: usersTable.role,
        status: usersTable.status,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!existing) {
      await db.insert(usersTable).values({
        name: demoUser.name,
        email,
        password: demoUser.password,
        role: demoUser.role,
        status: demoUser.status,
      });
      created += 1;
      continue;
    }

    const shouldUpdate =
      existing.name !== demoUser.name ||
      existing.password !== demoUser.password ||
      existing.role !== demoUser.role ||
      existing.status !== demoUser.status;

    if (!shouldUpdate) {
      unchanged += 1;
      continue;
    }

    await db
      .update(usersTable)
      .set({
        name: demoUser.name,
        password: demoUser.password,
        role: demoUser.role,
        status: demoUser.status,
      })
      .where(eq(usersTable.id, existing.id));
    updated += 1;
  }

  return { created, updated, unchanged };
}
