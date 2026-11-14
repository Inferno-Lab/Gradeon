import { HttpException } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@tangent/contracts';

const STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  locked: 423,
  school_unavailable: 503,
  internal: 500,
};

/** An error with a code the clients can switch on and a message that is safe to show a person. */
export class ApiError extends HttpException {
  constructor(code: ErrorCode, message: string, extra: Partial<Omit<ApiErrorBody, 'code' | 'message'>> = {}) {
    super({ code, message, ...extra } satisfies ApiErrorBody, STATUS[code]);
  }
}

export const notFound = (what: string) => new ApiError('not_found', `${what} was not found.`);
export const forbidden = (message = 'You do not have access to this.') => new ApiError('forbidden', message);
export const invalid = (message: string, fields?: Record<string, string>) => new ApiError('validation', message, { fields });
