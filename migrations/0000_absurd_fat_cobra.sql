CREATE TYPE "public"."language_enum" AS ENUM('en', 'es');--> statement-breakpoint
CREATE TABLE "assessment_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"language" "language_enum" NOT NULL,
	"responses" jsonb,
	"core_drivers_analysis" jsonb,
	"chosen_path_id" integer,
	"action_plan" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "purpose_paths" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"ikigai_alignment" jsonb,
	"action_strategy" text
);
--> statement-breakpoint
ALTER TABLE "purpose_paths" ADD CONSTRAINT "purpose_paths_assessment_id_assessment_sessions_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;