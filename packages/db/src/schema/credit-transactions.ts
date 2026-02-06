import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { files } from "./files";

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Transaction type: allocation, consumption, rollover, bonus, refund
    type: varchar("type", { length: 30 }).notNull(),
    // Amount: positive = credit, negative = debit
    amount: integer("amount").notNull(),
    // Balance after transaction
    balanceAfter: integer("balance_after").notNull(),

    // References
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 100 }),

    // Description
    description: text("description"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_credit_tx_user").on(table.userId),
  ]
);

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
