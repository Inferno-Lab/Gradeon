import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@gradeon/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorSink } from './error-reports.js';

const BY_STATUS: Record<number, ErrorCode> = {
  400: 'validation', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 423: 'locked', 429: 'rate_limited', 503: 'school_unavailable',
};

/** Every failure leaves the server in one shape, and nothing internal is ever sent to a client. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Api');

  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const req = http.getRequest<FastifyRequest>();
    let status = 500;
    let body: ApiErrorBody = { code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' };
    if (err instanceof HttpException) {
      status = err.getStatus();
      const res = err.getResponse();
      if (typeof res === 'object' && res && 'code' in res && 'message' in res) body = res as ApiErrorBody;
      else body = { code: BY_STATUS[status] ?? 'internal', message: status === 404 ? 'That was not found.' : typeof res === 'string' ? res : err.message };
    } else if (typeof err === 'object' && err && (err as { statusCode?: number }).statusCode === 429) {
      // The rate limiter throws its reply as a plain object, not an Error.
      status = 429;
      body = { code: 'rate_limited', message: 'Too many tries from this device. Wait a moment and try again.' };
    } else if (err instanceof Error && err.name === 'ImportError') {
      // The import engine's own words about a file or a batch (by name: nest-kit does not depend on the database package).
      status = 400;
      body = { code: 'validation', message: err.message };
    } else {
      const school = req.headers['x-school'];
      // One structured line per failure: which school and which request, so a report from a school finds its log line.
      this.log.error({ msg: err instanceof Error ? err.message : String(err), school: typeof school === 'string' ? school : null, requestId: req.id, method: req.method, url: req.url.split('?')[0], stack: err instanceof Error ? err.stack : undefined });
      errorSink.report?.({
        source: req.url.startsWith('/console/') ? 'console-api' : 'api', schoolSlug: typeof school === 'string' ? school : null,
        message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null, url: `${req.method} ${req.url.split('?')[0]}`,
      });
    }
    body.requestId = req.id;
    if (body.retryAfter) void reply.header('retry-after', String(body.retryAfter));
    void reply.status(status).send(body);
  }
}
