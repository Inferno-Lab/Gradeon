/** Sends what broke in this tab to Gradeon's error list: uncaught errors, failed promises, and route render errors (pass them to `report`). */
export function reportErrors(endpoint: string, source: 'admin' | 'console', headers: () => Record<string, string> = () => ({}), release = ''): (err: unknown) => void {
  const seen = new Set<string>();
  const report = (err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err));
    // Once per message per tab, and never a flood from one broken page.
    if (seen.has(e.message) || seen.size >= 20) return;
    seen.add(e.message);
    void fetch(endpoint, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', ...headers() },
      body: JSON.stringify({ source, message: e.message.slice(0, 500) || 'Unknown error', stack: e.stack?.slice(0, 4000), url: location.pathname.slice(0, 300), release: release.slice(0, 40) || undefined }),
    }).catch(() => undefined);
  };
  addEventListener('error', (ev) => report(ev.error ?? ev.message));
  addEventListener('unhandledrejection', (ev) => report(ev.reason));
  return report;
}
