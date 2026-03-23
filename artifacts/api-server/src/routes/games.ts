import { Router, type IRouter } from "express";
import { db, gamesTable, questionsTable, pointsAccountTable, pointsTransactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/games", async (req, res) => {
  try {
    const games = await db.select().from(gamesTable);
    res.json(games);
  } catch (err) {
    req.log.error({ err }, "Failed to list games");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/games/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, id));
    if (!game) return res.status(404).json({ error: "Game not found" });

    const questions = await db.select().from(questionsTable).where(eq(questionsTable.gameId, id));
    res.json({ ...game, questions });
  } catch (err) {
    req.log.error({ err }, "Failed to get game");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/games/:id/submit", async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { answers } = req.body as { answers: { questionId: number; selectedIndex: number }[] };

    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId));
    if (!game) return res.status(404).json({ error: "Game not found" });

    const questions = await db.select().from(questionsTable).where(eq(questionsTable.gameId, gameId));

    let correctCount = 0;
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (question && question.correctIndex === answer.selectedIndex) {
        correctCount++;
      }
    }

    const totalQuestions = questions.length;
    const ratio = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    const pointsEarned = Math.round(game.pointsReward * ratio);

    // Update points balance
    const accounts = await db.select().from(pointsAccountTable).limit(1);
    let newBalance = pointsEarned;

    if (accounts.length > 0) {
      const account = accounts[0];
      newBalance = account.balance + pointsEarned;
      await db.update(pointsAccountTable)
        .set({ balance: newBalance, totalEarned: account.totalEarned + pointsEarned, updatedAt: new Date() })
        .where(eq(pointsAccountTable.id, account.id));
    } else {
      const [acct] = await db.insert(pointsAccountTable).values({
        balance: 100 + pointsEarned,
        totalEarned: 100 + pointsEarned,
        totalSpent: 0,
      }).returning();
      newBalance = acct.balance;
    }

    if (pointsEarned > 0) {
      await db.insert(pointsTransactionsTable).values({
        type: "earn",
        amount: pointsEarned,
        description: `إجابة صحيحة في لعبة: ${game.title} (${correctCount}/${totalQuestions})`,
      });
    }

    res.json({ correctCount, totalQuestions, pointsEarned, newBalance });
  } catch (err) {
    req.log.error({ err }, "Failed to submit game answers");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
