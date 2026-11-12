import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyCard, useToast } from '@gradeon/web-ui';
import { useApp } from '../../app/context';
import { Card, Page } from '../../app/Page';
import { useSchoolConfig } from '../../app/kit';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Families (and students, where the school uses the app for them) on the school's app: who has been invited, who signed in and
 * agreed to the privacy notice, the invite and the reminder, and the letters to send home, printed from the school's wording.
 */
export function OnTheApp({ tabs }: { tabs: React.ReactNode }) {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const cfg = useSchoolConfig();
  const act = useQuery({ queryKey: ['activation'], queryFn: app.api.movingIn.activation });
  const may = app.user.permissions.includes('students.write');
  const invite = useMutation({
    mutationFn: (b: { classId?: string; remind: boolean }) => app.api.movingIn.inviteFamilies(b.classId, b.remind),
    onSuccess: (r, b) => { void qc.invalidateQueries({ queryKey: ['activation'] }); say(r.sent ? `${b.remind ? 'Reminded' : 'Invited'} ${r.sent} ${r.sent === 1 ? 'family' : 'families'}.` : b.remind ? 'Everyone invited has signed in.' : 'No family is left to invite.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  // The letters are a PDF from the server, one page each, with the code that opens the school's app.
  const letters = (classId: string | undefined, role: 'family' | 'student') => {
    const w = window.open('', '_blank');
    void app.api.movingIn.letterPdf(classId, role).then((b) => { if (w) w.location.href = URL.createObjectURL(b); }).catch((e: Error) => { w?.close(); say(e.message, 'bad'); });
  };
  const students = !!cfg?.app.roles.includes('student');
  const a = act.data;
  return (
    <Page title="Students" sub="Families on the school’s app" toast={toast} actions={tabs} loading={act.isLoading && !a}
      error={act.isError && !a ? { message: (act.error as Error).message, retry: () => void act.refetch() } : null}>
      {a && (a.classes.length === 0 ? (
        <EmptyCard title="On the app" chip={{ text: '0 classes', tone: 'v' }} scene="register" heading="No students yet" body="Once your students and their families are in, invite them to the app class by class and print the letters to send home." />
      ) : (
        <Card title="Families on the app" chip={<span className="chip g">{a.families.signedIn} of {a.families.total} signed in</span>}>
          <p className="help" style={{ marginTop: 0 }}>Invite a class at a time; the letters to send home say the same. Families sign in with their phone and a code: there is no password. Remind those who were invited but have not signed in yet.</p>
          <div className="scroll-x lscroll">
            <div style={{ minWidth: 760 }}>
              <div className="grd th" style={{ '--cols': 'minmax(0,1fr) 80px 80px minmax(0,1.3fr) 90px 260px' } as React.CSSProperties}><span>Class</span><span>Families</span><span>Invited</span><span>Signed in</span><span data-tip="Agreed to the school’s privacy notice in the app">Consented</span><span></span></div>
              {a.classes.map((c) => (
                <div key={c.classId} className="grd rw" style={{ '--cols': 'minmax(0,1fr) 80px 80px minmax(0,1.3fr) 90px 260px' } as React.CSSProperties}>
                  <b style={{ font: '700 14px var(--fb)' }}>{c.className}</b>
                  <span>{c.families}</span>
                  <span>{c.invited}</span>
                  <span className="us" style={{ gap: 4 }}><div className="bar" style={{ height: 10 }}><i style={{ width: `${pct(c.signedIn, c.families)}%` }}></i></div><small style={{ font: '700 11px var(--fb)', color: 'var(--ink3)' }}>{c.signedIn} of {c.families}</small></span>
                  <span>{c.consented}</span>
                  <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {may && c.invited < c.families && <button className="btn sm" disabled={invite.isPending} onClick={() => invite.mutate({ classId: c.classId, remind: false })}>Invite</button>}
                    {may && c.invited > c.signedIn && <button className="btn sm" disabled={invite.isPending} onClick={() => invite.mutate({ classId: c.classId, remind: true })}>Remind</button>}
                    <button className="btn sm" disabled={!c.students} onClick={() => letters(c.classId, 'family')}>Letters</button>
                    {students && <button className="btn sm" disabled={!c.students} onClick={() => letters(c.classId, 'student')}>Student letters</button>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {may && (
            <div className="tgrow" style={{ marginTop: 16 }}>
              {a.families.invited < a.families.total && <button className="btn pri" disabled={invite.isPending} onClick={() => invite.mutate({ remind: false })}>Invite every family not yet invited</button>}
              {a.families.invited > a.families.signedIn && <button className="btn" disabled={invite.isPending} onClick={() => invite.mutate({ remind: true })}>Remind everyone not signed in</button>}
            </div>
          )}
        </Card>
      ))}
    </Page>
  );
}
