import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, governorateZonesTable, shippingZonesTable } from "@workspace/db";

// v2 Phase 5 — bookstore shipping settings (admin-managed, per-governorate zones).
// All paths live under /admin/... so they inherit the app-level /api/admin
// role gate (see app.ts) — never add a non-/admin path here.
const router: IRouter = Router();

// Default 6-zone Egypt Post ("Wassalha") tariff. Prices are public ESTIMATES the
// owner overrides with real contract rates from the admin page. Governorate
// strings MUST match ofouq-mobile/lib/egyptGovernorates.ts verbatim (join key).
const DEFAULT_ZONES: { name: string; base: number; govs: string[] }[] = [
  { name: "القاهرة الكبرى", base: 55, govs: ["القاهرة", "الجيزة", "القليوبية"] },
  {
    name: "الإسكندرية والدلتا",
    base: 65,
    govs: ["الإسكندرية", "البحيرة", "الغربية", "المنوفية", "الدقهلية", "كفر الشيخ", "دمياط", "الشرقية"],
  },
  { name: "مدن القناة", base: 70, govs: ["بورسعيد", "الإسماعيلية", "السويس"] },
  { name: "شمال الصعيد", base: 75, govs: ["الفيوم", "بني سويف", "المنيا", "أسيوط"] },
  { name: "جنوب الصعيد", base: 100, govs: ["سوهاج", "قنا", "الأقصر", "أسوان"] },
  { name: "المناطق النائية", base: 110, govs: ["البحر الأحمر", "مطروح", "الوادي الجديد", "شمال سيناء", "جنوب سيناء"] },
];
const DEFAULT_PER_EXTRA_KG = 7;
const DEFAULT_BASE_WEIGHT_GRAMS = 2000;

// Seed the 6 zones + 27 governorate mappings the first time the page is opened
// (idempotent — no-op once any zone exists). Works locally and in production.
// Exported so checkout/quote can guarantee zones exist before computing shipping.
export async function ensureShippingDefaults(): Promise<void> {
  const [existing] = await db.select({ id: shippingZonesTable.id }).from(shippingZonesTable).limit(1);
  if (existing) return;

  const inserted = await db
    .insert(shippingZonesTable)
    .values(
      DEFAULT_ZONES.map((z, i) => ({
        name: z.name,
        basePriceEgp: z.base,
        perExtraKgEgp: DEFAULT_PER_EXTRA_KG,
        baseWeightGrams: DEFAULT_BASE_WEIGHT_GRAMS,
        sortOrder: i,
      })),
    )
    .returning({ id: shippingZonesTable.id, name: shippingZonesTable.name });

  const idByName = new Map(inserted.map((z) => [z.name, z.id]));
  const govRows: { governorate: string; zoneId: number }[] = [];
  for (const z of DEFAULT_ZONES) {
    const zoneId = idByName.get(z.name);
    if (!zoneId) continue;
    for (const gov of z.govs) govRows.push({ governorate: gov, zoneId });
  }
  if (govRows.length) {
    await db.insert(governorateZonesTable).values(govRows).onConflictDoNothing();
  }
}

function asNonNegInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

// GET all zones + governorate assignments (seeds defaults on first call).
router.get("/admin/shipping", async (req, res) => {
  try {
    await ensureShippingDefaults();
    const zones = await db
      .select()
      .from(shippingZonesTable)
      .orderBy(asc(shippingZonesTable.sortOrder), asc(shippingZonesTable.id));
    const governorates = await db
      .select()
      .from(governorateZonesTable)
      .orderBy(asc(governorateZonesTable.id));
    res.json({ zones, governorates });
  } catch (err) {
    req.log.error({ err }, "List shipping settings error");
    res.status(500).json({ error: "تعذّر تحميل إعدادات الشحن" });
  }
});

