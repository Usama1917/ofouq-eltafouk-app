import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  db,
  booksTable,
  videosTable,
  lessonsTable,
  postsTable,
  gamesTable,
  rewardsTable,
  usersTable,
  bannersTable,
  reportsTable,
  redemptionsTable,
  bookPurchasesTable,
  bookReservationsTable,
  bookVouchersTable,
  pointsAccountTable,
  pointsTransactionsTable,
  materialsTable,
} from "@workspace/db";
import { eq, ne, and, count, sql, desc, asc, or } from "drizzle-orm";

const bookCoversUploadDir = path.resolve(process.cwd(), "uploads/book-covers");
fs.mkdirSync(bookCoversUploadDir, { recursive: true });

const bookCoverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, bookCoversUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const uploadBookCoverFile = multer({
  storage: bookCoverStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router: IRouter = Router();
const DEFAULT_MATERIALS = [
  { name: "علوم عامة", classification: "علوم" },
  { name: "رياضيات عامة", classification: "رياضيات" },
  { name: "اللغة العربية", classification: "لغة عربية" },
  { name: "اللغة الإنجليزية", classification: "لغة إنجليزية" },
  { name: "تاريخ", classification: "تاريخ" },
  { name: "برمجة", classification: "برمجة" },
];

async function ensureDefaultMaterials() {
  const current = await db.select().from(materialsTable).orderBy(asc(materialsTable.id));
  if (current.length > 0) {
    const hasMissingSortOrder = current.some((material) => !material.sortOrder || material.sortOrder <= 0);
    const hasMissingClassification = current.some((material) => !String(material.classification ?? "").trim());
    if (hasMissingSortOrder || hasMissingClassification) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < current.length; i += 1) {
          const fallbackClassification = String(current[i].classification ?? "").trim() || current[i].name;
          await tx
            .update(materialsTable)
            .set({
              sortOrder: current[i].sortOrder && current[i].sortOrder > 0 ? current[i].sortOrder : i + 1,
              classification: fallbackClassification,
            })
            .where(eq(materialsTable.id, current[i].id));
        }
      });
    }
    return db.select().from(materialsTable).orderBy(asc(materialsTable.sortOrder), asc(materialsTable.name));
  }

  for (let i = 0; i < DEFAULT_MATERIALS.length; i += 1) {
    const item = DEFAULT_MATERIALS[i];
    try {
      await db.insert(materialsTable).values({
        name: item.name,
        classification: item.classification,
        sortOrder: i + 1,
      });
    } catch {
      // ignore duplicate race condition
    }
  }
  return db.select().from(materialsTable).orderBy(asc(materialsTable.sortOrder), asc(materialsTable.name));
}

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

