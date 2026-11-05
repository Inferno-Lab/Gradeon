-- kind: expand
-- A code is good for one purpose: signing in, or setting a new password. A reset code must never sign anyone in.

ALTER TABLE "otp_challenges" ADD COLUMN "purpose" text DEFAULT 'sign_in' NOT NULL;
