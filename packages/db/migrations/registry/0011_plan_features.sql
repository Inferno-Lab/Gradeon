-- kind: expand
-- A plan can leave features out (like paying in the app on a starter plan), so packaging is data, not code.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "features" jsonb DEFAULT '{}'::jsonb NOT NULL;
