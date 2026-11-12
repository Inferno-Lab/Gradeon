import { useState } from 'react';
import { Field, Icon } from '@gradeon/web-ui';

/** No school in the address: ask for it, on the sign-in's lit deep colour with the same floating card. */
export function SchoolPicker() {
  const [slug, setSlug] = useState('');
  const ok = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/.test(slug.trim().toLowerCase());
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 16, display: 'grid', placeItems: 'center', background: 'var(--hero-fill)' }}>
      <form className="card" style={{ maxWidth: 420, width: '100%', padding: 32, display: 'flex', flexDirection: 'column', gap: 20, borderRadius: 28 }}
        onSubmit={(e) => { e.preventDefault(); if (ok) window.location.href = `/s/${slug.trim().toLowerCase()}`; }}>
        <span className="lg" aria-hidden="true">G</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: '700 28px/34px var(--fd)', letterSpacing: '-.02em' }}>Which school?</h1>
          <p style={{ margin: 0, color: 'var(--ink2)', fontSize: 14, lineHeight: '20px' }}>Type your school's Gradeon address, like greenfield. You can find it in the invite email.</p>
        </div>
        <Field label="School address" value={slug} onChange={setSlug} placeholder="greenfield" icon="home" autoFocus autoCapitalize="none" spellCheck={false} />
        <button className="btn pri" disabled={!ok} style={{ height: 48 }}>Open my school<Icon name="next" /></button>
      </form>
    </div>
  );
}
