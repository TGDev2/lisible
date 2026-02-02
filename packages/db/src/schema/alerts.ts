import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { files } from "./files";
import { segments } from "./segments";

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id").references(() => segments.id, {
      onDelete: "cascade",
    }),

    // Alert info
    ruleCode: varchar("rule_code", { length: 50 }).notNull(), // speed, length, overlap, duration, proper_noun
    severity: varchar("severity", { length: 20 }).notNull(), // critical, warning, info
    message: text("message").notNull(),

    // Details (JSON for flexibility)
    details: jsonb("details"), // { actual: 24, max: 20, unit: "car/s" }

    // Resolution
    resolved: boolean("resolved").default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_alerts_file").on(table.fileId),
    index("idx_alerts_segment").on(table.segmentId),
    index("idx_alerts_unresolved").on(table.fileId, table.resolved),
  ]
);

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

// Type for alert details
export interface AlertDetails {
  actual?: number;
  max?: number;
  min?: number;
  unit?: string;
  overlapMs?: number;
  term?: string;
}
