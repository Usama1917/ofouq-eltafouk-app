import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  booksTable,
  cartItemsTable,
  shippingAddressesTable,
  ordersTable,
  orderItemsTable,
  orderStatusHistoryTable,
  shippingZonesTable,
  governorateZonesTable,
  bookFavoritesTable,
  storeSettingsTable,
  bookVouchersTable,
  subjectsTable,
  academicYearsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { getSessionUser } from "./quiz";
import { ensureShippingDefaults } from "./shipping";
import { awardPoints } from "../lib/gamification";
import { sendPushNotificationToUser } from "../lib/push-notifications";

// v2 Phase 5 — bookstore. Student-facing store (/store/*) + admin order management
// (/admin/orders/*, auto-gated by the app-level /api/admin role check). Books are
// PHYSICAL goods, so this never touches IAP; digital access to a book's subject is
// granted only on an instant online payment (COD → student redeems the code later).
const router: IRouter = Router();

const ORDER_STATUSES = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];
// A student may self-cancel only while the order hasn't shipped yet.
const CANCELLABLE_BY_STUDENT: OrderStatus[] = ["placed", "confirmed", "packed"];
const DEFAULT_BOOK_WEIGHT_GRAMS = 500;

const STATUS_MSG: Record<OrderStatus, { t: string; b: string }> = {
  placed: { t: "تم استلام طلبك 🛒", b: "طلبك وصلنا وبنراجعه دلوقتي." },
  confirmed: { t: "تم تأكيد طلبك ✅", b: "بنجهّزلك الطلب حالًا." },
  packed: { t: "طلبك بيتجهّز 📦", b: "جهّزنا كتبك وبنحضّرها للشحن." },
  shipped: { t: "طلبك اتشحن 🚚", b: "الطلب في الطريق إليك." },
  out_for_delivery: { t: "طلبك خرج للتوصيل 🛵", b: "المندوب في الطريق ليك النهارده." },
  delivered: { t: "طلبك اتسلّم 🎉", b: "استمتع بكتبك! لو الكتاب بيفتح محتوى رقمي فعّله بالكود." },
  cancelled: { t: "اتلغى طلبك", b: "لو عندك أي استفسار كلّم الدعم." },
};

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function requireStudentId(req: any, res: any): Promise<number | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  return user.id;
}

async function getStoreSettings() {
  // orderBy(asc id) so GET + PUT always resolve to the SAME (lowest) row even if a
  // first-call race ever created a duplicate — the singleton stays deterministic.
  const [existing] = await db.select().from(storeSettingsTable).orderBy(asc(storeSettingsTable.id)).limit(1);
  if (existing) return existing;
  await db.insert(storeSettingsTable).values({}).onConflictDoNothing();
  const [row] = await db.select().from(storeSettingsTable).orderBy(asc(storeSettingsTable.id)).limit(1);
  return row;
}

type LayoutRow = { type: "normal" | "carousel"; title?: string; titleEn?: string; books: number[] };
// Normalise stored / incoming layout to typed rows. Accepts the current
// {type,title?,books} shape AND legacy number[] rows (→ normal). Drops invalid/empty
// rows and dupes; a normal row is capped at 2 books (it only ever shows 2).
function normalizeLayout(raw: unknown): LayoutRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: LayoutRow[] = [];
  for (const r of raw) {
    let type: "normal" | "carousel" = "normal";
    let src: unknown[] = [];
    let title: string | undefined;
    let titleEn: string | undefined;
    if (Array.isArray(r)) {
      src = r;
    } else if (r && typeof r === "object" && Array.isArray((r as { books?: unknown }).books)) {
      type = (r as { type?: unknown }).type === "carousel" ? "carousel" : "normal";
      src = (r as { books: unknown[] }).books;
      const t = (r as { title?: unknown }).title;
      if (typeof t === "string" && t.trim()) title = t.trim().slice(0, 40);
      const te = (r as { titleEn?: unknown }).titleEn;
      if (typeof te === "string" && te.trim()) titleEn = te.trim().slice(0, 40);
    } else {
      continue;
    }
    let books = Array.from(
      new Set(src.map((v) => Number.parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0)),
    );
    if (type === "normal") books = books.slice(0, 2);
    if (books.length) {
      const row: LayoutRow = { type, books };
      if (title) row.title = title;
      if (titleEn) row.titleEn = titleEn;
      rows.push(row);
    }
  }
  return rows;
}

// Shipping cost for a destination governorate + total parcel weight, using the
// admin-managed zone table (base covers baseWeightGrams, then perExtraKgEgp/kg).
async function computeShipping(governorate: string, totalWeightGrams: number): Promise<{ zoneId: number | null; cost: number }> {
  const [gz] = await db
    .select({ zoneId: governorateZonesTable.zoneId })
    .from(governorateZonesTable)
    .where(eq(governorateZonesTable.governorate, governorate))
    .limit(1);
  if (!gz) return { zoneId: null, cost: 0 };
  const [zone] = await db.select().from(shippingZonesTable).where(eq(shippingZonesTable.id, gz.zoneId)).limit(1);
  if (!zone) return { zoneId: null, cost: 0 };
  const extraKg = Math.ceil(Math.max(0, totalWeightGrams - zone.baseWeightGrams) / 1000);
  return { zoneId: zone.id, cost: zone.basePriceEgp + extraKg * zone.perExtraKgEgp };
}

