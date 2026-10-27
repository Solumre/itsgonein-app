import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, MapPin, Send } from 'lucide-react';
import { useApi, useNow, useMyLeagues, useSnapshot } from '../lib/hooks';
import { QUICK_CHAT } from '../lib/game';
import { ago } from '../lib/format';
import PickReactions from '../components/PickReactions';
import { api } from '../lib/api';
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

const LIVE_TEXT = {
  next: (q) => ({ title: '⚽ Who scores next?', sub: q?.at ? `Asked at ${q.at.home}–${q.at.away}` : '', pts: 2 }),
  h1: () => ({ title: '⏱️ Goal before half-time?', sub: 'Still 0–0', pts: 1 }),
  h2: () => ({ title: '⏱️ Goal in the second half?', sub: 'No second-half goals yet', pts: 1 }),
};
const HISTORY_TEXT = { next: 'Next goal', h1: 'Goal before half-time', h2: 'Goal in the second half' };
const optionLabel = (o, m) => ({ home: m.home.tla, away: m.away.tla, none: 'No more goals', yes: 'Yes', no: 'No' }[o]);
const RESULT_ICON = (h) => (h.result == null ? '⏳' : h.result === 'void' ? '➖' : h.points > 0 ? '✅' : '❌');

function LivePicks({ live, m, competition, onAnswered }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const send = async (qid, answer) => {
    setBusy(qid);
    try {
      await api(`/api/match/${m.id}/live?competition=${competition}`, { method: 'POST', body: { qid, answer } });
      toast('🔒 Locked in!', 'good');
      await onAnswered();
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(null);
  };
  return (
    <section className="card live-picks">
      <header className="lp-head">
        <h2 className="section-title">⚡ Live picks</h2>
        {live.points > 0 && <span className="pts-chip exact">+{live.points}</span>}
      </header>
      {live.open.length === 0 && m.status === 'live' && <p className="hint">No questions open right now. A new one opens after every goal.</p>}
      {live.open.map((q) => {
        const t = LIVE_TEXT[q.kind](q);
        return (
          <div key={q.id} className="lp-q">
            <div className="lp-title"><b>{t.title}</b><small>{t.sub} · right answer +{t.pts}</small></div>
            <div className={`lp-options n${q.options.length}`}>
              {q.options.map((o) => (
                <button key={o} className={`lp-opt${q.mine === o ? ' mine' : ''}`} disabled={!!q.mine || busy === q.id} onClick={() => send(q.id, o)}>
                  <span>{optionLabel(o, m)}</span>
                  {q.mates.filter((x) => x.answer === o).length > 0 && (
                    <span className="lp-mates">{q.mates.filter((x) => x.answer === o).slice(0, 4).map((x) => <Avatar key={x.nickname} user={x} size={20} />)}</span>
                  )}
                </button>
              ))}
            </div>
            {q.mine && <p className="hint">🔒 Locked in. We&apos;ll mark it when it happens.</p>}
          </div>
        );
      })}
      {live.history.length > 0 && (
        <ul className="lp-history">
          {live.history.map((h) => (
            <li key={h.qid}>
              <span>{RESULT_ICON(h)}</span>
              <span className="who">{HISTORY_TEXT[h.kind]}{h.kind === 'next' ? ` at ${h.qid.slice(5).replace('-', '–')}` : ''}
                <small>You said {optionLabel(h.answer, m)}{h.result && h.result !== 'void' && h.result !== h.answer ? `, it was ${optionLabel(h.result, m)}` : ''}</small>
              </span>
              {h.points > 0 && <span className="pts-chip exact">+{h.points}</span>}
            </li>
          ))}
        </ul>
      )}
      {live.board.length > 1 && (
        <p className="lp-board">This game: {live.board.map((b) => <span key={b.uid} className={b.me ? 'me' : ''}>{b.me ? 'You' : b.nickname} <b>{b.points}</b></span>)}</p>
      )}
      <p className="hint">Each live point is worth 5 XP. Live picks don&apos;t change league tables.</p>
    </section>
  );
}

// Chat about this game with a league: messages tagged with it, from the league chat.
function MatchTalk({ m }) {
  const { user, priv, profile } = useSession();
  const { data: leagues } = useMyLeagues(user?.uid);
  const [picked, setPicked] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const code = picked || leagues?.[0]?.id || null;
  const ref = useMemo(() => code && query(collection(db, 'leagues', code, 'messages'), where('matchId', '==', m.id), limit(60)), [code, m.id]);
  const { data: msgs } = useSnapshot(ref);
  if (!user || !leagues) return null;
  if (!leagues.length) {
    return (
      <section className="card">
        <h2 className="section-title">💬 Match talk</h2>
        <p className="hint">Join a league to talk about this game with your mates. <Link to="/leagues">Leagues ›</Link></p>
      </section>
    );
  }
  const blocked = new Set(priv?.blocked || []);
  const list = [...(msgs || [])].filter((x) => !x.deleted && !blocked.has(x.uid))
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity)).slice(-30);
  const send = async (body) => {
    setBusy(true);
    try {
      await api(`/api/leagues/${code}/messages`, { method: 'POST', body: { ...body, matchId: m.id } });
      if (body.text) setText('');
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };
  return (
    <section className="card match-talk">
      <h2 className="section-title">💬 Match talk</h2>
      {leagues.length > 1 && (
        <div className="comp-chips" role="tablist" aria-label="League">
          {leagues.map((l) => <button key={l.id} role="tab" aria-selected={l.id === code} className={`chip chip-sm${l.id === code ? ' on' : ''}`} onClick={() => setPicked(l.id)}>{l.name}</button>)}
        </div>
      )}
      <div className="mt-list">
        {list.length === 0 && <p className="hint">Nothing yet about {m.home.tla} v {m.away.tla}. Say something!</p>}
        {list.map((x) => (x.type === 'system' ? (
          <p key={x.id} className="sys-msg">{x.text}</p>
        ) : (
          <div key={x.id} className={`mt-msg${x.uid === user.uid ? ' mine' : ''}`}>
            <Avatar user={x} size={24} />
            <span className="mt-body"><b style={{ color: x.color || undefined }}>{x.uid === user.uid ? 'You' : x.nickname}</b> {x.type === 'pick' && '🔮 '}{x.text}<time>{ago(x.createdAt?.toDate?.())}</time></span>
          </div>
        )))}
      </div>
      <div className="quick-row" role="toolbar" aria-label="Quick chat">
        {Object.entries(QUICK_CHAT).slice(0, 6).map(([id, t]) => <button key={id} className="chip chip-sm" disabled={busy} onClick={() => send({ quick: id })}>{t}</button>)}
      </div>
      <form className="composer-row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={`Message as ${profile?.nickname || 'you'}…`} aria-label="Message about this game" />
        <button className="send" disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
      <p className="hint">Goes to your {leagues.find((l) => l.id === code)?.name} chat too. Be kind!</p>
    </section>
  );
}

