import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Dices, Lock } from 'lucide-react';
import { db } from '../lib/firebase';
import { useSession } from '../lib/session';
import { useMyPicks, useNow } from '../lib/hooks';
import { scorePick, pickKind, validDoubles, gameweekComplete } from '../lib/game';
import { dayLabel, timeLabel, countdown } from '../lib/format';
import { useGameMatches } from '../App';
import { useToast } from '../components/Toast';
import Crest from '../components/Crest';
import Confetti from '../components/Confetti';
import { Spinner, ErrorBox, Empty } from '../components/Bits';
import { ReminderPrompt } from '../components/Reminders';
import { RecapSheet, RecapBanner, recapSeen } from '../components/Recap';

const isOpen = (m, now) => m.status === 'upcoming' && new Date(m.kickoff).getTime() > now;

// A realistic-ish random score for "Lucky dip".
function luckyScore() {
  const g = () => [0, 0, 1, 1, 1, 2, 2, 3][Math.floor(Math.random() * 8)];
  return { home: g(), away: g() };
}

function Stepper({ value, onChange, disabled, label }) {
  const v = value ?? null;
  return (
    <div className={`stepper${v === null ? ' empty' : ''}`}>
      <button type="button" aria-label={`${label} plus one`} disabled={disabled || v >= 15} onClick={() => onChange(v === null ? 1 : v + 1)}><ChevronUp size={22} /></button>
      <output aria-label={`${label} goals`}>{v === null ? '–' : v}</output>
      <button type="button" aria-label={`${label} minus one`} disabled={disabled || v === 0} onClick={() => onChange(v === null ? 0 : v - 1)}><ChevronDown size={22} /></button>
    </div>
  );
}

function Outcome({ kind, points, doubled }) {
  const map = { exact: ['🎯', 'Exact score'], result: ['✅', 'Right result'], miss: ['❌', 'Not this time'] };
  const [emoji, text] = map[kind] || ['', ''];
  return <span className={`outcome outcome-${kind}`}>{emoji} {text} · <b>+{points}</b>{doubled && ' ✌️'}</span>;
}

function MatchCard({ m, pick, now, onPick, onDouble, doubleLocked, isDouble }) {
  const open = isOpen(m, now);
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const ms = new Date(m.kickoff).getTime() - now;
  const has = pick && pick.home != null && pick.away != null;
  const kind = has && (live || done) ? pickKind(pick, m.score) : null;
  const pts = has && (live || done) ? (done && pick.points != null ? pick.points : scorePick(pick, m.score, isDouble)) : 0;

  const set = (side) => (n) => {
    const next = { home: pick?.home ?? 0, away: pick?.away ?? 0, double: !!pick?.double, [side]: n };
    onPick(m, next);
  };

  return (
    <article className={`match${live ? ' is-live' : ''}${done ? ' is-done' : ''}${isDouble ? ' is-double' : ''}`}>
      <div className="match-meta">
        {live ? <span className="live-pill">{m.paused ? 'HT' : m.minute ? `${m.minute}'` : 'LIVE'}</span>
          : done ? <span className="meta-ft">FT</span>
            : m.status === 'postponed' ? <span className="meta-ft">Postponed</span>
              : <span>{dayLabel(m.kickoff)} · {timeLabel(m.kickoff)}</span>}
        {open && ms < 3 * 3600_000 && <span className="lock-soon"><Lock size={12} /> locks in {countdown(ms)}</span>}
        {!open && !live && !done && m.status !== 'postponed' && <span className="lock-soon"><Lock size={12} /> locked</span>}
      </div>

      <div className="match-row">
        <div className="side home"><Crest team={m.home} size={40} /><span>{m.home.name}</span></div>
        {open ? (
          <div className="pick-input">
            <Stepper value={pick?.home} onChange={set('home')} label={m.home.name} />
            <span className="dash">–</span>
            <Stepper value={pick?.away} onChange={set('away')} label={m.away.name} />
          </div>
        ) : (
          <div className="score-board">
            {m.score ? <strong className="score">{m.score.home}<span>–</span>{m.score.away}</strong> : <strong className="score muted">v</strong>}
            {has ? <span className="your-pick">You: {pick.home}–{pick.away}</span> : <span className="your-pick muted">No pick</span>}
          </div>
        )}
        <div className="side away"><Crest team={m.away} size={40} /><span>{m.away.name}</span></div>
      </div>

      {(open || ((live || done) && has) || isDouble) && <div className="match-foot">
        {open && (
          <button type="button" className={`double-btn${isDouble ? ' on' : ''}`} disabled={doubleLocked && !isDouble} onClick={() => onDouble(m)} aria-pressed={isDouble}>
            ✌️ {isDouble ? 'Double Up on!' : 'Double Up'}
          </button>
        )}
        {open && has && <span className="saved">Saved ✓</span>}
        {live && has && <span className={`outcome outcome-${kind} pulse`}>If it ends now: <b>+{pts}</b>{isDouble && ' ✌️'}</span>}
        {done && has && <Outcome kind={kind} points={pts} doubled={isDouble} />}
        {!open && isDouble && !done && !live && <span className="saved">✌️ Doubled</span>}
      </div>}
    </article>
  );
}

