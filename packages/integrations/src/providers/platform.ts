import { createSign } from 'node:crypto';
import { connect } from 'node:net';
import pg from 'pg';
import { call } from '../http.js';
import { ProviderError, at, fill, type Adapter, type Ctx } from '../types.js';
import { fileText, googleToken } from './fcm.js';

// The services the console itself runs on: alerts to the team, virus scanning, app builds and stores, databases, hosting, bus trackers.

const fail = (e: unknown) => ({ ok: false, detail: (e as Error).message });

// ── Alerts ─────────────────────────────────────────────────────────────────────

/** Slack and Discord incoming webhooks take the same JSON (each reads its own field). */
const chatHook: Adapter = {
  async alert(c, a) {
    await call(c.secrets.url!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${a.title}*\n${a.text}`, content: `**${a.title}**\n${a.text}` }) });
  },
  async test(c) {
    try {
      await chatHook.alert!(c, { title: 'Test from the Gradeon console', text: 'Alerts reach this channel.' });
      return { ok: true, detail: 'The channel accepted the test alert.' };
    } catch (e) { return fail(e); }
  },
};
export const slack = chatHook;
export const discord = chatHook;

/** Alerts by email go out through the platform's live email connection (the Hub passes it in as `c.route.send`). */
export const emailAlerts: Adapter = {
  async alert(c, a) {
    const send = c.route.sendEmail as ((to: string, subject: string, text: string) => Promise<void>) | undefined;
    if (!send) throw new ProviderError('There is no live email connection to send alerts through. Set one up first.', true);
    for (const to of String(c.settings.to).split(',').map((x) => x.trim()).filter(Boolean)) await send(to, `Gradeon alert: ${a.title}`, a.text);
  },
  async test(c) {
    try {
      await emailAlerts.alert!(c, { title: 'Test from the Gradeon console', text: 'Alerts reach this address.' });
      return { ok: true, detail: `Sent to ${String(c.settings.to)}.` };
    } catch (e) { return fail(e); }
  },
};

// ── Virus scanning ─────────────────────────────────────────────────────────────

/** ClamAV's INSTREAM over TCP: "stream: OK", or the name of what it found. */
function clamScan(host: string, port: number, data: Buffer): Promise<{ clean: boolean; found: string | null }> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port, timeout: 30_000 });
    let reply = '';
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += 64 * 1024) {
        const chunk = data.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(Buffer.concat([len, chunk]));
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => { reply += d.toString('utf8'); });
    sock.on('end', () => {
      const line = reply.replace(/\0/g, '').trim();
      if (/OK$/.test(line)) resolve({ clean: true, found: null });
      else if (/FOUND$/.test(line)) resolve({ clean: false, found: line.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, '') });
      else reject(new ProviderError(`ClamAV answered “${line || 'nothing'}”.`));
    });
    sock.on('timeout', () => { sock.destroy(); reject(new ProviderError('ClamAV did not answer within 30 seconds.')); });
    sock.on('error', (e) => reject(new ProviderError(`Could not reach ClamAV: ${e.message}`)));
  });
}

// The standard anti-virus test string: harmless, and every scanner flags it.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export const clamav: Adapter = {
  scan: (c, data) => clamScan(String(c.settings.host), Number(c.settings.port ?? 3310), data),
  async test(c) {
    try {
      const r = await clamScan(String(c.settings.host), Number(c.settings.port ?? 3310), Buffer.from(EICAR));
      return r.clean ? { ok: false, detail: 'ClamAV answered but did not flag the test file: its signatures may be missing.' } : { ok: true, detail: `ClamAV flagged the test file (${r.found}).` };
    } catch (e) { return fail(e); }
  },
};

// ── App builds ─────────────────────────────────────────────────────────────────

const gh = (c: Ctx) => ({ authorization: `Bearer ${c.secrets.token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'gradeon-console' });

export const github: Adapter = {
  builds: {
    async dispatch(c, inputs) {
      await call(`https://api.github.com/repos/${String(c.settings.repo)}/actions/workflows/mobile-build.yml/dispatches`, {
        method: 'POST', headers: gh(c), body: JSON.stringify({ ref: String(c.settings.branch || 'main'), inputs }), retries: 0,
      });
    },
    async commit(c, path, content, message) {
      const api = `https://api.github.com/repos/${String(c.settings.repo)}/contents/${path}`;
      const branch = String(c.settings.branch || 'main');
      let sha: string | undefined;
      try { sha = (await call(`${api}?ref=${branch}`, { headers: gh(c), retries: 0 })).json?.sha; } catch (e) { if (!(e instanceof ProviderError && e.message.startsWith('404'))) throw e; }
      await call(api, { method: 'PUT', headers: gh(c), body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch, ...(sha ? { sha } : {}) }) });
    },
  },
  async test(c) {
    try {
      await call(`https://api.github.com/repos/${String(c.settings.repo)}/actions/workflows/mobile-build.yml`, { headers: gh(c), retries: 0 });
      return { ok: true, detail: `The token sees ${String(c.settings.repo)} and its mobile build workflow.` };
    } catch (e) { return fail(e); }
  },
};