// Materials
router.get("/admin/materials", async (req, res) => {
  try {
    const materials = await ensureDefaultMaterials();
    res.json(materials);
  } catch (err) {
    req.log.error({ err }, "List materials error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/materials", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const classification = String(req.body?.classification ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "اسم المادة مطلوب" });
    }
    if (!classification) {
      return res.status(400).json({ error: "التصنيف مطلوب" });
    }
    const [maxOrderResult] = await db
      .select({ maxSortOrder: sql<number>`coalesce(max(${materialsTable.sortOrder}), 0)` })
      .from(materialsTable);
    const nextSortOrder = (Number(maxOrderResult?.maxSortOrder ?? 0) || 0) + 1;
    const [material] = await db
      .insert(materialsTable)
      .values({ name, classification, sortOrder: nextSortOrder })
      .returning();
    res.status(201).json(material);
  } catch (err: any) {
    const errorCode = String(err?.code ?? err?.cause?.code ?? "");
    const errorMessage = `${String(err?.message ?? "")} ${String(err?.cause?.message ?? "")}`;
    if (errorCode === "23505" || errorMessage.includes("duplicate key") || errorMessage.includes("materials_name_unique")) {
      return res.status(400).json({ error: "المادة موجودة بالفعل" });
    }
    req.log.error({ err }, "Create material error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/materials/reorder", async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = rawIds
      .map((value: unknown) => Number.parseInt(String(value), 10))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: "ids مطلوبة" });
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      return res.status(400).json({ error: "ids يجب أن تكون فريدة" });
    }

    const existingMaterials = await db.select({ id: materialsTable.id }).from(materialsTable);
    const existingIds = existingMaterials.map((material) => material.id);
    const sameLength = existingIds.length === ids.length;
    const sameSet = existingIds.every((id) => uniqueIds.includes(id));
    if (!sameLength || !sameSet) {
      return res.status(400).json({ error: "ids يجب أن تحتوي كل المواد مرة واحدة" });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i += 1) {
        await tx.update(materialsTable).set({ sortOrder: i + 1 }).where(eq(materialsTable.id, ids[i]));
      }
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reorder materials error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/materials/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "id غير صالح" });
    }
    const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, id)).limit(1);
    if (!material) {
      return res.status(404).json({ error: "المادة غير موجودة" });
    }
    const classificationValue = String(material.classification ?? "").trim() || material.name;

    const [bookUsage] = await db
      .select({ count: count() })
      .from(booksTable)
      .where(or(eq(booksTable.subject, classificationValue), eq(booksTable.category, classificationValue)));
    const [videoUsage] = await db
      .select({ count: count() })
      .from(videosTable)
      .where(eq(videosTable.subject, classificationValue));

    const [alternativesCount] = await db
      .select({ count: count() })
      .from(materialsTable)
      .where(and(eq(materialsTable.classification, classificationValue), ne(materialsTable.id, id)));

    const isUsed = Number(bookUsage.count) > 0 || Number(videoUsage.count) > 0;
    const hasAlternativeClassification = Number(alternativesCount.count) > 0;
    if (isUsed && !hasAlternativeClassification) {
      return res.status(400).json({
        error: "لا يمكن حذف المادة لأن تصنيفها مرتبط بكتب أو فيديوهات. غيّر ربط المحتوى أو أضف مادة بديلة بنفس التصنيف.",
      });
    }

    await db.delete(materialsTable).where(eq(materialsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete material error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Books
router.get("/admin/books", async (req, res) => {
  try {
    const books = await db
      .select()
      .from(booksTable)
      .orderBy(asc(booksTable.sortOrder), desc(booksTable.createdAt));
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/books/upload-cover", uploadBookCoverFile.single("cover"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No cover file provided" });
    }
    const filename = req.file.filename;
    const url = `/api/uploads/book-covers/${filename}`;
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Upload book cover error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/books", async (req, res) => {
  try {
    const body = req.body ?? {};
    const subject = typeof body.subject === "string" ? body.subject : typeof body.category === "string" ? body.category : "علوم";
    const priceEgp = Number.parseInt(String(body.priceEgp ?? body.pointsPrice ?? 0), 10) || 0;
    const originalPriceEgp = Number.parseInt(String(body.originalPriceEgp ?? priceEgp), 10) || priceEgp;
    const [maxOrderResult] = await db
      .select({ maxSortOrder: sql<number>`coalesce(max(${booksTable.sortOrder}), 0)` })
      .from(booksTable);
    const nextSortOrder = (Number(maxOrderResult?.maxSortOrder ?? 0) || 0) + 1;

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
        sortOrder: nextSortOrder,
        freeShipping: Boolean(body.freeShipping),
        available: body.available === undefined ? true : Boolean(body.available),
      })
      .returning();
    res.status(201).json(book);
  } catch (err) {
    req.log.error({ err }, "Create book error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/books/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body ?? {};
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.coverUrl !== undefined) updateData.coverUrl = body.coverUrl;
    if (body.available !== undefined) updateData.available = Boolean(body.available);
    if (body.freeShipping !== undefined) updateData.freeShipping = Boolean(body.freeShipping);

    if (body.subject !== undefined || body.category !== undefined) {
      const subject = typeof body.subject === "string" ? body.subject : body.category;
      updateData.subject = subject;
      updateData.category = subject;
    }

    if (body.priceEgp !== undefined || body.pointsPrice !== undefined) {
      const priceEgp = Number.parseInt(String(body.priceEgp ?? body.pointsPrice), 10) || 0;
      updateData.priceEgp = priceEgp;
      updateData.pointsPrice = priceEgp;
    }

    if (body.originalPriceEgp !== undefined) {
      updateData.originalPriceEgp = Number.parseInt(String(body.originalPriceEgp), 10) || 0;
    }
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = Number.parseInt(String(body.sortOrder), 10) || 0;
    }

    const [book] = await db.update(booksTable).set(updateData).where(eq(booksTable.id, id)).returning();
    if (!book) return res.status(404).json({ error: "Not found" });
    res.json(book);
  } catch (err) {
    req.log.error({ err }, "Update book error");
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

router.post("/admin/books/reorder", async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = rawIds
      .map((value: unknown) => Number.parseInt(String(value), 10))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: "ids are required" });
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      return res.status(400).json({ error: "ids must be unique" });
    }

    const existingBooks = await db.select({ id: booksTable.id }).from(booksTable);
    const existingIds = existingBooks.map((book) => book.id);
    const sameLength = existingIds.length === ids.length;
    const sameSet = existingIds.every((id) => uniqueIds.includes(id));
    if (!sameLength || !sameSet) {
      return res.status(400).json({ error: "ids must include all books exactly once" });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i += 1) {
        await tx.update(booksTable).set({ sortOrder: i + 1 }).where(eq(booksTable.id, ids[i]));
      }
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reorder books error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/book-vouchers", async (req, res) => {
  try {
    const vouchers = await db
      .select({
        id: bookVouchersTable.id,
        code: bookVouchersTable.code,
        bookId: bookVouchersTable.bookId,
        bookTitle: booksTable.title,
        discountType: bookVouchersTable.discountType,
        discountValue: bookVouchersTable.discountValue,
        discountPercent: bookVouchersTable.discountPercent,
        active: bookVouchersTable.active,
        usageLimit: bookVouchersTable.usageLimit,
        usedCount: bookVouchersTable.usedCount,
        startsAt: bookVouchersTable.startsAt,
        expiresAt: bookVouchersTable.expiresAt,
        createdAt: bookVouchersTable.createdAt,
      })
      .from(bookVouchersTable)
      .leftJoin(booksTable, eq(bookVouchersTable.bookId, booksTable.id))
      .orderBy(desc(bookVouchersTable.createdAt));
    res.json(vouchers);
  } catch (err) {
    req.log.error({ err }, "List book vouchers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/book-vouchers", async (req, res) => {
  try {
    const body = req.body ?? {};
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: "Voucher code is required" });
    }
    const bookId = Number.parseInt(String(body.bookId ?? ""), 10);
    if (!Number.isFinite(bookId) || bookId <= 0) {
      return res.status(400).json({ error: "bookId is required" });
    }
    const [book] = await db.select({ id: booksTable.id }).from(booksTable).where(eq(booksTable.id, bookId)).limit(1);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const discountTypeRaw = String(body.discountType ?? "percent").trim().toLowerCase();
    const discountType = discountTypeRaw === "amount" || discountTypeRaw === "free_shipping" ? discountTypeRaw : "percent";
    const rawDiscountValue = Number.parseInt(String(body.discountValue ?? body.discountPercent ?? 0), 10) || 0;
    const discountValue = Math.max(0, rawDiscountValue);
    const discountPercent = discountType === "percent" ? Math.max(1, Math.min(100, discountValue || 0)) : 0;
    const usageLimitRaw = Number.parseInt(String(body.usageLimit ?? ""), 10);
    const usageLimit = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? usageLimitRaw : null;
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const [voucher] = await db
      .insert(bookVouchersTable)
      .values({
        code,
        bookId,
        discountType,
        discountValue,
        discountPercent,
        active: body.active === undefined ? true : Boolean(body.active),
        usageLimit,
        startsAt,
        expiresAt,
      })
      .returning();
    res.status(201).json(voucher);
  } catch (err) {
    req.log.error({ err }, "Create book voucher error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/book-vouchers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const body = req.body ?? {};
    const updateData: Record<string, unknown> = {};

    if (body.code !== undefined) updateData.code = String(body.code).trim().toUpperCase();
    if (body.discountType !== undefined) {
      const discountTypeRaw = String(body.discountType ?? "percent").trim().toLowerCase();
      const normalizedType = discountTypeRaw === "amount" || discountTypeRaw === "free_shipping" ? discountTypeRaw : "percent";
      updateData.discountType = normalizedType;
      if (normalizedType !== "percent") {
        updateData.discountPercent = 0;
      }
    }
    if (body.discountValue !== undefined || body.discountPercent !== undefined) {
      const discountValue = Math.max(0, Number.parseInt(String(body.discountValue ?? body.discountPercent ?? 0), 10) || 0);
      updateData.discountValue = discountValue;
      const discountTypeRaw = String(body.discountType ?? "").trim().toLowerCase();
      const discountType = discountTypeRaw === "amount" || discountTypeRaw === "free_shipping" ? discountTypeRaw : null;
      if ((discountType ?? null) === "percent") {
        updateData.discountPercent = Math.max(1, Math.min(100, discountValue || 0));
      } else if (discountType === "amount" || discountType === "free_shipping") {
        updateData.discountPercent = 0;
      } else if (body.discountPercent !== undefined) {
        updateData.discountPercent = Math.max(1, Math.min(100, discountValue || 0));
      }
    }
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.bookId !== undefined) {
      const bookId = Number.parseInt(String(body.bookId ?? ""), 10);
      if (!Number.isFinite(bookId) || bookId <= 0) {
        return res.status(400).json({ error: "bookId must be a valid id" });
      }
      updateData.bookId = bookId;
    }
    if (body.usageLimit !== undefined) {
      const usageLimitRaw = Number.parseInt(String(body.usageLimit ?? ""), 10);
      updateData.usageLimit = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? usageLimitRaw : null;
    }
    if (body.startsAt !== undefined) updateData.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const [voucher] = await db.update(bookVouchersTable).set(updateData).where(eq(bookVouchersTable.id, id)).returning();
    if (!voucher) return res.status(404).json({ error: "Not found" });
    res.json(voucher);
  } catch (err) {
    req.log.error({ err }, "Update book voucher error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/book-vouchers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await db.delete(bookVouchersTable).where(eq(bookVouchersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete book voucher error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Videos
router.get("/admin/videos", async (req, res) => {
  try {
    const videos = await db
      .selectDistinct({
        id: videosTable.id,
        title: videosTable.title,
        description: videosTable.description,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        videoType: videosTable.videoType,
        publishStatus: videosTable.publishStatus,
        createdAt: videosTable.createdAt,
      })
      .from(videosTable)
      .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
      .orderBy(desc(videosTable.createdAt));
    res.json(videos);
  } catch (err) {
    req.log.error({ err }, "List admin videos error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/videos/upload", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف رفع الفيديوهات من مسار admin/videos. استخدم /admin/academic/media/upload-video داخل شاشة الدرس.",
  });
});

router.post("/admin/videos/upload-thumbnail", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف رفع الصورة المصغرة من مسار admin/videos. استخدم /admin/academic/media/upload-thumbnail داخل شاشة الدرس.",
  });
});

router.post("/admin/videos", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف إنشاء الفيديو المستقل. أنشئ الفيديو من داخل الدرس عبر /admin/academic.",
  });
});

router.put("/admin/videos/:id", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف تعديل الفيديو المستقل. عدل الفيديو من شاشة الدرس داخل /admin/academic.",
  });
});

router.delete("/admin/videos/:id", async (_req, res) => {
  res.status(410).json({
    error: "تم إيقاف حذف الفيديو المستقل. احذف/فك ارتباط الفيديو من شاشة الدرس داخل /admin/academic.",
  });
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
