-- kind: expand
-- A desk receipt recorded by mistake is cancelled (with a reason, after a second person agrees), not deleted: the receipt
-- stays readable as cancelled and its money leaves the totals through `refunded`.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cancel_reason" text NOT NULL DEFAULT '';
--> statement-breakpoint
-- A declined refund says why (the person who asked reads it), and a reconciliation finding says what was done about it.
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "decision_note" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "reconciliation" ADD COLUMN IF NOT EXISTS "note" text NOT NULL DEFAULT '';
