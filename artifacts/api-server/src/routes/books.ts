import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  bookPurchasesTable,
  bookReservationsTable,
  bookVouchersTable,
  booksTable,
  materialsTable,
  db,
} from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_SHIPPING_EGP = 50;

function asPositiveInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function normalizeVoucherCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function isVoucherValidNow(voucher: {
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
}): boolean {
  if (!voucher.active) return false;
  const now = Date.now();
  if (voucher.startsAt && voucher.startsAt.getTime() > now) return false;
  if (voucher.expiresAt && voucher.expiresAt.getTime() < now) return false;
  if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) return false;
  return true;
}

router.get("/materials", async (_req, res) => {
  try {
    const materials = await db
      .select({
        id: materialsTable.id,
        classification: materialsTable.classification,
        name: materialsTable.name,
        sortOrder: materialsTable.sortOrder,
      })
      .from(materialsTable)
      .orderBy(asc(materialsTable.sortOrder), asc(materialsTable.name));

    const uniqueClassifications = Array.from(
      new Set(
        materials
          .map((material) => String(material.classification ?? "").trim() || String(material.name ?? "").trim())
          .filter(Boolean),
      ),
    );

    res.json(uniqueClassifications);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/books", async (req, res) => {
  try {
    const { category, search, subject } = req.query as {
      category?: string;
      subject?: string;
      search?: string;
    };

    const normalizedSubject = subject || category;
    const conditions = [];

    if (normalizedSubject) {
      conditions.push(or(eq(booksTable.subject, normalizedSubject), eq(booksTable.category, normalizedSubject)));
    }

    if (search) {
      conditions.push(
        or(
          ilike(booksTable.title, `%${search}%`),
          ilike(booksTable.description, `%${search}%`),
          ilike(booksTable.subject, `%${search}%`),
          ilike(booksTable.category, `%${search}%`),
        ),
      );
    }

    const books =
      conditions.length > 0
        ? await db
            .select()
            .from(booksTable)
            .where(conditions.length === 1 ? conditions[0] : and(...conditions))
            .orderBy(asc(booksTable.sortOrder), desc(booksTable.createdAt))
        : await db.select().from(booksTable).orderBy(asc(booksTable.sortOrder), desc(booksTable.createdAt));

    res.json(books);
  } catch (err) {
    req.log.error({ err }, "Failed to list books");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/books", async (req, res) => {
  try {
    const body = req.body ?? {};
    const subject = typeof body.subject === "string" ? body.subject : typeof body.category === "string" ? body.category : "علوم";
    const priceEgp = asPositiveInt(body.priceEgp ?? body.pointsPrice, 0);
    const originalPriceEgp = asPositiveInt(body.originalPriceEgp ?? priceEgp, priceEgp);

    const [book] = await db
      .insert(booksTable)
      .values({
        title: body.title,
        author: typeof body.author === "string" && body.author.trim().length > 0 ? body.author : "غير محدد",
        description: body.description,
        category: subject,
        subject,
        coverUrl: body.coverUrl,
        pointsPrice: priceEgp,
        priceEgp,
        originalPriceEgp,
        sortOrder: 0,
        freeShipping: Boolean(body.freeShipping),
        available: body.available === undefined ? true : Boolean(body.available),
      })
      .returning();
    res.status(201).json(book);
  } catch (err) {
    req.log.error({ err }, "Failed to create book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/books/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
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
    const bookId = Number.parseInt(req.params.id, 10);
    const [reservation] = await db.insert(bookReservationsTable).values({ bookId, status: "pending" }).returning();
    res.json(reservation);
  } catch (err) {
    req.log.error({ err }, "Failed to reserve book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/books/:id/purchase", async (req, res) => {
  try {
    const bookId = Number.parseInt(req.params.id, 10);
    const [book] = await db.select().from(booksTable).where(eq(booksTable.id, bookId));
    if (!book) return res.status(404).json({ error: "Book not found" });

    const basePriceEgp = asPositiveInt(book.priceEgp ?? book.pointsPrice, 0);
    const originalPriceEgp = asPositiveInt(book.originalPriceEgp ?? basePriceEgp, basePriceEgp);
    const normalizedVoucherCode = normalizeVoucherCode((req.body as { voucherCode?: string } | undefined)?.voucherCode);

    let voucherCode: string | null = null;
    let discountPercent = 0;
    let discountType: "percent" | "amount" | "free_shipping" | null = null;
    let discountValue = 0;
    let voucherForcesFreeShipping = false;

    if (normalizedVoucherCode.length > 0) {
      const [voucher] = await db.select().from(bookVouchersTable).where(eq(bookVouchersTable.code, normalizedVoucherCode)).limit(1);

      if (!voucher) {
        return res.status(400).json({ error: "كود الخصم غير صحيح" });
      }
      if (!isVoucherValidNow(voucher)) {
        return res.status(400).json({ error: "كود الخصم غير صالح أو منتهي" });
      }
      if (voucher.bookId !== null && voucher.bookId !== bookId) {
        return res.status(400).json({ error: "كود الخصم لا يطبق على هذا الكتاب" });
      }

      voucherCode = voucher.code;
      const rawType = String(voucher.discountType ?? "percent").trim().toLowerCase();
      discountType = rawType === "amount" || rawType === "free_shipping" ? rawType : "percent";
      const storedDiscountValue = typeof voucher.discountValue === "number" ? voucher.discountValue : 0;
      const fallbackPercent = typeof voucher.discountPercent === "number" ? voucher.discountPercent : 0;
      discountValue = Math.max(0, storedDiscountValue > 0 ? storedDiscountValue : fallbackPercent);
      if (discountType === "percent") {
        discountPercent = Math.max(0, Math.min(100, discountValue || fallbackPercent || 0));
      } else if (discountType === "free_shipping") {
        voucherForcesFreeShipping = true;
      }

      await db
        .update(bookVouchersTable)
        .set({ usedCount: voucher.usedCount + 1 })
        .where(eq(bookVouchersTable.id, voucher.id));
    }

    let discountAmountEgp = 0;
    if (discountType === "amount") {
      discountAmountEgp = Math.min(basePriceEgp, discountValue);
    } else if (discountType === "percent") {
      discountAmountEgp = Math.round((basePriceEgp * discountPercent) / 100);
    }
    const finalPriceEgp = Math.max(0, basePriceEgp - discountAmountEgp);
    const shippingCostEgp = book.freeShipping || voucherForcesFreeShipping ? 0 : DEFAULT_SHIPPING_EGP;
    const totalPaidEgp = finalPriceEgp + shippingCostEgp;

    const [purchase] = await db
      .insert(bookPurchasesTable)
      .values({
        bookId,
        pointsSpent: totalPaidEgp,
        originalPriceEgp,
        discountPercent,
        discountAmountEgp,
        finalPriceEgp,
        shippingCostEgp,
        voucherCode,
      })
      .returning();

    res.json({
      ...purchase,
      totalPaidEgp,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to purchase book");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
