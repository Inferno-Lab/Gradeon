import { z } from 'zod';

/** What a connection does. Every third party the platform talks to is one of these. */
export const CAPABILITIES = ['sms', 'whatsapp', 'email', 'push', 'payments', 'storage', 'maps', 'video', 'accounting', 'ai', 'webhook'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  sms: 'Text messages', whatsapp: 'WhatsApp', email: 'Email', push: 'Phone notifications', payments: 'Payments', storage: 'File storage',
  maps: 'Maps', video: 'Video meetings', accounting: 'Accounting', ai: 'AI', webhook: 'Events to other systems',
};

/** One field of a provider's form in the console. `secret` values are sealed and never shown again; `template` takes {placeholders}. */
export interface ProviderField {
  key: string;
  label: string;
  help?: string;
  kind: 'text' | 'secret' | 'url' | 'select' | 'number' | 'bool' | 'json' | 'template';
  options?: [string, string][];
  required?: boolean;
  placeholder?: string;
}

/** A kind of third party with a built adapter. The console builds its form from `fields`, so a new provider needs no new screen. */
export interface ProviderDef {
  key: string;
  name: string;
  capabilities: Capability[];
  fields: ProviderField[];
  /** What "Test" does, in words. */
  testAction: string;
  /** Inbound events this provider sends us, and how they are checked. */
  webhooks?: { events: string; verifies: string };
  docs: string;
}

const f = (key: string, label: string, kind: ProviderField['kind'], extra: Partial<ProviderField> = {}): ProviderField => ({ key, label, kind, required: kind !== 'bool', ...extra });
const opt = (field: ProviderField): ProviderField => ({ ...field, required: false });
const SMS_TEST = 'Sends a short text to the number you type.';
const WA_TEST = 'Sends an approved template to the number you type.';
const MAIL_TEST = 'Sends a short email to the address you type.';

