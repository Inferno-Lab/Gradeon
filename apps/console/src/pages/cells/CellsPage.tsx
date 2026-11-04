import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError, type CellRow } from '@gradeon/api-client';
import type { SchoolRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, SelectField, useShake } from '@gradeon/web-ui';
import { Card, Page, Tiles, useToast } from '../../app/Page';
import { useApp } from '../../app/context';
import { url } from '../../app/base';
import { statusOf } from '../../app/format';

const TARGET: Record<string, string> = { local: 'This computer', 'free-test': 'Free test track', 'aws-cell': 'AWS cell' };
const fields = (e: unknown): Record<string, string> => (e instanceof HttpError && Object.keys(e.fields).length ? e.fields : { _: (e as Error).message });

export function CellsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [dlg, setDlg] = useState<{ kind: 'add' } | { kind: 'manage'; cell: CellRow } | { kind: 'move'; school: SchoolRow } | null>(null);
  const cells = useQuery({ queryKey: ['cells'], queryFn: app.api.cells });
  const schools = useQuery({ queryKey: ['schools'], queryFn: () => app.api.schools() });
  const list = cells.data ?? [];
  const canCells = app.can('policy.write');
  const canMove = app.can('schools.write');
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => ['cells', 'schools', 'fleet', 'actions'].includes(String(q.queryKey[0])) });
  return (
    <Page active="cells" title="Cells" sub="Where schools run. Each cell is one database server and one API, and every school gets its own database inside it." toast={toast} loading={cells.isLoading}
      error={cells.isError ? { message: (cells.error as Error).message, retry: () => void cells.refetch() } : null}
      actions={canCells ? <button className="btn pri" onClick={() => setDlg({ kind: 'add' })}><svg viewBox="0 0 24 24" aria-hidden="true"><path className="i" d="M12 5v14M5 12h14"></path></svg>Add a cell</button> : undefined}
      overlays={<>
        {dlg?.kind === 'add' && <AddCell onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); refresh(); say(m); }} />}
        {dlg?.kind === 'manage' && <ManageCell cell={dlg.cell} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); refresh(); say(m); }} />}
        {dlg?.kind === 'move' && <MoveSchool school={dlg.school} cells={list} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); refresh(); say(m); }} />}
      </>}>
      {list.length === 0 ? (
        <div>
          <EmptyCard title="Cells" chip={{ text: '0 cells', tone: 'v' }} scene="map-pin" heading="No cells yet" body="The first cell is created when the platform starts. Add another here to place schools in more than one place." actions={canCells ? <button className="btn pri" onClick={() => setDlg({ kind: 'add' })}>Add a cell</button> : undefined} />
        </div>
      ) : (
        <>
        <Tiles items={[
          { label: 'Cells', value: list.length, note: `${list.filter((c) => c.accepting).length} open to new schools`, tone: 'v' },
          { label: 'Schools placed', value: list.reduce((n, c) => n + c.schools, 0), note: `room for ${list.reduce((n, c) => n + c.maxSchools, 0)}`, tone: 'a' },
          { label: 'Space used', value: `${Math.round((list.reduce((n, c) => n + c.schools, 0) / Math.max(1, list.reduce((n, c) => n + c.maxSchools, 0))) * 100)}%`, note: 'across every cell', tone: 'i' },
        ]} />
        <section className="grid">
          {list.map((c) => {
            const here = (schools.data ?? []).filter((s) => s.cell === c.key);
            const full = c.maxSchools ? Math.round((c.schools / c.maxSchools) * 100) : 0;
            return (
              <Card key={c.key} title={`Cell ${c.key}`} chip={<><span className="chip v">{TARGET[c.target] ?? c.target}</span>{!c.accepting && <span className="chip a">Closed to new schools</span>}{canCells && <button className="btn sm" onClick={() => setDlg({ kind: 'manage', cell: c })}>Manage</button>}</>} span="s6">
                <div className="us">
                  <div className="r">Schools<b>{c.schools} of {c.maxSchools}</b></div>
                  <div className={`bar ${full > 80 ? 'warn' : ''}`}><i style={{ width: `${full}%` }}></i></div>
                </div>
                <div className="kv" style={{ marginTop: 14 }}>Region<b>{c.region}</b></div>
                <div className="lbl" style={{ margin: '12px 0 4px' }}>Schools here</div>
                {here.length === 0 && <div className="help">No schools in this cell yet.</div>}
                <div className="lscroll" style={{ maxHeight: 260 }}>
                  {here.map((s) => {
                    const st = statusOf(s);
                    return (
                      <div key={s.id} className="kv" style={{ alignItems: 'center' }}>
                        <a href={url(`/schools/${s.id}`)} onClick={(e) => { e.preventDefault(); app.go(`/schools/${s.id}`); }} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</a>
                        <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className={`st ${st.tone}`}><i></i>{st.text}</span>{canMove && list.length > 1 && s.status === 'live' && <button className="btn sm" onClick={() => setDlg({ kind: 'move', school: s })}>Move</button>}</b>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </section>
        </>
      )}
    </Page>
  );
}

function AddCell({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [f, setF] = useState({ key: '', target: 'free-test', region: '', maxSchools: '25' });
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: '', _: '' })); };
  const make = useMutation({ mutationFn: () => app.api.createCell({ key: f.key.trim().toLowerCase(), target: f.target as 'local', region: f.region.trim(), maxSchools: Number(f.maxSchools) }), onSuccess: (r) => onDone(`Cell ${r.key} added. ${r.note}`), onError: (e) => { setErr(fields(e)); shake.hit(); } });
  const go = () => {
    const p: Record<string, string> = {};
    if (!/^[a-z][a-z0-9-]{1,22}[a-z0-9]$/.test(f.key.trim().toLowerCase())) p.key = 'Use 3 to 24 letters, numbers or dashes, starting with a letter.';
    if (f.region.trim().length < 2) p.region = 'Name the place, like Mumbai or this computer.';
    if (!(Number(f.maxSchools) >= 1)) p.maxSchools = 'At least 1.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else make.mutate();
  };
  return (
    <Dialog title="Add a cell" onClose={onClose} width={500} shake={shake.cls}>
      <div className="stack">
        <Field label="Name" value={f.key} onChange={set('key')} error={err.key} placeholder="mumbai-2" />
        <SelectField label="Runs on" value={f.target} onChange={set('target')} options={Object.entries(TARGET).map(([value, label]) => ({ value, label }))} />
        <div className="two"><Field label="Region" value={f.region} onChange={set('region')} error={err.region} placeholder="Mumbai" /><Field label="Most schools" type="number" min={1} value={f.maxSchools} onChange={set('maxSchools')} error={err.maxSchools} /></div>
        {f.target === 'aws-cell' && <div className="help">A cloud cell also needs the address of its database server in the console’s settings before a school can be placed in it.</div>}
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Adding…' : 'Add cell'}</button>
      </div>
    </Dialog>
  );
}

function ManageCell({ cell, onClose, onDone }: { cell: CellRow; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [region, setRegion] = useState(cell.region);
  const [max, setMax] = useState(String(cell.maxSchools));
  const [accepting, setAccepting] = useState(cell.accepting);
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  const save = useMutation({ mutationFn: () => app.api.patchCell(cell.key, { region: region.trim(), maxSchools: Number(max), accepting }), onSuccess: () => onDone(`Cell ${cell.key} was updated.`), onError: (e) => { setErr(fields(e)); shake.hit(); } });
  return (
    <Dialog title={`Cell ${cell.key}`} tag={{ text: TARGET[cell.target] ?? cell.target, tone: 'v' }} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <div className="two"><Field label="Region" value={region} onChange={setRegion} error={err.region} /><Field label="Most schools" type="number" min={Math.max(1, cell.schools)} value={max} onChange={(v) => { setMax(v); setErr({}); }} error={err.maxSchools} hint={`${cell.schools} run here now.`} /></div>
        <div className="tgl" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}><b style={{ font: '700 14.5px var(--fb)' }}>Accept new schools</b><div className="help">Turn this off to drain a cell. Schools already here keep running.</div></div>
          <button className={`sw ${accepting ? 'on' : ''}`} role="switch" aria-checked={accepting} aria-label="Accept new schools" onClick={() => setAccepting(!accepting)}></button>
        </div>
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </Dialog>
  );
}

function MoveSchool({ school, cells, onClose, onDone }: { school: SchoolRow; cells: CellRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const here = cells.find((c) => c.key === school.cell);
  const options = cells.filter((c) => c.key !== school.cell);
  const usable = (c: CellRow) => c.accepting && c.schools < c.maxSchools && c.target === here?.target;
  const [to, setTo] = useState(options.find(usable)?.key ?? options[0]?.key ?? '');
  const [err, setErr] = useState('');
  const move = useMutation({
    mutationFn: (dry: boolean) => app.api.actions.request({ action: 'school.move', schoolId: school.id, params: { cell: to }, dryRun: dry }),
    onSuccess: (r) => (r.status === 'failed' ? setErr(r.summary) : onDone(r.status === 'pending_approval' ? 'Sent for approval. A second person has to approve it under Approvals.' : r.summary)),
    onError: (e) => setErr((e as Error).message),
  });
  const target = cells.find((c) => c.key === to);
  const why = target && !usable(target) ? (!target.accepting ? 'That cell is closed to new schools.' : target.schools >= target.maxSchools ? 'That cell is full.' : 'That cell runs on a different kind of place, which needs a database copy.') : '';
  return (
    <Dialog title={`Move ${school.name}`} tag={{ text: `From ${school.cell}`, tone: 'v' }} onClose={onClose} width={500}>
      <div className="stack">
        <SelectField label="Move to" value={to} onChange={(v) => { setTo(v); setErr(''); }} options={options.map((c) => ({ value: c.key, label: `${c.key} · ${c.schools} of ${c.maxSchools} schools${usable(c) ? '' : ' (not available)'}` }))} />
        {why && <div className="emsg" role="alert">{why}</div>}
        <div className="help">On the test track every cell of one kind shares a database server, so the school’s data stays where it is and only its record moves. A second person approves moves.</div>
        {err && <div className="emsg" role="alert">{err}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!to || move.isPending} onClick={() => move.mutate(true)}>Rehearse</button>
        <button className="btn pri" disabled={!to || !!why || move.isPending} onClick={() => move.mutate(false)}>{move.isPending ? 'Asking…' : 'Move school'}</button>
      </div>
    </Dialog>
  );
}
