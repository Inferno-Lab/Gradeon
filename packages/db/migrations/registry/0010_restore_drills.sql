-- kind: expand
-- Every restore drill: a school's backup put back into a scratch database and counted. A backup nobody has restored is a hope.

CREATE TABLE "restore_drills" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"school_name" text NOT NULL,
	"ok" boolean NOT NULL,
	"tables" integer DEFAULT 0 NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"students" integer DEFAULT 0 NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
