-- kind: expand
-- A student's record as the office keeps it: gender, and for each guardian whether they may collect the child from school.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "gender" text;
--> statement-breakpoint
ALTER TABLE "student_guardians" ADD COLUMN IF NOT EXISTS "can_collect" boolean NOT NULL DEFAULT true;