export default function Predict() {
  const { user, profile, priv } = useSession();
  const { data, error, loading, reload } = useGameMatches();
  const saved = useMyPicks(user.uid);
  const [draft, setDraft] = useState({});
  const [md, setMd] = useState(null);
  const [confetti, setConfetti] = useState(0);
  const [recapMd, setRecapMd] = useState(null);
  const [bannerGone, setBannerGone] = useState(false);
  const toast = useToast();
  const now = useNow(15_000);
  const timers = useRef({});

  const matches = useMemo(() => data?.matches || [], [data]);
  const maxMd = useMemo(() => Math.max(1, ...matches.map((m) => m.matchday || 1)), [matches]);
  const gw = md ?? data?.currentMatchday ?? 1;
  const gwMatches = useMemo(() => matches.filter((m) => m.matchday === gw).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)), [matches, gw]);
  const picks = useMemo(() => ({ ...saved, ...draft }), [saved, draft]);
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, { ...m, kickoff: new Date(m.kickoff).getTime() }])), [matches]);
  const doubles = useMemo(() => validDoubles(gwMatches.map((m) => picks[m.id] && { ...picks[m.id], matchId: m.id }).filter(Boolean), byId), [gwMatches, picks, byId]);
  const doubleLocked = gwMatches.some((m) => !isOpen(m, now) && picks[m.id]?.double);

  // Celebrate exact scores the first time you see them.
  useEffect(() => {
    let seen;
    try { seen = new Set(JSON.parse(localStorage.getItem('igi-celebrated') || '[]')); } catch { seen = new Set(); }
    // Only recent games, so signing in on a new device doesn't replay the whole season.
    const recent = (p) => Date.now() - (p.kickoff?.toMillis?.() ?? 0) < 4 * 86_400_000;
    const unseen = Object.values(saved).filter((p) => p.kind === 'exact' && !seen.has(p.matchId));
    const fresh = unseen.filter(recent);
    unseen.forEach((p) => seen.add(p.matchId));
    try { localStorage.setItem('igi-celebrated', JSON.stringify([...seen])); } catch { /* ignore */ }
    if (!fresh.length) return;
    setConfetti((c) => c + 1); // eslint-disable-line react-hooks/set-state-in-effect -- reacting to a Firestore update
    toast(`🎯 You nailed ${fresh.length === 1 ? 'an exact score' : `${fresh.length} exact scores`}!`, 'good');
  }, [saved, toast]);

  const write = (m, p) => setDoc(doc(db, 'predictions', `${user.uid}_${m.id}`), {
    uid: user.uid, matchId: m.id, home: p.home, away: p.away, double: !!p.double,
    kickoff: Timestamp.fromDate(new Date(m.kickoff)), matchday: m.matchday, updatedAt: serverTimestamp(),
  }).catch(() => {
    toast(isOpen(m, Date.now()) ? "Couldn't save that pick — try again." : `${m.home.tla} v ${m.away.tla} has kicked off, so picks are locked.`, 'bad');
    setDraft((d) => { const x = { ...d }; delete x[m.id]; return x; });
  });

  const onPick = (m, p) => {
    setDraft((d) => ({ ...d, [m.id]: { ...p, matchId: m.id } }));
    clearTimeout(timers.current[m.id]);
    timers.current[m.id] = setTimeout(() => write(m, p), 500);
  };

  const onDouble = (m) => {
    const turnOn = !picks[m.id]?.double;
    const base = picks[m.id] || { home: 0, away: 0 };
    onPick(m, { home: base.home, away: base.away, double: turnOn });
    if (turnOn) {
      for (const o of gwMatches) if (o.id !== m.id && picks[o.id]?.double && isOpen(o, now)) onPick(o, { ...picks[o.id], double: false });
      toast('✌️ Double Up: this game scores double points', 'good');
    }
  };

  const luckyDip = () => {
    const todo = gwMatches.filter((m) => isOpen(m, now) && !picks[m.id]);
    todo.forEach((m) => onPick(m, { ...luckyScore(), double: false }));
    toast(todo.length ? `🎲 Filled ${todo.length} pick${todo.length > 1 ? 's' : ''}. Change any you like!` : 'All picked already!');
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;

  const openCount = gwMatches.filter((m) => isOpen(m, now)).length;
  const pickedOpen = gwMatches.filter((m) => isOpen(m, now) && picks[m.id]).length;
  const picked = gwMatches.filter((m) => picks[m.id]).length;
  const nextLock = gwMatches.find((m) => isOpen(m, now));
  const gwPoints = gwMatches.reduce((sum, m) => {
    const p = picks[m.id];
    if (!p || !(m.status === 'live' || m.status === 'finished')) return sum;
    return sum + (m.status === 'finished' && p.points != null ? p.points : scorePick(p, m.score, doubles.has(m.id)));
  }, 0);
  const anyLive = gwMatches.some((m) => m.status === 'live');
  const playedIn = (md) => Object.values(saved).some((p) => p.matchday === md);
  const gwDone = gameweekComplete(matches, gw) && playedIn(gw);
  // The latest finished gameweek you played in, for the "recap is ready" banner.
  let lastDone = null;
  for (let md = data?.currentMatchday ?? 0; md >= 1; md--) {
    if (gameweekComplete(matches, md)) { lastDone = playedIn(md) ? md : null; break; }
  }
  const showBanner = lastDone && !bannerGone && !recapSeen(lastDone);

  return (
    <div className="page predict">
      <Confetti fire={confetti} />
      {priv?.consent === 'pending' && (
        <Link to="/me" className="banner banner-warn">👋 Ask a parent or carer to OK your account to unlock leagues and chat. <u>Show me how</u></Link>
      )}

      {showBanner && <RecapBanner matchday={lastDone} onOpen={() => setRecapMd(lastDone)} onDismiss={() => setBannerGone(true)} />}

      <section className="gw-hero kit">
        <div className="gw-nav">
          <button className="icon-btn" onClick={() => setMd(Math.max(1, gw - 1))} disabled={gw <= 1} aria-label="Previous gameweek"><ChevronLeft size={22} /></button>
          <div className="gw-title">
            <span className="eyebrow">Premier League</span>
            <h1>Gameweek {gw}</h1>
          </div>
          <button className="icon-btn" onClick={() => setMd(Math.min(maxMd, gw + 1))} disabled={gw >= maxMd} aria-label="Next gameweek"><ChevronRight size={22} /></button>
        </div>
        <div className="gw-stats">
          <div><b>{gwPoints}</b><span>{anyLive ? 'points (live)' : 'points'}</span></div>
          <div><b>{picked}/{gwMatches.length}</b><span>picked</span></div>
          <div><b>{profile?.stats?.streak || 0}🔥</b><span>streak</span></div>
        </div>
        {gwDone && <button className="btn btn-sm gw-recap-btn" onClick={() => setRecapMd(gw)}>📊 See my recap</button>}
        {nextLock && <p className="gw-deadline"><Lock size={14} /> Next game locks in <b>{countdown(new Date(nextLock.kickoff) - now)}</b></p>}
      </section>

      {openCount > 0 && (
        <div className="predict-tools">
          <span className="hint">Tap ▲▼ to set the score. Picks save automatically.</span>
          {pickedOpen < openCount && <button className="btn btn-ghost btn-sm" onClick={luckyDip}><Dices size={16} /> Lucky dip</button>}
        </div>
      )}

      <ReminderPrompt show={Object.keys(saved).length > 0} />

      {gwMatches.length === 0 ? <Empty title="No games this gameweek" /> : (
        <div className="match-list">
          {gwMatches.map((m) => (
            <MatchCard key={m.id} m={m} pick={picks[m.id]} now={now} onPick={onPick} onDouble={onDouble}
              doubleLocked={doubleLocked} isDouble={doubles.has(m.id)} />
          ))}
        </div>
      )}

      <RecapSheet matchday={recapMd} open={!!recapMd} onClose={() => { setRecapMd(null); setBannerGone(true); }} />

      <details className="how">
        <summary>How points work</summary>
        <ul>
          <li>🎯 <b>3 points</b> for the exact score</li>
          <li>✅ <b>1 point</b> for the right result (win, draw or loss)</li>
          <li>✌️ <b>Double Up</b> one game a gameweek to double its points</li>
          <li>🔒 Picks lock at kickoff. Then everyone in your leagues can see them.</li>
        </ul>
      </details>
    </div>
  );
}
