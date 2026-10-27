import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, MapPin } from 'lucide-react';
import { useApi, useNow } from '../lib/hooks';
import { useSession } from '../lib/session';
import { dayLabel, timeLabel, ordinal } from '../lib/format';
import { clubColors } from '../lib/clubs';
import { useToast } from '../components/Toast';
import Crest from '../components/Crest';
import Avatar from '../components/Avatar';
import Confetti from '../components/Confetti';
import { Spinner, ErrorBox } from '../components/Bits';
import Video from '../components/Video';

const EVENT_ICON = { goal: '⚽', penalty: '⚽', own_goal: '⚽', yellow: '🟨', second_yellow: '🟨🟥', red: '🟥', sub: '🔁' };
const isLive = (d) => d?.match?.status === 'live'
  || (d?.match?.status === 'upcoming' && Math.abs(new Date(d.match.kickoff) - Date.now()) < 15 * 60_000);

function Scoreboard({ m, past }) {
  const live = m.status === 'live';
  return (
    <section className={`mc-hero${live ? ' is-live' : ''}`} style={{ '--home': clubColors(m.home)[0], '--away': clubColors(m.away)[0] }}>
      <div className="mc-meta">
        {live ? <span className="live-pill">{m.paused ? 'HALF TIME' : m.minute ? `${m.minute}'` : 'LIVE'}</span>
          : m.status === 'finished' ? <span className="mc-ft">FULL TIME{past ? ` · ${new Date(m.kickoff).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>
            : m.status === 'postponed' ? <span className="mc-ft">POSTPONED</span>
              : <span className="mc-ft">{dayLabel(m.kickoff)} · {timeLabel(m.kickoff)}</span>}
      </div>
      <div className="mc-teams">
        <div className="mc-team"><Crest team={m.home} size={64} /><strong>{m.home.name}</strong></div>
        <div className="mc-score" aria-live="polite">
          {m.score ? <>{m.score.home}<span>–</span>{m.score.away}</> : <span className="vs">VS</span>}
        </div>
        <div className="mc-team"><Crest team={m.away} size={64} /><strong>{m.away.name}</strong></div>
      </div>
      {(m.venue || m.referee) && (
        <p className="mc-venue">{m.venue && <><MapPin size={13} /> {m.venue}</>}{m.venue && m.referee ? ' · ' : ''}{m.referee && `Ref: ${m.referee}`}</p>
      )}
    </section>
  );
}

function Timeline({ events, m }) {
  if (!events?.length) return null;
  return (
    <section className="card">
      <h2 className="section-title">Timeline</h2>
      <ol className="mc-timeline">
        {[...events].reverse().map((e, i) => (
          <li key={i} className={`ev ev-${e.side} ev-${e.kind}`}>
            <span className="ev-min">{e.clock ? `${e.clock}'` : ''}</span>
            <span className="ev-icon" aria-hidden="true">{EVENT_ICON[e.kind]}</span>
            <span className="ev-text">
              {e.kind === 'sub' ? <><b>{e.player}</b> on for {e.out}</> : <b>{e.player || (e.side === 'home' ? m.home.name : m.away.name)}</b>}
              {e.kind === 'penalty' && ' (pen)'}
              {e.kind === 'own_goal' && ' (own goal)'}
              {e.assist && <small> · assist {e.assist}</small>}
              {e.score && <small className="ev-score"> {e.score.home}–{e.score.away}</small>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Lineups({ lineups, m }) {
  if (!lineups) return null;
  const col = (side) => {
    const l = lineups[side];
    return (
      <div className="mc-xi">
        <h3><Crest team={m[side]} size={18} /> {l.formation || ''}</h3>
        <ol>{l.starting.map((p) => <li key={p.name}><span className="shirt">{p.number ?? ''}</span>{p.name}</li>)}</ol>
        {l.bench.length > 0 && <p className="hint">Subs: {l.bench.map((p) => p.name).join(', ')}</p>}
        {l.coach && <p className="hint">Manager: {l.coach}</p>}
      </div>
    );
  };
  return (
    <section className="card">
      <h2 className="section-title">Line-ups</h2>
      <div className="mc-lineups">{col('home')}{col('away')}</div>
    </section>
  );
}

function Picks({ mine, mates, m, canPick }) {
  const live = m.status === 'live';
  return (
    <section className="card mc-picks">
      <h2 className="section-title">Predictions</h2>
      <div className="mc-mine">
        <span>Your pick</span>
        {mine ? (
          <b>{mine.home}–{mine.away}{mine.double ? ' ✌️' : ''}</b>
        ) : <b className="muted">No pick</b>}
        {mine?.points != null && <span className={`outcome ${mine.points >= 3 ? 'outcome-exact' : mine.points > 0 ? 'outcome-result' : 'outcome-miss'}`}>{live ? 'If it ends now: ' : ''}<b>+{mine.points}</b></span>}
        {canPick && <Link to="/predict" className="btn btn-sm">{mine ? 'Change' : 'Make a pick'}</Link>}
      </div>
      {mates && !mates.revealed && (
        <p className="hint"><Lock size={13} /> {mates.picked} of your {mates.total} league mates have picked. Their picks show at kickoff.</p>
      )}
      {mates?.revealed && mates.picked > 0 && (
        <>
          <div className="mc-split" role="img" aria-label={`${mates.split.home} backing ${m.home.name}, ${mates.split.draw} a draw, ${mates.split.away} backing ${m.away.name}`}>
            {['home', 'draw', 'away'].map((k) => mates.split[k] > 0 && (
              <span key={k} className={`seg seg-${k}`} style={{ flex: mates.split[k] }}>
                {k === 'draw' ? 'Draw' : m[k].tla} {mates.split[k]}
              </span>
            ))}
          </div>
          <ul className="mc-mates">
            {mates.list.map((p) => (
              <li key={p.uid}>
                <Avatar user={p} size={30} />
                <span className="who"><strong>{p.nickname}</strong></span>
                <span className="mc-mate-pick">{p.pick.home}–{p.pick.away}{p.pick.double ? ' ✌️' : ''}</span>
                {p.points != null && <span className={`pts-chip ${p.points >= 3 ? 'exact' : p.points > 0 ? 'result' : ''}`}>+{p.points}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {mates?.revealed && mates.picked === 0 && <p className="hint">None of your league mates picked this game.</p>}
    </section>
  );
}

function Highlights({ h }) {
  if (!h?.videoId) return null;
  return (
    <section className="card mc-highlights">
      <h2 className="section-title">📺 Highlights</h2>
      <Video id={h.videoId} title={h.title} />
      <p className="hint">{h.channel ? `${h.channel} · ` : ''}<a href={`https://www.youtube.com/watch?v=${h.videoId}`} target="_blank" rel="noreferrer">Watch on YouTube</a></p>
    </section>
  );
}

function FormAndHistory({ form, h2h, m }) {
  const formRow = (side) => {
    const r = form?.[side];
    if (!r) return null;
    return (
      <div className="mc-form-row">
        <Crest team={m[side]} size={20} />
        <span className="who"><strong>{m[side].name}</strong><small>{r.position ? `${ordinal(r.position)} · ${r.points} pts` : ''}</small></span>
        <span className="form">{(r.form || '').split('').map((f, i) => <i key={i} className={`f-${f}`}>{f}</i>)}</span>
      </div>
    );
  };
  const hasForm = form?.home || form?.away;
  if (!hasForm && !h2h?.count) return null;
  return (
    <section className="card">
      {hasForm && <><h2 className="section-title">Form</h2>{formRow('home')}{formRow('away')}</>}
      {h2h?.count > 0 && (
        <>
          <h2 className="section-title mc-h2h-title">Head to head</h2>
          <div className="mc-h2h">
            <div><b>{h2h.home.wins}</b><span>{m.home.tla} wins</span></div>
            <div><b>{h2h.home.draws}</b><span>draws</span></div>
            <div><b>{h2h.away.wins}</b><span>{m.away.tla} wins</span></div>
          </div>
          <ul className="fixtures mc-past">
            {h2h.matches.map((x) => (
              <li key={x.id}><Link to={`/match/${x.id}?c=${x.competition || 'PL'}`} className="fixture">
                <span className="fx-time">{new Date(x.kickoff).getFullYear()}</span>
                <span className="fx-team home">{x.home.name}</span>
                <span className="fx-score">{x.score ? `${x.score.home} – ${x.score.away}` : '–'}</span>
                <span className="fx-team away">{x.away.name}</span>
              </Link></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default function MatchCentre() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const competition = params.get('c') || 'PL';
  const { user } = useSession();
  const { data, error, reload } = useApi(`/api/match/${id}?competition=${competition}`, { refresh: 5 * 60_000, fastRefresh: 30_000, isLive });
  const toast = useToast();
  const [goalFx, setGoalFx] = useState(0);
  const [seen, setSeen] = useState({ id: null, total: null });
  const navigate = useNavigate();
  const now = useNow(30_000);

  // While another match loads, the previous one's data is still here; don't show it.
  const m = data?.match?.id === id ? data.match : null;
  // A goal while you're watching: confetti and a shout. Only within the same match.
  const total = m?.score ? m.score.home + m.score.away : null;
  if (m && (m.id !== seen.id || total !== seen.total)) {
    if (m.id === seen.id && seen.total != null && total != null && total > seen.total) setGoalFx((n) => n + 1);
    setSeen({ id: m.id, total });
  }
  useEffect(() => {
    if (goalFx) toast(`⚽ GOAL! ${m.home.tla} ${m.score.home}–${m.score.away} ${m.away.tla}`, 'good');
  }, [goalFx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  if (error && !m) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!m) return <Spinner />;
  const canPick = !!user && ['PL', 'CL'].includes(competition) && m.status === 'upcoming' && new Date(m.kickoff).getTime() > now;

  return (
    <div className="page match-centre">
      <Confetti fire={goalFx} />
      <button className="link-btn mc-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/live'))}>
        <ArrowLeft size={16} /> Back
      </button>
      <Scoreboard m={m} past={data.past} />
      <Highlights h={data.highlight} />
      {user && !data.past && ['PL', 'CL'].includes(competition) && <Picks mine={data.mine} mates={data.mates} m={m} canPick={canPick} />}
      <Timeline events={m.events} m={m} />
      <Lineups lineups={m.lineups} m={m} />
      <FormAndHistory form={data.form} h2h={data.h2h} m={m} />
    </div>
  );
}
