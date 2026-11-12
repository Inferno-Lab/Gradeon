-- kind: expand
-- The app's fourth role: a bus driver is a member of staff who signs in to the app and runs a route's trips (the live bus comes
-- from the driver's phone). Each route names its driver's account and its attendant, whom families call instead of the driver.

ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "driver_user_id" text;
--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "attendant_name" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "attendant_phone" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- A person's own choices (the class the Students page opens on, the dashboard's cards, which messages they want, the welcome they
-- have seen) follow them from the browser to the phone instead of living in one browser or one phone.
CREATE TABLE IF NOT EXISTS "user_prefs" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	PRIMARY KEY ("user_id", "key")
);