// Validate a voucher code against a subtotal. Coupon types: "percent" (% off
// subtotal), "amount" (flat EGP off subtotal), "free_shipping" (waive shipping).
type VoucherResult = { ok: boolean; discountEgp: number; freeShipping: boolean; voucher?: typeof bookVouchersTable.$inferSelect; error?: string };
async function evaluateVoucher(code: string, subtotalEgp: number): Promise<VoucherResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, discountEgp: 0, freeShipping: false, error: "اكتب كود الخصم" };
  const [v] = await db.select().from(bookVouchersTable).where(eq(bookVouchersTable.code, normalized)).limit(1);
  if (!v || !v.active) return { ok: false, discountEgp: 0, freeShipping: false, error: "كود غير صالح" };
  const now = new Date();
  if (v.startsAt && v.startsAt > now) return { ok: false, discountEgp: 0, freeShipping: false, error: "الكود لسه مبدأش" };
  if (v.expiresAt && v.expiresAt < now) return { ok: false, discountEgp: 0, freeShipping: false, error: "الكود انتهت صلاحيته" };
  if (v.usageLimit != null && v.usedCount >= v.usageLimit) return { ok: false, discountEgp: 0, freeShipping: false, error: "الكود خلص عدد استخدامه" };

  if (v.discountType === "free_shipping") {
    return { ok: true, discountEgp: 0, freeShipping: true, voucher: v };
  }
  const discountEgp =
    v.discountType === "amount"
      ? Math.min(subtotalEgp, Math.max(0, v.discountValue))
      : Math.min(subtotalEgp, Math.round((subtotalEgp * v.discountPercent) / 100));
  return { ok: true, discountEgp, freeShipping: false, voucher: v };
}

async function notifyOrderStatus(userId: number, order: { id: number; orderNumber: string | null }, status: OrderStatus) {
  const m = STATUS_MSG[status];
  if (!m) return;
  const data = { route: "order", orderId: order.id, orderNumber: order.orderNumber, status };
  const [created] = await db
    .insert(notificationsTable)
    .values({ userId, type: `order_${status}`, title: m.t, body: m.b, tone: "primary", data, dedupeKey: `order:${order.id}:status:${status}` })
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  if (created) {
    await sendPushNotificationToUser({ userId, title: m.t, body: m.b, data: { ...data, type: `order_${status}`, notificationId: created.id } }).catch(() => undefined);
  }
}

async function notifyAdminsNewOrder(order: { id: number; orderNumber: string | null; totalEgp: number }) {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(inArray(usersTable.role, ["admin", "owner"]), eq(usersTable.status, "active")));
  const title = "طلب جديد في المتجر 🛒";
  const body = `طلب رقم ${order.orderNumber ?? order.id} بقيمة ${order.totalEgp} ج.`;
  const data = { route: "order", orderId: order.id, orderNumber: order.orderNumber, admin: true };
  for (const a of admins) {
    const [created] = await db
      .insert(notificationsTable)
      .values({ userId: a.id, type: "order_new_admin", title, body, tone: "primary", data, dedupeKey: `order:${order.id}:new-admin:${a.id}` })
      .onConflictDoNothing()
      .returning({ id: notificationsTable.id });
    if (created) {
      await sendPushNotificationToUser({ userId: a.id, title, body, data: { ...data, notificationId: created.id } }).catch(() => undefined);
    }
  }
}

// ── Catalog ───────────────────────────────────────────────────────────────
router.get("/store/books", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const subjectId = toInt(req.query.subjectId);
    const yearId = toInt(req.query.yearId);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const conds = [eq(booksTable.available, true)];
    if (subjectId) conds.push(eq(booksTable.unlocksSubjectId, subjectId));
    if (yearId) {
      conds.push(
        inArray(
          booksTable.unlocksSubjectId,
          db.select({ id: subjectsTable.id }).from(subjectsTable).where(eq(subjectsTable.yearId, yearId)),
        ),
      );
    }
    if (q) {
      const like = `%${q}%`;
      conds.push(or(ilike(booksTable.title, like), ilike(booksTable.author, like))!);
    }

    const books = await db
      .select()
      .from(booksTable)
      .where(and(...conds))
      .orderBy(desc(booksTable.sortOrder), desc(booksTable.id));

    const favRows = await db.select({ bookId: bookFavoritesTable.bookId }).from(bookFavoritesTable).where(eq(bookFavoritesTable.userId, studentId));
    const favSet = new Set(favRows.map((f) => f.bookId));

    res.json(books.map((b) => ({ ...b, favorite: favSet.has(b.id) })));
  } catch (err) {
    req.log.error({ err }, "Store list books error");
    res.status(500).json({ error: "تعذّر تحميل الكتب" });
  }
});

