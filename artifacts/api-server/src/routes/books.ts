import { Router, type IRouter } from "express";
import { db, booksTable, bookReservationsTable, bookPurchasesTable, pointsAccountTable, pointsTransactionsTable } from "@workspace/db";
import { eq, ilike, or, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/books", async (req, res) => {
  try {
    const { category, search } = req.query as { category?: string; search?: string };
    let query = db.select().from(booksTable);
    const conditions = [];
    if (category) conditions.push(eq(booksTable.category, category));
    if (search) conditions.push(or(ilike(booksTable.title, `%${search}%`), ilike(booksTable.author, `%${search}%`)));
    const books = conditions.length > 0
      ? await db.select().from(booksTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await db.select().from(booksTable);
    res.json(books);
  } catch (err) {
    req.log.error({ err }, "Failed to list books");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/books", async (req, res) => {
  try {
    const body = req.body;
    const [book] = await db.insert(booksTable).values(body).returning();
    res.status(201).json(book);
  } catch (err) {
    req.log.error({ err }, "Failed to create book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/books/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [book] = await db.select().from(booksTable).where(eq(booksTable.id, id));
    if (!book) return res.status(404).json({ error: "Book not found" });
    res.json(book);
  } catch (err) {
    req.log.error({ err }, "Failed to get book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/books/:id/reserve", async (req, res) => {
  try {
    const bookId = parseInt(req.params.id);
    const [reservation] = await db.insert(bookReservationsTable).values({ bookId, status: "pending" }).returning();
    res.json(reservation);
  } catch (err) {
    req.log.error({ err }, "Failed to reserve book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/books/:id/purchase", async (req, res) => {
  try {
    const bookId = parseInt(req.params.id);
    const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
    if (!book) return res.status(404).json({ error: "Book not found" });

    let [account] = await db.select().from(pointsAccountTable).limit(1);
    if (!account) {
      [account] = await db.insert(pointsAccountTable).values({ balance: 100, totalEarned: 100, totalSpent: 0 }).returning();
    }

    if (account.balance < book.pointsPrice) {
      return res.status(400).json({ error: "Insufficient points" });
    }

    const [purchase] = await db.insert(bookPurchasesTable).values({ bookId, pointsSpent: book.pointsPrice }).returning();

    await db.update(pointsAccountTable)
      .set({ balance: account.balance - book.pointsPrice, totalSpent: account.totalSpent + book.pointsPrice, updatedAt: new Date() })
      .where(eq(pointsAccountTable.id, account.id));

    await db.insert(pointsTransactionsTable).values({
      type: "spend",
      amount: book.pointsPrice,
      description: `شراء كتاب: ${book.title}`,
    });

    res.json(purchase);
  } catch (err) {
    req.log.error({ err }, "Failed to purchase book");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
