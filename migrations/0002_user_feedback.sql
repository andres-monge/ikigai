CREATE TABLE "user_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"reply_email" text NOT NULL,
	"text" text NOT NULL,
	"page" text NOT NULL,
	"build_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notification" text DEFAULT 'pending' NOT NULL,
	"envelope" jsonb,
	"first_attempt_at" timestamp with time zone,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	CONSTRAINT "user_feedback_page_valid" CHECK ("user_feedback"."page" IN ('chat','map')),
	CONSTRAINT "user_feedback_text_valid" CHECK (char_length("user_feedback"."text") BETWEEN 1 AND 4000),
	CONSTRAINT "user_feedback_notification_valid" CHECK ("user_feedback"."notification" IN ('pending','unavailable','sending','accepted','failed','uncertain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_feedback_owner_submission" ON "user_feedback" USING btree ("user_id","submission_id");--> statement-breakpoint
CREATE INDEX "user_feedback_owner_time" ON "user_feedback" USING btree ("user_id","created_at");