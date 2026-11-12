import { Logger } from '@nestjs/common';

const log = new Logger('Alert');

/**
 * Where the team hears about trouble: the "Alerts to the Gradeon team" connection in the console (Slack, Discord or email,
 * through the Integrations Hub). Each server sets `send` at start-up; until a connection is set up, alerts reach the log only.
 */
export const alerts: { send?: (title: string, text: string) => Promise<boolean> } = {};

export function alert(text: string): void {
  log.warn(text);
  if (!alerts.send) return;
  const title = text.split(/[:.]/)[0]!.slice(0, 80);
  void alerts.send(title, text).catch((err: Error) => log.error(`could not send the alert: ${err.message}`));
}