export const INTEGRATION_PROVIDERS: ProviderDef[] = [
  { key: 'sandbox', name: 'Test inbox', capabilities: ['sms', 'whatsapp', 'email', 'push', 'payments', 'storage', 'maps'], fields: [],
    testAction: 'Files a test message in the console’s Test inbox.', docs: '' },
  // Text messages
  { key: 'msg91', name: 'MSG91', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://docs.msg91.com/reference/send-sms',
    fields: [f('authKey', 'Auth key', 'secret'), f('senderId', 'Sender ID (6 letters, DLT approved)', 'text', { placeholder: 'GRDEON' }), opt(f('dltEntityId', 'DLT principal entity ID', 'text'))],
    webhooks: { events: 'Delivery reports', verifies: 'The secret token in the webhook address' } },
  { key: 'gupshup', name: 'Gupshup SMS', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://docs.gupshup.io/docs/sms-api',
    fields: [f('userId', 'User ID', 'text'), f('password', 'Password', 'secret'), f('senderId', 'Sender ID (DLT approved)', 'text'), f('dltEntityId', 'DLT principal entity ID', 'text')],
    webhooks: { events: 'Delivery reports', verifies: 'The secret token in the webhook address' } },
  { key: 'twilio', name: 'Twilio', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://www.twilio.com/docs/sms/api',
    fields: [f('accountSid', 'Account SID', 'text'), f('authToken', 'Auth token', 'secret'), f('from', 'From number or sender ID', 'text', { placeholder: '+14155550100' })],
    webhooks: { events: 'Status callbacks', verifies: 'The secret token in the webhook address' } },
  { key: 'kaleyra', name: 'Kaleyra', capabilities: ['sms'], testAction: SMS_TEST, docs: 'https://developers.kaleyra.io/docs/sms',
    fields: [f('sid', 'Account SID', 'text'), f('apiKey', 'API key', 'secret'), f('sender', 'Sender ID (DLT approved)', 'text')],
    webhooks: { events: 'Delivery reports', verifies: 'The secret token in the webhook address' } },
  // WhatsApp
  { key: 'meta-cloud', name: 'WhatsApp Cloud API (Meta)', capabilities: ['whatsapp'], testAction: WA_TEST, docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    fields: [f('phoneNumberId', 'Phone number ID', 'text'), f('accessToken', 'Permanent access token', 'secret'), opt(f('appSecret', 'App secret (checks webhooks)', 'secret')), opt(f('verifyToken', 'Webhook verify token', 'text'))],
    webhooks: { events: 'Message status updates', verifies: 'X-Hub-Signature-256 with the app secret' } },
  { key: 'gupshup-wa', name: 'Gupshup WhatsApp', capabilities: ['whatsapp'], testAction: WA_TEST, docs: 'https://docs.gupshup.io/docs/whatsapp-api',
    fields: [f('apiKey', 'API key', 'secret'), f('source', 'WhatsApp number', 'text', { placeholder: '919800000000' }), f('appName', 'App name', 'text')],
    webhooks: { events: 'Message events', verifies: 'The secret token in the webhook address' } },
  { key: 'interakt', name: 'Interakt', capabilities: ['whatsapp'], testAction: WA_TEST, docs: 'https://www.interakt.shop/resource-center/send-template-api',
    fields: [f('apiKey', 'Secret key', 'secret')],
    webhooks: { events: 'Message status', verifies: 'The secret token in the webhook address' } },
  // Email
  { key: 'ses', name: 'Amazon SES', capabilities: ['email'], testAction: MAIL_TEST, docs: 'https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html',
    fields: [f('region', 'Region', 'text', { placeholder: 'ap-south-1' }), f('accessKeyId', 'Access key ID', 'text'), f('secretAccessKey', 'Secret access key', 'secret'), f('from', 'From address', 'text', { placeholder: 'Greenfield <no-reply@gradeon.app>' })] },
  { key: 'smtp', name: 'SMTP server', capabilities: ['email'], testAction: MAIL_TEST, docs: 'https://datatracker.ietf.org/doc/html/rfc5321',
    fields: [f('host', 'Host', 'text', { placeholder: 'smtp.example.com' }), f('port', 'Port', 'number', { placeholder: '465' }),
      f('security', 'Connection', 'select', { options: [['tls', 'TLS from the start (port 465)'], ['starttls', 'STARTTLS (port 587)']] }), f('user', 'User', 'text'), f('password', 'Password', 'secret'), f('from', 'From address', 'text')] },
  { key: 'resend', name: 'Resend', capabilities: ['email'], testAction: MAIL_TEST, docs: 'https://resend.com/docs/api-reference/emails/send-email',
    fields: [f('apiKey', 'API key', 'secret'), f('from', 'From address', 'text')] },
  // Phone notifications
  { key: 'fcm', name: 'Firebase Cloud Messaging', capabilities: ['push'], testAction: 'Checks the service account by asking Google for an access token.', docs: 'https://firebase.google.com/docs/cloud-messaging/send-message',
    fields: [f('projectId', 'Firebase project ID', 'text'), f('serviceAccount', 'Service account key (the JSON file’s contents)', 'secret')] },
  // Payments
  { key: 'razorpay', name: 'Razorpay', capabilities: ['payments'], testAction: 'Creates a ₹1 payment link in the account and cancels it.', docs: 'https://razorpay.com/docs/api/payments/payment-links/',
    fields: [f('keyId', 'Key ID', 'text', { placeholder: 'rzp_test_…' }), f('keySecret', 'Key secret', 'secret'), f('webhookSecret', 'Webhook secret', 'secret')],
    webhooks: { events: 'payment_link.paid, payment.failed, refund.processed', verifies: 'X-Razorpay-Signature with the webhook secret' } },
  { key: 'cashfree', name: 'Cashfree', capabilities: ['payments'], testAction: 'Creates a ₹1 payment link in the account and cancels it.', docs: 'https://docs.cashfree.com/reference/pgcreatelink',
    fields: [f('appId', 'App ID', 'text'), f('secretKey', 'Secret key', 'secret'), f('environment', 'Environment', 'select', { options: [['sandbox', 'Test'], ['production', 'Live']] })],
    webhooks: { events: 'PAYMENT_LINK_EVENT, REFUND_STATUS_WEBHOOK', verifies: 'x-webhook-signature with the secret key' } },
  // File storage
  { key: 's3', name: 'S3-compatible storage', capabilities: ['storage'], testAction: 'Writes, reads and deletes a small file in the bucket.', docs: 'https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html',
    fields: [opt(f('endpoint', 'Endpoint (blank for AWS)', 'url', { placeholder: 'https://<account>.r2.cloudflarestorage.com' })), f('region', 'Region', 'text', { placeholder: 'ap-south-1' }), f('bucket', 'Bucket', 'text'),
      f('accessKeyId', 'Access key ID', 'text'), f('secretAccessKey', 'Secret access key', 'secret'), f('pathStyle', 'Path-style addresses (MinIO, some providers)', 'bool')] },
  // Maps
  { key: 'google-maps', name: 'Google Maps', capabilities: ['maps'], testAction: 'Asks for the travel time between two points in Pune.', docs: 'https://developers.google.com/maps/documentation/distance-matrix',
    fields: [f('apiKey', 'API key', 'secret')] },
  { key: 'mapbox', name: 'Mapbox', capabilities: ['maps'], testAction: 'Asks for the travel time between two points in Pune.', docs: 'https://docs.mapbox.com/api/navigation/directions/',
    fields: [f('accessToken', 'Access token', 'secret')] },
  // Anything over plain HTTP
  { key: 'custom-http', name: 'Custom HTTP', capabilities: ['sms', 'whatsapp', 'email'], testAction: 'Sends a test message through the request you set up.', docs: '',
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
    fields: [f('url', 'Address', 'url'), f('secret', 'Signing secret', 'secret', { help: 'Each event carries X-Gradeon-Signature: sha256 of the body with this secret.' })] },
];

// What a message costs, for billing and the console's totals: set on every paid messaging connection.
for (const p of INTEGRATION_PROVIDERS) {
  if (p.key !== 'sandbox' && p.capabilities.some((c) => c === 'sms' || c === 'whatsapp' || c === 'email')) {
    p.fields.push(opt(f('costPaise', 'Cost per message or SMS part (paise)', 'number', { placeholder: '18' })));
  }
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
