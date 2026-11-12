-- kind: expand
-- Attendance every period (feature attendance.periodWise): the teacher of each period marks who is there. The day's roll call
-- stays the school's attendance record; these marks sit beside it, so a child present in the morning and missing from a later
-- period is seen and the family told.
CREATE TABLE IF NOT EXISTS "period_marks" (
  "class_id" text NOT NULL REFERENCES "classes"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "period" integer NOT NULL,
  "student_id" text NOT NULL REFERENCES "students"("id") ON DELETE cascade,
  "status" text NOT NULL,
  "marked_by" text REFERENCES "users"("id") ON DELETE set null,
  "marked_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("class_id", "date", "period", "student_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_marks_student_idx" ON "period_marks" ("student_id", "date");
