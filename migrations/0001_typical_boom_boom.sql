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
	"origin" text NOT NULL,
	"lease_id" text NOT NULL,
	"status" "agent_turn_status" DEFAULT 'pending' NOT NULL,
	"terminal_result" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"terminal_at" timestamp with time zone,
	CONSTRAINT "agent_turns_terminal_consistency" CHECK (("agent_turns"."status" = 'pending' AND "agent_turns"."terminal_at" IS NULL) OR ("agent_turns"."status" <> 'pending' AND "agent_turns"."terminal_at" IS NOT NULL)),
	CONSTRAINT "agent_turns_valid_origin" CHECK ("agent_turns"."origin" IN ('agent-turn', 'workspace-action'))
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
	analytics_oid oid;
	table_kind "char";
	table_persistence "char";
	row_security boolean;
	force_row_security boolean;
	id_attribute_number smallint;
	id_default text;
	id_identity "char";
	id_sequence text;
	id_sequence_oid oid;
	id_sequence_kind "char";
	id_sequence_persistence "char";
	id_sequence_type regtype;
	id_sequence_start bigint;
	id_sequence_increment bigint;
	id_sequence_min bigint;
	id_sequence_max bigint;
	id_sequence_cache bigint;
	id_sequence_cycle boolean;
	session_default text;
	event_default text;
	metadata_default text;
	created_default text;
	generated_column_count integer;
	primary_key_count integer;
	primary_key_exact boolean;
	disallowed_constraint_count integer;
	table_index_count integer;
	user_trigger_count integer;
	table_rule_count integer;
