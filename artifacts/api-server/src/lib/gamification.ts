// Gamification engine (v2 Phase 1): per-student points wallet, daily streak, and
// daily study-goal. The streak/goal day boundary is computed in Africa/Cairo time so
// "today" matches the student's clock, not UTC midnight. All point credits go through
// `awardPoints`, which is idempotent per (userId, sourceKey) — so a lesson, a day, or
// a goal can never be double-credited even if the client retries a request.

import {
  db,
  usersTable,
  pointsAccountTable,
  pointsTransactionsTable,
  dailyActivityTable,
  studentOnboardingResponsesTable,
} from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

// Point values for each earnable event. Centralised so the admin "points rules" page
// and the mobile "+N" animation read the same source of truth.
export const POINTS = {
  lessonComplete: 10,
  dailyActive: 5,
  dailyGoal: 20,
} as const;

// Streak bonus by milestone: day 10 → 20, day 20 → 50, day 30 → 100, then +5 for
// every additional day from day 31 onward. Returns the bonus for the given streak day.
export function streakBonus(streakCount: number): number {
  if (streakCount === 10) return 20;
  if (streakCount === 20) return 50;
  if (streakCount === 30) return 100;
  if (streakCount >= 31) return 5;
  return 0;
}

const CAIRO_TZ = "Africa/Cairo";
// A single progress ping arrives every ~15s with the cumulative position; cap how much
// study time one ping may contribute so a seek/skip/resume jump can't inflate the goal.
const MAX_PING_SECONDS = 120;

const cairoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar day in Africa/Cairo as "YYYY-MM-DD". */
export function cairoDay(d: Date = new Date()): string {
  return cairoDayFormatter.format(d); // en-CA → YYYY-MM-DD
}

