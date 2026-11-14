import { useState } from 'react';
import { Icon, Illustration } from '@gradeon/web-ui';

/** No school in the address: ask for it, as an empty card with the noticeboard. */
export function SchoolPicker() {
  const [slug, setSlug] = useState('');
  const ok = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/.test(slug.trim().toLowerCase());
  return (
    <div className="nest" style={{ minHeight: '100dvh', padding: 16, display: 'grid', placeItems: 'center' }}>
      <form style={{ maxWidth: 440, width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (ok) window.location.href = `/s/${slug.trim().toLowerCase()}`; }}>
        <article className="es">
          <div className="eh"><b>Sign in</b></div>
          <div className="eb">
            <div className="art"><Illustration scene="noticeboard" /></div>
            <h3>Which school?</h3>
            <p>Type your school's Gradeon address, like greenfield. You can find it in the invite email.</p>
            <label className="in3" style={{ marginTop: 10 }}>
              <Icon name="home" size={18} />
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="greenfield" aria-label="School address" autoFocus autoCapitalize="none" spellCheck={false} />
            </label>
            <div className="es-act"><button className="btn pri" disabled={!ok}>Open my school<Icon name="next" /></button></div>
          </div>
        </article>
      </form>
    </div>
  );
}