router.get("/store/books/:id", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const id = toInt(req.params.id);
    const [book] = await db.select().from(booksTable).where(eq(booksTable.id, id)).limit(1);
    if (!book) {
      res.status(404).json({ error: "الكتاب غير موجود" });
      return;
    }
    let unlocksSubject: { id: number; name: string } | null = null;
    if (book.unlocksSubjectId) {
      const [s] = await db.select({ id: subjectsTable.id, name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, book.unlocksSubjectId)).limit(1);
      unlocksSubject = s ?? null;
    }
    const related = await db
      .select()
      .from(booksTable)
      .where(and(eq(booksTable.available, true), ne(booksTable.id, id), eq(booksTable.category, book.category)))
      .limit(6);
    const [fav] = await db.select({ id: bookFavoritesTable.id }).from(bookFavoritesTable).where(and(eq(bookFavoritesTable.userId, studentId), eq(bookFavoritesTable.bookId, id))).limit(1);
    res.json({ ...book, favorite: Boolean(fav), unlocksSubject, related });
  } catch (err) {
    req.log.error({ err }, "Store book detail error");
    res.status(500).json({ error: "تعذّر تحميل الكتاب" });
  }
});

// Owner-curated catalog layout (ordered rows of book ids). null = default grid.
router.get("/store/layout", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const settings = await getStoreSettings();
    res.json({ layout: settings.catalogLayout ? normalizeLayout(settings.catalogLayout) : null });
  } catch (err) {
    req.log.error({ err }, "Store layout load error");
    res.status(500).json({ error: "تعذّر تحميل الترتيب" });
  }
});

// ── Cart ────────────────────────────────────────────────────────────────────
async function loadCart(userId: number) {
  const rows = await db
    .select({
      id: cartItemsTable.id,
      bookId: booksTable.id,
      title: booksTable.title,
      author: booksTable.author,
      coverUrl: booksTable.coverUrl,
      priceEgp: booksTable.priceEgp,
      stockQuantity: booksTable.stockQuantity,
      quantity: cartItemsTable.quantity,
    })
    .from(cartItemsTable)
    .innerJoin(booksTable, eq(cartItemsTable.bookId, booksTable.id))
    .where(eq(cartItemsTable.userId, userId))
    .orderBy(desc(cartItemsTable.id));
  const subtotal = rows.reduce((sum, r) => sum + r.priceEgp * r.quantity, 0);
  return { items: rows, subtotal };
}

router.get("/store/cart", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    res.json(await loadCart(studentId));
  } catch (err) {
    req.log.error({ err }, "Cart load error");
    res.status(500).json({ error: "تعذّر تحميل السلة" });
  }
});

router.post("/store/cart", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const bookId = toInt(req.body?.bookId);
    const quantity = Math.max(1, toInt(req.body?.quantity, 1));
    const [book] = await db.select({ id: booksTable.id, stock: booksTable.stockQuantity, available: booksTable.available }).from(booksTable).where(eq(booksTable.id, bookId)).limit(1);
    if (!book || !book.available) {
      res.status(404).json({ error: "الكتاب غير متاح" });
      return;
    }
    if (book.stock <= 0) {
      res.status(400).json({ error: "نفدت الكمية" });
      return;
    }
    await db
      .insert(cartItemsTable)
      .values({ userId: studentId, bookId, quantity })
      .onConflictDoUpdate({
        target: [cartItemsTable.userId, cartItemsTable.bookId],
        set: { quantity: sql`least(${cartItemsTable.quantity} + ${quantity}, ${book.stock})`, updatedAt: new Date() },
      });
    res.json(await loadCart(studentId));
  } catch (err) {
    req.log.error({ err }, "Cart add error");
    res.status(500).json({ error: "تعذّر الإضافة للسلة" });
  }
});

router.patch("/store/cart/:id", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const id = toInt(req.params.id);
    const quantity = toInt(req.body?.quantity);
    // Clamp the requested quantity to the book's live stock (mirrors POST /cart).
    const [line] = await db
      .select({ stock: booksTable.stockQuantity })
      .from(cartItemsTable)
      .innerJoin(booksTable, eq(cartItemsTable.bookId, booksTable.id))
      .where(and(eq(cartItemsTable.id, id), eq(cartItemsTable.userId, studentId)))
      .limit(1);
    const clamped = line ? Math.min(quantity, line.stock) : quantity;
    if (clamped <= 0) {
      await db.delete(cartItemsTable).where(and(eq(cartItemsTable.id, id), eq(cartItemsTable.userId, studentId)));
    } else {
      await db.update(cartItemsTable).set({ quantity: clamped, updatedAt: new Date() }).where(and(eq(cartItemsTable.id, id), eq(cartItemsTable.userId, studentId)));
    }
    res.json(await loadCart(studentId));
  } catch (err) {
    req.log.error({ err }, "Cart update error");
    res.status(500).json({ error: "تعذّر تعديل السلة" });
  }
});

router.delete("/store/cart/:id", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    await db.delete(cartItemsTable).where(and(eq(cartItemsTable.id, toInt(req.params.id)), eq(cartItemsTable.userId, studentId)));
    res.json(await loadCart(studentId));
  } catch (err) {
    req.log.error({ err }, "Cart delete error");
    res.status(500).json({ error: "تعذّر حذف العنصر" });
  }
});

