-- kind: backfill
-- The school edits its own classes, subjects, periods, terms, holidays and fee structures (within what the console
-- allows): roles that could add students get "setup.write". Families invited before this column existed count as invited.

UPDATE "roles" SET "permissions" = "permissions" || '["setup.write"]'::jsonb
WHERE "permissions" ? 'students.write' AND NOT "permissions" ? 'setup.write';
--> statement-breakpoint
UPDATE "users" SET "invited_at" = "last_login_at" WHERE "invited_at" IS NULL AND "last_login_at" IS NOT NULL;
