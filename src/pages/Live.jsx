import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useApi, useMatches } from '../lib/hooks';
import { dayLabel, timeLabel } from '../lib/format';
import { roundLabel } from '../lib/game';
import { useToast } from '../components/Toast';
import Crest from '../components/Crest';
import { thumb } from '../components/Video';
import { Spinner, ErrorBox, Empty, Segmented, PageHead } from '../components/Bits';

const COMPS = [
  ['PL', 'Premier League'], ['ELC', 'Championship'], ['CL', 'Champions League'],
  ['PD', 'La Liga'], ['BL1', 'Bundesliga'], ['SA', 'Serie A'], ['FL1', 'Ligue 1'],
];

function Poll() {
  const { user } = useSession();
  const { data, reload } = useApi('/api/poll');
  const toast = useToast();
  const poll = data?.poll;
  if (!poll) return null;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const voted = !!poll.myVote;
  const vote = async (id) => {
    if (!user) return toast('Sign in to vote');
    try { await api('/api/poll/vote', { method: 'POST', body: { option: id } }); toast('🗳️ Vote counted!', 'good'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <section className="card poll">
      <header><h2>{poll.title}</h2><span className="eyebrow">{total} vote{total === 1 ? '' : 's'}</span></header>
      {poll.options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <button key={o.id} className={`poll-option${poll.myVote === o.id ? ' mine' : ''}`} disabled={voted} onClick={() => vote(o.id)}>
            {voted && <span className="poll-bar" style={{ width: `${pct}%` }} />}
            <span className="poll-name"><b>{o.name}</b> <small>{o.team}</small></span>
            {voted && <span className="poll-pct">{pct}%</span>}
          </button>
        );
      })}
      {!voted && <p className="hint">Tap to vote. One vote each per week.</p>}
    </section>
  );
}