BEGIN
	SELECT oid, relkind, relpersistence, relrowsecurity, relforcerowsecurity
	INTO analytics_oid, table_kind, table_persistence, row_security, force_row_security
	FROM pg_class
	WHERE oid = 'public.analytics_events'::regclass;

	IF analytics_oid IS NULL
		OR table_kind IS DISTINCT FROM 'r'
		OR table_persistence IS DISTINCT FROM 'p'
		OR row_security
		OR force_row_security
	THEN
		RAISE EXCEPTION 'analytics_events baseline table properties do not match the reviewed migration';
	END IF;

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

	SELECT count(*)
	INTO generated_column_count
	FROM pg_attribute
	WHERE attrelid = analytics_oid
		AND attnum > 0
		AND NOT attisdropped
		AND attgenerated <> '';

	SELECT
		max(attnum) FILTER (WHERE attname = 'id'),
		max(pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid)) FILTER (WHERE attname = 'id'),
		max(attidentity) FILTER (WHERE attname = 'id'),
		max(pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid)) FILTER (WHERE attname = 'session_id'),
		max(pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid)) FILTER (WHERE attname = 'event_type'),
		max(pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid)) FILTER (WHERE attname = 'metadata'),
		max(pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid)) FILTER (WHERE attname = 'created_at')
	INTO
		id_attribute_number,
		id_default,
		id_identity,
		session_default,
		event_default,
		metadata_default,
		created_default
	FROM pg_attribute
	LEFT JOIN pg_attrdef
		ON pg_attrdef.adrelid = pg_attribute.attrelid
		AND pg_attrdef.adnum = pg_attribute.attnum
	WHERE pg_attribute.attrelid = analytics_oid
		AND pg_attribute.attnum > 0
		AND NOT pg_attribute.attisdropped;

	id_sequence := pg_get_serial_sequence('public.analytics_events', 'id');
	id_sequence_oid := to_regclass(id_sequence);
	SELECT
		class_row.relkind,
		class_row.relpersistence,
		sequence_row.seqtypid::regtype,
		sequence_row.seqstart,
		sequence_row.seqincrement,
		sequence_row.seqmin,
		sequence_row.seqmax,
		sequence_row.seqcache,
		sequence_row.seqcycle
	INTO
		id_sequence_kind,
		id_sequence_persistence,
		id_sequence_type,
		id_sequence_start,
		id_sequence_increment,
		id_sequence_min,
		id_sequence_max,
		id_sequence_cache,
		id_sequence_cycle
	FROM pg_class class_row
	JOIN pg_sequence sequence_row ON sequence_row.seqrelid = class_row.oid
	WHERE class_row.oid = id_sequence_oid;
	IF generated_column_count <> 0
		OR session_default IS NOT NULL
		OR event_default IS NOT NULL
		OR metadata_default IS DISTINCT FROM '''{}''::jsonb'
		OR created_default IS DISTINCT FROM 'now()'
		OR id_sequence IS DISTINCT FROM 'public.analytics_events_id_seq'
		OR id_identity IS DISTINCT FROM ''
		OR id_default IS DISTINCT FROM format(
			'nextval(%L::regclass)',
			id_sequence_oid::regclass::text
		)
		OR id_sequence_kind IS DISTINCT FROM 'S'
		OR id_sequence_persistence IS DISTINCT FROM 'p'
		OR id_sequence_type IS DISTINCT FROM 'integer'::regtype
		OR id_sequence_start IS DISTINCT FROM 1
		OR id_sequence_increment IS DISTINCT FROM 1
		OR id_sequence_min IS DISTINCT FROM 1
		OR id_sequence_max IS DISTINCT FROM 2147483647
		OR id_sequence_cache IS DISTINCT FROM 1
		OR id_sequence_cycle IS DISTINCT FROM false
	THEN
		RAISE EXCEPTION 'analytics_events baseline defaults/generation do not match the reviewed migration';
	END IF;

	SELECT
		count(*),
		coalesce(bool_and(
			constraint_row.conkey = ARRAY[id_attribute_number]::smallint[]
			AND constraint_row.convalidated
			AND NOT constraint_row.condeferrable
			AND NOT constraint_row.condeferred
			AND index_row.indisvalid
			AND index_row.indisready
			AND index_row.indisunique
			AND index_row.indisprimary
			AND index_row.indnkeyatts = 1
			AND index_row.indnatts = 1
			AND index_row.indpred IS NULL
			AND index_row.indexprs IS NULL
		), false)
	INTO primary_key_count, primary_key_exact
	FROM pg_constraint constraint_row
	JOIN pg_index index_row ON index_row.indexrelid = constraint_row.conindid
	WHERE constraint_row.conrelid = analytics_oid
		AND constraint_row.contype = 'p';

	SELECT count(*)
	INTO disallowed_constraint_count
	FROM pg_constraint
	WHERE conrelid = analytics_oid
		AND contype NOT IN ('p', 'n');

	SELECT count(*)
	INTO table_index_count
	FROM pg_index
	WHERE indrelid = analytics_oid;

	SELECT count(*)
	INTO user_trigger_count
	FROM pg_trigger
	WHERE tgrelid = analytics_oid
		AND NOT tgisinternal;

	SELECT count(*)
	INTO table_rule_count
	FROM pg_rewrite
	WHERE ev_class = analytics_oid;

	IF primary_key_count <> 1
		OR NOT primary_key_exact
		OR disallowed_constraint_count <> 0
		OR table_index_count <> 1
		OR user_trigger_count <> 0
		OR table_rule_count <> 0
	THEN
		RAISE EXCEPTION 'analytics_events baseline primary key/constraints do not match the reviewed migration';
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
CREATE INDEX "agent_turn_leases_expiry_idx" ON "agent_turn_leases" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_user_message_unique" ON "agent_turns" USING btree ("user_id","client_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_user_lease_unique" ON "agent_turns" USING btree ("user_id","lease_id");--> statement-breakpoint
CREATE INDEX "agent_turns_user_idx" ON "agent_turns" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_drafts_user_id_unique" ON "career_map_drafts" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "career_map_drafts_user_idx" ON "career_map_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_history_user_operation_unique" ON "career_map_history" USING btree ("user_id","operation_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_history_user_revision_unique" ON "career_map_history" USING btree ("user_id","result_revision");--> statement-breakpoint
CREATE INDEX "career_map_history_user_idx" ON "career_map_history" USING btree ("user_id");