// ── Address (single, editable) ───────────────────────────────────────────────
router.get("/store/address", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const [addr] = await db.select().from(shippingAddressesTable).where(eq(shippingAddressesTable.userId, studentId)).orderBy(desc(shippingAddressesTable.id)).limit(1);
    res.json(addr ?? null);
  } catch (err) {
    req.log.error({ err }, "Address load error");
    res.status(500).json({ error: "تعذّر تحميل العنوان" });
  }
});

router.put("/store/address", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const recipientName = String(req.body?.recipientName ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const governorate = String(req.body?.governorate ?? "").trim();
    if (!recipientName || !phone || !governorate) {
      res.status(400).json({ error: "اكتب الاسم والتليفون والمحافظة" });
      return;
    }
    const fields = {
      recipientName,
      phone,
      governorate,
      city: String(req.body?.city ?? "").trim(),
      street: String(req.body?.street ?? "").trim(),
      notes: req.body?.notes ? String(req.body.notes).trim() : null,
      isDefault: true,
      updatedAt: new Date(),
    };
    const [existing] = await db.select({ id: shippingAddressesTable.id }).from(shippingAddressesTable).where(eq(shippingAddressesTable.userId, studentId)).orderBy(desc(shippingAddressesTable.id)).limit(1);
    let saved;
    if (existing) {
      [saved] = await db.update(shippingAddressesTable).set(fields).where(eq(shippingAddressesTable.id, existing.id)).returning();
    } else {
      [saved] = await db.insert(shippingAddressesTable).values({ userId: studentId, ...fields }).returning();
    }
    res.json(saved);
  } catch (err) {
    req.log.error({ err }, "Address save error");
    res.status(500).json({ error: "تعذّر حفظ العنوان" });
  }
});

// ── Shipping quote + coupon check ────────────────────────────────────────────
router.get("/store/shipping/quote", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    let governorate = typeof req.query.governorate === "string" ? req.query.governorate.trim() : "";
    if (!governorate) {
      const [addr] = await db.select({ g: shippingAddressesTable.governorate }).from(shippingAddressesTable).where(eq(shippingAddressesTable.userId, studentId)).limit(1);
      governorate = addr?.g ?? "";
    }
    const { items, subtotal } = await loadCart(studentId);
    const weight = await cartWeightGrams(items.map((i) => ({ bookId: i.bookId, quantity: i.quantity })));
    await ensureShippingDefaults();
    const settings = await getStoreSettings();
    const freeThreshold = settings.freeShippingThresholdEgp;
    const { cost } = governorate ? await computeShipping(governorate, weight) : { cost: 0 };
    const freeShip = freeThreshold != null && subtotal >= freeThreshold;
    res.json({ governorate, subtotal, shippingEgp: freeShip ? 0 : cost, freeShipping: freeShip, freeShippingThreshold: freeThreshold });
  } catch (err) {
    req.log.error({ err }, "Shipping quote error");
    res.status(500).json({ error: "تعذّر حساب الشحن" });
  }
});

async function cartWeightGrams(items: { bookId: number; quantity: number }[]): Promise<number> {
  if (!items.length) return 0;
  const rows = await db.select({ id: booksTable.id, w: booksTable.weightGrams }).from(booksTable).where(inArray(booksTable.id, items.map((i) => i.bookId)));
  const wById = new Map(rows.map((r) => [r.id, r.w ?? DEFAULT_BOOK_WEIGHT_GRAMS]));
  return items.reduce((sum, i) => sum + (wById.get(i.bookId) ?? DEFAULT_BOOK_WEIGHT_GRAMS) * i.quantity, 0);
}

router.post("/store/coupon/check", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const { subtotal } = await loadCart(studentId);
    const result = await evaluateVoucher(String(req.body?.code ?? ""), subtotal);
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? "كود غير صالح" });
      return;
    }
    res.json({ ok: true, discountEgp: result.discountEgp, freeShipping: result.freeShipping, code: result.voucher?.code });
  } catch (err) {
    req.log.error({ err }, "Coupon check error");
    res.status(500).json({ error: "تعذّر التحقق من الكود" });
  }
});

