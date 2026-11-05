import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { Catch, NotFoundException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

const here = path.dirname(fileURLToPath(import.meta.url));
const API_PREFIXES = ['/v1/', '/console/v1/', '/health', '/metrics'];

/**
 * The test track serves the school admin at the root and the console under /console/ from the same process, so there is one address
 * to open and nothing to wire between sites. Each is a single-page app: any other path gets its index.html. Returns what it serves.
 */
export async function serveFrontends(app: NestFastifyApplication): Promise<string[]> {
  const admin = process.env.ADMIN_DIST ?? path.resolve(here, '../../admin/dist');
  const console_ = process.env.CONSOLE_DIST ?? path.resolve(here, '../../console/dist');
  const served: string[] = [];
  const fastify = app.getHttpAdapter().getInstance();
  // @fastify/static 9+ passes Fastify's reply here, not Node's response (the old res.setHeader crashed every page).
  const setHeaders = (reply: { header: (k: string, v: string) => unknown }, file: string) => {
    // Hashed files never change; the page that points at them must be fetched fresh.
    reply.header('cache-control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
  };
  let first = true;
  for (const [root, prefix] of [[console_, '/console/'], [admin, '/']] as const) {
    if (!existsSync(path.join(root, 'index.html'))) continue;
    await fastify.register(fastifyStatic as never, { root, prefix, index: false, wildcard: false, decorateReply: first, setHeaders });
    first = false;
    served.push(prefix);
  }
  if (served.length) app.useGlobalFilters(new SpaFallback(served, { '/console/': console_, '/': admin }));
  return served;
}

/** An address no route knows: a page address gets the app's index.html so its own router can answer, anything else gets the API's plain 404. */
@Catch(NotFoundException)
class SpaFallback implements ExceptionFilter {
  constructor(private readonly served: string[], private readonly roots: Record<string, string>) {}

  catch(_: NotFoundException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<{ method: string; url: string }>();
    const reply = http.getResponse<{ code: (n: number) => { send: (b: unknown) => void }; header: (k: string, v: string) => unknown }>();
    const url = req.url.split('?')[0]!;
    const wantsPage = (req.method === 'GET' || req.method === 'HEAD') && !API_PREFIXES.some((p) => url.startsWith(p)) && !/\.[a-z0-9]{2,5}$/i.test(url);
    const spa = url.startsWith('/console') && this.served.includes('/console/') ? '/console/' : this.served.includes('/') ? '/' : null;
    if (wantsPage && spa) {
      (reply.header('cache-control', 'no-cache') as { sendFile: (f: string, root: string) => unknown }).sendFile('index.html', this.roots[spa]!);
      return;
    }
    reply.code(404).send({ code: 'not_found', message: 'That address does not exist.' });
  }
}
