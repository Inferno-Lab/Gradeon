-- kind: expand
-- Phase 3, moving a school in: terms and fee structures the school keeps itself, every import as an undoable batch,
-- the column matches people chose for a file shape, the files a school sends Gradeon, and when a person was invited.

CREATE TABLE "terms" (
	"id" text PRIMARY KEY NOT NULL,
	"year_id" text NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "terms_year_name_uq" ON "terms" ("year_id", lower("name"));
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" text PRIMARY KEY NOT NULL,
	"grade" integer,
	"head" text NOT NULL DEFAULT 'tuition',
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"due_on" date NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structures_grade_title_uq" ON "fee_structures" (coalesce("grade", 0), lower("title"));
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL DEFAULT 'gradeon',
	"file_name" text NOT NULL DEFAULT '',
	"created" integer NOT NULL DEFAULT 0,
	"updated" integer NOT NULL DEFAULT 0,
	"skipped" integer NOT NULL DEFAULT 0,
	"report" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"changes" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"by_name" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "import_batches_at_idx" ON "import_batches" ("at");
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"signature" text PRIMARY KEY NOT NULL,
	"mapping" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"note" text NOT NULL DEFAULT '',
	"content" text NOT NULL,
	"rows" integer NOT NULL DEFAULT 0,
	"uploaded_by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL DEFAULT 'new',
	"batch_id" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_at" timestamp with time zone;
