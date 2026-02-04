import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { files } from "./files";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queueName: varchar("queue_name", { length: 50 }).notNull(), // stt, sme, pdf, cleanup

    // Reference
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    // State
    status: varchar("status", { length: 20 }).default("pending"), // pending, active, completed, failed
    attempts: integer("attempts").default(0),
    maxAttempts: integer("max_attempts").default(3),

    // Payload
    payload: jsonb("payload"),
    result: jsonb("result"),
    error: text("error"),

    // Timing
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_jobs_queue_status").on(table.queueName, table.status),
    index("idx_jobs_file").on(table.fileId),
  ]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
