import { z } from 'zod';

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14');

export const Page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});
export type Page = z.infer<typeof Page>;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Error codes the clients can switch on. The message is always safe to show to a person. */
export const ErrorCode = z.enum([
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'locked',
  'school_unavailable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Field-level problems, keyed by field path. */
  fields?: Record<string, string>;
  /** Sign-in only: how many wrong passwords or codes are left before the account is locked for a while. */
  attemptsLeft?: number;
  /** Seconds to wait before trying again, when rate limited or locked. */
  retryAfter?: number;
  requestId?: string;
}

export const SLUG_RE = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;
export const RESERVED_SLUGS = ['admin', 'console', 'api', 'www', 'app', 'status', 'gradeon', 'test', 'demo-fleet'] as const;
