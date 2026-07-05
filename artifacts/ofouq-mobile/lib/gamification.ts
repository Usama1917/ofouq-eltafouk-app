import { apiFetch } from "./api";

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

export interface PointsTransaction {
  id: number;
  type: string;
  amount: number;
  description: string;
  sourceKey: string | null;
  createdAt: string;
}

export const gamificationQueryKey = ["me", "gamification"] as const;
export const leaderboardQueryKey = ["leaderboard"] as const;
export const pointsHistoryQueryKey = ["me", "points-history"] as const;

export function fetchPointsHistory(token: string | null | undefined): Promise<{ transactions: PointsTransaction[] }> {
  return apiFetch<{ transactions: PointsTransaction[] }>("/api/me/points-history", { token });
}

export function fetchGamification(token: string | null | undefined): Promise<GamificationSummary> {
  return apiFetch<GamificationSummary>("/api/me/gamification", { token });
}

export function fetchLeaderboard(
  token: string | null | undefined,
  scope: "grade" | "all" = "grade",
  period: "week" | "all" = "week",
): Promise<LeaderboardResult> {
  return apiFetch<LeaderboardResult>(`/api/leaderboard?scope=${scope}&period=${period}`, { token });
}
