-- kind: expand
-- The Integrations Hub: every third party is a connection the console creates, tests and routes per school. Secrets are sealed
-- with SECRETS_KEY (like school database addresses) and never leave the server. message_log is the record of every message.

CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL CHECK ("scope" IN ('platform', 'school')),
	"school_id" text REFERENCES "schools"("id"),
	"state" text DEFAULT 'draft' NOT NULL CHECK ("state" IN ('draft', 'test', 'live', 'paused')),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_sealed" text,
	"secret_hints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"hook_token" text NOT NULL,
	"health_ok" boolean,
	"health_checked_at" timestamp with time zone,
	"health_error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CHECK (("scope" = 'school') = ("school_id" IS NOT NULL))
);

CREATE TABLE "integration_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"school_id" text REFERENCES "schools"("id"),
	"connection_id" text NOT NULL REFERENCES "integration_connections"("id"),
	"fallback_id" text REFERENCES "integration_connections"("id"),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "integration_routes_one" ON "integration_routes" ("capability", coalesce("school_id", ''));

CREATE TABLE "integration_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL REFERENCES "integration_connections"("id") ON DELETE CASCADE,
	"message_key" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"provider_template_id" text NOT NULL,
	"dlt_template_id" text,
	"approved_text" text NOT NULL,
	UNIQUE ("connection_id", "message_key", "language")
);

CREATE TABLE "message_log" (
	"id" text PRIMARY KEY NOT NULL,
	"school_slug" text NOT NULL,
	"channel" text NOT NULL,
	"to_addr" text NOT NULL,
	"message_key" text,
	"subject" text,
	"body" text NOT NULL,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"connection_id" text,
	"provider_message_id" text,
	"status" text NOT NULL CHECK ("status" IN ('queued', 'held', 'sent', 'delivered', 'read', 'failed', 'refused')),
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"segments" integer,
	"cost_paise" integer,
	"send_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "message_log_school" ON "message_log" ("school_slug", "created_at" DESC);
CREATE INDEX "message_log_due" ON "message_log" ("status", "send_after") WHERE "status" IN ('queued', 'held');
CREATE INDEX "message_log_provider" ON "message_log" ("provider_message_id");

-- What each connection's webhook received, so the console can show the last events and whether their signature held.
CREATE TABLE "integration_hook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL REFERENCES "integration_connections"("id") ON DELETE CASCADE,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"summary" text NOT NULL
);
CREATE INDEX "integration_hook_events_conn" ON "integration_hook_events" ("connection_id", "at" DESC);

-- Files kept by the sandbox storage provider (local and staging), so file features work without a bucket.
CREATE TABLE "sandbox_files" (
	"key" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" bytea NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Per-school work that runs in the background: reminders, late fines, imports, file checks, reconciliation, erasure.
CREATE TABLE "job_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL CHECK ("status" IN ('queued', 'running', 'done', 'failed')),
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
CREATE INDEX "job_queue_due" ON "job_queue" ("status", "run_at");
-- A daily job is queued once per school per day.
CREATE UNIQUE INDEX "job_queue_once" ON "job_queue" ("kind", coalesce("school_id", ''), (("payload"->>'day'))) WHERE "payload" ? 'day';
