import { Router, type IRouter } from "express";
import { db, rewardsTable, redemptionsTable, pointsAccountTable, pointsTransactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

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
    const redemptions = await db.select().from(redemptionsTable).orderBy(desc(redemptionsTable.createdAt));
    res.json(redemptions);
  } catch (err) {
    req.log.error({ err }, "Failed to list redemptions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rewards/:id/redeem", async (req, res) => {
  try {
    const rewardId = parseInt(req.params.id);
    const [reward] = await db.select().from(rewardsTable).where(eq(rewardsTable.id, rewardId));
    if (!reward) return res.status(404).json({ error: "Reward not found" });
    if (!reward.available) return res.status(400).json({ error: "Reward not available" });

    const accounts = await db.select().from(pointsAccountTable).limit(1);
    let account = accounts[0];
    if (!account) {
      [account] = await db.insert(pointsAccountTable).values({ balance: 100, totalEarned: 100, totalSpent: 0 }).returning();
    }

    if (account.balance < reward.pointsCost) {
      return res.status(400).json({ error: "Insufficient points" });
    }

    const newBalance = account.balance - reward.pointsCost;
    await db.update(pointsAccountTable)
      .set({ balance: newBalance, totalSpent: account.totalSpent + reward.pointsCost, updatedAt: new Date() })
      .where(eq(pointsAccountTable.id, account.id));

    await db.insert(pointsTransactionsTable).values({
      type: "spend",
      amount: reward.pointsCost,
      description: `استبدال مكافأة: ${reward.title}`,
    });

    await db.insert(redemptionsTable).values({
      rewardId,
      rewardTitle: reward.title,
      pointsSpent: reward.pointsCost,
      status: "completed",
    });

    res.json({ success: true, pointsSpent: reward.pointsCost, newBalance, rewardTitle: reward.title });
  } catch (err) {
    req.log.error({ err }, "Failed to redeem reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
