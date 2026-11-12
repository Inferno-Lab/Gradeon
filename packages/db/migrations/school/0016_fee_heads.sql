-- kind: expand
-- A school's fee heads are its own data (docs/product-map.md §5, D5), not four lists in the code: their names, their order,
-- and whether concessions (fee waivers) are taken off them. Heads already used by invoices and fee structures are kept.

CREATE TABLE IF NOT EXISTS "fee_heads" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer NOT NULL DEFAULT 0,
	"concession" boolean NOT NULL DEFAULT false,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "fee_heads" ("key", "name", "sort", "concession") VALUES
	('tuition', 'Tuition', 1, true), ('transport', 'Transport', 2, false), ('activities', 'Activities', 3, false), ('lab', 'Lab', 4, false)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "fee_heads" ("key", "name", "sort")
SELECT DISTINCT h, initcap(replace(h, '_', ' ')), 50 FROM (
	SELECT "head" AS h FROM "fee_invoices" UNION SELECT "head" FROM "fee_structures"
) x WHERE h IS NOT NULL AND h <> ''
ON CONFLICT ("key") DO NOTHING;