// ── Checkout ─────────────────────────────────────────────────────────────────
router.post("/store/checkout", async (req, res) => {
  const studentId = await requireStudentId(req, res);
  if (studentId == null) return;
  try {
    // Only Cash-on-Delivery is supported until a real payment gateway with
    // SERVER-VERIFIED webhooks exists. A client-claimed "paid" method must never
    // be trusted — doing so would let anyone unlock paywalled digital content for
    // free. So we hard-force COD and grant NO digital access here; the student
    // redeems the book's code after delivery (admin-reviewed), same as today.
    const paymentMethod = "cod";
    const voucherCode = req.body?.voucherCode ? String(req.body.voucherCode).trim() : "";

    const { items, subtotal } = await loadCart(studentId);
    if (!items.length) {
      res.status(400).json({ error: "السلة فاضية" });
      return;
    }
    const [address] = await db.select().from(shippingAddressesTable).where(eq(shippingAddressesTable.userId, studentId)).orderBy(desc(shippingAddressesTable.id)).limit(1);
    if (!address) {
      res.status(400).json({ error: "ضيف عنوان الشحن الأول" });
      return;
    }

    await ensureShippingDefaults();
    const settings = await getStoreSettings();
    const weight = await cartWeightGrams(items.map((i) => ({ bookId: i.bookId, quantity: i.quantity })));
    const { zoneId, cost: rawShipping } = await computeShipping(address.governorate, weight);
    const freeShip = settings.freeShippingThresholdEgp != null && subtotal >= settings.freeShippingThresholdEgp;
    // No zone for this governorate = we can't price shipping → don't silently ship free.
    if (zoneId == null && !freeShip) {
      res.status(400).json({ error: "الشحن لمحافظتك مش متاح حاليًا، تواصل مع الدعم" });
      return;
    }
    const shippingEgp = freeShip ? 0 : rawShipping;

    let discountEgp = 0;
    let voucher: typeof bookVouchersTable.$inferSelect | undefined;
    let couponFreeShipping = false;
    if (voucherCode) {
      const v = await evaluateVoucher(voucherCode, subtotal);
      if (!v.ok) {
        res.status(400).json({ error: v.error ?? "كود غير صالح" });
        return;
      }
      discountEgp = v.discountEgp;
      voucher = v.voucher;
      couponFreeShipping = v.freeShipping;
    }
    // A free-shipping coupon waives the shipping fee (on top of any threshold).
    const finalShippingEgp = couponFreeShipping ? 0 : shippingEgp;
    const totalEgp = Math.max(0, subtotal + finalShippingEgp - discountEgp);

    const order = await db.transaction(async (tx) => {
      // Atomic, self-guarding stock decrement: each UPDATE only fires while enough
      // stock remains, so two concurrent checkouts can't oversell one copy. Any
      // short item throws → the whole order rolls back.
      for (const i of items) {
        const dec = await tx
          .update(booksTable)
          .set({ stockQuantity: sql`${booksTable.stockQuantity} - ${i.quantity}` })
          .where(and(eq(booksTable.id, i.bookId), sql`${booksTable.stockQuantity} >= ${i.quantity}`))
          .returning({ id: booksTable.id });
        if (dec.length === 0) throw new Error(`OUT_OF_STOCK:${i.title}`);
      }
      // Guarded voucher redemption — the WHERE clause enforces the usage limit
      // atomically, so concurrent checkouts can't push usedCount past it.
      if (voucher) {
        const vr = await tx
          .update(bookVouchersTable)
          .set({ usedCount: sql`${bookVouchersTable.usedCount} + 1` })
          .where(
            and(
              eq(bookVouchersTable.id, voucher.id),
              sql`(${bookVouchersTable.usageLimit} is null or ${bookVouchersTable.usedCount} < ${bookVouchersTable.usageLimit})`,
            ),
          )
          .returning({ id: bookVouchersTable.id });
        if (vr.length === 0) throw new Error("VOUCHER_EXHAUSTED");
      }

      const [o] = await tx
        .insert(ordersTable)
        .values({
          userId: studentId,
          status: "placed",
          recipientName: address.recipientName,
          phone: address.phone,
          governorate: address.governorate,
          city: address.city,
          street: address.street,
          addressNotes: address.notes,
          subtotalEgp: subtotal,
          shippingEgp: finalShippingEgp,
          discountEgp,
          totalEgp,
          voucherCode: voucher?.code ?? null,
          paymentMethod,
        })
        .returning();
      const orderNumber = `OF-${String(o.id).padStart(5, "0")}`;
      await tx.update(ordersTable).set({ orderNumber }).where(eq(ordersTable.id, o.id));
      await tx.insert(orderItemsTable).values(items.map((i) => ({ orderId: o.id, bookId: i.bookId, titleSnapshot: i.title, unitPriceEgp: i.priceEgp, quantity: i.quantity })));
      await tx.insert(orderStatusHistoryTable).values({ orderId: o.id, status: "placed", note: "تم إنشاء الطلب" });
      await tx.delete(cartItemsTable).where(eq(cartItemsTable.userId, studentId));
      return { ...o, orderNumber };
    });

    // NOTE: loyalty points are credited only when the order is DELIVERED (see the
    // admin status handler) — never at placement — so a place-then-cancel loop
    // can't farm points. No digital access is granted here (COD, unpaid).
    await notifyOrderStatus(studentId, order, "placed").catch(() => undefined);
    await notifyAdminsNewOrder(order).catch(() => undefined);

    res.status(201).json(order);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("OUT_OF_STOCK:")) {
      res.status(409).json({ error: `الكمية المطلوبة من «${msg.slice("OUT_OF_STOCK:".length)}» مش متوفرة` });
      return;
    }
    if (msg === "VOUCHER_EXHAUSTED") {
      res.status(409).json({ error: "الكود خلص عدد استخدامه" });
      return;
    }
    req.log.error({ err }, "Checkout error");
    res.status(500).json({ error: "تعذّر إتمام الطلب" });
  }
});

