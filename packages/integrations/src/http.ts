import { ProviderError } from './types.js';

/**
 * Every call to a provider: a 10 second limit, two retries with backoff on network errors and 5xx answers, never on a 4xx
 * (a refusal will not change by asking again). The provider's own words come back in the error.
 */
export async function call(url: string, init: RequestInit & { retries?: number } = {}): Promise<{ status: number; text: string; json: any }> {
  const retries = init.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      if (res.status >= 500 && attempt < retries) { await wait(attempt); continue; }
      if (res.status >= 400) throw new ProviderError(`${res.status}: ${reason(json, text)}`, res.status < 500);
      return { status: res.status, text, json };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (attempt >= retries) throw new ProviderError(`Could not reach the provider: ${(err as Error).message}`);
      await wait(attempt);
    }
  }
}

const wait = (attempt: number) => new Promise((r) => setTimeout(r, 400 * 2 ** attempt));

/** The most useful words in a provider's error reply. */
function reason(json: any, text: string): string {
  const pick = json?.error?.description ?? json?.error?.message ?? json?.message ?? json?.error_description ?? json?.errors?.[0]?.message ?? json?.error;
  return (typeof pick === 'string' ? pick : text || 'no details').slice(0, 300);
}

export const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
export const form = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined) as [string, string][]).toString();
