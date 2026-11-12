import { useQuery } from '@tanstack/react-query';
import type { PublicStatus } from '@gradeon/contracts';
import { Illustration, useTheme } from '@gradeon/web-ui';

const TEXT = { ok: 'Everything is working', degraded: 'Some things are slow', down: 'Something is down' } as const;
const TONE = { ok: 'g', degraded: 'a', down: 'c' } as const;
const WORD = { ok: 'Working', degraded: 'Slow', down: 'Down' } as const;

/** What anyone can open to see whether Gradeon is up: no sign-in, no school data, just names and states. */
export function StatusBoard() {
  const theme = useTheme();
  const q = useQuery({
    queryKey: ['public-status'],
    queryFn: async () => { const r = await fetch('/console/v1/public/status'); if (!r.ok) throw new Error('The status could not be read.'); return (await r.json()) as PublicStatus; },
    refetchInterval: 30_000,
  });
  const s = q.data;
  return (
    <div className={`nest ${theme.cls}`} style={{ minHeight: '100dvh', padding: 12 }}>
      <main className="fr" style={{ maxWidth: 820, margin: '0 auto', padding: '32px 32px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header>
          <div className="lbl">Gradeon status</div>
          <h1 className="fd" style={{ margin: '6px 0 4px', font: '700 semi-expanded 30px/1.1 var(--fd)', letterSpacing: '-.035em' }}>{s ? TEXT[s.state] : q.isError ? 'We could not check' : 'Checking…'}</h1>
          <p style={{ margin: 0, color: 'var(--ink3)', font: '600 14px var(--fb)' }}>{s ? `Updated ${new Date(s.updatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. This page refreshes by itself.` : q.isError ? 'Try again in a minute.' : ' '}</p>
        </header>
        {!s && !q.isError && <div className="skc" style={{ height: 220, borderRadius: 24 }} />}
        {s && (
          <>
            <section className="card">
              <div className="ch"><h2>Schools</h2><span className={`chip ${TONE[s.state]}`}>{s.schools.length}</span></div>
              <div className="lscroll" style={{ maxHeight: 360, marginTop: 8 }}>
                {s.schools.length === 0 && <div className="help">No schools are set up yet.</div>}
                {s.schools.map((x) => <div className="kv" key={x.name}><span>{x.name}</span><b><span className={`st ${TONE[x.state]}`}><i></i>{WORD[x.state]}</span></b></div>)}
              </div>
            </section>
            <section className="card">
              <div className="ch"><h2>Recent incidents</h2></div>
              {s.incidents.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><div style={{ width: 90, flex: 'none' }}><Illustration scene="checklist" /></div><div className="help">Nothing in the last 7 days.</div></div>
              ) : s.incidents.map((i) => <div className="kv" key={i.id}><span>{i.title}<br /><small style={{ color: 'var(--ink3)' }}>{new Date(i.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></span><b><span className={`st ${i.open ? 'c' : 'g'}`}><i></i>{i.open ? 'Open' : 'Resolved'}</span></b></div>)}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
