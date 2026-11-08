import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ThreadDetail, ThreadRow } from '@gradeon/contracts';
import { Dialog, EmptyCard, Field, Segmented, useShake } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, AreaField, Avatar, Ico, problem, stamp } from '../../app/kit';

const BACK = 'M15 5l-7 7 7 7';
const SEND = 'M4 12l16-8-6 16-3-7z';
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const refresh = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ predicate: (q) => ['messages', 'shell'].includes(String(q.queryKey[0])) });

export function MessagesPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'unread' | 'closed'>('open');
  const [starting, setStarting] = useState(false);
  const list = useQuery({ queryKey: ['messages'], queryFn: app.api.messages.list, refetchInterval: 20_000 });
  const rows = (list.data ?? []).filter((t) => (filter === 'closed' ? t.status === 'closed' : filter === 'unread' ? t.unread > 0 && t.status === 'open' : t.status === 'open'));
  const canWrite = app.user.permissions.includes('messages.write');
  const all = list.data ?? [];
  const unread = all.filter((t) => t.unread > 0).length;
  useEffect(() => { if (!sel && rows[0] && window.matchMedia('(min-width: 900px)').matches) setSel(rows[0].id); }, [rows, sel]);
  return (
    <Page title="Messages" sub={all.length ? `${unread ? `${unread} waiting for a reply` : 'All caught up'} · ${all.length} conversations` : 'What families write to the school'} toast={toast} loading={list.isLoading && !list.data}
      error={list.isError && !list.data ? { message: (list.error as Error).message, retry: () => void list.refetch() } : null}
      actions={canWrite ? <AddBtn onClick={() => setStarting(true)}>New message</AddBtn> : undefined}
      overlays={starting && <Start onClose={() => setStarting(false)} onDone={(t) => { setStarting(false); refresh(qc); setFilter('open'); setSel(t.id); say('Message sent. The family gets a notification.'); }} />}>
      {all.length === 0 ? (
        <div><EmptyCard title="Messages" chip={{ text: '0 conversations', tone: 'v' }} scene="envelope" heading="No messages yet" body="When a family writes to the school it appears here, and your reply goes to their app. You can also start a conversation with any student’s family." actions={canWrite ? <AddBtn onClick={() => setStarting(true)}>New message</AddBtn> : undefined} /></div>
      ) : (
        <section className={`msg ${sel ? 'has' : ''}`}>
          <div className="card msl rise" style={{ padding: 0 }}>
            <div style={{ padding: '16px 16px 10px' }}><Segmented value={filter} onChange={(v) => { setFilter(v); setSel(null); }} label="Show" options={[{ value: 'open', label: 'Open' }, { value: 'unread', label: 'Unread', count: unread || undefined }, { value: 'closed', label: 'Closed' }]} /></div>
            <div className="lscroll" style={{ maxHeight: 'min(68dvh,640px)' }}>
              {rows.length === 0 && <div className="help" style={{ padding: '10px 20px 20px' }}>{filter === 'unread' ? 'Nothing unread.' : filter === 'closed' ? 'No closed conversations.' : 'No open conversations.'}</div>}
              {rows.map((t) => <ThreadItem key={t.id} t={t} on={t.id === sel} onOpen={() => setSel(t.id)} />)}
            </div>
          </div>
          <div className="card mst rise" style={{ '--d': '.06s', padding: 0 } as React.CSSProperties}>
            {sel ? <Conversation key={sel} id={sel} canWrite={canWrite} onBack={() => setSel(null)} onChanged={(m) => { refresh(qc); if (m) say(m); }} /> : <div className="help" style={{ padding: 28, textAlign: 'center' }}>Choose a conversation.</div>}
          </div>
        </section>
      )}
    </Page>
  );
}

function ThreadItem({ t, on, onOpen }: { t: ThreadRow; on: boolean; onOpen: () => void }) {
  return (
    <button className={`mti ${on ? 'on' : ''}`} onClick={onOpen} aria-current={on}>
      <Avatar name={t.guardianName} size={38} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b title={t.guardianName}>{t.guardianName}</b><small>{ago(t.lastAt)}</small></span>
        <span className="mts" title={t.subject}>{t.subject}</span>
        <span className="mtp">{t.lastFrom === 'staff' ? 'You: ' : ''}{t.lastBody}</span>
      </span>
      {t.unread > 0 && <span className="ct" aria-label={`${t.unread} unread`} style={{ alignSelf: 'center', font: '800 11.5px var(--fb)', background: 'var(--v)', color: 'var(--onV)', borderRadius: 999, padding: '2px 8px' }}>{t.unread}</span>}
    </button>
  );
}

