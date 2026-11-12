import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadFile } from '@gradeon/api-client';
import type { FileRow } from '@gradeon/contracts';
import { FilePick } from '@gradeon/web-ui';
import { useApp } from '../../app/context';

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** A student's photo and papers (birth certificate, transfer certificate…), kept in the school's storage. */
export function StudentFiles({ id, say }: { id: string; say: (m: string) => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const canWrite = app.user.permissions.includes('students.write');
  const photos = useQuery({ queryKey: ['files', 'student_photo', id], queryFn: () => app.api.files.list('student_photo', id) });
  const docs = useQuery({ queryKey: ['files', 'student_document', id], queryFn: () => app.api.files.list('student_document', id) });
  const photo = photos.data?.filter((f) => f.status === 'clean').at(-1);
  const url = useQuery({ queryKey: ['file-url', photo?.id], queryFn: () => app.api.files.url(photo!.id), enabled: !!photo, staleTime: 4 * 60_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['files'] });
  const add = useMutation({
    mutationFn: ({ kind, file }: { kind: 'student_photo' | 'student_document'; file: File }) => uploadFile(app.api, kind, id, file),
    onSuccess: (f) => { refresh(); say(f.kind === 'student_photo' ? 'Photo saved.' : `${f.name} saved.`); }, onError: (e) => say((e as Error).message),
  });
  const open = async (f: FileRow) => { try { window.open((await app.api.files.url(f.id, true)).url, '_blank', 'noopener'); } catch (e) { say((e as Error).message); } };
  const list = docs.data ?? [];
  return (
    <div>
      <h3>Photo and documents</h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {url.data ? <img src={url.data.url} alt="Student photo" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} /> : <span className="help">No photo yet.</span>}
        {canWrite && <FilePick accept="image/jpeg,image/png,image/webp" className="btn sm" disabled={add.isPending} onPick={(file) => add.mutate({ kind: 'student_photo', file })}>{photo ? 'Change photo' : 'Add a photo'}</FilePick>}
        {canWrite && <FilePick accept="application/pdf,image/jpeg,image/png" className="btn sm" disabled={add.isPending} onPick={(file) => add.mutate({ kind: 'student_document', file })}>Add a document</FilePick>}
      </div>
      {list.length > 0 && <div style={{ marginTop: 8 }}>{list.map((f) => (
        <div key={f.id} className="kv" style={{ alignItems: 'center' }}>
          <button type="button" className="chip" onClick={() => void open(f)} disabled={f.status !== 'clean'} data-tip={f.status === 'clean' ? 'Open' : 'Being checked'}>{f.name}</button>
          <b className="num">{size(f.bytes)}</b>
        </div>
      ))}</div>}
    </div>
  );
}
