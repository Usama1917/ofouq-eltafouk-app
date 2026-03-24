import { Router, type IRouter } from "express";
import healthRouter from "./health";
import booksRouter from "./books";
import videosRouter from "./videos";
import postsRouter from "./posts";
import pointsRouter from "./points";
import gamesRouter from "./games";
import rewardsRouter from "./rewards";
import openaiRouter from "./openai";
import adminRouter from "./admin";
import moderatorRouter from "./moderator";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(booksRouter);
router.use(videosRouter);
router.use(postsRouter);
router.use(pointsRouter);
router.use(gamesRouter);
router.use(rewardsRouter);
router.use(openaiRouter);
router.use(adminRouter);
router.use(moderatorRouter);
router.use(authRouter);

export default router;
