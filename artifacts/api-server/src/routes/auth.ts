import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Simple password compare (demo - not bcrypt for speed)
function hashPassword(pw: string) { return pw; }
function checkPassword(plain: string, stored: string) { return plain === stored; }

// Register
router.post("/auth/register", async (req, res) => {
  try {
    const {
      name, email, password, role = "student",
      phone, age, address, parentPhone,
      specialty, qualifications, howDidYouHear,
      supportNeeded, governorate,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" });
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "البريد الإلكتروني مسجّل مسبقاً" });
    }

    const [user] = await db.insert(usersTable).values({
      name,
      email,
      password: hashPassword(password),
      role,
      status: "active",
      phone,
      age: age ? parseInt(age) : undefined,
      address,
      parentPhone,
      specialty,
      qualifications,
      howDidYouHear,
      supportNeeded,
      governorate,
    }).returning();

    const { password: _pw, ...safeUser } = user;
    res.status(201).json({ user: safeUser, token: `session_${user.id}` });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password, requiredRole } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    if (!checkPassword(password, user.password)) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    if (user.status === "suspended") return res.status(403).json({ error: "الحساب موقوف" });

    // If login page requires specific role
    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({ error: "ليس لديك صلاحية الدخول لهذه اللوحة" });
    }

    const { password: _pw, ...safeUser } = user;
    res.json({ user: safeUser, token: `session_${user.id}` });
  } catch (err) {
    req.log.error({ err }, "Login error");
    if (process.env.NODE_ENV === "development") {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: `خطأ في الخادم: ${message}` });
    }
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Get current user
router.get("/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token?.startsWith("session_")) return res.status(401).json({ error: "غير مصرح" });
    const id = parseInt(token.replace("session_", ""));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    const { password: _pw, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Update profile
router.put("/auth/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token?.startsWith("session_")) return res.status(401).json({ error: "غير مصرح" });
    const id = parseInt(token.replace("session_", ""));

    const { name, phone, age, address, bio, governorate, avatarUrl } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (age !== undefined) updateData.age = parseInt(age);
    if (address !== undefined) updateData.address = address;
    if (bio !== undefined) updateData.bio = bio;
    if (governorate !== undefined) updateData.governorate = governorate;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    const { password: _pw, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Seed demo accounts
router.post("/auth/seed-demo", async (req, res) => {
  try {
    const demos = [
      { name: "أحمد الطالب", email: "student@demo.com", password: "demo123", role: "student" },
      { name: "د. سارة المدير", email: "admin@demo.com", password: "admin123", role: "admin" },
      { name: "م. خالد المالك", email: "owner@demo.com", password: "owner123", role: "owner" },
      { name: "المعلم محمد", email: "teacher@demo.com", password: "demo123", role: "teacher" },
    ];
    for (const d of demos) {
      const existing = await db.select().from(usersTable).where(eq(usersTable.email, d.email)).limit(1);
      if (existing.length === 0) {
        await db.insert(usersTable).values({ ...d, status: "active" });
      }
    }
    res.json({ message: "تم إنشاء الحسابات التجريبية" });
  } catch (err) {
    req.log.error({ err }, "Seed demo error");
    if (process.env.NODE_ENV === "development") {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: `خطأ في الخادم: ${message}` });
    }
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
