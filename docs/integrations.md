# The Integrations Hub

Every third party the platform talks to (texts, WhatsApp, email, phone notifications, payments, file storage, maps, events to other systems) is a **connection** made in the console under **Integrations** (Operate menu, keys `G N`). Nothing is configured by a school and nothing needs a deploy: add a connection, test it, route it, take it live.

Code: `packages/integrations` (the adapters and the `Hub`), `apps/console-api/src/integrations.ts` (the console's routes), `apps/api/src/school/hub.service.ts` (the school API's Hub and background worker), `apps/api/src/school/hooks.controller.ts` (webhooks and the test track's checkout and file links). Tables: registry migration `0012_integrations.sql`.

## How it works

| Idea | What it means |
|---|---|
| **Capability** | What a connection does: `sms`, `whatsapp`, `email`, `push`, `payments`, `storage`, `maps`, `webhook` (and `video`, `accounting`, `ai`, kept for later). |
| **Provider** | A kind of third party with a built adapter (`INTEGRATION_PROVIDERS` in `packages/contracts/src/integrations.ts`). The console builds each provider's form from its `fields`, so a new provider needs no new screen. |
| **Connection** | One account at a provider: its settings, and its **secrets sealed** with `SECRETS_KEY` (never returned by the API; the console shows only which keys are set and their last four characters). Scope: Gradeon-wide, or one school (a school's own Razorpay account, its own sender ID). |
| **Route** | Which connection serves a capability: a school's own route wins, then the Gradeon default; each route can name a **fallback** tried when the connection fails, and route settings (sender ID, from-address, bucket prefix). |
| **Template** | For SMS and WhatsApp: our message key (`auth.code`, `attendance.absent`…) mapped to the provider's approved template ID, the DLT template ID and the approved wording. When a message is mapped, the approved wording is what goes out, filled with the message's values, so DLT never rejects it. |
| **message_log** | Every message's fate: queued, held (quiet hours), sent, delivered, read, failed (with the provider's reason) or refused (the plan's text limit). The console's Activity tab and billing totals read it. |

**States.** A new connection starts in **test**. **Go live** asks for a second person (action `integration.live`, approved under Approvals, needs the last test to have passed). **Pause** sends its routes to their fallback. Changing a live connection's keys or settings puts it back in test.

**Modes** (one switch at the top of Integrations, kept in the registry and read by both APIs; going live needs a second person and lists what is not live yet):

- `sandbox` (default, the test track): messages go to the console's **Test inbox**, except to numbers and addresses on the **allow-list** (Integrations → Allow-list), which are sent for real through test or live connections. Files, payments and maps use a routed test or live connection, or the built-in sandbox: files kept in the registry (`sandbox_files`), a **test checkout** that says no money moves (pay or fail), travel times estimated from the distance.
- `live`: only live connections serve. A capability with no live connection **fails and says so**; nothing falls back to the sandbox quietly.

**Sending.** `Messenger.send` writes a `message_log` row (a message to many families, like a notice, is written in bulk: one statement per thousand rows; routes and the allow-list are remembered for ten seconds). Sign-in codes and anything bound for the Test inbox go at once; the rest is sent by the school API's worker (every 20 seconds, `FOR UPDATE SKIP LOCKED`, so any number of servers can run it). A failure is tried again after 1 and 10 minutes, then the fallback, then it is marked failed with the provider's words; the console's Activity has **Retry**. In quiet hours a message is **held** until they end. Past the plan's `smsPerMonth` texts are **refused** (sign-in codes never are); SMS parts are counted per school per month, and each connection's `costPaise` gives the cost.

**Health.** Every 15 minutes each live connection runs its test (payments are skipped: their test makes a ₹1 link); a connection that turns unhealthy, or five failures with nothing sent in 15 minutes, is sent through the Alerts connections (Slack, Discord or e-mail).

**Webhooks.** Each connection that providers call back has its own address: `https://<server>/hooks/<connectionId>/<token>` (Integrations → Webhooks shows it with a Copy button and the last ten events). The token in the address is secret; providers that sign their calls (Meta, Razorpay, Cashfree) are also checked against the raw body. Delivery reports update `message_log`; payment events write the receipt once per provider payment ID, however often they repeat.

## Providers

For each: where the keys come from, what to set, and what to paste where.

### Text messages (India: DLT first)

Every business SMS in India must use a **registered sender ID (header) and a registered template**, on a DLT portal (Jio, Airtel, Vodafone Idea or BSNL; registering on one is enough). This takes weeks, so start it before anything else:

1. Register the company as a **principal entity** on a DLT portal; note the **entity ID**.
2. Register a **header** (six letters, like `GRDEON`), category transactional or service-implicit.
3. Register a **content template** for each message: copy each wording from the console's Integrations → Templates (sign-in code, password code, and every school message); put `{#var#}` where the values go. Note each **template ID**.
4. At the SMS provider, add the header, the entity ID and the templates (most providers import them from DLT).
5. In the console, add the connection, then under **Templates** map each message to its provider template ID and DLT template ID, and paste the approved wording with `{code}`, `{student}`… where DLT has `{#var#}`.

| Provider | Fields | Webhook (delivery reports) |
|---|---|---|
| **MSG91** | Auth key (MSG91 → API), sender ID, DLT entity ID. Messages use MSG91 **Flows**: the template ID in the console is the flow ID, and the flow's variables are named like ours (`code`, `school`…). | Paste the Hub address under MSG91 → Reports → Webhook. |
| **Gupshup SMS** (enterprise) | User ID, password, sender ID, DLT entity ID. | Gupshup → Delivery report URL. |
| **Twilio** | Account SID, auth token, From number or sender ID. Indian numbers still need DLT; Twilio maps your templates. | Sent with each message (`StatusCallback`), nothing to paste. |
| **Kaleyra** | Account SID, API key, sender ID. | Sent with each message. |

### WhatsApp

WhatsApp business messages to someone who has not written in the last 24 hours must use an **approved template**. Create each template at the provider (category Utility), wait for approval, then map it under Templates: the template's **name** is the template ID; its `{{1}}`, `{{2}}`… are filled in the order of the message's values.

| Provider | Fields | Webhook |
|---|---|---|
| **WhatsApp Cloud API (Meta)** | Phone number ID and a permanent access token (Meta Business → System user), app secret (to check webhooks), a verify token you choose. | Meta → WhatsApp → Configuration → Callback URL = the Hub address, Verify token = yours; subscribe to `messages`. |
| **Gupshup WhatsApp** | API key, the WhatsApp number, app name. | Gupshup app → Callback URL. |
| **Interakt** | Secret key. | Interakt → Developer settings → Webhook URL. |

### Email

Set SPF and DKIM for the sending domain first, or mail lands in spam. Emails go as plain text plus an HTML version in one layout with the school's name in its brand colour.

| Provider | Fields |
|---|---|
| **Amazon SES** | Region, access key ID and secret (an IAM user allowed `ses:SendEmail`), From address on a verified domain. Ask AWS to take the account out of the SES sandbox. |
| **SMTP** | Host, port, TLS (465) or STARTTLS (587), user, password, From. |
| **Resend** | API key, From on a verified domain. |

### Phone notifications

**Firebase Cloud Messaging**: the Firebase project ID and a **service account key** (Firebase → Project settings → Service accounts → Generate new private key; paste the whole JSON file). The app registers each phone at `POST /v1/f/devices` after sign-in; a token Google calls unregistered is forgotten. Each notification carries the screen it opens (`/fees`, `/homework`, `/chat/<id>`…).

The app does not include Firebase yet: it needs the project's `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from the owner, then `firebase_messaging` added to the app and the token posted to `/v1/f/devices`. Until then notifications are listed in the app (from `message_log`) but not pushed.

### Payments

The family pays on the provider's own page (no SDK in the app): `POST /v1/f/fees/:id/order` makes a payment link for what is owed, the app opens it, and the provider's signed webhook marks it paid; the app sees the receipt appear (it asks every 3 seconds) and the page after paying links back to `gradeon://open/fees`. A school's own account (its money settles to it) is a school-scoped connection routed for that school.

| Provider | Fields | Webhook |
|---|---|---|
| **Razorpay** | Key ID and secret (Settings → API keys; `rzp_test_…` for test mode), webhook secret. | Settings → Webhooks → the Hub address, the same secret, events `payment_link.paid`, `payment.failed`, `refund.processed`. |
| **Cashfree** | App ID, secret key, environment (test or live). | Developers → Webhooks → the Hub address (signed with the secret key). |

Refunds start from the admin's **Online payments** (permission `fees.refund`); above the school's `fees.refundApprovalAbove` a second person with the same permission approves. Each morning yesterday's settlements are matched to receipts; differences are listed under Online payments → Reconciliation.

### File storage

Any **S3-compatible** bucket (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces): endpoint (blank for AWS), region, bucket, access key ID and secret, path-style for MinIO. Allow `PUT` and `GET` from the admin's and the app's origins in the bucket's CORS rules (uploads go straight to the bucket). Files are kept under `schools/<slug>/<kind>/`; downloads are presigned addresses valid five minutes, given only to someone allowed to see the file. Add a File scanning connection (ClamAV: host and port; Test scans the EICAR test file) to scan every upload; in live mode family uploads are refused until one exists.

### Maps

**Google Maps** (an API key with the Distance Matrix and Static Maps APIs) or **Mapbox** (an access token). Used for the bus's arrival time and the "bus is near" message. Without one the sandbox estimates from the distance (a town bus at 18 km/h).

### Anything else

- **Custom HTTP** sends texts, WhatsApp or email through any provider with an HTTP API: an address, a method, headers (`{secret.apiKey}` reads a sealed secret), a body template with `{to}`, `{text}`, `{subject}`, `{templateId}`, `{vars.name}`, where the reply's message ID is, and how its delivery reports read.
- **Webhook** posts events to another system (an ERP), each signed: `X-Gradeon-Signature: sha256=<hmac of the body with the secret>`.

## Adding a provider

1. Add its `ProviderDef` to `INTEGRATION_PROVIDERS` (its fields, test, webhook note, docs link).
2. Write its `Adapter` in `packages/integrations/src/providers/` (`sms`/`email`/… and `test`, plus `inbound` if it calls back) with `call()` from `http.ts` (timeouts, retries on 5xx, the provider's words in errors), and add it to `ADAPTERS`.
3. That is all: the console form, routing, templates, activity and webhooks come from the definition.
