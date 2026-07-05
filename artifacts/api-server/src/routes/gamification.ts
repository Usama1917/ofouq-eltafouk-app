import { Router, type IRouter } from "express";
import { getSessionUserId } from "../lib/auth";
import { getGamificationSummary, getLeaderboard, getPointsHistory } from "../lib/gamification";

const router: IRouter = Router();

// Student-facing gamification reads. Each route authenticates individually (this
// router is mounted at the API root, so we must NOT gate it with a bare prefix).

// Balance + streak + today's daily-goal progress for the home header + goal ring.
router.get("/me/gamification", async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    const summary = await getGamificationSummary(userId);
    return res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to load gamification summary");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// The student's points ledger (newest first) for the "النقاط والستريك" screen.
router.get("/me/points-history", async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    const transactions = await getPointsHistory(userId);
    return res.json({ transactions });
  } catch (err) {
    req.log.error({ err }, "Failed to load points history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Weekly (default) ranking, scoped to the student's grade unless ?scope=all.
router.get("/leaderboard", async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    const scope = req.query.scope === "all" ? "all" : "grade";
    const period = req.query.period === "all" ? "all" : "week";
    const result = await getLeaderboard({ userId, scope, period });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to load leaderboard");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
