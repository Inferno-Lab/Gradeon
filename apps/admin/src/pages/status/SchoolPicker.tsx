import { useState } from 'react';
import { EmptyCard } from '@gradeon/web-ui';

/** No school in the address: ask for it. */
export function SchoolPicker() {
  const [slug, setSlug] = useState('');
  const ok = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/.test(slug.trim().toLowerCase());
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 12, display: 'grid', placeItems: 'center' }}>
      <form style={{ maxWidth: 440, width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (ok) window.location.href = `/s/${slug.trim().toLowerCase()}`; }}>
        <EmptyCard title="Sign in" scene="noticeboard" heading="Which school?" body="Type your school's Gradeon address, like greenfield. You can find it in the invite email." actions={<button className="btn pri" disabled={!ok}>Open my school</button>}>
          <label className="in3" style={{ marginTop: 10 }}>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="greenfield" aria-label="School address" autoFocus />
          </label>
        </EmptyCard>
      </form>
    </div>
  );
}
