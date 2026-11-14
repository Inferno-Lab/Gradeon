import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { dashboardPieces } from '@tangent/config-engine';
import { Field, useShake, useTheme, useToast } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { problem } from '../../app/kit';
import { useShellChrome } from '../../app/Layout';
import { Card, Page } from '../../app/Page';

/** The signed-in person's own account: who they are here, their password, where they are signed in, and the shortcuts. */
export function AccountPage() {
  const app = useApp();
  const { shell } = useShellChrome();
  const theme = useTheme();
  const { toast, say } = useToast();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const change = useMutation({
    mutationFn: () => app.api.changePassword({ current: f.current, next: f.next }),
    onSuccess: () => { setF({ current: '', next: '', again: '' }); say('Password changed. Every other device was signed out.'); },
    onError: (e) => { setErr(problem(e)); shake.hit(); },
  });
  const everywhere = useMutation({ mutationFn: app.api.logoutAll, onSuccess: app.signOut, onError: (e) => say((e as Error).message, 'bad') });
  const go = () => {
    if (f.next !== f.again) { setErr({ again: 'The two new passwords are not the same.' }); shake.hit(); return; }
    change.mutate();
  };
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setErr({}); };
  const pages = (shell?.menu ?? []).flatMap((g) => g.pages);
  const news = dashboardPieces({ modules: shell?.modules ?? [], features: shell?.features ?? [] }, app.user.permissions).filter((p) => p.kind === 'new' && p.keys);
  return (
    <Page title="My account" sub={app.user.name} toast={toast}>
      <section className="grid" data-even="">
        <Card span="s6" title="You at the school">
          <div className="kv"><span>Name</span><b>{app.user.name}</b></div>
          <div className="kv"><span>Signs in with</span><b>{app.user.email || app.user.phone || '–'}</b></div>
          <div className="kv" style={{ alignItems: 'flex-start' }}><span>{app.user.roleNames.length === 1 ? 'Role' : 'Roles'}</span><b style={{ textAlign: 'right' }}>{app.user.roleNames.join(' · ') || 'Staff'}</b></div>
          <p className="help" style={{ marginBottom: 0 }}>The office changes your name, email and phone under Staff. Roles are set up by Tangent.</p>
          <div className="tgrow" style={{ marginTop: 12 }}>
            <button className="btn" onClick={theme.toggle}>{theme.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}</button>
            <button className="btn" disabled={everywhere.isPending} onClick={() => everywhere.mutate()}>Sign out on every device</button>
          </div>
        </Card>
        <Card span="s6" title="Password">
          <div className={`stack ${shake.cls}`}>
            <Field label="Current password" type="password" value={f.current} onChange={set('current')} error={err.current} />
            <Field label="New password" type="password" value={f.next} onChange={set('next')} error={err.next} hint="At least 8 characters." />
            <Field label="New password again" type="password" value={f.again} onChange={set('again')} error={err.again} />
            {err._ && <div className="emsg" role="alert">{err._}</div>}
            <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
              <button className="btn pri" disabled={change.isPending || !f.current || !f.next} onClick={go}>{change.isPending ? 'Changing…' : 'Change password'}</button>
            </div>
          </div>
        </Card>
        <Card span="s12" title="Keyboard shortcuts">
          <div className="kv"><span>Search anything</span><b>Ctrl K or /</b></div>
          {pages.map((p) => <div key={p.id} className="kv"><span>Go to {p.label}</span><b>{p.keys}</b></div>)}
          {news.map((n) => <div key={n.key} className="kv"><span>{n.label}</span><b>{n.keys}</b></div>)}
        </Card>
      </section>
    </Page>
  );
}
