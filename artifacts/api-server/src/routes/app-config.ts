import { Router, type IRouter } from "express";

import { ensureAppSettings } from "../lib/app-settings";
import { canCaptureScreen } from "../lib/feature-access";
import { getSessionUser } from "./quiz";

// Lightweight app-wide config the mobile app reads at runtime. Owner-controlled
// values only — never trust the client to enforce them, but for UX toggles
// (screen-capture blocking) client-side enforcement is the mechanism itself.
// The capture flag is PERSONALIZED: global toggle + the owner's per-account
// override + role defaults, resolved in lib/feature-access (single source).
const router: IRouter = Router();

router.get("/app-config", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
      return;
    }
    const settings = await ensureAppSettings();
    res.json({ screenCaptureBlockEnabled: !canCaptureScreen(user, settings.screenCaptureBlockEnabled) });
  } catch (err) {
    (req as any).log?.error({ err }, "app-config load error");
    res.status(500).json({ error: "تعذّر تحميل إعدادات التطبيق" });
  }
});

export default router;
