-- kind: expand
-- When Tangent's team sets a file aside, the school reads why.
ALTER TABLE "import_uploads" ADD COLUMN IF NOT EXISTS "set_aside_reason" text NOT NULL DEFAULT '';
