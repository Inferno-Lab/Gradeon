-- kind: expand
-- How a loan ended (returned, lost, damaged), and what happened to its fine: put on the family's fees (the invoice) or waived
-- with a reason. A lost book takes a copy off the shelf.
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "outcome" text NOT NULL DEFAULT 'returned';
--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "fine_note" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN IF NOT EXISTS "fine_invoice_id" text;
--> statement-breakpoint
ALTER TABLE "library_reservations" ADD COLUMN IF NOT EXISTS "cancel_reason" text NOT NULL DEFAULT '';
