import { z } from 'zod';

/**
 * What a connection does. Every third party the platform talks to is one of these, from messages to families to the services
 * the console itself runs on (builds, app stores, databases, hosting). A capability appears in the console only when a provider
 * for it exists; a module that needs a new kind of third party adds the capability and its provider in the same change.
 */
export const CAPABILITIES = [
  'sms', 'whatsapp', 'email', 'push', 'payments', 'storage', 'maps', 'tracking', 'scanning', 'webhook',
  'alerts', 'builds', 'stores', 'databases', 'hosting',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  sms: 'Text messages', whatsapp: 'WhatsApp', email: 'Email', push: 'Phone notifications', payments: 'Payments', storage: 'File storage',
  maps: 'Maps', tracking: 'Bus trackers', scanning: 'Virus scanning', webhook: 'Events to other systems',
  alerts: 'Alerts to the Gradeon team', builds: 'App builds', stores: 'App stores', databases: 'School databases', hosting: 'Hosting and domains',
};

/** Capabilities Gradeon itself uses (never a school's own connection). */
export const PLATFORM_CAPABILITIES: Capability[] = ['alerts', 'builds', 'stores', 'databases', 'hosting', 'scanning'];

/**
 * One field of a provider's form in the console: what to type, where to find it, and the shape it must have. `secret` and
 * `file` values are sealed and never shown again; `template` takes {placeholders}.
 */
export interface ProviderField {
  key: string;
  label: string;
  /** Where to find it at the provider, in a few words ("Razorpay → Settings → API keys"). */
  help?: string;
  kind: 'text' | 'secret' | 'url' | 'select' | 'number' | 'bool' | 'json' | 'template' | 'file';
  options?: [string, string][];
  required?: boolean;
  placeholder?: string;
  /** A regular expression the value must match, and the words shown when it does not. */
  pattern?: string;
  patternHint?: string;
  /** For `file`: the file types accepted ("application/json,.p8"). */
  accept?: string;
}

/** A kind of third party with a built adapter. The console builds its form and its setup guide from this, so a new provider needs no new screen. */
export interface ProviderDef {
  key: string;
  name: string;
  capabilities: Capability[];
  fields: ProviderField[];
  /** The steps to get the values, in order, shown beside the form. */
  steps: string[];
  /** What "Test" does, in words. */
  testAction: string;
  /** Inbound events this provider sends us, which ones to tick at the provider, and how they are checked. */
  webhooks?: { events: string; verifies: string };
  docs: string;
}

const f = (key: string, label: string, kind: ProviderField['kind'], extra: Partial<ProviderField> = {}): ProviderField => ({ key, label, kind, required: kind !== 'bool', ...extra });
const opt = (field: ProviderField): ProviderField => ({ ...field, required: false });
const SMS_TEST = 'Sends a short text to the number you type.';
const WA_TEST = 'Sends an approved template to the number you type.';
const MAIL_TEST = 'Sends a short email to the address you type.';
const SENDER = { pattern: '^[A-Z]{6}$', patternHint: 'Six capital letters, exactly as approved on DLT.' };
const DLT_ENTITY = { pattern: '^\\d{19}$', patternHint: 'The 19-digit principal entity ID from your DLT portal.' };
const DLT_STEPS = [
  'Register the company as a principal entity on a DLT portal (Jio, Airtel, Vodafone Idea or BSNL; one is enough) and note the 19-digit entity ID. This takes days, so start first.',
  'On the same portal, register a six-letter header (sender ID) such as GRDEON, as transactional or service-implicit.',
  'Register a content template for every message: open Templates here, press “Copy for DLT” on each message and paste it into the portal. Note each template ID.',
];

