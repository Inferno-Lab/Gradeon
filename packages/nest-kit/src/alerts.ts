import { Logger } from '@nestjs/common';

const log = new Logger('Alert');

/** Where the team hears about trouble: a Slack or Discord incoming webhook (ALERT_WEBHOOK_URL). Without one, alerts only reach the log. */
export const alerts: { url?: string } = {};

export function alert(text: string): void {
  log.warn(text);
  if (!alerts.url) return;
  void fetch(alerts.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(10_000) })
    .catch((err: Error) => log.error(`could not send the alert: ${err.message}`));
}
