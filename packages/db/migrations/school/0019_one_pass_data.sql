-- kind: expand
-- What the one-pass repair adds to a school's own data (docs/product-fix-plan.md step 4). Each block says what it is for.

-- Requests remember who sent them (a parent may correct or withdraw a pending one) and the reason given with a decision.
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "requested_by" text;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "decision_note" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Chat: a student's own conversations with a teacher (when the school lets students message), files on a message,
-- a message its sender took back, and a message reported to the office.
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "student_user_id" text;
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "sender_id" text;
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "file_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "reported_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "report_reason" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Notices: a category from the school's list, pinned to the top, published later at a set time, an acknowledgement asked of
-- families, corrected after publishing, taken down. Who read and who acknowledged each one is kept for the office.
ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'academic';
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "pinned" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "publish_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "needs_ack" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notice_reads" (
	"notice_id" text NOT NULL REFERENCES "notices"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL DEFAULT now(),
	"acked_at" timestamp with time zone,
	PRIMARY KEY ("notice_id", "user_id")
);
--> statement-breakpoint
-- The exam timetable families see: each paper's time and room. Results reopened after publishing say why when they go out again.
ALTER TABLE "exam_subjects" ADD COLUMN IF NOT EXISTS "starts_at" text;
--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD COLUMN IF NOT EXISTS "ends_at" text;
--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD COLUMN IF NOT EXISTS "room" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "reopened_note" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- The driver's day: a trip (morning to school, afternoon home) is started and ended in the app; who got on and off the bus,
-- and a delay the driver reports, are kept per trip. A route's bus may carry a GPS tracker known to the tracker company by a number.
CREATE TABLE IF NOT EXISTS "bus_trips" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL REFERENCES "transport_routes"("id") ON DELETE CASCADE,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"driver_id" text,
	"started_at" timestamp with time zone NOT NULL DEFAULT now(),
	"ended_at" timestamp with time zone,
	"late_minutes" integer NOT NULL DEFAULT 0,
	"late_reason" text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bus_trips_one" ON "bus_trips" ("route_id", "day", "kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bus_trip_marks" (
	"trip_id" text NOT NULL REFERENCES "bus_trips"("id") ON DELETE CASCADE,
	"student_id" text NOT NULL,
	"event" text NOT NULL,
	"stop_id" text,
	"at" timestamp with time zone NOT NULL DEFAULT now(),
	PRIMARY KEY ("trip_id", "student_id")
);
--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "tracker_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Homework: a teacher's draft is kept on the server until set; some homework is not marked; work can be returned for a redo
-- (with why) and handed in again; a grade remembers when it was given.
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'set';
--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "graded" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "returned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "return_note" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "graded_at" timestamp with time zone;
--> statement-breakpoint
-- A family reports a photo (it shows their child when it should not, or is wrong): the office sees it in Gallery and decides.
CREATE TABLE IF NOT EXISTS "gallery_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"resolved_at" timestamp with time zone,
	"resolution" text NOT NULL DEFAULT ''
);
--> statement-breakpoint
-- Events: a category from the school's list, whether families are asked to reply, the place on a map (for directions), and
-- how many adults and children a family brings.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "needs_rsvp" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "lat" double precision;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "lng" double precision;
--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD COLUMN IF NOT EXISTS "adults" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Staff borrow library books too: a loan is to a student or to a member of staff.
ALTER TABLE "library_loans" ALTER COLUMN "student_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "staff_user_id" text;
--> statement-breakpoint
-- A data request made by a family from the app remembers who made it, so they can follow it there.
ALTER TABLE "data_requests" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
ALTER TABLE "data_requests" ADD COLUMN IF NOT EXISTS "answer" text NOT NULL DEFAULT '';
