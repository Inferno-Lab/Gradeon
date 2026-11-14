-- kind: expand
-- The services Tangent runs on come from the Integrations Hub instead of server variables (docs/product-fix-plan.md step 3):
-- each build gets its own short-lived code to fetch its signing kit and report back; each cell names the connection that makes
-- its schools' databases; a school's own address records what the host said about it.

ALTER TABLE "builds" ADD COLUMN IF NOT EXISTS "token_hash" text;
--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN IF NOT EXISTS "store" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "cells" ADD COLUMN IF NOT EXISTS "connection_id" text;
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "domain_state" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
-- Backups move to Tangent's File storage connection; the row keeps where the file is (older backups keep their data in the row).
ALTER TABLE "school_backups" ADD COLUMN IF NOT EXISTS "storage_key" text;
--> statement-breakpoint
ALTER TABLE "school_backups" ALTER COLUMN "data" DROP NOT NULL;
--> statement-breakpoint
-- An authenticator code works once: the last one used is remembered while it could still be valid.
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "totp_last" text;
