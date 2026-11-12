-- kind: expand
-- Whether a school is a demo school is a fact about the school, kept with it in the registry, not a setting anyone edits
-- (docs/product-map.md §5). Schools started from the demo data are demo schools.

ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "demo" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "schools" SET "demo" = true
WHERE "id" IN (SELECT "school_id" FROM "provision_runs" WHERE "payload"->'data'->>'start' = 'demo' AND NOT "dry_run");