function HighlightsStrip() {
  const { data } = useApi('/api/highlights', { refresh: 10 * 60_000 });
  const list = data?.highlights || [];
  if (!list.length) return null;
  return (
    <section className="hl-strip" aria-label="Latest highlights">
      <h2 className="section-title">📺 Latest highlights</h2>
      <div className="hl-row">
        {list.map((h) => (
          <Link key={h.matchId} to={`/match/${h.matchId}?c=${h.competition}`} className="hl-card">
            <span className="hl-thumb" style={{ backgroundImage: `url(${thumb(h.videoId)})` }}><span className="video-play sm">▶</span></span>
            <span className="hl-score"><Crest team={h.home} size={16} /> {h.home.tla} {h.score ? `${h.score.home}–${h.score.away}` : 'v'} {h.away.tla} <Crest team={h.away} size={16} /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MatchRow({ m }) {
  return (
    <li><Link to={`/match/${m.id}?c=${m.competition}`} className={`fixture${m.status === 'live' ? ' is-live' : ''}`}>
      <span className="fx-time">
        {m.status === 'live' ? <span className="live-pill">{m.paused ? 'HT' : m.minute ? `${m.minute}'` : 'LIVE'}</span>
          : m.status === 'finished' ? 'FT' : m.status === 'postponed' ? 'PP' : timeLabel(m.kickoff)}
      </span>
      <span className="fx-team home">{m.home.name}<Crest team={m.home} size={22} /></span>
      <span className="fx-score">{m.score ? `${m.score.home} – ${m.score.away}` : 'v'}</span>
      <span className="fx-team away"><Crest team={m.away} size={22} />{m.away.name}</span>
    </Link></li>
  );
}

const roundName = (code, md) => (code === 'PL' || code === 'CL' ? roundLabel(code, md) : `Matchday ${md}`);

function Fixtures({ code }) {
  const { data, error, loading, reload } = useMatches(code);
  // The round lives in the address, so Back from a match centre returns to it.
  const [params, setParams] = useSearchParams();
  const picked = params.get('r') ? Number(params.get('r')) : null; // null = the current round
  const setPicked = (r) => setParams((p) => { const n = new URLSearchParams(p); if (r == null) n.delete('r'); else n.set('r', r); return n; }, { replace: true });
  const rounds = useMemo(() => [...new Set((data?.matches || []).map((m) => m.matchday).filter((n) => n != null))].sort((a, b) => a - b), [data]);
  const md = picked ?? data?.currentMatchday ?? rounds[0];
  const isCurrent = md === data?.currentMatchday;
  const groups = useMemo(() => {
    if (!data) return [];
    const list = data.matches.filter((m) => m.matchday === md || (isCurrent && m.status === 'live')).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const by = new Map();
    for (const m of list) {
      const k = dayLabel(m.kickoff);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(m);
    }
    return [...by.entries()];
  }, [data, md, isCurrent]);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const i = rounds.indexOf(md);
  return (
    <div>
      {md != null && (
        <div className="round-nav">
          <button className="icon-btn" aria-label="Previous round" disabled={i <= 0} onClick={() => setPicked(rounds[i - 1])}><ChevronLeft size={20} /></button>
          <span className="eyebrow">{roundName(code, md)}</span>
          <button className="icon-btn" aria-label="Next round" disabled={i < 0 || i >= rounds.length - 1} onClick={() => setPicked(rounds[i + 1])}><ChevronRight size={20} /></button>
        </div>
      )}
      {!isCurrent && data.currentMatchday != null && <button className="link-btn round-back" onClick={() => setPicked(null)}>Back to this round</button>}
      {!groups.length ? <Empty title="No games right now" /> : groups.map(([day, ms]) => (
        <section key={day} className="day">
          <h3 className="group-label">{day}</h3>
          <ul className="fixtures">{ms.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function Standings({ code }) {
  const { profile } = useSession();
  const { data, error, loading, reload } = useApi(`/api/standings?competition=${code}`);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data?.standings?.length) return <Empty title="No table yet" />;
  const mine = profile?.club?.tla;
  return data.standings.map((s) => (
    <section key={s.group || 'all'} className="card table-card">
      {s.group && <h3 className="group-label">{s.group.replace('_', ' ')}</h3>}
      <table className="league-table">
        <thead><tr><th>#</th><th className="left">Club</th><th>P</th><th>GD</th><th>Pts</th><th className="form-col">Form</th></tr></thead>
        <tbody>
          {s.table.map((r) => (
            <tr key={r.team.id} className={`${r.team.tla === mine ? 'mine' : ''} ${code === 'PL' && r.position <= 4 ? 'zone-top' : ''} ${code === 'PL' && r.position >= 18 ? 'zone-bottom' : ''}`}>
              <td>{r.position}</td>
              <td className="left"><span className="tbl-team"><Crest team={r.team} size={20} />{r.team.name}</span></td>
              <td>{r.played}</td>
              <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="tbl-pts">{r.points}</td>
              <td className="form-col"><span className="form">{r.form.split('').map((f, i) => <i key={i} className={`f-${f}`}>{f}</i>)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ));
}

function Scorers({ code }) {
  const { data, error, loading, reload } = useApi(`/api/scorers?competition=${code}`);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data?.scorers?.length) return <Empty title="No scorers yet" />;
  const [top, ...rest] = data.scorers;
  return (
    <div>
      <section className="boot kit">
        <span className="eyebrow">Golden Boot race</span>
        <div className="boot-row"><Crest team={top.team} size={48} /><div><h2>{top.name}</h2><span>{top.team.name}</span></div><b>{top.goals}<small>goals</small></b></div>
      </section>
      <ol className="scorers">
        {rest.map((s, i) => (
          <li key={s.name}><span className="pos">{i + 2}</span><Crest team={s.team} size={24} /><span className="who"><strong>{s.name}</strong><small>{s.team.name}</small></span><b>{s.goals}</b></li>
        ))}
      </ol>
    </div>
  );
}

export default function Live() {
  const [params, setParams] = useSearchParams();
  const code = params.get('c') || 'PL';
  const setCode = (c) => setParams(c === 'PL' ? {} : { c }, { replace: true });
  const [tab, setTab] = useState('games');
  return (
    <div className="page">
      <PageHead title="Live" sub="Scores, tables and top scorers" />
      <HighlightsStrip />
      <Poll />
      <div className="comp-chips" role="tablist" aria-label="Competition">
        {COMPS.map(([c, name]) => <button key={c} role="tab" aria-selected={code === c} className={`chip${code === c ? ' on' : ''}`} onClick={() => setCode(c)}>{name}</button>)}
      </div>
      <Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'games', label: 'Games' }, { value: 'table', label: 'Table' }, { value: 'scorers', label: 'Scorers' }]} />
      <div className="live-body">
        {tab === 'games' && <Fixtures key={code} code={code} />}
        {tab === 'table' && <Standings code={code} />}
        {tab === 'scorers' && <Scorers code={code} />}
      </div>
    </div>
  );
}
