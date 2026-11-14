import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadFile } from '@tangent/api-client';
import type { AlbumRow, GalleryReportRow, PhotoRow } from '@tangent/contracts';
import { Dialog, Field, FilePick, Panel, Presence, SelectField, useShake, Icon, EmptyState, EmptyNote } from '@tangent/web-ui';
import { useApp } from '../../app/context';
import { Page, useToast } from '../../app/Page';
import { AddBtn, StudentPick, problem, stamp } from '../../app/kit';

/** A photo shown from storage: its link is fetched when it appears and lasts a few minutes. */
function Photo({ id, alt }: { id: string; alt: string }) {
  const app = useApp();
  const q = useQuery({ queryKey: ['file-url', id], queryFn: () => app.api.files.url(id), staleTime: 4 * 60_000 });
  return q.data ? <img src={q.data.url} alt={alt} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 12, display: 'block', background: 'var(--s2)' }} />
    : <div className="skc" style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 12 }} />;
}

export function GalleryPage() {
  const app = useApp();
  const qc = useQueryClient();
  const { toast, say } = useToast();
  const [edit, setEdit] = useState<AlbumRow | 'new' | null>(null);
  const [open, setOpen] = useState<AlbumRow | null>(null);
  const albums = useQuery({ queryKey: ['gallery'], queryFn: app.api.gallery.albums });
  const canWrite = app.user.permissions.includes('gallery.write');
  const list = albums.data ?? [];
  const done = (m: string) => { setEdit(null); void qc.invalidateQueries({ queryKey: ['gallery'] }); say(m); };
  return (
    <Page title="Gallery" sub="Albums by class and event. Families see a shared album, minus any photo with a child whose family has not agreed to photos." toast={toast}
      loading={albums.isLoading && !albums.data} error={albums.isError && !albums.data ? { message: (albums.error as Error).message, retry: () => void albums.refetch() } : null}
      actions={canWrite ? <AddBtn onClick={() => setEdit('new')}>New album</AddBtn> : undefined}
      overlays={<>
        {edit && <AlbumDialog album={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={done} />}
      </>}>
      <Reported say={say} />
      {!list.length ? (
        <div><EmptyState scene="gallery" onAction={canWrite ? () => setEdit('new') : undefined} /></div>
      ) : (
        <section className="grid" data-even="">
          {list.map((a, i) => (
            <button key={a.id} className="card s4 rise" onClick={() => setOpen(a)} style={{ '--d': `${Math.min(i, 8) * 0.04}s`, textAlign: 'left', cursor: 'pointer', border: 0, font: 'inherit', color: 'inherit' } as React.CSSProperties} aria-label={`Open ${a.title}`}>
              {a.coverFileId ? <Photo id={a.coverFileId} alt={a.title} /> : <div style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 12, background: 'var(--s2)', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 6, color: 'var(--ink3)', font: '600 13px var(--fb)' }}><Icon name="image" size={28} />No photos yet</div>}
              <div className="ch" style={{ marginTop: 12 }}><h2 style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</h2><span className={`chip ${a.published ? 'g' : ''}`}>{a.published ? 'Shared' : 'Draft'}</span></div>
              <div className="help" style={{ marginTop: 4 }}>{a.className ?? 'Whole school'} · {a.photos} {a.photos === 1 ? 'photo' : 'photos'} · {stamp(a.createdAt)}</div>
            </button>
          ))}
        </section>
      )}
      <Presence>{open && <AlbumPanel album={list.find((a) => a.id === open.id) ?? open} canWrite={canWrite} say={say} onEdit={() => setEdit(open)} onClose={() => setOpen(null)} />}</Presence>
    </Page>
  );
}