export const INTEGRATION_PROVIDERS: ProviderDef[] = [
  { key: 'sandbox', name: 'Test inbox', capabilities: ['sms', 'whatsapp', 'email', 'push', 'payments', 'storage', 'maps'], fields: [], steps: [],
    testAction: 'Files a test message in the console’s Test inbox.', docs: '' },
  // Text messages
  { key: 'msg91', name: 'MSG91', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://docs.msg91.com/reference/send-sms',
    steps: [...DLT_STEPS, 'At MSG91, add the header and your DLT entity ID, then create a Flow for each template (its variables named like ours: code, school…).', 'Copy the auth key from MSG91 → API, fill in the form and save.', 'Paste the webhook address shown here under MSG91 → Reports → Webhook.', 'Under Templates, put each Flow ID against its message, then Test.'],
    fields: [f('authKey', 'Auth key', 'secret', { help: 'MSG91 → API → Auth key' }), f('senderId', 'Sender ID', 'text', { placeholder: 'GRDEON', help: 'Your DLT-approved header', ...SENDER }), f('dltEntityId', 'DLT principal entity ID', 'text', { help: 'From your DLT portal', ...DLT_ENTITY })],
    webhooks: { events: 'Delivery reports', verifies: 'The secret token in the webhook address' } },
  { key: 'gupshup', name: 'Gupshup SMS', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://docs.gupshup.io/docs/sms-api',
    steps: [...DLT_STEPS, 'At Gupshup Enterprise, add the header, the entity ID and the templates.', 'Fill in your user ID and password, save, and paste the webhook address under Gupshup → Delivery report URL.'],
    fields: [f('userId', 'User ID', 'text', { help: 'Gupshup Enterprise → Account', pattern: '^\\d{6,12}$', patternHint: 'Your Gupshup user ID is a number.' }), f('password', 'Password', 'secret', { help: 'The API password of that user' }),
      f('senderId', 'Sender ID', 'text', { help: 'Your DLT-approved header', ...SENDER }), f('dltEntityId', 'DLT principal entity ID', 'text', { help: 'From your DLT portal', ...DLT_ENTITY })],
    webhooks: { events: 'Delivery reports', verifies: 'The secret token in the webhook address' } },
  { key: 'twilio', name: 'Twilio', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://www.twilio.com/docs/sms/api',
    steps: ['For Indian numbers, finish DLT registration first (header and templates) and add it in Twilio → Messaging → Regulatory compliance.', 'Copy the Account SID and Auth token from the Twilio console home page.', 'Fill in the form; delivery reports are requested with each message, nothing to paste back.'],
    fields: [f('accountSid', 'Account SID', 'text', { help: 'Twilio console home page', pattern: '^AC[0-9a-f]{32}$', patternHint: 'Starts with AC, then 32 letters and digits.' }), f('authToken', 'Auth token', 'secret', { help: 'Twilio console home page' }),
      f('from', 'From number or sender ID', 'text', { placeholder: '+14155550100', help: 'A Twilio number, or your DLT header for India' })],
    webhooks: { events: 'Status callbacks', verifies: 'The secret token in the webhook address' } },
  { key: 'kaleyra', name: 'Kaleyra', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://developers.kaleyra.io/docs/sms',
    steps: [...DLT_STEPS, 'At Kaleyra, add the header and templates, then copy the SID and API key from Developers → API keys.', 'Fill in the form; delivery reports come with each message.'],
    fields: [f('sid', 'Account SID', 'text', { help: 'Kaleyra → Developers → API keys' }), f('apiKey', 'API key', 'secret', { help: 'Kaleyra → Developers → API keys' }), f('sender', 'Sender ID', 'text', { help: 'Your DLT-approved header', ...SENDER })],
    webhooks: { events: 'Delivery reports', verifies: 'The secret token in the webhook address' } },
  // WhatsApp
  { key: 'meta-cloud', name: 'WhatsApp Cloud API (Meta)', capabilities: ['whatsapp'], testAction: WA_TEST, docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    steps: ['In Meta Business Manager, add a WhatsApp Business account and a phone number; copy its Phone number ID (WhatsApp → API setup).',
      'Create a System user (Business settings → Users → System users), give it the WhatsApp app, and generate a permanent token with whatsapp_business_messaging.',
      'Copy the App secret (App settings → Basic) and choose any verify token of your own.',
      'Save, then in Meta → WhatsApp → Configuration set the Callback URL to the webhook address shown here and the Verify token to yours; subscribe to “messages”.',
      'Create each message as a Utility template at Meta and wait for approval, then press “Import from provider” under Templates.'],
    fields: [f('phoneNumberId', 'Phone number ID', 'text', { help: 'WhatsApp → API setup', pattern: '^\\d{10,20}$', patternHint: 'A long number, not the phone number itself.' }),
      f('accessToken', 'Permanent access token', 'secret', { help: 'From the System user, not the 24-hour test token' }), f('appSecret', 'App secret', 'secret', { help: 'App settings → Basic → App secret (checks webhooks)' }),
      f('verifyToken', 'Webhook verify token', 'text', { help: 'Any word you choose; type the same at Meta', pattern: '^\\S{8,}$', patternHint: 'At least eight characters, no spaces.' }),
      opt(f('businessAccountId', 'WhatsApp Business account ID', 'text', { help: 'WhatsApp → API setup; needed to import templates' }))],
    webhooks: { events: 'messages (status updates)', verifies: 'X-Hub-Signature-256 with the app secret' } },
  { key: 'gupshup-wa', name: 'Gupshup WhatsApp', capabilities: ['whatsapp'], testAction: WA_TEST, docs: 'https://docs.gupshup.io/docs/whatsapp-api',
    steps: ['Create an app at Gupshup for your WhatsApp number and get the templates approved (category Utility).', 'Copy the API key (top-right menu → API key) and the app name.', 'Save, then paste the webhook address under the app → Callback URL.', 'Under Templates, press “Import from provider”.'],
    fields: [f('apiKey', 'API key', 'secret', { help: 'Gupshup → your profile → API key' }), f('source', 'WhatsApp number', 'text', { placeholder: '919800000000', help: 'With 91 in front, digits only', pattern: '^91\\d{10}$', patternHint: '91 and the ten-digit number, digits only.' }), f('appName', 'App name', 'text', { help: 'As named at Gupshup' })],
    webhooks: { events: 'Message events', verifies: 'The secret token in the webhook address' } },
  { key: 'interakt', name: 'Interakt', capabilities: ['whatsapp'], testAction: WA_TEST, docs: 'https://www.interakt.shop/resource-center/send-template-api',
    steps: ['Get the templates approved in Interakt (category Utility).', 'Copy the secret key from Settings → Developer settings.', 'Save, then paste the webhook address under Developer settings → Webhook URL.', 'Under Templates, put each template’s name against its message.'],
    fields: [f('apiKey', 'Secret key', 'secret', { help: 'Interakt → Settings → Developer settings' })],
    webhooks: { events: 'Message status', verifies: 'The secret token in the webhook address' } },
  // Email
  { key: 'ses', name: 'Amazon SES', capabilities: ['email'], testAction: MAIL_TEST, docs: 'https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html',
    steps: ['In AWS SES, verify the sending domain and turn on DKIM (add the three CNAME records); add an SPF record.', 'Ask AWS to move the account out of the SES sandbox (Account dashboard → Request production access).',
      'In IAM, create a user allowed only ses:SendEmail and make an access key for it.', 'Fill in the form with the region where the domain is verified.'],
    fields: [f('region', 'Region', 'select', { options: [['ap-south-1', 'Mumbai (ap-south-1)'], ['ap-southeast-1', 'Singapore (ap-southeast-1)'], ['us-east-1', 'N. Virginia (us-east-1)'], ['eu-west-1', 'Ireland (eu-west-1)']], help: 'Where the domain is verified' }),
      f('accessKeyId', 'Access key ID', 'text', { help: 'IAM → Users → Security credentials', pattern: '^AKIA[0-9A-Z]{16}$', patternHint: 'Starts with AKIA, 20 characters.' }), f('secretAccessKey', 'Secret access key', 'secret', { help: 'Shown once when the key is made' }),
      f('from', 'From address', 'text', { placeholder: 'Greenfield <no-reply@gradeon.app>', help: 'On the verified domain', pattern: '^(.+<)?[^@\\s<>]+@[^@\\s<>]+\\.[^@\\s<>]+>?$', patternHint: 'An address, or a name with the address in <>.' })] },
  { key: 'smtp', name: 'SMTP server', capabilities: ['email'], testAction: MAIL_TEST, docs: 'https://datatracker.ietf.org/doc/html/rfc5321',
    steps: ['Set SPF and DKIM for the sending domain at its DNS host, or mail lands in spam.', 'Get the SMTP host, port, user and password from the mail provider.', 'Fill in the form and Test.'],
    fields: [f('host', 'Host', 'text', { placeholder: 'smtp.example.com', pattern: '^[a-z0-9.-]+\\.[a-z]{2,}$', patternHint: 'A host name like smtp.example.com.' }), f('port', 'Port', 'number', { placeholder: '465' }),
      f('security', 'Connection', 'select', { options: [['tls', 'TLS from the start (port 465)'], ['starttls', 'STARTTLS (port 587)']] }), f('user', 'User', 'text'), f('password', 'Password', 'secret'),
      f('from', 'From address', 'text', { pattern: '^(.+<)?[^@\\s<>]+@[^@\\s<>]+\\.[^@\\s<>]+>?$', patternHint: 'An address, or a name with the address in <>.' })] },
  { key: 'resend', name: 'Resend', capabilities: ['email'], testAction: MAIL_TEST, docs: 'https://resend.com/docs/api-reference/emails/send-email',
    steps: ['Add and verify the sending domain at Resend → Domains (it gives the DNS records).', 'Create an API key with sending access (API keys).', 'Fill in the form and Test.'],
    fields: [f('apiKey', 'API key', 'secret', { help: 'Resend → API keys', pattern: '^re_\\w+$', patternHint: 'Starts with re_.' }), f('from', 'From address', 'text', { help: 'On the verified domain', pattern: '^(.+<)?[^@\\s<>]+@[^@\\s<>]+\\.[^@\\s<>]+>?$', patternHint: 'An address, or a name with the address in <>.' })] },
  // Phone notifications
  { key: 'fcm', name: 'Firebase Cloud Messaging', capabilities: ['push'], testAction: 'Checks the service account by asking Google for an access token.', docs: 'https://firebase.google.com/docs/cloud-messaging/send-message',
    steps: ['Create a Firebase project (console.firebase.google.com) and add an Android app with the package name of the Gradeon app, and an iOS app with its bundle ID.',
      'Download google-services.json (Android) and GoogleService-Info.plist (iOS) and add both here: every app build takes them from this connection.',
      'Project settings → Service accounts → Generate new private key; add that JSON file too.', 'Save and Test; then route Phone notifications to this connection.'],
    fields: [f('projectId', 'Firebase project ID', 'text', { help: 'Project settings → General', pattern: '^[a-z][a-z0-9-]{4,28}[a-z0-9]$', patternHint: 'Lower-case letters, digits and dashes.' }),
      f('serviceAccount', 'Service account key', 'file', { help: 'Project settings → Service accounts → Generate new private key', accept: 'application/json,.json' }),
      f('androidConfig', 'google-services.json', 'file', { help: 'Project settings → Your apps → Android', accept: 'application/json,.json' }),
      f('iosConfig', 'GoogleService-Info.plist', 'file', { help: 'Project settings → Your apps → iOS', accept: '.plist,application/xml' })] },
  // Payments
  { key: 'razorpay', name: 'Razorpay', capabilities: ['payments'], testAction: 'Creates a ₹1 payment link in the account and cancels it.', docs: 'https://razorpay.com/docs/api/payments/payment-links/',
    steps: ['In Razorpay, finish KYC so the account can take payments (test keys work before that).', 'Settings → API keys → Generate key; copy the Key ID and Key secret (rzp_test_ for test, rzp_live_ for live).',
      'Save, then Settings → Webhooks → Add: the webhook address shown here, a secret of your choice (type the same below), events payment_link.paid, payment.failed and refund.processed.'],
    fields: [f('keyId', 'Key ID', 'text', { placeholder: 'rzp_test_…', help: 'Settings → API keys', pattern: '^rzp_(test|live)_\\w{10,}$', patternHint: 'Starts with rzp_test_ or rzp_live_.' }), f('keySecret', 'Key secret', 'secret', { help: 'Shown once when the key is made' }),
      f('webhookSecret', 'Webhook secret', 'secret', { help: 'The secret you typed when adding the webhook' })],
    webhooks: { events: 'payment_link.paid, payment.failed, refund.processed', verifies: 'X-Razorpay-Signature with the webhook secret' } },
  { key: 'cashfree', name: 'Cashfree', capabilities: ['payments'], testAction: 'Creates a ₹1 payment link in the account and cancels it.', docs: 'https://docs.cashfree.com/reference/pgcreatelink',
    steps: ['In Cashfree Payments, finish KYC (the sandbox works before that).', 'Developers → API keys: copy the App ID and Secret key for the environment you use.', 'Save, then Developers → Webhooks → add the webhook address shown here for payment links and refunds.'],
    fields: [f('appId', 'App ID', 'text', { help: 'Developers → API keys' }), f('secretKey', 'Secret key', 'secret', { help: 'Developers → API keys' }), f('environment', 'Environment', 'select', { options: [['sandbox', 'Test'], ['production', 'Live']] })],
    webhooks: { events: 'PAYMENT_LINK_EVENT, REFUND_STATUS_WEBHOOK', verifies: 'x-webhook-signature with the secret key' } },
  // File storage
  { key: 's3', name: 'S3-compatible storage', capabilities: ['storage'], testAction: 'Writes, reads and deletes a small file in the bucket.', docs: 'https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html',
    steps: ['Create a private bucket (AWS S3, Cloudflare R2, MinIO or DigitalOcean Spaces).', 'In its CORS rules allow PUT and GET from the admin’s and the app’s addresses (uploads go straight to the bucket).', 'Make an access key that can read and write only this bucket.', 'Fill in the form (endpoint blank for AWS) and Test. School backups are kept here too.'],
    fields: [opt(f('endpoint', 'Endpoint (blank for AWS)', 'url', { placeholder: 'https://<account>.r2.cloudflarestorage.com', help: 'R2: the account’s S3 endpoint' })), f('region', 'Region', 'text', { placeholder: 'ap-south-1', help: 'auto for R2' }), f('bucket', 'Bucket', 'text', { pattern: '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$', patternHint: 'A bucket name: lower-case letters, digits, dots and dashes.' }),
      f('accessKeyId', 'Access key ID', 'text'), f('secretAccessKey', 'Secret access key', 'secret'), f('pathStyle', 'Path-style addresses (MinIO, some providers)', 'bool')] },
  // Maps and bus trackers
  { key: 'google-maps', name: 'Google Maps', capabilities: ['maps'], testAction: 'Asks for the travel time between two points in Pune.', docs: 'https://developers.google.com/maps/documentation/distance-matrix',
    steps: ['In Google Cloud, create a project with billing and enable the Distance Matrix API and the Maps Static API.', 'Credentials → Create API key; restrict it to those two APIs.', 'Fill in the form and Test.'],
    fields: [f('apiKey', 'API key', 'secret', { help: 'Google Cloud → Credentials', pattern: '^AIza[\\w-]{35}$', patternHint: 'Starts with AIza, 39 characters.' })] },
  { key: 'mapbox', name: 'Mapbox', capabilities: ['maps'], testAction: 'Asks for the travel time between two points in Pune.', docs: 'https://docs.mapbox.com/api/navigation/directions/',
    steps: ['In Mapbox → Tokens, create a token with the default public scopes.', 'Fill in the form and Test.'],
    fields: [f('accessToken', 'Access token', 'secret', { help: 'Mapbox → Tokens', pattern: '^pk\\.\\w+\\.[\\w-]+$', patternHint: 'Starts with pk.' })] },
  { key: 'gps-http', name: 'GPS trackers (HTTP)', capabilities: ['tracking'], testAction: 'Asks the tracker service for the latest positions and shows how many vehicles it found.', docs: '',
    steps: ['Ask the tracker company for its API: the address that lists the latest position of each vehicle, and how to sign in to it.', 'Fill in the address, the header that carries the key, and where in the reply each vehicle’s number, latitude and longitude are.', 'Test, then under Transport give each bus the tracker’s vehicle number. Positions are read every 30 seconds while a trip runs.'],
    fields: [f('url', 'Positions address', 'url', { placeholder: 'https://api.tracker.example/v1/positions' }), opt(f('headers', 'Headers (JSON; {secret.apiKey} reads the key)', 'json', { placeholder: '{"Authorization": "Bearer {secret.apiKey}"}' })),
      opt(f('apiKey', 'API key', 'secret')), f('listPath', 'Where the list of vehicles is', 'text', { placeholder: 'data.vehicles' }), f('vehiclePath', 'In each: the vehicle number', 'text', { placeholder: 'registration' }),
      f('latPath', 'In each: latitude', 'text', { placeholder: 'lat' }), f('lngPath', 'In each: longitude', 'text', { placeholder: 'lng' }), opt(f('atPath', 'In each: when it was read', 'text', { placeholder: 'timestamp' }))] },
  // Virus scanning
  { key: 'clamav', name: 'ClamAV', capabilities: ['scanning'], testAction: 'Sends the standard EICAR test file and expects ClamAV to flag it.', docs: 'https://docs.clamav.net/manual/Usage/Scanning.html',
    steps: ['Run a ClamAV daemon (clamd) reachable from the school servers, listening on TCP (TCPSocket 3310 in clamd.conf).', 'Fill in its host and port and Test. In live mode, uploads from families are refused while no scanner is live.'],
    fields: [f('host', 'Host', 'text', { placeholder: 'clamav.internal' }), f('port', 'Port', 'number', { placeholder: '3310' })] },
  // Alerts to the team
  { key: 'slack', name: 'Slack', capabilities: ['alerts'], testAction: 'Posts a test alert to the channel.', docs: 'https://api.slack.com/messaging/webhooks',
    steps: ['In Slack, create an app (api.slack.com/apps) with Incoming Webhooks turned on, and add a webhook to the channel the team watches.', 'Paste the webhook address here and Test.'],
    fields: [f('url', 'Webhook address', 'secret', { help: 'Incoming Webhooks → Webhook URL', pattern: '^https://hooks\\.slack\\.com/services/\\S+$', patternHint: 'Starts with https://hooks.slack.com/services/.' })] },
  { key: 'discord', name: 'Discord', capabilities: ['alerts'], testAction: 'Posts a test alert to the channel.', docs: 'https://support.discord.com/hc/en-us/articles/228383668',
    steps: ['In Discord, open the channel’s settings → Integrations → Webhooks → New webhook, and copy its address.', 'Paste it here and Test.'],
    fields: [f('url', 'Webhook address', 'secret', { pattern: '^https://(discord|discordapp)\\.com/api/webhooks/\\S+$', patternHint: 'Starts with https://discord.com/api/webhooks/.' })] },
  { key: 'email-alerts', name: 'Email to the team', capabilities: ['alerts'], testAction: 'Emails a test alert to the addresses, through the live email connection.', docs: '',
    steps: ['Set up an Email connection first (alerts are sent through it).', 'List the addresses that should receive alerts and Test.'],
    fields: [f('to', 'Addresses (comma between)', 'text', { placeholder: 'ops@gradeon.app, kaushal@gradeon.app', pattern: '^[^@\\s,]+@[^@\\s,]+(\\s*,\\s*[^@\\s,]+@[^@\\s,]+)*$', patternHint: 'Email addresses, separated by commas.' })] },
  // App builds and stores
  { key: 'github', name: 'GitHub Actions', capabilities: ['builds'], testAction: 'Checks the token can see the repository and its mobile build workflow.', docs: 'https://docs.github.com/en/rest/actions/workflows',
    steps: ['In GitHub → Settings → Developer settings → Fine-grained tokens, make a token for the Gradeon repository with Actions (read and write) and Contents (read and write).', 'Fill in the repository (owner/name), the branch builds start from, and the token. Test.', 'Every build gets its own short-lived code to fetch its signing files and report back; nothing else to paste into GitHub.'],
    fields: [f('repo', 'Repository', 'text', { placeholder: 'Inferno-Lab/Gradeon', pattern: '^[\\w.-]+/[\\w.-]+$', patternHint: 'owner/name' }), f('branch', 'Branch', 'text', { placeholder: 'main' }), f('token', 'Token', 'secret', { help: 'A fine-grained token', pattern: '^(github_pat_|ghp_)\\w+$', patternHint: 'Starts with github_pat_ or ghp_.' })] },
  { key: 'google-play', name: 'Google Play', capabilities: ['stores'], testAction: 'Signs in to the Play Developer API with the service account and checks the upload key opens with its passwords.', docs: 'https://developers.google.com/android-publisher',
    steps: ['In Play Console, create each school’s app once (the package name the build gives it), and accept the terms.', 'In Google Cloud, create a service account, give it access in Play Console → Users and permissions (Release manager), and download its JSON key.',
      'Make an upload keystore once (keytool -genkey -keystore upload.jks …) and keep a copy safe: Play needs the same key for every update.', 'Add both files and the passwords here, choose the track builds go to, and Test.'],
    fields: [f('serviceAccount', 'Service account key', 'file', { accept: 'application/json,.json', help: 'Google Cloud → Service accounts → Keys' }), f('keystore', 'Upload keystore', 'file', { accept: '.jks,.keystore', help: 'The .jks file' }),
      f('keystorePassword', 'Keystore password', 'secret'), f('keyAlias', 'Key alias', 'text', { placeholder: 'upload' }), f('keyPassword', 'Key password', 'secret'),
      f('track', 'Track', 'select', { options: [['internal', 'Internal testing'], ['alpha', 'Closed testing'], ['beta', 'Open testing'], ['production', 'Production']] })] },
  { key: 'app-store', name: 'Apple App Store', capabilities: ['stores'], testAction: 'Signs a token with the key and asks App Store Connect for the apps it can see.', docs: 'https://developer.apple.com/documentation/appstoreconnectapi',
    steps: ['Join the Apple Developer Program for the company; note the Team ID (Membership).', 'App Store Connect → Users and Access → Integrations → App Store Connect API: generate a key with App Manager access; download the .p8 file (once) and note the Key ID and Issuer ID.',
      'Fill in the form and Test. iPhone builds are signed automatically with this key and sent to TestFlight.'],
    fields: [f('teamId', 'Team ID', 'text', { pattern: '^[A-Z0-9]{10}$', patternHint: 'Ten letters and digits.' }), f('issuerId', 'Issuer ID', 'text', { pattern: '^[0-9a-f-]{36}$', patternHint: 'A UUID like 69a6de7f-….' }),
      f('keyId', 'Key ID', 'text', { pattern: '^[A-Z0-9]{10}$', patternHint: 'Ten letters and digits.' }), f('privateKey', 'API key (.p8)', 'file', { accept: '.p8' })] },
  // Where schools' databases live, and their addresses
  { key: 'postgres-server', name: 'PostgreSQL server', capabilities: ['databases'], testAction: 'Connects with the admin address and checks it may create databases.', docs: 'https://www.postgresql.org/docs/current/sql-createdatabase.html',
    steps: ['On the PostgreSQL server for a cell, make a role with CREATEDB and CREATEROLE.', 'Fill in its admin address and Test, then under Cells give the cell this connection. Schools on the cell get their own database and role there.'],
    fields: [f('adminUrl', 'Admin address', 'secret', { placeholder: 'postgres://admin:…@host:5432/postgres', pattern: '^postgres(ql)?://\\S+$', patternHint: 'A postgres:// address.' })] },
  { key: 'neon', name: 'Neon', capabilities: ['databases'], testAction: 'Lists the projects the key can see.', docs: 'https://api-docs.neon.tech/reference/createproject',
    steps: ['In Neon → Account settings → API keys, create a key.', 'Choose the region new schools’ projects are made in, fill in the form and Test. Each school on this cell gets a Neon project of its own.'],
    fields: [f('apiKey', 'API key', 'secret', { help: 'Neon → Account settings → API keys' }), f('region', 'Region', 'select', { options: [['aws-ap-southeast-1', 'Singapore (AWS)'], ['aws-ap-south-1', 'Mumbai (AWS)'], ['aws-us-east-2', 'Ohio (AWS)'], ['aws-eu-central-1', 'Frankfurt (AWS)']] })] },
  { key: 'render', name: 'Render', capabilities: ['hosting'], testAction: 'Reads the service and lists its custom domains.', docs: 'https://api-docs.render.com/reference/add-custom-domain',
    steps: ['In Render → Account settings → API keys, create a key.', 'Copy the ID of the service that serves the admin and API (its page address ends in srv-…).', 'Fill in the form and Test. A school’s own domain is then added here when its address is set, with the DNS record to create shown in the console.'],
    fields: [f('apiKey', 'API key', 'secret', { pattern: '^rnd_\\w+$', patternHint: 'Starts with rnd_.' }), f('serviceId', 'Service ID', 'text', { pattern: '^srv-\\w+$', patternHint: 'Starts with srv-.' })] },
  // Anything over plain HTTP
  { key: 'custom-http', name: 'Custom HTTP', capabilities: ['sms', 'whatsapp', 'email'], testAction: 'Sends a test message through the request you set up.', docs: '',
    steps: ['From the provider’s API documentation, find the address and method that sends a message, how it signs in, and what the reply looks like.', 'Fill in the request; {to}, {text}, {subject}, {templateId} and {vars.name} are filled per message, {secret.apiKey} reads the key.', 'If the provider reports delivery, switch that on and paste the webhook address shown here at the provider. Test.'],
    fields: [
      f('url', 'Address', 'url', { placeholder: 'https://api.example.com/send' }),
      f('method', 'Method', 'select', { options: [['POST', 'POST'], ['GET', 'GET'], ['PUT', 'PUT']] }),
      opt(f('headers', 'Headers (JSON; {secret.name} reads a secret)', 'json', { placeholder: '{"Authorization": "Bearer {secret.apiKey}"}' })),
      opt(f('apiKey', 'Secret used in headers or body as {secret.apiKey}', 'secret')),
      f('body', 'Body', 'template', { placeholder: '{"to":"{to}","text":"{text}","template":"{templateId}"}', help: 'Placeholders: {to}, {text}, {subject}, {templateId}, {vars.name}.' }),
      opt(f('messageIdPath', 'Where the message ID is in the reply', 'text', { placeholder: 'data.id' })),
      opt(f('successPath', 'A field that must hold a value for success', 'text', { placeholder: 'status' })),
      opt(f('successValue', '…and the value it must hold', 'text', { placeholder: 'ok' })),
      f('statusWebhook', 'The provider sends delivery reports to our webhook', 'bool'),
      opt(f('statusIdPath', 'In a delivery report: the message ID', 'text', { placeholder: 'id' })),
      opt(f('statusPath', 'In a delivery report: the status', 'text', { placeholder: 'status' })),
      opt(f('statusMap', 'Their status words to ours (JSON)', 'json', { placeholder: '{"DELIVRD":"delivered","FAILED":"failed"}' })),
    ],
    webhooks: { events: 'Delivery reports, if switched on', verifies: 'The secret token in the webhook address' } },
  { key: 'webhook', name: 'Webhook', capabilities: ['webhook'], testAction: 'Posts a test event to the address.', docs: '',
    steps: ['In the other system, make an address that accepts JSON posts.', 'Choose a signing secret and give it to that system: each event carries X-Gradeon-Signature: sha256=<HMAC of the body>.', 'Fill in the form and Test.'],
    fields: [f('url', 'Address', 'url', { pattern: '^https://\\S+$', patternHint: 'An https:// address.' }), f('secret', 'Signing secret', 'secret', { help: 'Each event carries X-Gradeon-Signature: sha256 of the body with this secret.' })] },
];

