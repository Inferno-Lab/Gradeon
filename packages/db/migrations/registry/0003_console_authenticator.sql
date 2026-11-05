-- kind: expand
-- Console staff confirm sign-in with an authenticator app (no SMS or email provider needed), and an account locks after repeated wrong passwords.

ALTER TABLE "console_users" ADD COLUMN "totp_secret" text;
--> statement-breakpoint
ALTER TABLE "console_users" ADD COLUMN "failed_logins" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "console_users" ADD COLUMN "locked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "console_otp" ADD COLUMN "method" text DEFAULT 'email' NOT NULL;
--> statement-breakpoint
ALTER TABLE "console_otp" ADD COLUMN "pending_secret" text;
