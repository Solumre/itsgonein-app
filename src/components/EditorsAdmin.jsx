import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import Avatar from './Avatar';

// Admin only: who's a Junior Editor.
export default function EditorsAdmin({ run }) {
  const { data, reload } = useApi('/api/admin/editors');
  const [nickname, setNickname] = useState('');
  const go = (body, ok) => run(() => api('/api/admin/editors', { method: 'POST', body }), ok).then(reload);
  return (
    <section className="card">
      <h2 className="section-title">✍️ Junior Editors</h2>
      <p className="hint">Editors get an Editor desk for the ticker, the Player of the Week poll, the bonus question and quiz questions. Their name appears on what they write. They can&apos;t see reports, ban anyone or change the highlights channels.</p>
      <ul className="admin-list">
        {(data?.editors || []).map((e) => (
          <li key={e.uid}>
            <span className="who-row"><Avatar user={e} size={26} /> {e.nickname}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => go({ uid: e.uid, editor: false }, `${e.nickname} is no longer an editor`)}>Remove</button>
          </li>
        ))}
        {data && !data.editors.length && <li><small>No editors yet.</small></li>}
      </ul>
      <form className="row-form" onSubmit={(e) => { e.preventDefault(); go({ nickname, editor: true }, `${nickname} is now a Junior Editor`).then(() => setNickname('')); }}>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Player's nickname" aria-label="Nickname" />
        <button className="btn btn-sm" disabled={!nickname.trim()}>Make editor</button>
      </form>
    </section>
  );
}
