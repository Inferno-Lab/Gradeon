-- kind: backfill
-- The product is called Tangent: files shaped like its own templates are marked 'tangent'. Every other source keeps its name.
UPDATE "import_batches" SET "source" = 'tangent' WHERE "source" NOT IN ('tangent', 'sheet', 'typed', 'fedena', 'entab');
--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "source" SET DEFAULT 'tangent';
