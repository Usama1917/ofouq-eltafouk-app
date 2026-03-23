import { Router, type IRouter } from "express";
import {
  db,
  booksTable,
  videosTable,
  postsTable,
  gamesTable,
  rewardsTable,
  usersTable,
  bannersTable,
  reportsTable,
  redemptionsTable,
  bookPurchasesTable,
  bookReservationsTable,
  pointsAccountTable,
  pointsTransactionsTable,
} from "@workspace/db";
import { eq, count, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

// Stats
router.get("/admin/stats", async (req, res) => {
  try {
    const [usersCount] = await db.select({ count: count() }).from(usersTable);
    const [booksCount] = await db.select({ count: count() }).from(booksTable);
    const [videosCount] = await db.select({ count: count() }).from(videosTable);
    const [postsCount] = await db.select({ count: count() }).from(postsTable);
    const [gamesCount] = await db.select({ count: count() }).from(gamesTable);
    const [rewardsCount] = await db.select({ count: count() }).from(rewardsTable);
    const [purchasesCount] = await db.select({ count: count() }).from(bookPurchasesTable);
    const [redemptionsCount] = await db.select({ count: count() }).from(redemptionsTable);
    const [pendingReportsCount] = await db.select({ count: count() }).from(reportsTable).where(eq(reportsTable.status, "pending"));
    const account = await db.select().from(pointsAccountTable).limit(1);
    const circulating = account[0]?.totalEarned ?? 0;

    res.json({
      totalUsers: Number(usersCount.count),
      totalBooks: Number(booksCount.count),
      totalVideos: Number(videosCount.count),
      totalPosts: Number(postsCount.count),
      totalGames: Number(gamesCount.count),
      totalRewards: Number(rewardsCount.count),
      totalPurchases: Number(purchasesCount.count),
      totalRedemptions: Number(redemptionsCount.count),
      totalPointsCirculating: circulating,
      pendingReports: Number(pendingReportsCount.count),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Users
router.get("/admin/users", async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.joinedAt));
    res.json(users);
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users", async (req, res) => {
  try {
    const { name, email, role = "student", status = "active" } = req.body;
    const [user] = await db.insert(usersTable).values({ name, email, role, status }).returning();
    res.status(201).json(user);
  } catch (err) {
    req.log.error({ err }, "Create user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, role, status } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Update user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Books
router.get("/admin/books", async (req, res) => {
  try {
    const books = await db.select().from(booksTable).orderBy(desc(booksTable.createdAt));
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/books", async (req, res) => {
  try {
    const [book] = await db.insert(booksTable).values(req.body).returning();
    res.status(201).json(book);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/books/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [book] = await db.update(booksTable).set(req.body).where(eq(booksTable.id, id)).returning();
    if (!book) return res.status(404).json({ error: "Not found" });
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/books/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(booksTable).where(eq(booksTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Videos
router.get("/admin/videos", async (req, res) => {
  try {
    const videos = await db.select().from(videosTable).orderBy(desc(videosTable.createdAt));
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/videos", async (req, res) => {
  try {
    const [video] = await db.insert(videosTable).values(req.body).returning();
    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/videos/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [video] = await db.update(videosTable).set(req.body).where(eq(videosTable.id, id)).returning();
    if (!video) return res.status(404).json({ error: "Not found" });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/videos/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(videosTable).where(eq(videosTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rewards
router.get("/admin/rewards", async (req, res) => {
  try {
    const rewards = await db.select().from(rewardsTable).orderBy(desc(rewardsTable.createdAt));
    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/rewards", async (req, res) => {
  try {
    const [reward] = await db.insert(rewardsTable).values(req.body).returning();
    res.status(201).json(reward);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/rewards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [reward] = await db.update(rewardsTable).set(req.body).where(eq(rewardsTable.id, id)).returning();
    if (!reward) return res.status(404).json({ error: "Not found" });
    res.json(reward);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/rewards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(rewardsTable).where(eq(rewardsTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Games
router.get("/admin/games", async (req, res) => {
  try {
    const games = await db.select().from(gamesTable).orderBy(desc(gamesTable.createdAt));
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/games", async (req, res) => {
  try {
    const { title, subject, difficulty, pointsReward, description } = req.body;
    const [game] = await db.insert(gamesTable).values({ title, subject, difficulty, pointsReward, description, questionsCount: 0 }).returning();
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/games/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [game] = await db.update(gamesTable).set(req.body).where(eq(gamesTable.id, id)).returning();
    if (!game) return res.status(404).json({ error: "Not found" });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/games/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(gamesTable).where(eq(gamesTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Banners
router.get("/admin/banners", async (req, res) => {
  try {
    const banners = await db.select().from(bannersTable).orderBy(desc(bannersTable.createdAt));
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/banners", async (req, res) => {
  try {
    const [banner] = await db.insert(bannersTable).values(req.body).returning();
    res.status(201).json(banner);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/banners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [banner] = await db.update(bannersTable).set(req.body).where(eq(bannersTable.id, id)).returning();
    if (!banner) return res.status(404).json({ error: "Not found" });
    res.json(banner);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/banners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(bannersTable).where(eq(bannersTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Purchases & Reservations
router.get("/admin/purchases", async (req, res) => {
  try {
    const purchases = await db
      .select({
        id: bookPurchasesTable.id,
        bookId: bookPurchasesTable.bookId,
        bookTitle: booksTable.title,
        pointsSpent: bookPurchasesTable.pointsSpent,
        createdAt: bookPurchasesTable.createdAt,
      })
      .from(bookPurchasesTable)
      .leftJoin(booksTable, eq(bookPurchasesTable.bookId, booksTable.id))
      .orderBy(desc(bookPurchasesTable.createdAt));
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/reservations", async (req, res) => {
  try {
    const reservations = await db
      .select({
        id: bookReservationsTable.id,
        bookId: bookReservationsTable.bookId,
        bookTitle: booksTable.title,
        status: bookReservationsTable.status,
        createdAt: bookReservationsTable.createdAt,
      })
      .from(bookReservationsTable)
      .leftJoin(booksTable, eq(bookReservationsTable.bookId, booksTable.id))
      .orderBy(desc(bookReservationsTable.createdAt));
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/redemptions", async (req, res) => {
  try {
    const redemptions = await db.select().from(redemptionsTable).orderBy(desc(redemptionsTable.createdAt));
    res.json(redemptions);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/points-transactions", async (req, res) => {
  try {
    const transactions = await db.select().from(pointsTransactionsTable).orderBy(desc(pointsTransactionsTable.createdAt));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reports
router.get("/admin/reports", async (req, res) => {
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/reports/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, resolvedBy } = req.body;
    const [report] = await db.update(reportsTable)
      .set({ status, resolvedBy, resolvedAt: new Date() })
      .where(eq(reportsTable.id, id))
      .returning();
    if (!report) return res.status(404).json({ error: "Not found" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
