import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  jsonb,
  inet,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    action: varchar("action", { length: 50 }).notNull(), // data_export, data_delete, file_upload, etc.
    resourceType: varchar("resource_type", { length: 50 }), // user, file, project
    resourceId: uuid("resource_id"),

    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),

    metadata: jsonb("metadata"), // additional context

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_audit_user").on(table.userId),
    index("idx_audit_action").on(table.action, table.createdAt),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