// ── Student orders + tracking ────────────────────────────────────────────────
router.get("/store/orders", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const orders = await db
      .select({
        id: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        totalEgp: ordersTable.totalEgp,
        paymentMethod: ordersTable.paymentMethod,
        createdAt: ordersTable.createdAt,
        itemCount: sql<number>`(select count(*) from ${orderItemsTable} where ${orderItemsTable.orderId} = ${ordersTable.id})`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, studentId))
      .orderBy(desc(ordersTable.id));
    res.json(orders);
  } catch (err) {
    req.log.error({ err }, "Student orders error");
    res.status(500).json({ error: "تعذّر تحميل الطلبات" });
  }
});

router.get("/store/orders/:id", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const id = toInt(req.params.id);
    const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, id), eq(ordersTable.userId, studentId))).limit(1);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    const timeline = await db.select().from(orderStatusHistoryTable).where(eq(orderStatusHistoryTable.orderId, id)).orderBy(orderStatusHistoryTable.id);
    res.json({ ...order, items, timeline });
  } catch (err) {
    req.log.error({ err }, "Student order detail error");
    res.status(500).json({ error: "تعذّر تحميل الطلب" });
  }
});

router.post("/store/orders/:id/cancel", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const id = toInt(req.params.id);
    const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, id), eq(ordersTable.userId, studentId))).limit(1);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    if (!CANCELLABLE_BY_STUDENT.includes(order.status as OrderStatus)) {
      res.status(400).json({ error: "الطلب اتشحن — كلّم الدعم للإلغاء" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, id));
      await tx.insert(orderStatusHistoryTable).values({ orderId: id, status: "cancelled", note: "ألغاه الطالب" });
      const its = await tx.select({ bookId: orderItemsTable.bookId, quantity: orderItemsTable.quantity }).from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
      for (const it of its) {
        if (it.bookId) await tx.update(booksTable).set({ stockQuantity: sql`${booksTable.stockQuantity} + ${it.quantity}` }).where(eq(booksTable.id, it.bookId));
      }
    });
    await notifyOrderStatus(studentId, order, "cancelled").catch(() => undefined);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Order cancel error");
    res.status(500).json({ error: "تعذّر إلغاء الطلب" });
  }
});

// ── Wishlist ─────────────────────────────────────────────────────────────────
router.get("/store/wishlist", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const rows = await db
      .select({ id: booksTable.id, title: booksTable.title, author: booksTable.author, coverUrl: booksTable.coverUrl, priceEgp: booksTable.priceEgp, stockQuantity: booksTable.stockQuantity })
      .from(bookFavoritesTable)
      .innerJoin(booksTable, eq(bookFavoritesTable.bookId, booksTable.id))
      .where(eq(bookFavoritesTable.userId, studentId))
      .orderBy(desc(bookFavoritesTable.id));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Wishlist load error");
    res.status(500).json({ error: "تعذّر تحميل المفضّلة" });
  }
});

router.post("/store/wishlist/:bookId", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    const bookId = toInt(req.params.bookId);
    const [book] = await db.select({ id: booksTable.id }).from(booksTable).where(eq(booksTable.id, bookId)).limit(1);
    if (!book) {
      res.status(404).json({ error: "الكتاب غير موجود" });
      return;
    }
    await db.insert(bookFavoritesTable).values({ userId: studentId, bookId }).onConflictDoNothing();
    res.json({ ok: true, favorite: true });
  } catch (err) {
    req.log.error({ err }, "Wishlist add error");
    res.status(500).json({ error: "تعذّر الحفظ" });
  }
});

router.delete("/store/wishlist/:bookId", async (req, res) => {
  try {
    const studentId = await requireStudentId(req, res);
    if (studentId == null) return;
    await db.delete(bookFavoritesTable).where(and(eq(bookFavoritesTable.userId, studentId), eq(bookFavoritesTable.bookId, toInt(req.params.bookId))));
    res.json({ ok: true, favorite: false });
  } catch (err) {
    req.log.error({ err }, "Wishlist remove error");
    res.status(500).json({ error: "تعذّر الحذف" });
  }
});

// ── Admin: order management (auto-gated by app-level /api/admin) ──────────────
router.get("/admin/orders", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const conds = [] as any[];
    if (status && (ORDER_STATUSES as readonly string[]).includes(status)) conds.push(eq(ordersTable.status, status));
    if (q) {
      const like = `%${q}%`;
      conds.push(or(ilike(ordersTable.orderNumber, like), ilike(ordersTable.recipientName, like), ilike(ordersTable.phone, like), ilike(ordersTable.governorate, like))!);
    }
    const rows = await db
      .select({
        id: ordersTable.id,
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        recipientName: ordersTable.recipientName,
        phone: ordersTable.phone,
        governorate: ordersTable.governorate,
        totalEgp: ordersTable.totalEgp,
        paymentMethod: ordersTable.paymentMethod,
        createdAt: ordersTable.createdAt,
        itemCount: sql<number>`(select count(*) from ${orderItemsTable} where ${orderItemsTable.orderId} = ${ordersTable.id})`,
      })
      .from(ordersTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(ordersTable.id));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Admin orders list error");
    res.status(500).json({ error: "تعذّر تحميل الطلبات" });
  }
});