function AlbumPanel({ album, canWrite, say, onEdit, onClose }: { album: AlbumRow; canWrite: boolean; say: (m: string, tone?: 'bad') => void; onEdit: () => void; onClose: () => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const [tagging, setTagging] = useState<PhotoRow | null>(null);
  const photos = useQuery({ queryKey: ['gallery', album.id, 'photos'], queryFn: () => app.api.gallery.photos(album.id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['gallery'] });
  // Many photos at once, one after the other; any that fail are named and the rest stay.
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      const failed: string[] = [];
      for (const f of files) await uploadFile(app.api, 'gallery', album.id, f).catch(() => failed.push(f.name));
      return { added: files.length - failed.length, failed };
    },
    onSuccess: ({ added, failed }) => { refresh(); say(failed.length ? `${added} added; ${failed.join(', ')} could not be added.` : `${added} ${added === 1 ? 'photo' : 'photos'} added. Tag the children in them before sharing.`, failed.length ? 'bad' : undefined); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const [removing, setRemoving] = useState<string | null>(null);
  const share = useMutation({ mutationFn: () => app.api.gallery.publish(album.id, !album.published), onSuccess: (a) => { refresh(); say(a.published ? `${a.title} is shared with families.` : `${a.title} is hidden from families.`); }, onError: (e) => say((e as Error).message, 'bad') });
  const remove = useMutation({ mutationFn: app.api.files.remove, onSuccess: () => { setRemoving(null); refresh(); say('Photo removed.'); }, onError: (e) => say((e as Error).message, 'bad') });
  const list = photos.data ?? [];
  const hidden = list.filter((p) => p.students.some((s) => s.consent !== true)).length;
  return (
    <Panel label={album.title} onClose={onClose}>
      <div className="dh">
        <div className="dtop">
          <div style={{ minWidth: 0 }}>
            <div className="fd" style={{ fontSize: 30, letterSpacing: '-.03em', lineHeight: 1.1 }}>{album.title}</div>
            <div className="help" style={{ marginTop: 4 }}>{album.className ?? 'Whole school'} · {list.length} {list.length === 1 ? 'photo' : 'photos'}</div>
          </div>
          <button className="xbtn" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        {canWrite && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilePick accept="image/jpeg,image/png,image/webp" multiple className="btn sm pri" disabled={add.isPending} onPickAll={(files) => add.mutate(files)}>{add.isPending ? 'Uploading…' : 'Add photos'}</FilePick>
          <button className="btn sm" disabled={share.isPending} onClick={() => share.mutate()}>{album.published ? 'Hide from families' : 'Share with families'}</button>
          <button className="btn sm" onClick={onEdit}>Edit album</button>
        </div>}
      </div>
      <div className="db">
        {hidden > 0 && <div className="chip a" role="status" style={{ height: 'auto', padding: '8px 12px', whiteSpace: 'normal', lineHeight: 1.4 }}>{hidden} {hidden === 1 ? 'photo has' : 'photos have'} a child whose family has not agreed to photos: families will not see {hidden === 1 ? 'it' : 'them'}.</div>}
        {photos.isLoading ? <div className="skc" style={{ height: 200, borderRadius: 16 }} /> : !list.length ? <EmptyNote icon="camera" title="No photos in this album yet" body="Add the first ones. Families see them in the app once the album is shared." /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
            {list.map((p) => (
              <div key={p.id}>
                <Photo id={p.id} alt={p.name} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {p.students.map((s) => <span key={s.id} className={`chip ${s.consent === true ? 'g' : 'c'}`} data-tip={s.consent === true ? 'Family agreed' : s.consent === false ? 'Family said no' : 'Family has not answered'}>{s.name.split(' ')[0]}</span>)}
                </div>
                {canWrite && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn sm" onClick={() => setTagging(p)}>Tag</button>
                  {removing === p.id
                    ? <><button className="btn sm dngf" disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>Yes, remove</button><button className="btn sm" onClick={() => setRemoving(null)}>Keep</button></>
                    : <button className="btn sm" onClick={() => setRemoving(p.id)}>Remove</button>}
                </div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <Presence>{tagging && <TagDialog photo={tagging} onClose={() => setTagging(null)} onDone={() => { setTagging(null); refresh(); say('Tags saved.'); }} />}</Presence>
    </Panel>
  );
}

function TagDialog({ photo, onClose, onDone }: { photo: PhotoRow; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const [kids, setKids] = useState(photo.students.map((s) => ({ id: s.id, name: s.name })));
  const save = useMutation({ mutationFn: () => app.api.gallery.tag(photo.id, kids.map((k) => k.id)), onSuccess: onDone });
  return (
    <Dialog title="Who is in this photo?" onClose={onClose} width={480}>
      <div className="stack">
        <div className="tgrow">{kids.length ? kids.map((k) => <button key={k.id} type="button" className="chip v" onClick={() => setKids((l) => l.filter((x) => x.id !== k.id))} data-tip="Remove">{k.name} ×</button>) : <span className="help">Nobody tagged yet.</span>}</div>
        <StudentPick label="Add a child" value={null} onChange={(s) => s && setKids((l) => (l.some((x) => x.id === s.id) ? l : [...l, { id: s.id, name: s.name }]))} />
        {save.isError && <div className="emsg" role="alert">{(save.error as Error).message}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </Dialog>
  );
}

function AlbumDialog({ album, onClose, onDone }: { album: AlbumRow | null; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const shake = useShake();
  const classes = useQuery({ queryKey: ['classes'], queryFn: app.api.classes });
  const [title, setTitle] = useState(album?.title ?? '');
  const [classId, setClassId] = useState(album?.classId ?? '');
  const [eventId, setEventId] = useState(album?.eventId ?? '');
  const [confirm, setConfirm] = useState(false);
  const events = useQuery({ queryKey: ['events'], queryFn: app.api.events.list, enabled: app.user.permissions.includes('events.read') });
  const [err, setErr] = useState<Record<string, string>>({});
  const body = () => ({ title: title.trim(), classId: classId || null, eventId: eventId || null });
  const save = useMutation({ mutationFn: () => (album ? app.api.gallery.save(album.id, body()) : app.api.gallery.add(body())), onSuccess: (a) => onDone(`${a.title} was saved.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  const del = useMutation({ mutationFn: () => app.api.gallery.remove(album!.id), onSuccess: () => onDone(`${album!.title} and its photos were deleted.`), onError: (e) => { setErr(problem(e)); shake.hit(); } });
  return (
    <Dialog title={album ? 'Edit album' : 'New album'} onClose={onClose} width={480} shake={shake.cls}>
      <div className="stack">
        <Field label="Title" value={title} onChange={(x) => { setTitle(x); setErr({}); }} error={err.title} placeholder="Sports day 2026" />
        <SelectField label="Shared with" value={classId} onChange={setClassId} options={[{ value: '', label: 'The whole school' }, ...(classes.data ?? []).map((c) => ({ value: c.id, label: `Class ${c.name}` }))]} />
        {(events.data?.length ?? 0) > 0 && <SelectField label="From the event (optional)" value={eventId} onChange={setEventId} options={[{ value: '', label: 'Not linked to an event' }, ...(events.data ?? []).filter((e) => e.kind !== 'holiday').map((e) => ({ value: e.id, label: `${e.title} · ${new Date(e.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` }))]} />}
        {err._ && <div className="emsg" role="alert">{err._}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {album && (confirm
          ? <span style={{ marginRight: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}><span className="help">Delete it and its {album.photos} {album.photos === 1 ? 'photo' : 'photos'}?</span><button className="btn sm dngf" disabled={del.isPending} onClick={() => del.mutate()}>Yes, delete</button><button className="btn sm" onClick={() => setConfirm(false)}>Keep</button></span>
          : <button className="btn dng" style={{ marginRight: 'auto' }} onClick={() => setConfirm(true)}>Delete album</button>)}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={save.isPending || title.trim().length < 2} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : album ? 'Save' : 'Create album'}</button>
      </div>
    </Dialog>
  );
}

/** Photos families reported from the app, oldest first: each is kept or taken down, which closes every report of it. */
function Reported({ say }: { say: (m: string, tone?: 'bad') => void }) {
  const app = useApp();
  const qc = useQueryClient();
  const canWrite = app.user.permissions.includes('gallery.write');
  const q = useQuery({ queryKey: ['gallery', 'reports'], queryFn: app.api.gallery.reports });
  const act = useMutation({
    mutationFn: (a: { r: GalleryReportRow; remove: boolean }) => app.api.gallery.resolve(a.r.id, a.remove),
    onSuccess: (_, a) => { void qc.invalidateQueries({ queryKey: ['gallery'] }); say(a.remove ? 'The photo was taken down.' : 'The photo stays; the report is closed.'); },
    onError: (e) => say((e as Error).message, 'bad'),
  });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <div className="card rise" style={{ marginBottom: 16 }}>
      <div className="ch"><h2>Reported by families</h2><span className="chip a">{rows.length}</span></div>
      <section className="grid" style={{ marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.id} className="s4" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <Photo id={r.fileId} alt={`Reported photo in ${r.album ?? 'an album'}`} />
            <b style={{ font: '700 14px var(--fb)', overflowWrap: 'anywhere' }}>“{r.reason}”</b>
            <small className="help">{r.by} · {r.album ?? 'An album'} · {stamp(r.createdAt)}</small>
            {canWrite && (
              <span className="tgrow">
                <button className="btn sm dng" disabled={act.isPending} onClick={() => act.mutate({ r, remove: true })}>Take it down</button>
                <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ r, remove: false })}>Keep it</button>
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