// What a message costs, for billing and the console's totals: set on every paid messaging connection.
for (const p of INTEGRATION_PROVIDERS) {
  if (p.key !== 'sandbox' && p.capabilities.some((c) => c === 'sms' || c === 'whatsapp' || c === 'email')) {
    p.fields.push(opt(f('costPaise', 'Cost per message or SMS part (paise)', 'number', { placeholder: '18', help: 'From the provider’s price list; the console totals cost from it' })));
  }
}

/** Whether a field's value has the shape it must (empty optional fields always do). */
export function fieldProblem(field: ProviderField, value: unknown): string | null {
  const v = value === undefined || value === null ? '' : String(value).trim();
  if (!v) return field.required ? `${field.label} is needed.` : null;
  if (field.kind === 'json') {
    try { JSON.parse(v); } catch { return 'This is not valid JSON.'; }
  }
  if (field.pattern && field.kind !== 'file' && !new RegExp(field.pattern).test(v)) return field.patternHint ?? `${field.label} does not look right.`;
  return null;
}

/** Messages the platform sends itself, besides the school's own (MESSAGE_EVENTS): they need DLT templates too. */
export const SYSTEM_MESSAGES = [
  { key: 'auth.code', label: 'Sign-in code', vars: ['code', 'school', 'minutes'], text: 'Your Gradeon sign-in code for {school} is {code}. It expires in {minutes} minutes.' },
  { key: 'auth.reset', label: 'Code to set a new password', vars: ['code', 'school', 'minutes'], text: 'Your Gradeon code to set a new password for {school} is {code}. It expires in {minutes} minutes.' },
] as const;

