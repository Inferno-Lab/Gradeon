-- kind: expand
-- Errors from the APIs, the admin, the console and the app, grouped by fingerprint so the team sees each problem once with a count.

CREATE TABLE "error_reports" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"school_slug" text,
	"message" text NOT NULL,
	"stack" text,
	"url" text,
	"release" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "error_reports_last_idx" ON "error_reports" ("last_at");
