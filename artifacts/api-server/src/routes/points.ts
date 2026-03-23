import { Router, type IRouter } from "express";
import { db, pointsAccountTable, pointsTransactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateAccount() {
  const accounts = await db.select().from(pointsAccountTable).limit(1);
  if (accounts.length > 0) return accounts[0];
  const [account] = await db.insert(pointsAccountTable).values({ balance: 100, totalEarned: 100, totalSpent: 0 }).returning();
  await db.insert(pointsTransactionsTable).values({
    type: "earn",
    amount: 100,
    description: "نقاط ترحيبية للمستخدم الجديد",
  });
  return account;
}

router.get("/points", async (req, res) => {
  try {
    const account = await getOrCreateAccount();
    res.json({ balance: account.balance, totalEarned: account.totalEarned, totalSpent: account.totalSpent });
  } catch (err) {
    req.log.error({ err }, "Failed to get points");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/points/purchase", async (req, res) => {
  try {
    const { amount, packageName } = req.body;
    const account = await getOrCreateAccount();

    const newBalance = account.balance + amount;
    const newTotalEarned = account.totalEarned + amount;

    await db.update(pointsAccountTable)
      .set({ balance: newBalance, totalEarned: newTotalEarned, updatedAt: new Date() })
      .where(eq(pointsAccountTable.id, account.id));

    await db.insert(pointsTransactionsTable).values({
      type: "purchase",
      amount,
      description: `شراء باقة: ${packageName}`,
    });

    res.json({ balance: newBalance, totalEarned: newTotalEarned, totalSpent: account.totalSpent });
  } catch (err) {
    req.log.error({ err }, "Failed to purchase points");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/points/history", async (req, res) => {
  try {
    const transactions = await db.select().from(pointsTransactionsTable).orderBy(desc(pointsTransactionsTable.createdAt));
    res.json(transactions);
  } catch (err) {
    req.log.error({ err }, "Failed to get points history");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
