CREATE TYPE "public"."agent_turn_status" AS ENUM('pending', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."method_erasure_status" AS ENUM('pending-provider', 'failed-provider');--> statement-breakpoint
CREATE TABLE "agent_conversation_mappings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_conversation_mappings_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "agent_turn_leases" (
	"user_id" text PRIMARY KEY NOT NULL,
	"lease_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_turn_leases_above_platform_cap" CHECK ("agent_turn_leases"."expires_at" > "agent_turn_leases"."acquired_at" + interval '300 seconds')
);
--> statement-breakpoint
CREATE TABLE "agent_turns" (
	"turn_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_message_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"lease_id" text NOT NULL,
	"status" "agent_turn_status" DEFAULT 'pending' NOT NULL,
	"terminal_result" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"terminal_at" timestamp with time zone,
	CONSTRAINT "agent_turns_terminal_consistency" CHECK (("agent_turns"."status" = 'pending' AND "agent_turns"."terminal_at" IS NULL) OR ("agent_turns"."status" <> 'pending' AND "agent_turns"."terminal_at" IS NOT NULL))
);
--> statement-breakpoint
-- Baseline reconciliation: analytics_events was added to the runtime schema
-- after 0000 without a matching migration. Fresh databases create it here;
-- the released baseline keeps its existing table and is audited immediately.
CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
DECLARE
	actual_shape text[];
BEGIN
	SELECT array_agg(
		column_name || ':' || data_type || ':' || is_nullable
		ORDER BY ordinal_position
	)
	INTO actual_shape
	FROM information_schema.columns
	WHERE table_schema = 'public' AND table_name = 'analytics_events';

	IF actual_shape IS DISTINCT FROM ARRAY[
		'id:integer:NO',
		'session_id:text:NO',
		'event_type:text:NO',
		'metadata:jsonb:YES',
		'created_at:timestamp with time zone:NO'
	] THEN
		RAISE EXCEPTION 'analytics_events baseline shape does not match the reviewed migration';
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "career_map_drafts" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_map_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_source_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"payload_fingerprint" text NOT NULL,
	"base_revision" integer NOT NULL,
	"result_revision" integer NOT NULL,
	"result" jsonb NOT NULL,
	"confirmation_provenance" jsonb,
	"module_version" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "career_map_history_revision_order" CHECK ("career_map_history"."result_revision" = "career_map_history"."base_revision" + 1)
);
--> statement-breakpoint
CREATE TABLE "career_map_research_attempts" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"attempt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_maps" (
	"user_id" text PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"document" jsonb NOT NULL,
	"repair_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_maps_revision_nonnegative" CHECK ("career_maps"."revision" >= 0),
	CONSTRAINT "career_maps_schema_version_positive" CHECK ("career_maps"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "method_erasure_jobs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"conversation_id" text,
	"status" "method_erasure_status" NOT NULL,
	"error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "method_erasure_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "agent_conversation_mappings" ADD CONSTRAINT "agent_conversation_mappings_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turn_leases" ADD CONSTRAINT "agent_turn_leases_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_map_drafts" ADD CONSTRAINT "career_map_drafts_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_map_history" ADD CONSTRAINT "career_map_history_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_map_research_attempts" ADD CONSTRAINT "career_map_research_attempts_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_turn_leases_expiry_idx" ON "agent_turn_leases" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_user_message_unique" ON "agent_turns" USING btree ("user_id","client_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_user_lease_unique" ON "agent_turns" USING btree ("user_id","lease_id");--> statement-breakpoint
CREATE INDEX "agent_turns_user_idx" ON "agent_turns" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_drafts_user_id_unique" ON "career_map_drafts" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "career_map_drafts_user_idx" ON "career_map_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_history_user_operation_unique" ON "career_map_history" USING btree ("user_id","operation_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_history_user_revision_unique" ON "career_map_history" USING btree ("user_id","result_revision");--> statement-breakpoint
CREATE INDEX "career_map_history_user_idx" ON "career_map_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_research_user_id_unique" ON "career_map_research_attempts" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "career_map_research_user_idx" ON "career_map_research_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "career_map_research_turn_idx" ON "career_map_research_attempts" USING btree ("user_id","turn_id","lease_id");