// ── App stores ─────────────────────────────────────────────────────────────────

/** A JKS/PKCS12 keystore cannot be opened without Java; the test checks the file is a keystore and that the passwords are set. */
const looksLikeKeystore = (b: Buffer) => b.length > 32 && (b.readUInt32BE(0) === 0xfeedfeed || b[0] === 0x30);

export const googlePlay: Adapter = {
  async test(c) {
    try {
      await googleToken(c, 'serviceAccount', 'https://www.googleapis.com/auth/androidpublisher');
      const ks = Buffer.from(c.secrets.keystore ?? '', 'base64');
      if (!looksLikeKeystore(ks)) return { ok: false, detail: 'Google accepted the service account, but the upload keystore is not a .jks or .p12 file.' };
      if (!c.secrets.keystorePassword || !c.secrets.keyPassword) return { ok: false, detail: 'Google accepted the service account; the keystore passwords are missing.' };
      return { ok: true, detail: `Google accepted the service account; builds will be signed with the “${String(c.settings.keyAlias)}” key and sent to the ${String(c.settings.track)} track.` };
    } catch (e) { return fail(e); }
  },
};

/** An App Store Connect API token: an ES256 JWT signed with the .p8 key, valid twenty minutes. */
export function appStoreToken(c: Ctx): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: String(c.settings.keyId), typ: 'JWT' })}.${b64({ iss: String(c.settings.issuerId), iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`;
  const sig = createSign('SHA256').update(unsigned).sign({ key: fileText(c, 'privateKey'), dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${unsigned}.${sig}`;
}

export const appStore: Adapter = {
  async test(c) {
    try {
      const r = await call('https://api.appstoreconnect.apple.com/v1/apps?limit=200', { headers: { authorization: `Bearer ${appStoreToken(c)}` }, retries: 0 });
      return { ok: true, detail: `App Store Connect answered: ${(r.json?.data ?? []).length} apps visible to this key.` };
    } catch (e) { return fail(e); }
  },
};

// ── School databases ───────────────────────────────────────────────────────────

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A PostgreSQL server where each school gets its own database and login role. */
export const postgresServer: Adapter = {
  databases: {
    async create(c, name, password) {
      const admin = new pg.Client({ connectionString: c.secrets.adminUrl });
      await admin.connect();
      try {
        const role = `${name}_app`;
        if (!(await admin.query('select 1 from pg_roles where rolname = $1', [role])).rowCount) await admin.query(`create role ${ident(role)} login password ${lit(password)}`);
        else await admin.query(`alter role ${ident(role)} password ${lit(password)}`);
        if (!(await admin.query('select 1 from pg_database where datname = $1', [name])).rowCount) await admin.query(`create database ${ident(name)} owner ${ident(role)}`);
        await admin.query(`revoke connect on database ${ident(name)} from public`);
        const u = new URL(c.secrets.adminUrl!);
        u.username = role;
        u.password = password;
        u.pathname = `/${name}`;
        return { url: u.toString(), dbName: name };
      } finally { await admin.end(); }
    },
    async drop(c, name) {
      const admin = new pg.Client({ connectionString: c.secrets.adminUrl });
      await admin.connect();
      try {
        await admin.query(`drop database if exists ${ident(name)} with (force)`);
        await admin.query(`drop role if exists ${ident(`${name}_app`)}`);
      } finally { await admin.end(); }
    },
  },
  async test(c) {
    const admin = new pg.Client({ connectionString: c.secrets.adminUrl, connectionTimeoutMillis: 10_000 });
    try {
      await admin.connect();
      const r = await admin.query<{ ok: boolean }>('select rolcreatedb and rolcreaterole as ok from pg_roles where rolname = current_user');
      return r.rows[0]?.ok ? { ok: true, detail: 'Connected; this role may create databases and roles.' } : { ok: false, detail: 'Connected, but this role cannot create databases and roles (needs CREATEDB and CREATEROLE).' };
    } catch (e) { return fail(e); } finally { await admin.end().catch(() => undefined); }
  },
};

const neonHeaders = (c: Ctx) => ({ authorization: `Bearer ${c.secrets.apiKey}`, 'content-type': 'application/json', accept: 'application/json' });

/** Neon: each school gets a project of its own. */
export const neon: Adapter = {
  databases: {
    async create(c, name) {
      const r = await call('https://console.neon.tech/api/v2/projects', { method: 'POST', headers: neonHeaders(c), retries: 0, body: JSON.stringify({ project: { name: `gradeon-${name}`, region_id: String(c.settings.region) } }) });
      const uri = r.json?.connection_uris?.[0]?.connection_uri as string | undefined;
      if (!uri) throw new ProviderError('Neon made the project but gave no connection address.');
      return { url: uri, dbName: `neon:${r.json.project.id}` };
    },
    async drop(c, dbName) {
      await call(`https://console.neon.tech/api/v2/projects/${dbName.replace(/^neon:/, '')}`, { method: 'DELETE', headers: neonHeaders(c), retries: 0 });
    },
  },
  async test(c) {
    try {
      const r = await call('https://console.neon.tech/api/v2/projects?limit=100', { headers: neonHeaders(c), retries: 0 });
      return { ok: true, detail: `Neon answered: ${(r.json?.projects ?? []).length} projects.` };
    } catch (e) { return fail(e); }
  },
};

// ── Hosting and domains ────────────────────────────────────────────────────────

const renderHeaders = (c: Ctx) => ({ authorization: `Bearer ${c.secrets.apiKey}`, accept: 'application/json', 'content-type': 'application/json' });

export const render: Adapter = {
  hosting: {
    async addDomain(c, domain) {
      try {
        await call(`https://api.render.com/v1/services/${String(c.settings.serviceId)}/custom-domains`, { method: 'POST', headers: renderHeaders(c), retries: 0, body: JSON.stringify({ name: domain }) });
      } catch (e) {
        if (!(e instanceof ProviderError && /already/i.test(e.message))) throw e;
      }
      return render.hosting!.domain(c, domain);
    },
    async domain(c, domain) {
      const r = await call(`https://api.render.com/v1/services/${String(c.settings.serviceId)}/custom-domains/${encodeURIComponent(domain)}`, { headers: renderHeaders(c), retries: 0 });
      const verified = r.json?.verificationStatus === 'verified';
      return { verified, certificate: verified ? 'issued' : 'waiting', target: `${String(r.json?.server?.name ?? '')}.onrender.com` };
    },
    async removeDomain(c, domain) {
      await call(`https://api.render.com/v1/services/${String(c.settings.serviceId)}/custom-domains/${encodeURIComponent(domain)}`, { method: 'DELETE', headers: renderHeaders(c), retries: 0 });
    },
  },
  async test(c) {
    try {
      const r = await call(`https://api.render.com/v1/services/${String(c.settings.serviceId)}/custom-domains?limit=100`, { headers: renderHeaders(c), retries: 0 });
      return { ok: true, detail: `Render answered: ${(r.json ?? []).length} custom domains on the service.` };
    } catch (e) { return fail(e); }
  },
};

// ── Bus trackers ───────────────────────────────────────────────────────────────

/** A tracker company's API, described in the console: where the list is, and where each vehicle's number and position are. */
export const gpsHttp: Adapter = {
  tracking: {
    async positions(c) {
      const values: Record<string, string> = Object.fromEntries(Object.entries(c.secrets).map(([k, v]) => [`secret.${k}`, v]));
      let headers: Record<string, string> = {};
      try { headers = typeof c.settings.headers === 'string' && c.settings.headers ? JSON.parse(String(c.settings.headers)) : {}; } catch { throw new ProviderError('The headers are not valid JSON.', true); }
      const r = await call(String(c.settings.url), { headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, fill(String(v), values)])) });
      const list = at(r.json, String(c.settings.listPath));
      if (!Array.isArray(list)) throw new ProviderError(`Nothing at “${String(c.settings.listPath)}” in the reply is a list.`, true);
      return list.map((v) => ({
        vehicle: String(at(v, String(c.settings.vehiclePath)) ?? ''), lat: Number(at(v, String(c.settings.latPath))), lng: Number(at(v, String(c.settings.lngPath))),
        at: c.settings.atPath ? new Date(String(at(v, String(c.settings.atPath)))) : new Date(),
      })).filter((p) => p.vehicle && Number.isFinite(p.lat) && Number.isFinite(p.lng));
    },
  },
  async test(c) {
    try {
      const got = await gpsHttp.tracking!.positions(c);
      return got.length ? { ok: true, detail: `Read ${got.length} vehicles, for example ${got[0]!.vehicle} at ${got[0]!.lat.toFixed(4)}, ${got[0]!.lng.toFixed(4)}.` } : { ok: false, detail: 'The address answered, but no vehicle had a number and a position at the paths given.' };
    } catch (e) { return fail(e); }
  },
};
