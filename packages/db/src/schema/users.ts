import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").default(false),

    // Subscription & Credits
    plan: varchar("plan", { length: 20 }).default("free"), // free, pro
    stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
    subscriptionStatus: varchar("subscription_status", { length: 20 }), // active, canceled, past_due
    subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),

    // Credits (minutes)
    creditsTotal: integer("credits_total").default(30), // minutes allouées ce mois
    creditsUsed: integer("credits_used").default(0), // minutes consommées
    creditsRollover: integer("credits_rollover").default(0), // minutes reportées mois précédent
    creditsResetAt: timestamp("credits_reset_at", { withTimezone: true }),

    // RGPD
    dataRetentionDays: integer("data_retention_days").default(90),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    index("idx_users_stripe_customer").on(table.stripeCustomerId),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
