import type { Adapter } from '../types.js';
import { customHttp, webhook } from './generic.js';
import { resend, ses, smtp } from './email.js';
import { fcm } from './fcm.js';
import { googleMaps, mapbox } from './maps.js';
import { cashfree, razorpay } from './payments.js';
import { s3 } from './s3.js';
import { sandbox } from './sandbox.js';
import { gupshup, kaleyra, msg91, twilio } from './sms.js';
import { gupshupWa, interakt, metaCloud } from './whatsapp.js';
import { appStore, clamav, discord, emailAlerts, github, googlePlay, gpsHttp, neon, postgresServer, render, slack } from './platform.js';

/** Every built adapter by provider key (INTEGRATION_PROVIDERS in contracts lists the same keys with their forms). */
export const ADAPTERS: Record<string, Adapter> = {
  sandbox, msg91, gupshup, twilio, kaleyra, 'meta-cloud': metaCloud, 'gupshup-wa': gupshupWa, interakt, ses, smtp, resend, fcm, razorpay, cashfree, s3,
  'google-maps': googleMaps, mapbox, 'custom-http': customHttp, webhook,
  slack, discord, 'email-alerts': emailAlerts, clamav, github, 'google-play': googlePlay, 'app-store': appStore, 'postgres-server': postgresServer, neon, render, 'gps-http': gpsHttp,
};
