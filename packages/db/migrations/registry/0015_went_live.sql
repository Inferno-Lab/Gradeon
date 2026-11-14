-- kind: expand
-- A school runs ("live") as soon as it is provisioned, but it moves in first: Moving in, invites and imports belong to that time.
-- The day Tangent presses Go live (console: Import and go-live) is kept apart from the running status.

ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "went_live_at" timestamp with time zone;
--> statement-breakpoint
-- A person who dismissed an incident on Fleet does not see it again on reload; others still do.
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "dismissed_incident" text;
--> statement-breakpoint
-- What was asked stays readable after the result replaces the summary; a rejection says why.
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "asked" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "decision_note" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- An engineer marks an error handled; it comes back if it happens again after that.
ALTER TABLE "error_reports" ADD COLUMN IF NOT EXISTS "handled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN IF NOT EXISTS "handled_by" text;
--> statement-breakpoint
-- An invoice is sent for real (when, to whom) and paid on a day with a reference, which can be undone.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sent_to" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paid_on" date;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paid_ref" text;
--> statement-breakpoint
-- A signed agreement keeps the signed file, the day and who signed it; otherwise it proves nothing.
ALTER TABLE "compliance_items" ADD COLUMN IF NOT EXISTS "signed_on" date;
--> statement-breakpoint
ALTER TABLE "compliance_items" ADD COLUMN IF NOT EXISTS "signed_by" text;
--> statement-breakpoint
ALTER TABLE "compliance_items" ADD COLUMN IF NOT EXISTS "file_name" text;
--> statement-breakpoint
ALTER TABLE "compliance_items" ADD COLUMN IF NOT EXISTS "file" bytea;
--> statement-breakpoint
-- A new team member is invited by a link and chooses their own password; nobody else ever knows it.
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "invite_hash" text;
--> statement-breakpoint
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "invite_expires" timestamp with time zone;
