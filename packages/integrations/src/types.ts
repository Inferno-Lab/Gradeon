import type { Capability, DeliveryStatus } from '@gradeon/contracts';

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

/** What an adapter is given for one call: the connection's settings and secrets, the route's settings, and where it runs. */
export interface Ctx {
  connectionId: string;
  settings: Record<string, unknown>;
  secrets: Record<string, string>;
  /** Sender ID, from-address, bucket prefix: set on the route, they win over the connection's settings. */
  route: Record<string, unknown>;
  /** The registry database (the sandbox keeps its inbox and files there). */
  pool: Q;
  schoolSlug: string;
  /** The server's public address, for webhook and sandbox links. */
  baseUrl: string;
  /** Signs sandbox links (the platform's SECRETS_KEY). */
  signKey: string;
}

/** A message to send. `text` is already filled in; `vars` are for providers that fill an approved template themselves. */
export interface OutMessage {
  to: string;
  text: string;
  subject?: string;
  html?: string;
  messageKey?: string;
  templateId?: string;
  dltTemplateId?: string;
  language?: string;
  vars: Record<string, string>;
}

export interface SendResult {
  providerId: string | null;
  segments?: number;
  /** The provider already knows it arrived (the sandbox, some email APIs): otherwise a delivery report says so later. */
  delivered?: boolean;
}

export interface PushMessage { tokens: string[]; title: string; body: string; data: Record<string, string> }
export interface PushResult { sent: number; failedTokens: string[] }

/** One payment-link the family opens in a browser: no SDK in the app. */
export interface LinkInput { amountPaise: number; reference: string; description: string; customer: { name: string; phone?: string; email?: string }; callbackUrl: string; expiresAt?: Date }
export interface PaymentEvent { kind: 'paid' | 'failed' | 'refunded'; reference: string; providerPaymentId: string; amountPaise: number; method?: string; refundId?: string }
export interface PaymentsAdapter {
  createLink(c: Ctx, input: LinkInput): Promise<{ linkId: string; url: string }>;
  refund(c: Ctx, providerPaymentId: string, amountPaise: number, note: string): Promise<{ refundId: string }>;
  /** What the provider settled to the school for these days: for the daily reconciliation. */
  settlements?(c: Ctx, from: Date, to: Date): Promise<{ providerPaymentId: string; amountPaise: number }[]>;
}

export interface StorageAdapter {
  /** A short-lived address the client uploads to directly. */
  presignPut(c: Ctx, key: string, mime: string, maxBytes: number): Promise<{ url: string; method: 'PUT'; headers: Record<string, string> }>;
  presignGet(c: Ctx, key: string, seconds: number, filename?: string): Promise<string>;
  put(c: Ctx, key: string, body: Buffer, mime: string): Promise<void>;
  get(c: Ctx, key: string): Promise<Buffer>;
  remove(c: Ctx, key: string): Promise<void>;
  usage(c: Ctx, prefix: string): Promise<number>;
}

export interface MapsAdapter {
  eta(c: Ctx, from: [number, number], to: [number, number]): Promise<{ minutes: number; meters: number }>;
  staticMap(c: Ctx, points: [number, number][]): Promise<string | null>;
}

export interface InboundRequest { headers: Record<string, string | string[] | undefined>; raw: Buffer; query: Record<string, string> }
export interface InboundResult {
  ok: boolean;
  summary: string;
  deliveries?: { providerId: string; status: DeliveryStatus; error?: string }[];
  payments?: PaymentEvent[];
  /** Some providers want a particular answer (Meta's verify challenge). */
  reply?: { status: number; body: string };
}

/** A school's own database made on a cell's server or service. */
export interface DatabasesAdapter {
  create(c: Ctx, name: string, password: string): Promise<{ url: string; dbName: string }>;
  drop(c: Ctx, dbName: string): Promise<void>;
}
/** A school's own address at the host: added, then verified by its DNS record and given a certificate. */
export interface HostingAdapter {
  addDomain(c: Ctx, domain: string): Promise<DomainState>;
  domain(c: Ctx, domain: string): Promise<DomainState>;
  removeDomain(c: Ctx, domain: string): Promise<void>;
}
export interface DomainState { verified: boolean; certificate: 'issued' | 'waiting'; target: string }
export interface BuildsAdapter {
  dispatch(c: Ctx, inputs: Record<string, string>): Promise<void>;
  commit(c: Ctx, path: string, content: string, message: string): Promise<void>;
}
export interface TrackingAdapter { positions(c: Ctx): Promise<{ vehicle: string; lat: number; lng: number; at: Date }[]> }
/** A template as the provider lists it, for importing into the console's Templates. */
export interface ProviderTemplate { id: string; name: string; language: string; text: string; status: string }

/** One provider: the capabilities it implements, a test, and how it reads its webhooks. */
export interface Adapter {
  sms?(c: Ctx, m: OutMessage): Promise<SendResult>;
  whatsapp?(c: Ctx, m: OutMessage): Promise<SendResult>;
  email?(c: Ctx, m: OutMessage): Promise<SendResult>;
  push?(c: Ctx, m: PushMessage): Promise<PushResult>;
  webhook?(c: Ctx, event: { type: string; school: string; at: string; data: Record<string, unknown> }): Promise<SendResult>;
  payments?: PaymentsAdapter;
  storage?: StorageAdapter;
  maps?: MapsAdapter;
  alert?(c: Ctx, a: { title: string; text: string }): Promise<void>;
  scan?(c: Ctx, data: Buffer): Promise<{ clean: boolean; found: string | null }>;
  builds?: BuildsAdapter;
  databases?: DatabasesAdapter;
  hosting?: HostingAdapter;
  tracking?: TrackingAdapter;
  /** The provider's approved message templates, for importing (WhatsApp providers that can list them). */
  templates?(c: Ctx): Promise<ProviderTemplate[]>;
  test(c: Ctx, input: { to?: string }): Promise<{ ok: boolean; detail: string }>;
  inbound?(c: Ctx, req: InboundRequest): Promise<InboundResult>;
}

export type MessageCapability = Extract<Capability, 'sms' | 'whatsapp' | 'email'>;

/** SMS parts: 160 GSM characters (153 when split), 70 for anything outside GSM (67 when split). */
export function segments(text: string): number {
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅå_ÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
  const [one, part] = gsm ? [160, 153] : [70, 67];
  return text.length <= one ? 1 : Math.ceil(text.length / part);
}

/** Fills {name} and {vars.name} placeholders; `json` escapes values so they can sit inside a JSON body. */
export function fill(template: string, values: Record<string, string>, json = false): string {
  return template.replace(/\{([\w.]+)\}/g, (all, k: string) => {
    const v = values[k] ?? values[k.replace(/^vars\./, '')];
    if (v === undefined) return all;
    return json ? JSON.stringify(v).slice(1, -1) : v;
  });
}

/** A value at a dotted path in a JSON reply ("data.id", "messages.0.id"). */
export function at(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Digits only, with India's 91 in front of a ten-digit number. */
export function e164(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

export class ProviderError extends Error {
  constructor(message: string, readonly permanent = false) {
    super(message);
    this.name = 'ProviderError';
  }
}
