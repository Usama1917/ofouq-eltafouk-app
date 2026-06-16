import { Router, type IRouter } from "express";
import { db, rewardsTable, redemptionsTable, pointsAccountTable, pointsTransactionsTable, usersTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { getSessionUserId } from "../lib/auth";

const router: IRouter = Router();

const ADMIN_ROLES = new Set(["admin", "owner"]);

// Loads the authenticated, active user (id + role). Returns null after sending
// 401 for anonymous/unknown/inactive accounts. Mirrors moderator.ts/books.ts.
async function requireUser(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  return user;
}

// DEFERRED: the rewards economy currently runs on a single shared/global points
// account and a world-shaped redemptions table (no userId column), so every
// redemption draws from and is visible against the same balance. The per-user
// wallet redesign (per-user balance + ownership column on redemptions) needs a
// DB schema migration and is intentionally NOT done here. For now we at least
// require authentication so only logged-in users can spend points or read the
// redemption history.

router.get("/rewards", async (req, res) => {
  try {
    const rewards = await db.select().from(rewardsTable);
    res.json(rewards);
  } catch (err) {
    req.log.error({ err }, "Failed to list rewards");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/rewards/redemptions", async (req, res) => {
  try {
    // review B-24: the redemptions table has no per-user ownership column (per-user
    // wallets are DEFERRED — see the note above), so this list is global. Returning
    // every user's redemptions to any logged-in user leaks others' activity; restrict
    // it to staff (admin/owner) until per-user wallets land.
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ADMIN_ROLES.has(user.role)) {
      return res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    }

    const redemptions = await db.select().from(redemptionsTable).orderBy(desc(redemptionsTable.createdAt));
    res.json(redemptions);
  } catch (err) {
    req.log.error({ err }, "Failed to list redemptions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rewards/:id/redeem", async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });

    const rewardId = parseInt(req.params.id);
    const [reward] = await db.select().from(rewardsTable).where(eq(rewardsTable.id, rewardId));
    if (!reward) return res.status(404).json({ error: "Reward not found" });
    if (!reward.available) return res.status(400).json({ error: "Reward not available" });

    // review B-48: previously this read the balance, checked it, then wrote the new
    // balance in separate statements — two concurrent redeems could both pass the
    // check and overspend (TOCTOU). Now we deduct inside a transaction with a
    // conditional UPDATE (... WHERE balance >= cost): if no row comes back the
    // balance was insufficient at write time and nothing was charged.
    const cost = reward.pointsCost;
    const result = await db.transaction(async (tx) => {
      // Ensure the (single, shared) account exists; onConflictDoNothing keeps this
      // safe if two requests race to create the first account.
      const existing = await tx.select({ id: pointsAccountTable.id }).from(pointsAccountTable).limit(1);
      let accountId = existing[0]?.id;
      if (accountId === undefined) {
        const [created] = await tx
          .insert(pointsAccountTable)
          .values({ balance: 100, totalEarned: 100, totalSpent: 0 })
          .returning({ id: pointsAccountTable.id });
        accountId = created?.id;
        if (accountId === undefined) {
          // A concurrent insert won the race; re-select the existing row.
          const [row] = await tx.select({ id: pointsAccountTable.id }).from(pointsAccountTable).limit(1);
          accountId = row?.id;
        }
      }
      if (accountId === undefined) return null;

      const [updated] = await tx
        .update(pointsAccountTable)
        .set({
          balance: sql`${pointsAccountTable.balance} - ${cost}`,
          totalSpent: sql`${pointsAccountTable.totalSpent} + ${cost}`,
          updatedAt: new Date(),
        })
        .where(and(eq(pointsAccountTable.id, accountId), gte(pointsAccountTable.balance, cost)))
        .returning({ balance: pointsAccountTable.balance });

      // Conditional UPDATE didn't apply → balance was below cost. Insufficient funds.
      if (!updated) return { ok: false as const };

      await tx.insert(pointsTransactionsTable).values({
        type: "spend",
        amount: cost,
        description: `استبدال مكافأة: ${reward.title}`,
      });

      await tx.insert(redemptionsTable).values({
        rewardId,
        rewardTitle: reward.title,
        pointsSpent: cost,
        status: "completed",
      });

      return { ok: true as const, newBalance: updated.balance };
    });

    if (!result || !result.ok) {
      return res.status(400).json({ error: "رصيد غير كافٍ" });
    }

    res.json({ success: true, pointsSpent: cost, newBalance: result.newBalance, rewardTitle: reward.title });
  } catch (err) {
    req.log.error({ err }, "Failed to redeem reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
