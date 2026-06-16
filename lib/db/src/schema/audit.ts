import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Append-only audit trail for admin/owner actions. Captures who did what to
// which entity, with optional before/after snapshots and free-form metadata.
// Designed so the owner dashboard can build a fully attributed activity report.
export const adminAuditLogTable = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    actionType: text("action_type").notNull(),
    actionLabel: text("action_label"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    status: text("status").notNull().default("success"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdx: index("admin_audit_log_actor_idx").on(table.actorUserId),
    createdIdx: index("admin_audit_log_created_idx").on(table.createdAt),
  }),
);

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogTable).omit({
  id: true,
  createdAt: true,
});

export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
