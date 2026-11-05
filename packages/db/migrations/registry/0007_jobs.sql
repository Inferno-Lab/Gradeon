-- kind: expand
-- When each timed job (backups, sweeps, health probes) last ran, so it runs once across servers and catches up after a restart.

CREATE TABLE "jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone
);
