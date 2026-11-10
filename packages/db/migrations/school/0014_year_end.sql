-- kind: expand
-- Year-end: a year is drafted, made current, then archived (read-only); promotions run as a batch that can be undone;
-- students who leave keep a leaving date, and are erased once the retention period passes (two people in the console).

ALTER TABLE "academic_years" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'current' NOT NULL;
UPDATE "academic_years" SET "status" = CASE WHEN "current" THEN 'current' WHEN "ends_on" < now() THEN 'archived' ELSE 'draft' END;
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_status" CHECK ("status" IN ('draft', 'current', 'archived'));

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "left_on" date;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "leaving_reason" text;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "erased_at" timestamp with time zone;

CREATE TABLE "promotion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"from_year" text NOT NULL,
	"to_year" text NOT NULL,
	"moves" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
