import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi, useMatches } from '../lib/hooks';
import { dayLabel } from '../lib/format';

// Admin: the YouTube channels highlights come from, and setting a game's video by hand.
export default function HighlightsAdmin({ run }) {
  const { data, reload } = useApi('/api/admin/highlights');
  const [channel, setChannel] = useState('');
  const [comp, setComp] = useState('PL');
  const [matchId, setMatchId] = useState('');
  const [url, setUrl] = useState('');
  const { data: feed } = useMatches(comp);
  const finished = useMemo(() => (feed?.matches || []).filter((m) => m.status === 'finished')
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 30), [feed]);
  const go = (fn, ok) => run(fn, ok).then(reload);

  return (
    <section className="card">
      <h2 className="section-title">Highlights</h2>
      <p className="hint">Highlights are found automatically on these YouTube channels, usually within a few hours of full time.</p>
      <ul className="admin-list">
        {(data?.channels || []).map((c) => (
          <li key={c.id}>
            <a href={`https://www.youtube.com/channel/${c.id}`} target="_blank" rel="noreferrer">{c.name}</a>
            <button className="btn btn-ghost btn-sm" onClick={() => go(() => api('/api/admin/highlights/channels', { method: 'POST', body: { remove: c.id } }), 'Channel removed')}>Remove</button>
          </li>
        ))}
      </ul>
      <form className="row-form" onSubmit={(e) => { e.preventDefault(); go(() => api('/api/admin/highlights/channels', { method: 'POST', body: { add: channel } }), 'Channel added').then(() => setChannel('')); }}>
        <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="youtube.com/@channel" aria-label="YouTube channel link" />
        <button className="btn btn-sm" disabled={!channel.trim()}>Add</button>
      </form>
      <button className="btn btn-ghost btn-sm" onClick={() => go(() => api('/api/admin/highlights/find', { method: 'POST' }), 'Checked for new highlights')}>Look for new highlights now</button>

      <h3 className="group-label">Set a game's video</h3>
      <form onSubmit={(e) => { e.preventDefault(); go(() => api('/api/admin/highlights/match', { method: 'POST', body: { competition: comp, matchId, url } }), url ? 'Video saved' : 'Video removed').then(() => setUrl('')); }}>
        <div className="row-form">
          <select value={comp} onChange={(e) => { setComp(e.target.value); setMatchId(''); }} aria-label="Competition">
            <option value="PL">Premier League</option>
            <option value="CL">Champions League</option>
          </select>
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)} aria-label="Game">
            <option value="">Pick a game…</option>
            {finished.map((m) => <option key={m.id} value={m.id}>{dayLabel(m.kickoff)}: {m.home.name} {m.score?.home}–{m.score?.away} {m.away.name}</option>)}
          </select>
        </div>
        <div className="row-form">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube link (leave empty to remove the video)" aria-label="YouTube link" />
          <button className="btn btn-sm" disabled={!matchId}>{url ? 'Save' : 'Remove'}</button>
        </div>
      </form>

      {data?.recent?.length > 0 && (
        <>
          <h3 className="group-label">Latest found</h3>
          <ul className="admin-list">
            {data.recent.map((h) => (
              <li key={h.matchId}>
                <a href={`https://www.youtube.com/watch?v=${h.videoId}`} target="_blank" rel="noreferrer">{h.home.tla} {h.score?.home}–{h.score?.away} {h.away.tla}</a>
                <small>{h.auto ? h.channel : 'set by hand'}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
