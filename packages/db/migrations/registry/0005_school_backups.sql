-- kind: expand
-- Daily and on-demand backups of each school's database (gzipped JSON), so a school can be put back as it was.

CREATE TABLE "school_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"kind" text NOT NULL,
	"taken_by" text NOT NULL,
	"bytes" integer NOT NULL,
	"data" bytea NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "school_backups_school_idx" ON "school_backups" ("school_id", "taken_at");
