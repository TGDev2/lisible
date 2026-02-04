CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" uuid,
	"ip_address" inet,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_user_id_users_id_fk"
FOREIGN KEY ("user_id")
REFERENCES "public"."users"("id")
ON DELETE set null
ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" USING btree ("action","created_at");
