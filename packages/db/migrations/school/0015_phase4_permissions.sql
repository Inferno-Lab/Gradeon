-- kind: backfill
-- New permissions for refunds, library, transport, gallery and year-end reach the roles made from the templates before them.

UPDATE "roles" SET "permissions" = "permissions" || (
  SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM jsonb_array_elements_text('["fees.refund","library.read","library.write","transport.read","transport.write","gallery.read","gallery.write","year.manage"]'::jsonb) p
  WHERE NOT "roles"."permissions" ? p)
WHERE "key" = 'principal';
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || (
  SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM jsonb_array_elements_text('["library.read","library.write","transport.read","transport.write","gallery.read","gallery.write"]'::jsonb) p
  WHERE NOT "roles"."permissions" ? p)
WHERE "key" = 'office';
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || '["fees.refund"]'::jsonb WHERE "key" = 'accountant' AND NOT "permissions" ? 'fees.refund';
