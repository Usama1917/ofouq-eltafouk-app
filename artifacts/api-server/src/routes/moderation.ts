import { Router, type IRouter } from "express";
import { db, profileModerationRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "../lib/auth";
import {
  AUTO_SUSPEND_AT,
  approveModerationRequest,
  listModerationRequests,
  rejectModerationRequest,
  reportUser,
} from "../lib/profile-moderation";

// Moral-review admin API. All paths live under /admin/* so the app-level /api/admin
// gate (DB role/status check) protects them — only admins/owners can review identities.
const router: IRouter = Router();

// List requests — pending (default) or all (history).
router.get("/admin/moral-reviews", async (req, res) => {
  try {
    const status = req.query.status === "all" ? "all" : "pending";
    const items = await listModerationRequests(status);
    return res.json({ items, autoSuspendAt: AUTO_SUSPEND_AT });
  } catch (err) {
    req.log.error({ err }, "list moral reviews failed");
    return res.status(500).json({ error: "تعذّر تحميل المراجعات" });
  }
});

// Approve → the proposed name/photo becomes the public (everyone-visible) value.
router.post("/admin/moral-reviews/:id/approve", async (req, res) => {
  const adminId = getSessionUserId(req);
  const id = Number.parseInt(req.params.id, 10);
  if (!adminId || !Number.isFinite(id)) return res.status(400).json({ error: "طلب غير صالح" });
  try {
    const ok = await approveModerationRequest(id, adminId);
    if (!ok) return res.status(409).json({ error: "الطلب اتراجع قبل كده أو مش موجود" });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "approve moral review failed");
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Reject → the public value is left as-is (other users keep seeing the old one).
router.post("/admin/moral-reviews/:id/reject", async (req, res) => {
  const adminId = getSessionUserId(req);
  const id = Number.parseInt(req.params.id, 10);
  if (!adminId || !Number.isFinite(id)) return res.status(400).json({ error: "طلب غير صالح" });
  try {
    const ok = await rejectModerationRequest(id, adminId);
    if (!ok) return res.status(409).json({ error: "الطلب اتراجع قبل كده أو مش موجود" });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "reject moral review failed");
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Report the request's user → at AUTO_SUSPEND_AT cumulative reports the account is suspended.
router.post("/admin/moral-reviews/:id/report", async (req, res) => {
  const adminId = getSessionUserId(req);
  const id = Number.parseInt(req.params.id, 10);
  if (!adminId || !Number.isFinite(id)) return res.status(400).json({ error: "طلب غير صالح" });
  try {
    const [reqRow] = await db
      .select({ userId: profileModerationRequestsTable.userId })
      .from(profileModerationRequestsTable)
      .where(eq(profileModerationRequestsTable.id, id))
      .limit(1);
    if (!reqRow) return res.status(404).json({ error: "الطلب مش موجود" });
    const result = await reportUser({ userId: reqRow.userId, reportedBy: adminId, requestId: id });
    return res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err }, "report user failed");
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