// Add a new zone.
router.post("/admin/shipping/zones", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "اكتب اسم المنطقة" });
      return;
    }
    const [{ maxSort } = { maxSort: 0 }] = await db
      .select({ maxSort: sql<number>`coalesce(max(${shippingZonesTable.sortOrder}), 0)` })
      .from(shippingZonesTable);
    const [zone] = await db
      .insert(shippingZonesTable)
      .values({
        name,
        basePriceEgp: asNonNegInt(req.body?.basePriceEgp),
        perExtraKgEgp: asNonNegInt(req.body?.perExtraKgEgp, DEFAULT_PER_EXTRA_KG),
        baseWeightGrams: asNonNegInt(req.body?.baseWeightGrams, DEFAULT_BASE_WEIGHT_GRAMS),
        sortOrder: Number(maxSort) + 1,
      })
      .returning();
    res.status(201).json(zone);
  } catch (err) {
    req.log.error({ err }, "Create shipping zone error");
    res.status(500).json({ error: "تعذّر إضافة المنطقة" });
  }
});

// Edit a zone's name / prices.
router.put("/admin/shipping/zones/:id", async (req, res) => {
  try {
    const id = asNonNegInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: "منطقة غير صحيحة" });
      return;
    }
    const fields: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof req.body?.name === "string" && req.body.name.trim()) fields.name = req.body.name.trim();
    if (req.body?.basePriceEgp !== undefined) fields.basePriceEgp = asNonNegInt(req.body.basePriceEgp);
    if (req.body?.perExtraKgEgp !== undefined) fields.perExtraKgEgp = asNonNegInt(req.body.perExtraKgEgp);
    if (req.body?.baseWeightGrams !== undefined)
      fields.baseWeightGrams = asNonNegInt(req.body.baseWeightGrams, DEFAULT_BASE_WEIGHT_GRAMS);

    const [zone] = await db
      .update(shippingZonesTable)
      .set(fields)
      .where(eq(shippingZonesTable.id, id))
      .returning();
    if (!zone) {
      res.status(404).json({ error: "المنطقة غير موجودة" });
      return;
    }
    res.json(zone);
  } catch (err) {
    req.log.error({ err }, "Update shipping zone error");
    res.status(500).json({ error: "تعذّر حفظ المنطقة" });
  }
});

// Delete a zone (blocked while governorates still point at it).
router.delete("/admin/shipping/zones/:id", async (req, res) => {
  try {
    const id = asNonNegInt(req.params.id);
    if (!id) {
      res.status(400).json({ error: "منطقة غير صحيحة" });
      return;
    }
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(governorateZonesTable)
      .where(eq(governorateZonesTable.zoneId, id));
    if (Number(count) > 0) {
      res.status(400).json({ error: "فيه محافظات في المنطقة دي — غيّرها لمنطقة تانية الأول" });
      return;
    }
    await db.delete(shippingZonesTable).where(eq(shippingZonesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Delete shipping zone error");
    res.status(500).json({ error: "تعذّر حذف المنطقة" });
  }
});

// Reassign a governorate to a different zone.
router.put("/admin/shipping/governorates/:id", async (req, res) => {
  try {
    const id = asNonNegInt(req.params.id);
    const zoneId = asNonNegInt(req.body?.zoneId);
    if (!id || !zoneId) {
      res.status(400).json({ error: "بيانات غير صحيحة" });
      return;
    }
    const [zone] = await db
      .select({ id: shippingZonesTable.id })
      .from(shippingZonesTable)
      .where(eq(shippingZonesTable.id, zoneId))
      .limit(1);
    if (!zone) {
      res.status(404).json({ error: "المنطقة غير موجودة" });
      return;
    }
    const [row] = await db
      .update(governorateZonesTable)
      .set({ zoneId, updatedAt: new Date() })
      .where(eq(governorateZonesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "المحافظة غير موجودة" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Reassign governorate error");
    res.status(500).json({ error: "تعذّر تغيير منطقة المحافظة" });
  }
});

export default router;
