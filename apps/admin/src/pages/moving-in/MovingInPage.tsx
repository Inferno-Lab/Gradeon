import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IMPORT_KINDS, type LetterRow, type Permission } from '@gradeon/contracts';
import { Field, FilePick, Select } from '@gradeon/web-ui';
import qrcode from 'qrcode-generator';
import { useApp } from '../../app/context';
import { Card, Page, useToast } from '../../app/Page';
import { problem, stamp } from '../../app/kit';
import { TypeRows } from './TypeRows';

const STATUS = { new: { label: 'With Gradeon', tone: 'a' }, imported: { label: 'Imported', tone: 'g' }, set_aside: { label: 'Set aside', tone: '' } } as const;
const save = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** One letter per child, one per page, for the class teacher to hand out. */
function letterPage(school: string, link: string, rows: LetterRow[]): string {
  // The code opens the school's app in the phone's own store (the API's /hooks/app/<school> picks Google Play or the App Store).
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const code = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  const one = (r: LetterRow) => `<section><h1>${esc(school)}</h1><p class="m">For the family of <b>${esc(r.student)}</b> · ${esc(r.className)} · ${esc(r.admissionNo)}</p>
    <p>Dear ${esc(r.guardian)},</p><p>${esc(school)} now has its own app for attendance, homework, marks, fees and notices. You can follow ${esc(r.student)}’s day on your phone.</p>
    <div class="row"><ol><li>Scan the code with your phone’s camera to get the <b>${esc(school)}</b> app, or open <b>${esc(link)}</b>.</li><li>Sign in with your phone number ending <b>${esc(r.phoneEnd)}</b>.</li><li>Type the code we send you by SMS. There is no password to remember.</li></ol><div class="qr">${code}</div></div>
    <p>If your phone number has changed, tell the school office.</p></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Letters · ${esc(school)}</title><style>
    body{font:15px/1.6 system-ui,sans-serif;color:#111;margin: 0}section{padding:48px 56px;page-break-after:always;max-width:640px}
    h1{font-size:22px;margin: 0 0 4px}.m{color:#555;margin: 0 0 28px}li{margin:6px 0}.row{display:flex;gap:24px;align-items:center}.row ol{flex:1}.qr{width:132px;flex:none}.qr svg{width:100%;height:auto}</style></head><body>${rows.map(one).join('')}</body></html>`;
}

