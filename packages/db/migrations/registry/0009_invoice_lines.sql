-- kind: expand
-- How each invoice was worked out (the plan, then each module added on top), so what a school pays can be checked against what it has.

ALTER TABLE "invoices" ADD COLUMN "lines" jsonb DEFAULT '[]'::jsonb NOT NULL;