function Picks({ mine, mates, m, canPick, onChange }) {
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
      {mine?.reactions?.length > 0 && <p className="mc-mine-rx">Mates on your pick: <PickReactions reactions={mine.reactions} /></p>}
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
                <PickReactions reactions={p.reactions} matchId={m.id} target={p.uid} canReact onChange={onChange} />
              </li>
            ))}
          </ul>
        </>
      )}
      {mates?.revealed && mates.picked === 0 && <p className="hint">None of your league mates picked this game.</p>}
    </section>
  );
}

function Highlights({ h, title = '📺 Highlights' }) {
  if (!h?.videoId) return null;
  return (
    <section className="card mc-highlights">
      <h2 className="section-title">{title}</h2>
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
      <Highlights h={data.preview} title="🎬 Preview" />
      {data.live && <LivePicks live={data.live} m={m} competition={competition} onAnswered={reload} />}
      {user && !data.past && ['PL', 'CL'].includes(competition) && <Picks mine={data.mine} mates={data.mates} m={m} canPick={canPick} onChange={reload} />}
      {user && !data.past && ['PL', 'CL'].includes(competition) && <MatchTalk m={m} />}
      <Timeline events={m.events} m={m} />
      <Lineups lineups={m.lineups} m={m} />
      <FormAndHistory form={data.form} h2h={data.h2h} m={m} />
    </div>
  );
}
