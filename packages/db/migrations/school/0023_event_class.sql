-- kind: expand
-- An event for one class (a class trip, a class's parent meeting): only that class's families see it and are told.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "class_id" text REFERENCES "classes"("id") ON DELETE SET NULL;
