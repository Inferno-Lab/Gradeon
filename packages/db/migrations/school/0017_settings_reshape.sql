-- kind: backfill
-- Settings reshaped by the one-pass repair (docs/product-fix-plan.md, step 2):
-- the app's layout is chosen per role (app.layout) and the roles that sign in are listed (app.roles), replacing the families-only
-- app.dock/home/quick and the teachers' on/off switch; settings that were really data, a second home for modules, or a person's
-- preference are removed (modules.enabled, term.name, term.examsStart, students.pinnedClass; demo.mode moves to the registry).
-- New permission notices.pin reaches the roles that could already publish.

INSERT INTO "settings" ("key", "value", "updated_by", "updated_at")
SELECT 'app.layout', jsonb_build_object(
	'parent', jsonb_build_object(
		'dock', coalesce((SELECT "value" FROM "settings" WHERE "key" = 'app.dock'), '["home","academics","fees","chat"]'::jsonb),
		'home', coalesce((SELECT "value" FROM "settings" WHERE "key" = 'app.home'), '["dayRibbon","dueStack","attendance","nextExam","homework","notices","events"]'::jsonb),
		'quick', coalesce((SELECT "value" FROM "settings" WHERE "key" = 'app.quick'), '["payFees","applyLeave","messageTeacher","timetable"]'::jsonb)),
	'student', '{"dock":["home","homework","timetable","chat"],"home":["dayRibbon","homework","nextExam","notices","events"],"quick":["homework","timetable","events"]}'::jsonb,
	'teacher', '{"dock":["home","classes","timetable","chat"],"home":["dayRibbon","notices","events"],"quick":["markAttendance","assignHomework","grade","postNotice"]}'::jsonb,
	'driver', '{"dock":["home","trips","chat"],"home":[],"quick":[]}'::jsonb),
	'migration', now()
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'app.layout');
--> statement-breakpoint
INSERT INTO "settings" ("key", "value", "updated_by", "updated_at")
SELECT 'app.roles', CASE WHEN (SELECT "value" FROM "settings" WHERE "key" = 'app.teachers') = 'false'::jsonb THEN '["parent"]'::jsonb ELSE '["parent","teacher"]'::jsonb END, 'migration', now()
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'app.roles');
--> statement-breakpoint
DELETE FROM "settings" WHERE "key" IN ('app.dock', 'app.home', 'app.quick', 'app.teachers', 'modules.enabled', 'term.name', 'term.examsStart', 'students.pinnedClass', 'demo.mode', 'approvals.feeWaiver');
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || '["notices.pin"]'::jsonb
WHERE "permissions" ? 'notices.publish' AND NOT "permissions" ? 'notices.pin';