export const providerDef = (key: string): ProviderDef | undefined => INTEGRATION_PROVIDERS.find((p) => p.key === key);

export const CONNECTION_STATES = ['draft', 'test', 'live', 'paused'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const ConnectionInput = z.object({
  provider: z.string().min(2).max(40),
  name: z.string().trim().min(2, 'Give the connection a name.').max(60),
  scope: z.enum(['platform', 'school']),
  schoolId: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.string()).optional(),
  /** Made before its keys are filled in, so its webhook address can be copied while setting the provider up. */
  draft: z.boolean().default(false),
});
export type ConnectionInput = z.infer<typeof ConnectionInput>;

export const ConnectionPatch = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
  state: z.enum(['test', 'paused']).optional(),
});
export type ConnectionPatch = z.infer<typeof ConnectionPatch>;

export const RouteInput = z.object({
  capability: z.enum(CAPABILITIES),
  schoolId: z.string().nullable(),
  connectionId: z.string().min(1),
  fallbackId: z.string().nullable().default(null),
  /** Sender ID, from-address, bucket prefix and the like, for this route only. */
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type RouteInput = z.infer<typeof RouteInput>;

export const TemplateInput = z.object({
  connectionId: z.string().min(1),
  messageKey: z.string().min(1),
  language: z.string().min(2).max(5).default('en'),
  providerTemplateId: z.string().trim().min(1, 'The provider’s template ID is needed.').max(120),
  dltTemplateId: z.string().trim().max(40).optional(),
  approvedText: z.string().trim().min(1, 'Paste the approved wording.').max(1000),
});
export type TemplateInput = z.infer<typeof TemplateInput>;

export interface ConnectionRow {
  id: string;
  provider: string;
  name: string;
  scope: 'platform' | 'school';
  schoolId: string | null;
  schoolName: string | null;
  state: ConnectionState;
  settings: Record<string, unknown>;
  /** Names of the secrets that are set, with the last four characters of each: never the values. */
  secretsSet: { key: string; ending: string }[];
  health: { ok: boolean | null; checkedAt: string | null; error: string | null };
  usage: { month: string; count: number; costPaise: number };
  /** The webhook address to paste into the provider's dashboard. */
  webhookUrl: string | null;
  createdBy: string;
  updatedAt: string;
}

export interface RouteRow {
  id: string;
  capability: Capability;
  schoolId: string | null;
  schoolName: string | null;
  connectionId: string;
  fallbackId: string | null;
  settings: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string;
}

export interface TemplateRow extends TemplateInput { id: string; language: string }

export const DELIVERY_STATUSES = ['queued', 'held', 'sent', 'delivered', 'read', 'failed', 'refused'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface DeliveryRow {
  id: string;
  schoolSlug: string;
  channel: string;
  to: string;
  messageKey: string | null;
  subject: string | null;
  body: string;
  connectionId: string | null;
  connectionName: string | null;
  providerMessageId: string | null;
  status: DeliveryStatus;
  error: string | null;
  attempts: number;
  segments: number | null;
  costPaise: number | null;
  sendAfter: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface HookEventRow { id: string; connectionId: string; at: string; ok: boolean; summary: string }

/** What the console's Integrations page reads at once. */
export interface IntegrationsView {
  connections: ConnectionRow[];
  routes: RouteRow[];
  templates: TemplateRow[];
  /** Numbers and addresses that get real messages even while the platform is in sandbox mode. */
  allowList: string[];
  mode: 'sandbox' | 'live';
}

export const ActivityQuery = z.object({
  school: z.string().optional(),
  channel: z.string().optional(),
  status: z.enum(DELIVERY_STATUSES).optional(),
  from: z.string().optional(),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ActivityQuery = z.infer<typeof ActivityQuery>;

export interface ActivityView { rows: DeliveryRow[]; totals: { schoolSlug: string; channel: string; month: string; count: number; costPaise: number }[] }

/** What a school sees, read-only, about its channels (the admin's School setup). */
export interface SchoolChannels { channels: { capability: Capability; label: string; provider: string | null; state: 'on' | 'test' | 'sandbox' }[] }
