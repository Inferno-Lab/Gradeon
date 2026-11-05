-- kind: backfill
-- Configuration and roles now change only from the console. Roles lose "settings.write" and "roles.manage";
-- whoever logged families' data requests with "settings.write" keeps that job as "privacy.manage".

UPDATE "roles"
SET "permissions" = ("permissions" - 'settings.write' - 'roles.manage')
  || CASE WHEN "permissions" ? 'settings.write' AND NOT "permissions" ? 'privacy.manage' THEN '["privacy.manage"]'::jsonb ELSE '[]'::jsonb END
WHERE "permissions" ? 'settings.write' OR "permissions" ? 'roles.manage';
