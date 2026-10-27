import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useApi, useMatches } from '../lib/hooks';
import { dayLabel, timeLabel } from '../lib/format';
import { useToast } from '../components/Toast';
import Crest from '../components/Crest';
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

function MatchRow({ m }) {
  return (
    <li className={`fixture${m.status === 'live' ? ' is-live' : ''}`}>
      <span className="fx-time">
        {m.status === 'live' ? <span className="live-pill">{m.paused ? 'HT' : m.minute ? `${m.minute}'` : 'LIVE'}</span>
          : m.status === 'finished' ? 'FT' : m.status === 'postponed' ? 'PP' : timeLabel(m.kickoff)}
      </span>
      <span className="fx-team home">{m.home.name}<Crest team={m.home} size={22} /></span>
      <span className="fx-score">{m.score ? `${m.score.home} – ${m.score.away}` : 'v'}</span>
      <span className="fx-team away"><Crest team={m.away} size={22} />{m.away.name}</span>
    </li>
  );
}

function Fixtures({ code }) {
  const { data, error, loading, reload } = useMatches(code);
  const groups = useMemo(() => {
    if (!data) return [];
    const md = data.currentMatchday;
    const list = data.matches.filter((m) => m.matchday === md || m.status === 'live').sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const by = new Map();
    for (const m of list) {
      const k = dayLabel(m.kickoff);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(m);
    }
    return [...by.entries()];
  }, [data]);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!groups.length) return <Empty title="No games right now" />;
  return (
    <div>
      {data.currentMatchday && <p className="eyebrow center">Matchday {data.currentMatchday}</p>}
      {groups.map(([day, ms]) => (
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
  const [code, setCode] = useState('PL');
  const [tab, setTab] = useState('games');
  return (
    <div className="page">
      <PageHead title="Live" sub="Scores, tables and top scorers" />
      <Poll />
      <div className="comp-chips" role="tablist" aria-label="Competition">
        {COMPS.map(([c, name]) => <button key={c} role="tab" aria-selected={code === c} className={`chip${code === c ? ' on' : ''}`} onClick={() => setCode(c)}>{name}</button>)}
      </div>
      <Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'games', label: 'Games' }, { value: 'table', label: 'Table' }, { value: 'scorers', label: 'Scorers' }]} />
      <div className="live-body">
        {tab === 'games' && <Fixtures code={code} />}
        {tab === 'table' && <Standings code={code} />}
        {tab === 'scorers' && <Scorers code={code} />}
      </div>
    </div>
  );
}
