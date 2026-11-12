-- kind: expand
-- Library, transport and gallery leave beta: a catalogue with copies and reservations, routes with stops and the live bus,
-- and albums of photos kept in storage (files of kind 'gallery'), with the children in each photo so consent is respected.

CREATE TABLE "library_books" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"isbn" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"shelf" text DEFAULT '' NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL CHECK ("copies" >= 0),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "book_id" text REFERENCES "library_books"("id");
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "issued_on" date;
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "fine" integer DEFAULT 0 NOT NULL;
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "renewals" integer DEFAULT 0 NOT NULL;

CREATE TABLE "library_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL REFERENCES "library_books"("id") ON DELETE CASCADE,
	"student_id" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL CHECK ("status" IN ('waiting', 'ready', 'done', 'cancelled')),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "library_reservations_open" ON "library_reservations" ("book_id", "student_id") WHERE "status" IN ('waiting', 'ready');

CREATE TABLE "transport_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL UNIQUE,
	"vehicle" text DEFAULT '' NOT NULL,
	"driver_name" text DEFAULT '' NOT NULL,
	"driver_phone" text DEFAULT '' NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "transport_stops" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL REFERENCES "transport_routes"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"pickup" text DEFAULT '' NOT NULL,
	"drop_time" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision
);
ALTER TABLE "transport_assignments" ADD COLUMN IF NOT EXISTS "route_id" text REFERENCES "transport_routes"("id");
ALTER TABLE "transport_assignments" ADD COLUMN IF NOT EXISTS "stop_id" text REFERENCES "transport_stops"("id") ON DELETE SET NULL;
-- Routes brought in by Migration as names become real routes.
INSERT INTO "transport_routes" ("id", "name") SELECT 'rte_' || md5("route"), "route" FROM (SELECT DISTINCT "route" FROM "transport_assignments") r ON CONFLICT DO NOTHING;
UPDATE "transport_assignments" a SET "route_id" = r."id" FROM "transport_routes" r WHERE r."name" = a."route" AND a."route_id" IS NULL;

-- The bus's last known position (one row per route), and whether today's "bus is near" message went out per stop.
CREATE TABLE "bus_positions" (
	"route_id" text PRIMARY KEY REFERENCES "transport_routes"("id") ON DELETE CASCADE,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_user" text
);
CREATE TABLE "bus_near_sent" (
	"stop_id" text NOT NULL,
	"day" date NOT NULL,
	PRIMARY KEY ("stop_id", "day")
);

CREATE TABLE "gallery_albums" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"class_id" text,
	"event_id" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "gallery_tags" (
	"file_id" text NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
	"student_id" text NOT NULL,
	PRIMARY KEY ("file_id", "student_id")
);