function Conversation({ id, canWrite, onBack, onChanged }: { id: string; canWrite: boolean; onBack: () => void; onChanged: (m?: string) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['messages', id], queryFn: () => app.api.messages.get(id), refetchInterval: 15_000 });
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const end = useRef<HTMLDivElement>(null);
  const t = q.data;
  useEffect(() => { void qc.invalidateQueries({ queryKey: ['shell'] }); }, [qc, t?.messages.length]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length]);
  const reply = useMutation({
    mutationFn: () => app.api.messages.reply(id, { body: body.trim() }),
    onSuccess: (r) => { setBody(''); setErr(''); qc.setQueryData(['messages', id], r); onChanged(); },
    onError: (e) => { setErr(problem(e)._ ?? 'Could not send.'); shake.hit(); },
  });
  const patch = useMutation({ mutationFn: (b: { status?: 'open' | 'closed'; assignToMe?: boolean }) => app.api.messages.patch(id, b), onSuccess: (r, b) => { qc.setQueryData(['messages', id], r); onChanged(b.status === 'closed' ? 'Conversation closed.' : b.status === 'open' ? 'Conversation reopened.' : 'It is yours now.'); }, onError: (e) => setErr((e as Error).message) });
  if (!t) return <div className="skc" style={{ height: 360, borderRadius: 24, margin: 16 }} />;
  const send = () => { if (body.trim()) reply.mutate(); else { setErr('Write a reply first.'); shake.hit(); } };
  return (
    <div className="mcv">
      <header className="mch">
        <button className="btn sm mback" onClick={onBack} aria-label="Back to the list"><Ico d={BACK} /></button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b className="fd" title={t.subject} style={{ display: 'block', fontSize: 18, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</b>
          <small style={{ color: 'var(--ink3)', font: '600 12.5px var(--fb)' }}>{t.guardianName}{t.studentName ? ` · ${t.studentName}, Class ${t.className}` : ''}{t.assignedToName ? ` · with ${t.assignedToName}` : ''}</small>
        </div>
        {canWrite && <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!t.assignedToName && <button className="btn sm" disabled={patch.isPending} onClick={() => patch.mutate({ assignToMe: true })}>Take it</button>}
          <button className="btn sm" disabled={patch.isPending} onClick={() => patch.mutate({ status: t.status === 'open' ? 'closed' : 'open' })}>{t.status === 'open' ? 'Close' : 'Reopen'}</button>
        </span>}
      </header>
      <div className="mlist lscroll" style={{ ['--scbg' as string]: 'var(--card)' }}>
        {t.messages.map((m) => (
          <div key={m.id} className={`mb ${m.from}`}>
            <div className="mbb">{m.body}</div>
            <small>{m.sender} · {stamp(m.at)}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      {canWrite ? (
        <footer className={`mcm ${shake.cls}`}>
          <AreaField label="Your reply" value={body} onChange={(v) => { setBody(v); setErr(''); }} rows={2} maxLength={1000} error={err} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="help">The family sees this in their app and gets a notification.{t.status === 'closed' ? ' Replying reopens the conversation.' : ''}</span>
            <button className="btn pri" disabled={reply.isPending} onClick={send}><Ico d={SEND} />{reply.isPending ? 'Sending…' : 'Send reply'}</button>
          </div>
        </footer>
      ) : <footer className="mcm"><div className="help">You can read messages but not reply.</div></footer>}
    </div>
  );
}

function Start({ onClose, onDone }: { onClose: () => void; onDone: (t: ThreadDetail) => void }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [stu, setStu] = useState<{ id: string; name: string; className: string } | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const shake = useShake();
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const found = useQuery({ queryKey: ['students', 'pick', term], queryFn: () => app.api.students.list({ query: term, limit: 6 }), enabled: term.length >= 2 && !stu });
  const make = useMutation({ mutationFn: () => app.api.messages.start({ studentId: stu!.id, subject: subject.trim(), body: body.trim() }), onSuccess: onDone, onError: (e) => { setErr(problem(e)); shake.hit(); } });
  const go = () => {
    const p: Record<string, string> = {};
    if (!stu) p.studentId = 'Choose the student whose family you are writing to.';
    if (subject.trim().length < 3) p.subject = 'Write a subject.';
    if (body.trim().length < 2) p.body = 'Write a message.';
    setErr(p);
    if (Object.keys(p).length) shake.hit(); else make.mutate();
  };
  return (
    <Dialog title="New message" onClose={onClose} width={540} shake={shake.cls}>
      <div className="stack">
        {stu ? (
          <div className="fld"><label>To the family of</label><div className="tgrow"><span className="chip v" style={{ height: 34, padding: '0 14px', fontSize: 13.5 }}>{stu.name} · Class {stu.className}</span><button className="btn sm" onClick={() => { setStu(null); setQ(''); }}>Change</button></div></div>
        ) : (
          <div className="fld">
            <Field label="To the family of" value={q} onChange={(v) => { setQ(v); setErr({ ...err, studentId: '' }); }} error={err.studentId} placeholder="Type a student’s name" />
            {found.data?.items.length ? <div className="pks">{found.data.items.map((s) => <button key={s.id} className="pk" onClick={() => setStu({ id: s.id, name: s.name, className: s.className })}><Avatar name={s.name} size={28} /><span><b>{s.name}</b><small>Class {s.className} · {s.guardianName}</small></span></button>)}</div> : term.length >= 2 && found.data ? <div className="help">No student found.</div> : null}
          </div>
        )}
        <Field label="Subject" value={subject} onChange={(v) => { setSubject(v); setErr({ ...err, subject: '' }); }} error={err.subject} maxLength={100} />
        <AreaField label="Message" value={body} onChange={(v) => { setBody(v); setErr({ ...err, body: '' }); }} error={err.body} rows={4} maxLength={1000} />
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={make.isPending} onClick={go}>{make.isPending ? 'Sending…' : 'Send message'}</button>
      </div>
    </Dialog>
  );
}