router.get("/admin/orders/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    const timeline = await db.select().from(orderStatusHistoryTable).where(eq(orderStatusHistoryTable.orderId, id)).orderBy(orderStatusHistoryTable.id);
    const [student] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1);
    res.json({ ...order, items, timeline, student: student ?? null });
  } catch (err) {
    req.log.error({ err }, "Admin order detail error");
    res.status(500).json({ error: "تعذّر تحميل الطلب" });
  }
});

router.put("/admin/orders/:id/status", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const status = String(req.body?.status ?? "").trim() as OrderStatus;
    const note = req.body?.note ? String(req.body.note).trim() : null;
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: "حالة غير صحيحة" });
      return;
    }
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    if (order.status === status) {
      res.json(order);
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(ordersTable).set({ status, updatedAt: new Date() }).where(eq(ordersTable.id, id));
      await tx.insert(orderStatusHistoryTable).values({ orderId: id, status, note });
      const its = await tx.select({ bookId: orderItemsTable.bookId, quantity: orderItemsTable.quantity }).from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
      // Restock ONLY on a real non-cancelled → cancelled transition (prior status
      // guard prevents restocking an already-cancelled order twice).
      if (status === "cancelled" && order.status !== "cancelled") {
        for (const it of its) {
          if (it.bookId) await tx.update(booksTable).set({ stockQuantity: sql`${booksTable.stockQuantity} + ${it.quantity}` }).where(eq(booksTable.id, it.bookId));
        }
      } else if (order.status === "cancelled" && status !== "cancelled") {
        // Reviving a cancelled order → take the stock back out.
        for (const it of its) {
          if (it.bookId) await tx.update(booksTable).set({ stockQuantity: sql`greatest(0, ${booksTable.stockQuantity} - ${it.quantity})` }).where(eq(booksTable.id, it.bookId));
        }
      }
    });

    // Loyalty points are credited once, only when the order is actually DELIVERED
    // (a settled, non-reversible state) — idempotent per order via sourceKey.
    if (status === "delivered") {
      const settings = await getStoreSettings();
      const unit = settings.pointsPerEgpUnit > 0 ? settings.pointsPerEgpUnit : 10;
      const points = Math.floor(order.subtotalEgp / unit);
      if (points > 0) {
        await awardPoints({ userId: order.userId, type: "book_purchase", amount: points, description: `شراء كتب (طلب ${order.orderNumber ?? order.id})`, sourceKey: `order:${order.id}` }).catch(() => 0);
      }
    }

    await notifyOrderStatus(order.userId, order, status).catch(() => undefined);
    const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Admin order status error");
    res.status(500).json({ error: "تعذّر تغيير الحالة" });
  }
});

router.get("/admin/store/low-stock", async (req, res) => {
  try {
    const settings = await getStoreSettings();
    const rows = await db
      .select({ id: booksTable.id, title: booksTable.title, stockQuantity: booksTable.stockQuantity })
      .from(booksTable)
      .where(and(eq(booksTable.available, true), sql`${booksTable.stockQuantity} <= ${settings.lowStockThreshold}`))
      .orderBy(booksTable.stockQuantity);
    res.json({ threshold: settings.lowStockThreshold, books: rows });
  } catch (err) {
    req.log.error({ err }, "Low stock error");
    res.status(500).json({ error: "تعذّر تحميل المخزون" });
  }
});

// Subjects list for the product editor's "unlocks which subject" dropdown.
router.get("/admin/store/subjects", async (req, res) => {
  try {
    const rows = await db
      .select({ id: subjectsTable.id, name: subjectsTable.name, yearName: academicYearsTable.name })
      .from(subjectsTable)
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .orderBy(academicYearsTable.orderIndex, subjectsTable.orderIndex);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Store subjects error");
    res.status(500).json({ error: "تعذّر تحميل المواد" });
  }
});

router.get("/admin/store/settings", async (_req, res) => {
  res.json(await getStoreSettings());
});

router.put("/admin/store/settings", async (req, res) => {
  try {
    const current = await getStoreSettings();
    const freeShippingThresholdEgp =
      req.body?.freeShippingThresholdEgp === null || req.body?.freeShippingThresholdEgp === ""
        ? null
        : Math.max(0, toInt(req.body?.freeShippingThresholdEgp, current.freeShippingThresholdEgp ?? 0));
    const [saved] = await db
      .update(storeSettingsTable)
      .set({
        freeShippingThresholdEgp,
        pointsPerEgpUnit: Math.max(1, toInt(req.body?.pointsPerEgpUnit, current.pointsPerEgpUnit)),
        lowStockThreshold: Math.max(0, toInt(req.body?.lowStockThreshold, current.lowStockThreshold)),
        updatedAt: new Date(),
      })
      .where(eq(storeSettingsTable.id, current.id))
      .returning();
    res.json(saved);
  } catch (err) {
    req.log.error({ err }, "Store settings save error");
    res.status(500).json({ error: "تعذّر حفظ الإعدادات" });
  }
});

