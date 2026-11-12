import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CSRF_HEADER } from './cookies.js';

/** Routes that take a school's files (a whole student list, a year of attendance as CSV): everything else keeps the small limit. */
const BIG_BODIES = /^\/v1\/(students\/import|moving-in\/uploads)$|^\/console\/v1\/schools\/:id\/(import\/(preview|commit)|logo)$|^\/hooks\/sandbox-storage\/:token$/;

export interface HttpEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  CORS_ORIGINS: string;
}

const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  connectSrc: ["'self'"],
  fontSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

/** Cookies, security headers, CORS, and a process-wide rate limit. Call once per Fastify instance. */
export async function registerHttp(app: NestFastifyApplication, env: HttpEnv): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(cookie as never);
  await fastify.register(helmet as never, {
    contentSecurityPolicy: { directives: CSP },
    hsts: { maxAge: 15_552_000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false,
  });
  fastify.addHook('onRequest', async (_req, reply) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });
  const listed = env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await fastify.register(cors as never, {
    origin: listed,
    credentials: env.CORS_ORIGINS !== '*',
    allowedHeaders: ['content-type', 'authorization', 'x-school', CSRF_HEADER],
    exposedHeaders: ['content-disposition', 'retry-after'],
    maxAge: 86400,
  });
  await fastify.register(rateLimit as never, {
    global: true,
    // Local runs load every page at four widths from one machine; the limit guards real servers.
    max: env.NODE_ENV === 'production' ? 300 : 10_000,
    timeWindow: '1 minute',
    skip: (req: { url: string }) => req.url.startsWith('/health') || req.url.startsWith('/metrics'),
    errorResponseBuilder: () => ({ statusCode: 429, code: 'rate_limited', message: 'Too many tries from this device. Wait a moment and try again.' }),
  });
  // Files uploaded to the test track's storage arrive as whatever they are (images, PDFs): kept as bytes, never parsed.
  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body));
  fastify.addHook('onRoute', (route: { url?: string; bodyLimit?: number }) => {
    // A school's files: a whole student list or a year of attendance as CSV.
    if (route.url && BIG_BODIES.test(route.url)) route.bodyLimit = 26_000_000;
  });
}
