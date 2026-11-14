import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, useShake } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { AreaField } from '../../app/kit';

/** "Ask Tangent to change this": the request lands in the console's Requests, and Tangent's answer shows here. */
export function AskTangent({ area, onClose, onDone }: { area: string; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const shake = useShake();
  const mine = useQuery({ queryKey: ['change-requests'], queryFn: app.api.changeRequests.list });
  const send = useMutation({
    mutationFn: () => app.api.changeRequests.create({ area, message: message.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['change-requests'] }); onDone(); },
    onError: (e) => { setErr((e as Error).message); shake.hit(); },
  });
  const go = () => { if (message.trim().length < 5) { setErr('Say what you would like changed.'); shake.hit(); } else send.mutate(); };
  return (
    <Dialog title="Ask Tangent to change this" tag={{ text: area, tone: 'v' }} onClose={onClose} width={560} shake={shake.cls}>
      <div className="stack">
        <AreaField label="What would you like changed?" value={message} onChange={(v) => { setMessage(v); setErr(''); }} error={err} maxLength={1000} rows={4} placeholder="For example: put Fees in the app’s bottom tabs." />
        <div className="tgrow" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={send.isPending} onClick={go}>{send.isPending ? 'Sending…' : 'Send to Tangent'}</button>
        </div>
        {(mine.data ?? []).length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Your requests</div>
            {(mine.data ?? []).slice(0, 5).map((r) => (
              <div key={r.id} className="kv" style={{ alignItems: 'flex-start' }}>
                <span style={{ minWidth: 0 }}><b style={{ font: '700 13px var(--fb)' }}>{r.area}</b> · {r.message}{r.answer && <small style={{ display: 'block', color: 'var(--ink3)' }}>Tangent: {r.answer}</small>}</span>
                <b><span className={`chip ${r.status === 'open' ? 'a' : r.status === 'done' ? 'g' : 'c'}`}>{r.status === 'open' ? 'Waiting' : r.status === 'done' ? 'Done' : 'Declined'}</span></b>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