// ── Catalog layout: owner arranges in-stock books into display rows ───────────
router.get("/admin/store/layout", async (req, res) => {
  try {
    const settings = await getStoreSettings();
    const books = await db
      .select({
        id: booksTable.id,
        title: booksTable.title,
        coverUrl: booksTable.coverUrl,
        coverPortraitUrl: booksTable.coverPortraitUrl,
        coverLandscapeUrl: booksTable.coverLandscapeUrl,
        priceEgp: booksTable.priceEgp,
        originalPriceEgp: booksTable.originalPriceEgp,
        stockQuantity: booksTable.stockQuantity,
        available: booksTable.available,
      })
      .from(booksTable)
      .where(and(eq(booksTable.available, true), gt(booksTable.stockQuantity, 0)))
      .orderBy(desc(booksTable.sortOrder), desc(booksTable.id));
    res.json({ layout: settings.catalogLayout ? normalizeLayout(settings.catalogLayout) : null, books });
  } catch (err) {
    req.log.error({ err }, "Store layout admin load error");
    res.status(500).json({ error: "تعذّر تحميل بيانات العرض" });
  }
});

router.put("/admin/store/layout", async (req, res) => {
  try {
    const layout = normalizeLayout(req.body?.layout);
    const current = await getStoreSettings();
    const [saved] = await db
      .update(storeSettingsTable)
      .set({ catalogLayout: layout, updatedAt: new Date() })
      .where(eq(storeSettingsTable.id, current.id))
      .returning();
    res.json({ layout: saved.catalogLayout ?? [] });
  } catch (err) {
    req.log.error({ err }, "Store layout save error");
    res.status(500).json({ error: "تعذّر حفظ الترتيب" });
  }
});

// ── Admin: store-wide discount codes (whole-order percent coupons) ───────────
// Stored in book_vouchers with bookId=null so they apply to the whole cart.
// Validity is enforced at checkout (evaluateVoucher): active + date window +
// usageLimit, with an atomic usage-limit guard in the checkout transaction.
router.get("/admin/store/coupons", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: bookVouchersTable.id,
        code: bookVouchersTable.code,
        discountType: bookVouchersTable.discountType,
        discountValue: bookVouchersTable.discountValue,
        discountPercent: bookVouchersTable.discountPercent,
        usageLimit: bookVouchersTable.usageLimit,
        usedCount: bookVouchersTable.usedCount,
        expiresAt: bookVouchersTable.expiresAt,
        active: bookVouchersTable.active,
        createdAt: bookVouchersTable.createdAt,
      })
      .from(bookVouchersTable)
      .orderBy(desc(bookVouchersTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "List coupons error");
    res.status(500).json({ error: "تعذّر تحميل الأكواد" });
  }
});

router.post("/admin/store/coupons", async (req, res) => {
  try {
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: "اكتب الكود" });
      return;
    }
    const typeRaw = String(req.body?.discountType ?? "percent").trim();
    const discountType = typeRaw === "amount" || typeRaw === "free_shipping" ? typeRaw : "percent";
    const value = Math.max(0, toInt(req.body?.discountValue));
    if (discountType === "percent" && value < 1) {
      res.status(400).json({ error: "اكتب نسبة الخصم" });
      return;
    }
    if (discountType === "amount" && value < 1) {
      res.status(400).json({ error: "اكتب مبلغ الخصم" });
      return;
    }
    const discountValue = discountType === "free_shipping" ? 0 : value;
    const discountPercent = discountType === "percent" ? Math.min(100, value) : 0;
    const usageLimitRaw = toInt(req.body?.usageLimit);
    const usageLimit = usageLimitRaw > 0 ? usageLimitRaw : null;
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
    const [existing] = await db.select({ id: bookVouchersTable.id }).from(bookVouchersTable).where(eq(bookVouchersTable.code, code)).limit(1);
    if (existing) {
      res.status(400).json({ error: "الكود موجود بالفعل" });
      return;
    }
    const [voucher] = await db
      .insert(bookVouchersTable)
      .values({ code, bookId: null, discountType, discountValue, discountPercent, active: true, usageLimit, startsAt: null, expiresAt })
      .returning();
    res.status(201).json(voucher);
  } catch (err) {
    req.log.error({ err }, "Create coupon error");
    res.status(500).json({ error: "تعذّر إنشاء الكود" });
  }
});

router.patch("/admin/store/coupons/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const [voucher] = await db.update(bookVouchersTable).set({ active: Boolean(req.body?.active) }).where(eq(bookVouchersTable.id, id)).returning();
    if (!voucher) {
      res.status(404).json({ error: "الكود غير موجود" });
      return;
    }
    res.json(voucher);
  } catch (err) {
    req.log.error({ err }, "Toggle coupon error");
    res.status(500).json({ error: "تعذّر تعديل الكود" });
  }
});

router.delete("/admin/store/coupons/:id", async (req, res) => {
  try {
    await db.delete(bookVouchersTable).where(eq(bookVouchersTable.id, toInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Delete coupon error");
    res.status(500).json({ error: "تعذّر حذف الكود" });
  }
});

export default router;
