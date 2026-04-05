import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

// NOTE: Keeping simple text passwords for the current project behavior.
function hashPassword(password: string) {
  return password;
}

function checkPassword(plain: string, stored: string) {
  return plain === stored;
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["admin:full", "owner:full"],
  admin: ["admin:full"],
  teacher: ["content:manage"],
  student: ["student:self"],
  parent: ["parent:self"],
};

function withPermissions<T extends { role: string }>(safeUser: T) {
  return {
    ...safeUser,
    permissions: ROLE_PERMISSIONS[safeUser.role] ?? ["student:self"],
  };
}

function getErrorDetails(err: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4) {
    return { name: "Error", message: "Max error depth reached" };
  }

  if (err instanceof Error) {
    const maybeErrorWithCause = err as Error & { code?: string; cause?: unknown };
    const details: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: maybeErrorWithCause.code,
    };
    if (maybeErrorWithCause.cause) {
      details.cause = getErrorDetails(maybeErrorWithCause.cause, depth + 1);
    }
    return details;
  }

  if (err && typeof err === "object") {
    const raw = err as { code?: string; message?: string; cause?: unknown };
    const details: Record<string, unknown> = {
      name: "NonErrorObject",
      message: raw.message ?? String(err),
      code: raw.code,
    };
    if (raw.cause) {
      details.cause = getErrorDetails(raw.cause, depth + 1);
    }
    return details;
  }

  return { name: "UnknownError", message: String(err) };
}

function collectErrorSignals(err: unknown, acc: string[] = [], depth = 0) {
  if (depth > 4 || !err) return acc;

  if (err instanceof Error) {
    const maybeErrorWithCause = err as Error & { code?: string; cause?: unknown };
    if (typeof maybeErrorWithCause.code === "string" && maybeErrorWithCause.code) {
      acc.push(maybeErrorWithCause.code);
    }
    if (typeof maybeErrorWithCause.message === "string" && maybeErrorWithCause.message) {
      acc.push(maybeErrorWithCause.message);
    }
    if (maybeErrorWithCause.cause) {
      collectErrorSignals(maybeErrorWithCause.cause, acc, depth + 1);
    }
    return acc;
  }

  if (typeof err === "object") {
    const raw = err as { code?: string; message?: string; cause?: unknown };
    if (typeof raw.code === "string" && raw.code) acc.push(raw.code);
    if (typeof raw.message === "string" && raw.message) acc.push(raw.message);
    if (raw.cause) collectErrorSignals(raw.cause, acc, depth + 1);
  }

  return acc;
}

function isDatabaseUnavailableError(err: unknown) {
  const signals = collectErrorSignals(err).map((signal) => signal.toLowerCase());
  const codeMatches = ["econnrefused", "etimedout", "enotfound", "eai_again", "57p01", "08006", "08001"];
  const messageMatches = [
    "connection terminated unexpectedly",
    "connect econnrefused",
    "no pg_hba.conf entry",
    "could not connect",
    "database does not exist",
    "getaddrinfo enotfound",
  ];
  return signals.some((signal) => codeMatches.includes(signal) || messageMatches.some((msg) => signal.includes(msg)));
}

function sendDatabaseError(res: any, err: unknown) {
  const errorDetails = getErrorDetails(err);
  if (process.env.NODE_ENV === "development" || process.env.AUTH_DEBUG === "true") {
    return res.status(503).json({
      error: "تعذّر الاتصال بقاعدة البيانات. تحقق من DATABASE_URL وحالة Postgres.",
      details: errorDetails,
    });
  }
  return res.status(503).json({ error: "تعذّر الاتصال بقاعدة البيانات" });
}

// Register
router.post("/auth/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "student",
      phone,
      age,
      address,
      parentPhone,
      specialty,
      qualifications,
      howDidYouHear,
      supportNeeded,
      governorate,
    } = req.body ?? {};

    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" });
    }

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "البريد الإلكتروني مسجّل مسبقاً" });
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        name: String(name),
        email: normalizedEmail,
        password: hashPassword(String(password)),
        role: String(role),
        status: "active",
        phone: phone === undefined ? undefined : String(phone),
        age: age === undefined ? undefined : Number.parseInt(String(age), 10),
        address: address === undefined ? undefined : String(address),
        parentPhone: parentPhone === undefined ? undefined : String(parentPhone),
        specialty: specialty === undefined ? undefined : String(specialty),
        qualifications: qualifications === undefined ? undefined : String(qualifications),
        howDidYouHear: howDidYouHear === undefined ? undefined : String(howDidYouHear),
        supportNeeded: supportNeeded === undefined ? undefined : String(supportNeeded),
        governorate: governorate === undefined ? undefined : String(governorate),
      })
      .returning();

    const { password: _pw, ...safeUser } = user;
    return res.status(201).json({ user: withPermissions(safeUser), token: `session_${user.id}` });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Register error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Login
router.post("/auth/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as {
    email?: string;
    password?: string;
  };
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
  const plainPassword = typeof password === "string" ? password : "";

  try {
    if (!normalizedEmail || !plainPassword) {
      return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
    if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    if (!checkPassword(plainPassword, user.password)) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    if (user.status === "suspended") return res.status(403).json({ error: "الحساب موقوف" });

    const { password: _pw, ...safeUser } = user;
    return res.json({ user: withPermissions(safeUser), token: `session_${user.id}` });
  } catch (err) {
    const errorDetails = getErrorDetails(err);
    req.log.error({ err: errorDetails, email: normalizedEmail }, "Login error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    if (process.env.NODE_ENV === "development" || process.env.AUTH_DEBUG === "true") {
      return res.status(500).json({
        error: "خطأ في الخادم أثناء تسجيل الدخول",
        details: errorDetails,
      });
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Get current user
router.get("/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token?.startsWith("session_")) return res.status(401).json({ error: "غير مصرح" });
    const id = Number.parseInt(token.replace("session_", ""), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(401).json({ error: "غير مصرح" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    const { password: _pw, ...safeUser } = user;
    return res.json(withPermissions(safeUser));
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Get profile error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Update profile
router.put("/auth/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token?.startsWith("session_")) return res.status(401).json({ error: "غير مصرح" });
    const id = Number.parseInt(token.replace("session_", ""), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(401).json({ error: "غير مصرح" });

    const { name, phone, age, address, bio, governorate, avatarUrl } = req.body ?? {};
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name);
    if (phone !== undefined) updateData.phone = String(phone);
    if (age !== undefined) updateData.age = Number.parseInt(String(age), 10);
    if (address !== undefined) updateData.address = String(address);
    if (bio !== undefined) updateData.bio = String(bio);
    if (governorate !== undefined) updateData.governorate = String(governorate);
    if (avatarUrl !== undefined) updateData.avatarUrl = String(avatarUrl);

    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    const { password: _pw, ...safeUser } = user;
    return res.json(withPermissions(safeUser));
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Update profile error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
