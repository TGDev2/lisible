CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" varchar(50) NOT NULL,
	"file_id" uuid,
	"user_id" uuid,
	"status" varchar(20) DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"payload" jsonb,
	"result" jsonb,
	"error" text,
	"scheduled_at" timestamp with time zone DEFAULT now(),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_queue_status" ON "jobs" USING btree ("queue_name","status");--> statement-breakpoint
CREATE INDEX "idx_jobs_file" ON "jobs" USING btree ("file_id");