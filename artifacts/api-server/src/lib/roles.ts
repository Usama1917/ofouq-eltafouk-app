// Shared role allowlists for the admin user-management routes.
// review B-43: these sets were re-declared inline in multiple admin.ts handlers;
// centralised here so the membership stays consistent across create/update/delete.

// Every role a user account may hold.
export const VALID_ROLES = new Set(["student", "teacher", "parent", "admin", "owner", "moderator"]);

// Roles that carry elevated privileges — granting, revoking, suspending, or
// deleting one of these is owner-only.
export const PRIVILEGED_ROLES = new Set(["admin", "owner", "moderator"]);
