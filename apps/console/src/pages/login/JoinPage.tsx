import { useState } from 'react';
import { HttpError } from '@gradeon/api-client';
import { Field, useShake } from '@gradeon/web-ui';
import { makeClient } from '../../app/client';

const client = makeClient(() => undefined);
import { url } from '../../app/base';

/** The invitation link: the new team member chooses their password, then signs in and adds an authenticator. */
export function JoinPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [f, setF] = useState({ password: '', again: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const shake = useShake();
  const go = async () => {
    const p: Record<string, string> = {};
    if (f.password.length < 10) p.password = 'Use at least 10 characters.';
    else if (f.password !== f.again) p.again = 'The two do not match.';
    setErr(p);
    if (Object.keys(p).length) { shake.hit(); return; }
    setBusy(true);
    try { const r = await client.api.join({ token, password: f.password }); setDone(r.email); }
    catch (e) { setErr(e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message }); shake.hit(); }
    finally { setBusy(false); }
  };
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 16, display: 'grid', placeItems: 'center', background: 'var(--hero-fill)' }}>
      <div className={`card ${shake.cls}`} style={{ maxWidth: 440, width: '100%', padding: 32, borderRadius: 28 }}>
        <div className="ch"><h2>{done ? 'Your password is set' : 'Join the Gradeon console'}</h2></div>
        {done ? (
          <>
            <p>Sign in with {done} and your new password. The first time, the console shows a code to add to your authenticator app.</p>
            <a className="btn pri" href={url('/login')}>Sign in</a>
          </>
        ) : !token ? <p>This link is incomplete. Open the whole link from your invitation email, or ask for a new one.</p> : (
          <div className="stack">
            <Field label="Choose a password" type="password" value={f.password} onChange={(password) => { setF({ ...f, password }); setErr({}); }} error={err.password} autoComplete="new-password" hint="At least 10 characters." />
            <Field label="The same password again" type="password" value={f.again} onChange={(again) => { setF({ ...f, again }); setErr({}); }} error={err.again} autoComplete="new-password" />
            {err._ && <div className="emsg" role="alert">{err._}</div>}
            <button className="btn pri" disabled={busy} onClick={() => void go()}>{busy ? 'Saving…' : 'Set my password'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
