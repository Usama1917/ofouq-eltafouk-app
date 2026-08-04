// ── Per-account feature access (OWNER-controlled) ────────────────────────────
// The SINGLE resolution point for the two per-user overrides the owner sets from
// the «جميع المستخدمين» drawer. Resolution order (identical for both features):
//   1. role "owner"  → ALWAYS allowed/unlocked, no stored value can change that.
//   2. explicit stored boolean (set by the owner) → wins for every non-owner role.
//   3. no override (null/undefined) → role default: admin unlocked, others locked
//      (screen capture falls back to the GLOBAL app_settings toggle for others).
//
// SECURITY: every content-paywall bypass and the capture flag MUST go through
// these two functions — never re-implement role checks at call sites, so the
// rules can't drift apart.

export type FeatureUser = {
  role: string;
  screenCaptureAllowed?: boolean | null;
  allSubjectsAccess?: boolean | null;
  canViewUserActivity?: boolean | null;
};

/**
 * May this user open ANOTHER user's activity log?
 *
 * Deliberately the inverse default of the two features below: they are opt-OUT
 * (admins get them unless the owner revokes), this is opt-IN. The log lays out a
 * student's orders, spend, points and exam scores, so an admin sees it only when
 * the owner has explicitly switched it on for that admin. Owner: always.
 */
export function canViewUserActivity(user: FeatureUser): boolean {
  if (user.role === "owner") return true;
  if (user.role !== "admin") return false;
  return user.canViewUserActivity === true;
}

/** May this user take screenshots / record the screen in the mobile app? */
export function canCaptureScreen(user: FeatureUser, globalBlockEnabled: boolean): boolean {
  if (user.role === "owner") return true;
  if (typeof user.screenCaptureAllowed === "boolean") return user.screenCaptureAllowed;
  if (user.role === "admin") return true;
  return !globalBlockEnabled;
}

/** Does this user automatically have access to ALL subjects (paywall bypass)? */
export function hasAllSubjectsAccess(user: FeatureUser): boolean {
  if (user.role === "owner") return true;
  if (typeof user.allSubjectsAccess === "boolean") return user.allSubjectsAccess;
  return user.role === "admin";
}

// STAFF content-preview capability: may this user see UNPUBLISHED (draft) content and
// SKIP the anti-cheat watch-gate? This is NOT the same as content access:
//   • It is STAFF-only (admin/owner role) — a subscription-waived STUDENT must never
//     see drafts, skip the watch-gate, or farm leaderboard points cold.
//   • It still honours the owner's content LOCK — an admin whose all-subjects access
//     was switched OFF is treated like a normal user (no draft preview, watch-gate on,
//     needs a subscription). So it is role-staff AND not content-locked.
// Owner: always. Unlocked admin: yes. Locked admin (allSubjectsAccess=false): no.
export function canPreviewUnpublished(user: FeatureUser): boolean {
  const staffRole = user.role === "admin" || user.role === "owner";
  return staffRole && hasAllSubjectsAccess(user);
}
