-- kind: expand
-- A family's consent to the school's privacy notice, and whether the school may share photos of the child.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consented_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_consent" boolean;