/** The calendar day before `dayStr` ("YYYY-MM-DD" in, "YYYY-MM-DD" out). */
export function previousDay(dayStr: string): string {
  const [y, m, d] = dayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Idempotently credit points to a student's wallet. When `sourceKey` is supplied and a
 * transaction already exists for that (userId, sourceKey), this no-ops and returns 0 —
 * so the same event is never awarded twice. Returns the amount actually credited.
 */
export async function awardPoints(opts: {
  userId: number;
  type: string;
  amount: number;
  description: string;
  sourceKey?: string;
}): Promise<number> {
  const { userId, type, amount, description, sourceKey } = opts;
  if (!Number.isInteger(amount) || amount <= 0) return 0;

  // One wallet row per student.
  await db
    .insert(pointsAccountTable)
    .values({ userId, balance: 0, totalEarned: 0, totalSpent: 0 })
    .onConflictDoNothing({ target: pointsAccountTable.userId });

  // Ledger row; a duplicate (userId, sourceKey) hits the unique index and no-ops.
  const inserted = await db
    .insert(pointsTransactionsTable)
    .values({ userId, type, amount, description, sourceKey: sourceKey ?? null })
    .onConflictDoNothing()
    .returning({ id: pointsTransactionsTable.id });

  if (inserted.length === 0) return 0; // already awarded for this sourceKey

  await db
    .update(pointsAccountTable)
    .set({
      balance: sql`${pointsAccountTable.balance} + ${amount}`,
      totalEarned: sql`${pointsAccountTable.totalEarned} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(pointsAccountTable.userId, userId));

  return amount;
}

export interface ActivityResult {
  pointsAwarded: number;
  streakCount: number;
  goalMet: boolean;
  // True only on the single ping that crossed the daily goal (for the congrats msg).
  goalJustMet: boolean;
  // Wallet balance after this call's awards (for points-milestone detection).
  balanceAfter: number;
}

/**
 * Record a chunk of study activity and run the streak + daily-goal + points engine.
 * Call after a lesson-progress ping is persisted.
 *  - watchedDeltaSeconds: NEW seconds watched since the previous ping (caller's delta).
 *  - justCompletedLesson: true only on the false→true completion transition.
 */
export async function recordLessonActivity(opts: {
  userId: number;
  watchedDeltaSeconds: number;
  justCompletedLesson: boolean;
  lessonId: number;
}): Promise<ActivityResult> {
  const { userId, lessonId } = opts;
  const watched = Math.max(0, Math.min(Math.floor(opts.watchedDeltaSeconds), MAX_PING_SECONDS));
  const today = cairoDay();
  let pointsAwarded = 0;

  const [user] = await db
    .select({
      lastActiveDay: usersTable.lastActiveDay,
      streakCount: usersTable.streakCount,
      streakBest: usersTable.streakBest,
      dailyGoalMinutes: usersTable.dailyGoalMinutes,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return { pointsAwarded: 0, streakCount: 0, goalMet: false, goalJustMet: false, balanceAfter: 0 };

  // --- streak: advance at most once per calendar day ---
  let streakCount = user.streakCount;
  if (user.lastActiveDay !== today) {
    streakCount = user.lastActiveDay === previousDay(today) ? user.streakCount + 1 : 1;
    const streakBest = Math.max(user.streakBest, streakCount);
    await db
      .update(usersTable)
      .set({ streakCount, streakBest, lastActiveDay: today })
      .where(eq(usersTable.id, userId));
    pointsAwarded += await awardPoints({
      userId,
      type: "earn",
      amount: POINTS.dailyActive,
      description: "نشاط يومي",
      sourceKey: `daily_active:${today}`,
    });
    // Streak bonus (10→20, 20→50, 30→100, then +5/day from day 31). Keyed by the day
    // it's earned so it awards once per day and re-earns across separate streaks.
    const bonus = streakBonus(streakCount);
    if (bonus > 0) {
      pointsAwarded += await awardPoints({
        userId,
        type: "earn",
        amount: bonus,
        description: `مكافأة سلسلة ${streakCount} يوم`,
        sourceKey: `streak_milestone:${today}`,
      });
    }
  }

  // --- lesson completion bonus (once per lesson, ever) ---
  if (opts.justCompletedLesson) {
    pointsAwarded += await awardPoints({
      userId,
      type: "earn",
      amount: POINTS.lessonComplete,
      description: "مشاهدة درس",
      sourceKey: `lesson_complete:${lessonId}`,
    });
  }

  // --- daily-activity ledger (accumulate watched seconds + lessons) ---
  const goalSeconds = Math.max(1, user.dailyGoalMinutes * 60);
  const completedInc = opts.justCompletedLesson ? 1 : 0;
  const [activity] = await db
    .insert(dailyActivityTable)
    .values({
      userId,
      activityDate: today,
      watchedSeconds: watched,
      lessonsCompleted: completedInc,
      pointsEarned: pointsAwarded,
      goalMet: false,
    })
    .onConflictDoUpdate({
      target: [dailyActivityTable.userId, dailyActivityTable.activityDate],
      set: {
        watchedSeconds: sql`${dailyActivityTable.watchedSeconds} + ${watched}`,
        lessonsCompleted: sql`${dailyActivityTable.lessonsCompleted} + ${completedInc}`,
        pointsEarned: sql`${dailyActivityTable.pointsEarned} + ${pointsAwarded}`,
        updatedAt: new Date(),
      },
    })
    .returning({
      watchedSeconds: dailyActivityTable.watchedSeconds,
      goalMet: dailyActivityTable.goalMet,
    });

  // --- daily goal: flip the flag and award the bonus once, on the crossing ping ---
  let goalMet = activity?.goalMet ?? false;
  let goalJustMet = false;
  if (!goalMet && (activity?.watchedSeconds ?? 0) >= goalSeconds) {
    goalMet = true;
    goalJustMet = true;
    const goalBonus = await awardPoints({
      userId,
      type: "earn",
      amount: POINTS.dailyGoal,
      description: "تحقيق الهدف اليومي",
      sourceKey: `daily_goal:${today}`,
    });
    pointsAwarded += goalBonus;
    await db
      .update(dailyActivityTable)
      .set({
        goalMet: true,
        pointsEarned: sql`${dailyActivityTable.pointsEarned} + ${goalBonus}`,
      })
      .where(and(eq(dailyActivityTable.userId, userId), eq(dailyActivityTable.activityDate, today)));
  }

  // Final wallet balance, so the caller can detect a points-milestone crossing
  // (old balance = balanceAfter - pointsAwarded).
  const [acct] = await db
    .select({ balance: pointsAccountTable.balance })
    .from(pointsAccountTable)
    .where(eq(pointsAccountTable.userId, userId))
    .limit(1);

  return { pointsAwarded, streakCount, goalMet, goalJustMet, balanceAfter: acct?.balance ?? 0 };
}

export interface GamificationSummary {
  balance: number;
  totalEarned: number;
  streak: number;
  streakBest: number;
  activeToday: boolean;
  dailyGoalMinutes: number;
  todayWatchedSeconds: number;
  todayProgressRatio: number;
  goalMet: boolean;
  todayPointsEarned: number;
}

/** Everything the mobile home header + goal ring needs in one call. */
export async function getGamificationSummary(userId: number): Promise<GamificationSummary> {
  const today = cairoDay();
  const [[user], [account], [activity]] = await Promise.all([
    db
      .select({
        streakCount: usersTable.streakCount,
        streakBest: usersTable.streakBest,
        lastActiveDay: usersTable.lastActiveDay,
        dailyGoalMinutes: usersTable.dailyGoalMinutes,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1),
    db
      .select({ balance: pointsAccountTable.balance, totalEarned: pointsAccountTable.totalEarned })
      .from(pointsAccountTable)
      .where(eq(pointsAccountTable.userId, userId))
      .limit(1),
    db
      .select({
        watchedSeconds: dailyActivityTable.watchedSeconds,
        goalMet: dailyActivityTable.goalMet,
        pointsEarned: dailyActivityTable.pointsEarned,
      })
      .from(dailyActivityTable)
      .where(and(eq(dailyActivityTable.userId, userId), eq(dailyActivityTable.activityDate, today)))
      .limit(1),
  ]);

  const goalMinutes = user?.dailyGoalMinutes ?? 30;
  const goalSeconds = Math.max(1, goalMinutes * 60);
  const watchedToday = activity?.watchedSeconds ?? 0;

  // A stored streak is only "live" if the last active day was today or yesterday;
  // otherwise the chain is broken and we display 0 (the next activity will reset it).
  const last = user?.lastActiveDay ?? null;
  const streakLive = last === today || last === previousDay(today);

  return {
    balance: account?.balance ?? 0,
    totalEarned: account?.totalEarned ?? 0,
    streak: streakLive ? user?.streakCount ?? 0 : 0,
    streakBest: user?.streakBest ?? 0,
    activeToday: last === today,
    dailyGoalMinutes: goalMinutes,
    todayWatchedSeconds: watchedToday,
    todayProgressRatio: Math.min(1, watchedToday / goalSeconds),
    goalMet: activity?.goalMet ?? false,
    todayPointsEarned: activity?.pointsEarned ?? 0,
  };
}

/** The student's points ledger, newest first — what they earned and when. */
export async function getPointsHistory(userId: number, limit = 200) {
  return db
    .select({
      id: pointsTransactionsTable.id,
      type: pointsTransactionsTable.type,
      amount: pointsTransactionsTable.amount,
      description: pointsTransactionsTable.description,
      sourceKey: pointsTransactionsTable.sourceKey,
      createdAt: pointsTransactionsTable.createdAt,
    })
    .from(pointsTransactionsTable)
    .where(eq(pointsTransactionsTable.userId, userId))
    .orderBy(desc(pointsTransactionsTable.createdAt))
    .limit(limit);
}

export interface LeaderboardEntry {
  userId: number;
  name: string;
  avatarUrl: string | null;
  points: number;
  rank: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResult {
  scope: "grade" | "all";
  period: "week" | "all";
  gradeLevel: string | null;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LEADERBOARD_LIMIT = 50;

/** The leaderboard shows only the first name (privacy). "أحمد محمد علي" → "أحمد". */
function firstName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? "";
}

/**
 * Weekly (or all-time) points ranking. scope="grade" ranks the student against peers
 * in the same onboarding grade level; scope="all" ranks across every student.
 */
export async function getLeaderboard(opts: {
  userId: number;
  scope?: "grade" | "all";
  period?: "week" | "all";
}): Promise<LeaderboardResult> {
  const scope = opts.scope === "all" ? "all" : "grade";
  const period = opts.period === "all" ? "all" : "week";
  const since = period === "week" ? new Date(Date.now() - WEEK_MS) : new Date(0);

  // Only count positive "earn" credits within the window. The date condition lives in
  // the JOIN so students with zero recent points still appear (with 0).
  const earnedSince = and(
    eq(pointsTransactionsTable.userId, usersTable.id),
    eq(pointsTransactionsTable.type, "earn"),
    gte(pointsTransactionsTable.createdAt, since),
  );

  const rows = await db
    .select({
      userId: usersTable.id,
      // `name`/`avatarUrl` = the user's own live values (shown to THEMSELVES);
      // `publicName`/`publicAvatarUrl` = the admin-approved values shown to others.
      name: usersTable.name,
      publicName: usersTable.publicName,
      avatarUrl: usersTable.avatarUrl,
      publicAvatarUrl: usersTable.publicAvatarUrl,
      gradeLevel: studentOnboardingResponsesTable.gradeLevel,
      points: sql<number>`coalesce(sum(${pointsTransactionsTable.amount}), 0)`.mapWith(Number),
    })
    .from(usersTable)
    .leftJoin(pointsTransactionsTable, earnedSince)
    .leftJoin(studentOnboardingResponsesTable, eq(studentOnboardingResponsesTable.userId, usersTable.id))
    .where(and(eq(usersTable.role, "student"), eq(usersTable.status, "active")))
    .groupBy(
      usersTable.id,
      usersTable.name,
      usersTable.publicName,
      usersTable.avatarUrl,
      usersTable.publicAvatarUrl,
      studentOnboardingResponsesTable.gradeLevel,
    );

  const myGrade = rows.find((r) => r.userId === opts.userId)?.gradeLevel ?? null;

  // Only rank students who actually have points — anyone at 0 is hidden from every
  // leaderboard/ranking (a 0-point requester simply won't see themselves listed).
  const pool = (scope === "grade" && myGrade ? rows.filter((r) => r.gradeLevel === myGrade) : rows).filter(
    (r) => r.points > 0,
  );

  // Rank: points desc, then earliest joiner (stable) — here just userId asc as tiebreak.
  pool.sort((a, b) => b.points - a.points || a.userId - b.userId);

  const ranked: LeaderboardEntry[] = pool.map((r, i) => {
    const isMe = r.userId === opts.userId;
    // The current user sees their own live identity; everyone else sees the approved
    // (public) one — or a placeholder if it was never approved yet (brand-new account).
    const shownName = isMe ? r.name : r.publicName;
    const shownAvatar = isMe ? r.avatarUrl : r.publicAvatarUrl;
    return {
      userId: r.userId,
      name: shownName ? firstName(shownName) : "مستخدم جديد",
      avatarUrl: shownAvatar ?? null,
      points: r.points,
      rank: i + 1,
      isCurrentUser: isMe,
    };
  });

  const me = ranked.find((e) => e.isCurrentUser) ?? null;

  return {
    scope: scope === "grade" && !myGrade ? "all" : scope,
    period,
    gradeLevel: myGrade,
    entries: ranked.slice(0, LEADERBOARD_LIMIT),
    me,
  };
}
