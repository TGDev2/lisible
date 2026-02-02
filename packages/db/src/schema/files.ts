import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { projects } from "./projects";

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // File info
    originalName: varchar("original_name", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 20 }).notNull(), // srt, vtt, video, audio
    mimeType: varchar("mime_type", { length: 100 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    durationSeconds: integer("duration_seconds"), // for video/audio

    // Storage
    storageKey: varchar("storage_key", { length: 500 }), // S3 key for source file
    storageKeySrt: varchar("storage_key_srt", { length: 500 }), // S3 key for generated SRT (if video)

    // Processing state
    status: varchar("status", { length: 20 }).default("pending"),
    // pending, uploading, processing_stt, processing_sme, ready, failed, deleted
    progressPercent: integer("progress_percent").default(0),
    errorMessage: text("error_message"),

    // SME Score
    smeScore: integer("sme_score"), // 0-100
    smeAnalyzedAt: timestamp("sme_analyzed_at", { withTimezone: true }),

    // Credits consumed
    creditsConsumed: integer("credits_consumed").default(0), // minutes facturées

    // RGPD
    expiresAt: timestamp("expires_at", { withTimezone: true }), // auto-deletion date

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_files_project").on(table.projectId),
    index("idx_files_user").on(table.userId),
    index("idx_files_status").on(table.status),
  ]
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
