import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeeHead } from '@gradeon/contracts';
import { Checkbox, Field, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Ico, problem, useSetting } from '../../app/kit';
import { Card, Page } from '../../app/Page';
import { useSetupSections } from '../year/SetupSections';

type Draft = { key?: string; name: string; concession: boolean };

/** The kinds of fee the school charges (fee heads) and what each class pays (fee structures). */
export function FeeStructure({ tabs }: { tabs: React.ReactNode }) {
  const { toast, say } = useToast();
  const setup = useSetupSections(['fee_structures'], say);
  return (
    <Page title="Fees" sub="The kinds of fee the school charges, and what each class pays" toast={toast} actions={tabs} overlays={setup.overlay}>
      <div className="stack" style={{ gap: 16 }}>
        <Heads say={say} />
        {setup.view}
      </div>
    </Page>
  );
}

function Heads({ say }: { say: (text: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['fee-heads'], queryFn: app.api.fees.heads });
  // The school edits its own fee heads unless Gradeon keeps them (console: Fees → the school edits its fee structures).
  const open = useSetting<boolean>('feeStructures.schoolEdits', true);
  const may = open && app.user.permissions.includes('setup.write');
  const [draft, setDraft] = useState<Draft[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const reset = (h: FeeHead[]) => { setDraft(h.map((x) => ({ key: x.key, name: x.name, concession: x.concession }))); setErr({}); };
  useEffect(() => { if (q.data) reset(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => app.api.fees.setHeads({ heads: draft.map((d) => ({ ...(d.key ? { key: d.key } : {}), name: d.name.trim(), concession: d.concession })) }),
    onSuccess: (next) => { qc.setQueryData(['fee-heads'], next); void qc.invalidateQueries({ queryKey: ['fee-summary'] }); say('Fee heads saved.'); },
    onError: (e) => { const p = problem(e); setErr(p); say(Object.values(p)[0] ?? 'Could not save.', 'bad'); },
  });
  const changed = JSON.stringify(draft) !== JSON.stringify((q.data ?? []).map((x) => ({ key: x.key, name: x.name, concession: x.concession })));
  const set = (i: number, p: Partial<Draft>) => setDraft(draft.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const move = (i: number, by: -1 | 1) => { const n = [...draft]; const j = i + by; [n[i], n[j]] = [n[j]!, n[i]!]; setDraft(n); };
  if (q.isLoading) return <div className="skc" style={{ height: 200, borderRadius: 18 }} />;
  return (
    <Card title="Fee heads" chip={<span className="chip">{draft.length}</span>}>
      <p className="help" style={{ margin: '0 0 12px' }}>{may
        ? 'The kinds of fee on invoices and receipts, in this order. A head already used can be renamed but not removed. Concessions apply only to heads marked for them.'
        : 'The kinds of fee on invoices and receipts. Gradeon keeps them for your school; ask Gradeon from School profile to change them.'}</p>
      {draft.map((d, i) => (
        <div key={d.key ?? `new-${i}`} className="exr" style={{ padding: '8px 0', gap: 12 }}>
          <span className="rn num">{i + 1}</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            {may ? <Field label={`Fee head ${i + 1}`} value={d.name} onChange={(name) => set(i, { name })} error={err[`heads.${i}.name`]} maxLength={40} /> : <b style={{ font: '700 14px var(--fb)' }}>{d.name}</b>}
          </div>
          {may ? <Checkbox checked={d.concession} onChange={(concession) => set(i, { concession })} label="Concessions apply" /> : d.concession && <span className="chip v">Concessions apply</span>}
          {may && (
            <span className="tgrow">
              <button className="btn sm" aria-label={`Move ${d.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Ico d="M6 15l6-6 6 6" /></button>
              <button className="btn sm" aria-label={`Move ${d.name} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)}><Ico d="M6 9l6 6 6-6" /></button>
              <button className="btn sm" aria-label={`Remove ${d.name}`} disabled={draft.length === 1} data-tip="A head used by invoices stays" onClick={() => setDraft(draft.filter((_, j) => j !== i))}><Ico d="M6 6l12 12M18 6L6 18" /></button>
            </span>
          )}
        </div>
      ))}
      {may && (
        <div className="tgrow" style={{ marginTop: 12 }}>
          <button className="btn sm" disabled={draft.length >= 30} onClick={() => setDraft([...draft, { name: '', concession: false }])}>Add a fee head</button>
          <span className="grow"></span>
          {changed && <button className="btn" onClick={() => q.data && reset(q.data)}>Discard changes</button>}
          <button className="btn pri" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save fee heads'}</button>
        </div>
      )}
    </Card>
  );
}
