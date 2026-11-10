-- kind: expand
-- Files kept in storage through the Integrations Hub: the row says what a file is for and who may read it; the bytes are in the
-- school's storage prefix. Uploads go straight to storage with a presigned address; a file is usable once it is scanned clean.

CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL CHECK ("kind" IN ('homework_submission', 'homework_attachment', 'notice_attachment', 'chat', 'student_photo', 'student_document', 'logo', 'gallery', 'receipt', 'report_card')),
	"owner_id" text,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL CHECK ("status" IN ('uploading', 'pending', 'clean', 'infected')),
	"width" integer,
	"height" integer,
	"thumb_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
CREATE INDEX "files_owner" ON "files" ("kind", "owner_id") WHERE "deleted_at" IS NULL;

-- Phones signed in to the app, for notifications. A token Google calls unregistered is removed on its answer.
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"platform" text NOT NULL CHECK ("platform" IN ('android', 'ios', 'web')),
	"token" text NOT NULL UNIQUE,
	"app_version" text,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "devices_user" ON "devices" ("user_id");
