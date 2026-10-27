import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi, useMatches } from '../lib/hooks';
import { dayLabel } from '../lib/format';
import { thumb } from './Video';

const COMPS = [['PL', 'Premier League'], ['ELC', 'Championship'], ['CL', 'Champions League'], ['PD', 'La Liga'], ['BL1', 'Bundesliga'], ['SA', 'Serie A'], ['FL1', 'Ligue 1']];
const short = (code) => ({ PL: 'PL', ELC: 'EFL', CL: 'UCL', PD: 'Liga', BL1: 'Bund', SA: 'Serie A', FL1: 'L1' }[code] || code);

// Admin: the YouTube channels videos come from (and which leagues each covers), and
// setting a game's highlights or preview by hand.
export default function HighlightsAdmin({ run }) {
  const { data, reload } = useApi('/api/admin/highlights');
  const [channel, setChannel] = useState('');
  const [newComps, setNewComps] = useState(['PL']);
  const [comp, setComp] = useState('PL');
  const [kind, setKind] = useState('highlight');
  const [matchId, setMatchId] = useState('');
  const [url, setUrl] = useState('');
  const [results, setResults] = useState(null);
  const [searchingNow, setSearchingNow] = useState(false);
  const { data: feed } = useMatches(comp);
  const games = useMemo(() => {
    const all = feed?.matches || [];
    return kind === 'highlight'
      ? all.filter((m) => m.status === 'finished').sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 40)
      : all.filter((m) => m.status === 'upcoming').sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)).slice(0, 20);
  }, [feed, kind]);
  const go = (fn, ok) => run(fn, ok).then(reload);
  const post = (body, ok) => go(() => api('/api/admin/highlights/channels', { method: 'POST', body }), ok);
  const search = async () => {
    setSearchingNow(true); setResults(null);
    try { setResults(await api('/api/admin/highlights/search', { method: 'POST', body: { competition: comp, matchId, kind } })); } catch (e) { setResults({ candidates: [], errors: [e.message] }); }
    setSearchingNow(false);
    reload();
  };
  const use = (v) => go(() => api('/api/admin/highlights/match', { method: 'POST', body: { competition: comp, matchId, kind, url: v.videoId, title: v.title, channel: v.channel } }), 'Video saved').then(() => setResults(null));
  const toggle = (list, c) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);
  const q = data?.quota;

  return (
    <section className="card">
      <h2 className="section-title">Highlights &amp; previews</h2>
      <p className="hint">Videos are found on these YouTube channels for the leagues ticked. A channel with none ticked is used for every league.</p>
      <ul className="admin-list">
        {(data?.channels || []).map((c) => (
          <li key={c.id} className="ch-row">
            <span className="ch-name">
              <a href={`https://www.youtube.com/channel/${c.id}`} target="_blank" rel="noreferrer">{c.name}</a>
              <small className={c.status?.error ? 'bad' : ''}>
                {!c.status ? 'Not checked yet' : c.status.error ? `⚠️ ${c.status.error}` : `${c.status.videos} videos read · ${new Date(c.status.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
              </small>
            </span>
            <span className="ch-comps">
              {COMPS.map(([code]) => (
                <button key={code} className={`chip chip-sm${c.competitions?.includes(code) ? ' on' : ''}`}
                  onClick={() => post({ update: c.id, competitions: toggle(c.competitions || [], code) }, 'Leagues updated')}>{short(code)}</button>
              ))}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => post({ remove: c.id }, 'Channel removed')}>Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); post({ add: channel, competitions: newComps }, 'Channel added').then(() => setChannel('')); }}>
        <div className="row-form">
          <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="youtube.com/@channel" aria-label="YouTube channel link" />
          <button className="btn btn-sm" disabled={!channel.trim()}>Add</button>
        </div>
        <div className="ch-comps new">
          <small>For:</small>
          {COMPS.map(([code, name]) => (
            <button type="button" key={code} className={`chip chip-sm${newComps.includes(code) ? ' on' : ''}`} onClick={() => setNewComps(toggle(newComps, code))} title={name}>{short(code)}</button>
          ))}
        </div>
      </form>
      <button className="btn btn-ghost btn-sm" onClick={() => go(() => api('/api/admin/highlights/find', { method: 'POST' }), 'Checked the channels')}>Check channels now</button>
      {q && (
        <p className="hint">
          {q.enabled ? `YouTube searches today: ${Math.round(q.used / 100)} of ${Math.round(q.budget / 100)} (for older games and previews).` : 'Add YOUTUBE_API_KEY on Render to find videos for older games and previews.'}
        </p>
      )}

      <h3 className="group-label">Set a game&apos;s video</h3>
      <form onSubmit={(e) => { e.preventDefault(); go(() => api('/api/admin/highlights/match', { method: 'POST', body: { competition: comp, matchId, url, kind } }), url ? 'Video saved' : 'Video removed').then(() => setUrl('')); }}>
        <div className="row-form">
          <select value={kind} onChange={(e) => { setKind(e.target.value); setMatchId(''); setResults(null); }} aria-label="Video type">
            <option value="highlight">Highlights</option>
            <option value="preview">Preview</option>
          </select>
          <select value={comp} onChange={(e) => { setComp(e.target.value); setMatchId(''); setResults(null); }} aria-label="Competition">
            {COMPS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div className="row-form">
          <select value={matchId} onChange={(e) => { setMatchId(e.target.value); setResults(null); }} aria-label="Game">
            <option value="">Pick a game…</option>
            {games.map((m) => <option key={m.id} value={m.id}>{dayLabel(m.kickoff)}: {m.home.name} {m.score ? `${m.score.home}–${m.score.away}` : 'v'} {m.away.name}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!matchId || searchingNow} onClick={search}>{searchingNow ? 'Searching…' : '🔎 Search YouTube for this game'}</button>
        {results && (
          <div className="yt-results">
            {results.errors?.map((e) => <p key={e} className="hint">⚠️ {e}</p>)}
            {!results.candidates.length && !results.errors?.length && <p className="hint">YouTube found nothing for this game on these channels.</p>}
            {results.candidates.map((v) => (
              <button type="button" key={v.videoId} className={`yt-result${v.videoId === results.best ? ' best' : ''}`} onClick={() => use(v)}>
                <img src={thumb(v.videoId)} alt="" loading="lazy" />
                <span className="who"><strong>{v.title}</strong><small>{v.channel} · {dayLabel(v.published)}{v.videoId === results.best ? ' · would be picked automatically' : ''}</small></span>
                <span className="btn btn-sm">Use</span>
              </button>
            ))}
          </div>
        )}
        <div className="row-form">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Or paste a YouTube link (empty removes the video)" aria-label="YouTube link" />
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
                <small>{h.auto ? `${h.channel}${h.searched ? ' · searched' : ''}` : 'set by hand'}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
