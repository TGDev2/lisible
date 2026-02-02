import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { files } from "./files";

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),

    // Position
    sequenceNum: integer("sequence_num").notNull(), // ordre d'affichage

    // Timecodes (millisecondes)
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),

    // Content
    text: text("text").notNull(),
    speaker: varchar("speaker", { length: 100 }), // [FORMATEUR], [NARRATEUR], etc.

    // Metadata
    isSoundInfo: boolean("is_sound_info").default(false), // [musique], [applaudissements]

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_segments_file").on(table.fileId),
    index("idx_segments_file_seq").on(table.fileId, table.sequenceNum),
  ]
);

export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
