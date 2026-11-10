-- kind: expand
-- Online fee payments: an order per attempt (the family pays on the provider's page), applied once by the provider's payment ID
-- however often its webhook repeats; refunds; the daily reconciliation's findings; late fines once per invoice and month;
-- reminders once per invoice and day.

CREATE TABLE "payment_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL REFERENCES "fee_invoices"("id"),
	"student_id" text NOT NULL,
	"amount" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'created' NOT NULL CHECK ("status" IN ('created', 'paid', 'failed', 'refunded', 'partial_refund')),
	"provider_payment_id" text UNIQUE,
	"method" text,
	"payment_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
CREATE INDEX "payment_orders_invoice" ON "payment_orders" ("invoice_id");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunded" integer DEFAULT 0 NOT NULL;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "tax" jsonb;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_payment_id" text;

CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL REFERENCES "payments"("id"),
	"amount" integer NOT NULL CHECK ("amount" > 0),
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL CHECK ("status" IN ('requested', 'sent', 'done', 'failed', 'rejected')),
	"provider_refund_id" text,
	"requested_by" text,
	"approved_by" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);

CREATE TABLE "reconciliation" (
	"id" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_amount" integer,
	"receipt_amount" integer,
	"problem" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	UNIQUE ("day", "provider_payment_id")
);

-- A late fine is its own small invoice (head 'fine'), so every balance already counts it; this row keeps it to once a month.
CREATE TABLE "fee_fines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
	"fine_invoice_id" text NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
	"month" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	UNIQUE ("invoice_id", "month")
);

CREATE TABLE "fee_reminders" (
	"invoice_id" text NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
	"day" date NOT NULL,
	PRIMARY KEY ("invoice_id", "day")
);