export function MovingInPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const can = (p: Permission) => app.user.permissions.includes(p);
  const uploads = useQuery({ queryKey: ['uploads'], queryFn: app.api.movingIn.uploads, enabled: can('setup.write') });
  const batches = useQuery({ queryKey: ['import-batches'], queryFn: app.api.movingIn.batches, enabled: can('setup.write') });
  const act = useQuery({ queryKey: ['activation'], queryFn: app.api.movingIn.activation });
  const brand = useQuery({ queryKey: ['brand'], queryFn: app.api.brand, staleTime: 10 * 60_000 });
  const [picked, setPicked] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('students');
  const [err, setErr] = useState('');
  const fail = (e: unknown) => say(Object.values(problem(e))[0] ?? 'Something went wrong.', 'bad');
  const send = useMutation({
    mutationFn: async () => {
      const f = picked!;
      if (f.size > 18_000_000) throw new Error('That file is over 18 MB. Split it, or save it as CSV.');
      // Sheets go as text when they are text; anything else (Excel, PDF, a photo) as the file itself.
      const content = /\.(csv|txt)$/i.test(f.name) ? await f.text() : await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('That file could not be read.')); r.readAsDataURL(f); });
      return app.api.movingIn.upload({ fileName: f.name, note: note.trim(), content });
    },
    onSuccess: (next) => { qc.setQueryData(['uploads'], next); setPicked(null); setNote(''); say('Sent to Gradeon. The team will import it and tell you.'); },
    onError: (e) => setErr(Object.values(problem(e))[0] ?? ''),
  });
  const [typing, setTyping] = useState(false);
  const typed = useMutation({
    mutationFn: ({ csv, count }: { csv: string; count: number }) => {
      const k = IMPORT_KINDS.find((x) => x.key === kind)!;
      return app.api.movingIn.upload({ fileName: `${k.label} (typed).csv`, note: `${count} ${count === 1 ? 'row' : 'rows'} typed in the admin`, content: csv });
    },
    onSuccess: (next) => { qc.setQueryData(['uploads'], next); setTyping(false); say('Sent to Gradeon. The team will import it and tell you.'); },
    onError: fail,
  });
  const invite = useMutation({
    mutationFn: (classId?: string) => app.api.movingIn.inviteFamilies(classId),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['activation'] }); say(r.sent ? `Invited ${r.sent} ${r.sent === 1 ? 'family' : 'families'} by SMS.` : 'Every family there has been invited already.'); },
    onError: fail,
  });
  const staffInvite = useMutation({
    mutationFn: app.api.movingIn.inviteStaff,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['activation'] }); say(r.sent ? `Sent ${r.sent} staff their first password by email.` : 'Every staff member has been invited already.'); },
    onError: fail,
  });
  const letters = useMutation({
    mutationFn: async ({ classId, win }: { classId?: string; win: Window }) => ({ rows: await app.api.movingIn.letters(classId), win }),
    onSuccess: ({ rows, win }) => {
      if (!rows.length) { win.close(); say('No students there yet.'); return; }
      win.document.write(letterPage(brand.data?.name ?? 'Your school', `${location.origin}/hooks/app/${app.slug}`, rows));
      win.document.close();
      win.focus();
      win.print();
    },
    onError: fail,
  });
  // The tab opens on the click itself, so the browser does not block it; the letters fill it once they arrive.
  const print = (classId?: string) => { const win = window.open('', '_blank'); if (win) letters.mutate({ classId, win }); else say('Allow pop-ups for this site to print letters.', 'bad'); };
  const exp = useMutation({ mutationFn: app.api.movingIn.exportAll, onSuccess: (b) => { save(b, `${app.slug}-export.zip`); say('Your export is downloading.'); }, onError: fail });
  // An .xlsx with the columns, an example row, dropdowns where the values are fixed, and a sheet that explains each column.
  const tpl = useMutation({ mutationFn: (k: string) => app.api.movingIn.template(k), onSuccess: (b, k) => save(b, `${k}-template.xlsx`), onError: fail });
  const template = () => tpl.mutate(kind);
  const a = act.data;
  return (
    <Page title="Moving in" sub="Bring your records into Gradeon, then invite staff and families." toast={toast} loading={act.isLoading && !act.data}
      error={act.isError && !act.data ? { message: (act.error as Error).message, retry: () => void act.refetch() } : null}>
      <div className="stack" style={{ gap: 16 }}>
        {can('setup.write') && (
          <Card title="Send us your files" chip={<span className="chip">{uploads.data?.length ?? 0} sent</span>}>
            <p className="help" style={{ marginTop: 0 }}>Excel sheets, exports from your old system, or photos of paper registers. Gradeon’s team imports them, checks every total with you, and can undo an import for 30 days.</p>
            <div className="stack">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <FilePick onPick={(f) => { setPicked(f); setErr(''); }}>{picked ? 'Choose another file' : 'Choose a file'}</FilePick>
                {picked && <b style={{ font: '700 14px var(--fb)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{picked.name}</b>}
              </div>
              <Field label="What is in it (optional)" value={note} onChange={setNote} maxLength={500} placeholder="For example: fees paid this year, up to October" />
              {err && <div className="emsg" role="alert">{err}</div>}
              <div><button className="btn pri" disabled={!picked || send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sending…' : 'Send to Gradeon'}</button></div>
            </div>
            {(uploads.data ?? []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                {uploads.data!.map((u) => (
                  <div key={u.id} className="rw" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6, height: 'auto', padding: '10px 0', cursor: 'default' }}>
                    <span style={{ minWidth: 0, flex: '1 1 220px' }}><b style={{ font: '700 14px var(--fb)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-tip={u.fileName}>{u.fileName}</b><small style={{ color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{u.note || (u.rows ? `${u.rows} rows` : 'A file to read')}</small></span>
                    <span style={{ color: 'var(--ink2)', font: '600 13px var(--fb)' }}>{u.uploadedBy} · {stamp(u.at)}</span>
                    <span className={`st ${STATUS[u.status].tone}`}><i></i>{STATUS[u.status].label}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 16 }}>
              <div className="fld" style={{ minWidth: 220, flex: '1 1 220px', maxWidth: 360 }}><label htmlFor="tpl">Blank sheet to fill in</label><Select id="tpl" value={kind} onChange={setKind} options={IMPORT_KINDS.map((k) => ({ value: k.key, label: k.label }))} /></div>
              <button className="btn" disabled={tpl.isPending} onClick={template}>{tpl.isPending ? 'Preparing…' : 'Download sheet'}</button>
              {!typing && <button className="btn" onClick={() => setTyping(true)}>Type it in instead</button>}
            </div>
            {typing && <TypeRows key={kind} kind={IMPORT_KINDS.find((x) => x.key === kind)!} busy={typed.isPending} onSend={(csv, count) => typed.mutate({ csv, count })} onCancel={() => setTyping(false)} />}
          </Card>
        )}

        {(batches.data ?? []).length > 0 && (
          <Card title="What Gradeon imported" chip={<span className="chip">{batches.data!.filter((b) => !b.undoneAt).length}</span>}>
            <p className="help" style={{ marginTop: 0 }}>Each import with its totals. Check them against your old system’s reports; if something is off, tell Gradeon and the import can be undone.</p>
            {batches.data!.map((b) => (
              <div key={b.id} className="rw" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 16, rowGap: 6, height: 'auto', padding: '12px 0', cursor: 'default' }}>
                <span style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <b style={{ font: '700 14px var(--fb)' }}>{IMPORT_KINDS.find((k) => k.key === b.kind)?.label ?? b.kind}</b>
                  <small style={{ display: 'block', color: 'var(--ink3)', font: '600 12px var(--fb)' }}>{b.fileName || 'Typed in'} · {stamp(b.at)}</small>
                  {b.notes.map((n) => <small key={n} style={{ display: 'block', color: 'var(--a)', font: '600 12px var(--fb)', marginTop: 4 }}>{n}</small>)}
                </span>
                <span className="tgrow" style={{ gap: 6, flex: '1 1 260px' }}>
                  {b.undoneAt ? <span className="chip">Undone</span> : <><span className="chip g">{b.created} added</span><span className="chip">{b.updated} updated</span>{b.skipped > 0 && <span className="chip a">{b.skipped} left out</span>}</>}
                  {!b.undoneAt && b.totals.map((t) => <span key={t.label} className="chip">{t.label}: {t.value}</span>)}
                </span>
              </div>
            ))}
          </Card>
        )}

        {a && (
          <Card title="Families on the app" chip={<span className="chip g">{a.families.signedIn} of {a.families.total} signed in</span>}>
            <p className="help" style={{ marginTop: 0 }}>Invite a class at a time: each family gets an SMS, and letters to send home say the same. Families sign in with their phone; there is no password.</p>
            {a.classes.length === 0 ? <div className="help">No classes yet. They appear here once your students are in.</div> : (
              <div className="scroll-x lscroll">
                <div style={{ minWidth: 710 }}>
                  <div className="grd th" style={{ '--cols': 'minmax(0,1fr) 90px 90px minmax(0,1.4fr) 90px 220px' } as React.CSSProperties}><span>Class</span><span>Families</span><span>Invited</span><span>Signed in</span><span data-tip="Agreed to the school’s privacy notice in the app">Consented</span><span></span></div>
                  {a.classes.map((c) => (
                    <div key={c.classId} className="grd rw" style={{ '--cols': 'minmax(0,1fr) 90px 90px minmax(0,1.4fr) 90px 220px' } as React.CSSProperties}>
                      <b style={{ font: '700 14px var(--fb)' }}>{c.className}</b>
                      <span>{c.families}</span>
                      <span>{c.invited}</span>
                      <span className="us" style={{ gap: 4 }}><div className="bar" style={{ height: 10 }}><i style={{ width: `${pct(c.signedIn, c.families)}%` }}></i></div><small style={{ font: '700 11px var(--fb)', color: 'var(--ink3)' }}>{c.signedIn} of {c.families}</small></span>
                      <span>{c.consented}</span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {can('students.write') && c.invited < c.families && <button className="btn sm" disabled={invite.isPending} onClick={() => invite.mutate(c.classId)}>Invite</button>}
                        <button className="btn sm" disabled={!c.students} onClick={() => print(c.classId)}>Letters</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {can('students.write') && a.families.invited < a.families.total && <div style={{ marginTop: 16 }}><button className="btn pri" disabled={invite.isPending} onClick={() => invite.mutate(undefined)}>Invite every family not yet invited</button></div>}
          </Card>
        )}

        {a && (
          <Card title="Staff" chip={<span className="chip g">{a.staff.signedIn} of {a.staff.total} signed in</span>}>
            <p className="help" style={{ marginTop: 0 }}>{a.staff.total - a.staff.invited ? `${a.staff.total - a.staff.invited} of ${a.staff.total} staff have not had their invite yet. Each gets a first password by email and chooses their own after signing in.` : 'Every staff member has had their invite.'}</p>
            {can('staff.write') && a.staff.invited < a.staff.total && <button className="btn pri" disabled={staffInvite.isPending} onClick={() => staffInvite.mutate()}>{staffInvite.isPending ? 'Sending…' : 'Send staff their invites'}</button>}
          </Card>
        )}

        {can('privacy.manage') && (
          <Card title="Everything, to take with you">
            <p className="help" style={{ marginTop: 0 }}>A ZIP with one sheet for each kind of record, in the same columns Gradeon imports. Your data is yours: this is what you would take to another system.</p>
            <button className="btn" disabled={exp.isPending} onClick={() => exp.mutate()}>{exp.isPending ? 'Preparing…' : 'Download everything'}</button>
          </Card>
        )}
      </div>
    </Page>
  );
}
