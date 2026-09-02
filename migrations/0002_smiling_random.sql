CREATE TABLE "career_map_evidence_associations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"operation_source_id" text NOT NULL,
	"result_revision" integer NOT NULL,
	"source_handle" text NOT NULL,
	"association" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_map_evidence_result_revision_positive" CHECK ("career_map_evidence_associations"."result_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "career_map_evidence_associations" ADD CONSTRAINT "career_map_evidence_associations_user_id_career_maps_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."career_maps"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "career_map_evidence_user_source_unique" ON "career_map_evidence_associations" USING btree ("user_id","source_handle");--> statement-breakpoint
CREATE INDEX "career_map_evidence_user_revision_idx" ON "career_map_evidence_associations" USING btree ("user_id","result_revision");--> statement-breakpoint
CREATE INDEX "career_map_evidence_user_attempt_idx" ON "career_map_evidence_associations" USING btree ("user_id","attempt_id");