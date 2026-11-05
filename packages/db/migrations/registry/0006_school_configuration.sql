-- kind: expand
-- Configuration belongs to the console: every change is a version (with who, what and why) that can be rolled back,
-- setups can be saved as templates for other schools, and schools ask for changes instead of making them.

CREATE TABLE "config_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"version" integer NOT NULL,
	"values" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "config_versions_school_idx" ON "config_versions" ("school_id", "at");
--> statement-breakpoint
CREATE TABLE "config_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"values" jsonb NOT NULL,
	"roles" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_slug" text NOT NULL,
	"school_name" text NOT NULL,
	"area" text NOT NULL,
	"message" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"answered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" ("status", "created_at");
