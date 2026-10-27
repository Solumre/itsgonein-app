import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Confetti from '../components/Confetti';
import { PageHead, Spinner } from '../components/Bits';

const X = [18, 50, 82]; // % across the goal for left, centre, right
const Y = [24, 68]; // % down the goal for top, bottom
const OVER_AT = 85; // power above this goes over the bar
const SAY = { goal: 'GOAL!', saved: 'SAVED!', miss: 'MISSED!' };

// Card for the Predict page.
export function PensCard() {
  return (
    <Link to="/penalties" className="quiz-card pens-card">
      <span className="quiz-card-icon">🥅</span>
      <span className="who"><strong>Penalty shootout</strong><small>5 kicks each, then sudden death · up to +20 XP a day</small></span>
      <span className="btn btn-sm">Play</span>
    </Link>
  );
}

function PowerBar({ onStop }) {
  const [v, setV] = useState(0);
  const val = useRef(0);
  useEffect(() => {
    let raf, t0;
    const step = (t) => {
      t0 ??= t;
      // Up and down about once a second and a bit.
      const phase = ((t - t0) / 1300) % 1;
      val.current = Math.round((phase < 0.5 ? phase * 2 : 2 - phase * 2) * 100);
      setV(val.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <button className="pen-power" onClick={() => onStop(val.current)} aria-label="Shoot! Tap to set the power">
      <span className="pen-power-bar"><span className="pen-power-red" style={{ left: `${OVER_AT}%` }} /><span className="pen-power-mark" style={{ left: `${v}%` }} /></span>
      <span className="pen-power-label">TAP TO SHOOT!</span>
    </button>
  );
}

function Dots({ kicks, side }) {
  const mine = kicks.filter((_, i) => i % 2 === (side === 'you' ? 0 : 1));
  const n = Math.max(5, mine.length);
  return (
    <span className="pen-dots">
      {Array.from({ length: n }, (_, i) => {
        const k = mine[i];
        return <i key={i} className={!k ? '' : k.result === 'goal' ? 'goal' : 'miss'}>{!k ? '' : k.result === 'goal' ? '✓' : '✗'}</i>;
      })}
    </span>
  );
}

export default function Penalties() {
  const { profile } = useSession();
  const { data: board, reload: reloadBoard } = useApi('/api/pens');
  const toast = useToast();
  const [game, setGame] = useState(null); // { id, you, cpu, next, done, result, points }
  const [kicks, setKicks] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | aim | power | fly | dive | over
  const [aim, setAim] = useState(null);
  const [anim, setAnim] = useState(null); // { ball: {x, y}, keeper: col, say, mine }
  const [fx, setFx] = useState(0);
  const myKit = profile?.club?.primary || '#22c55e';

  const start = async () => {
    try {
      const g = await api('/api/pens', { method: 'POST' });
      setGame(g); setKicks([]); setAnim(null); setAim(null); setPhase('aim');
    } catch (e) { toast(e.message, 'bad'); }
  };

  const play = async (body, mine) => {
    setPhase('fly');
    try {
      const r = await api(`/api/pens/${game.id}/kick`, { method: 'POST', body });
      const k = r.kick;
      const ball = k.over ? { x: X[k.col], y: -30 } : k.off ? { x: k.col === 1 ? 50 : X[k.col] + (k.col ? 14 : -14), y: -24 } : { x: X[k.col], y: Y[k.row] };
      setAnim({ ball, keeper: mine ? k.keeper : k.dive, say: SAY[k.result], good: mine ? k.result === 'goal' : k.result !== 'goal', mine });
      setKicks((ks) => [...ks, k]);
      setTimeout(() => {
        setGame((g) => ({ ...g, ...r }));
        if (r.done) {
          setPhase('over');
          if (r.result === 'won') setFx((n) => n + 1);
          reloadBoard();
        } else {
          setAnim(null); setAim(null);
          setPhase(r.next === 'shoot' ? 'aim' : 'dive');
        }
      }, 1700);
    } catch (e) {
      toast(e.message, 'bad');
      setPhase(mine ? 'aim' : 'dive');
    }
  };

  const shoot = (power) => play({ type: 'shoot', col: aim.col, row: aim.row, over: power > OVER_AT }, true);
  const dive = (col) => play({ type: 'save', col }, false);

  const keeperIsYou = phase === 'dive' || (anim && !anim.mine);
  const you = kicks.filter((k, i) => i % 2 === 0 && k.result === 'goal').length;
  const cpu = kicks.filter((k, i) => i % 2 === 1 && k.result === 'goal').length;

  return (
    <div className="page pens">
      <Confetti fire={fx} />
      <PageHead title="Penalties" sub="You take five, you face five. Then it's sudden death!" />

      {phase !== 'idle' && (
        <div className="pen-score">
          <span className="pen-side"><b>You</b><Dots kicks={kicks} side="you" /></span>
          <span className="pen-big">{you}–{cpu}</span>
          <span className="pen-side right"><b>CPU</b><Dots kicks={kicks} side="cpu" /></span>
        </div>
      )}

      <section className={`pen-pitch${phase === 'idle' ? ' idle' : ''}`}>
        <div className="pen-goal">
          {phase === 'aim' && [0, 1].map((row) => [0, 1, 2].map((col) => (
            <button key={`${col}${row}`} className="pen-zone" style={{ left: `${col * 33.33}%`, top: `${row * 50}%` }}
              aria-label={`Aim ${['top', 'bottom'][row]} ${['left', 'middle', 'right'][col]}`}
              onClick={() => { setAim({ col, row }); setPhase('power'); }}>
              <span>🎯</span>
            </button>
          )))}
          {phase === 'power' && aim && <span className="pen-target" style={{ left: `${X[aim.col]}%`, top: `${Y[aim.row]}%` }}>🎯</span>}
          <span className={`pen-keeper${anim ? ` dive-${anim.keeper}` : ''}`} style={{ '--kit': keeperIsYou ? myKit : '#d9f99d' }} aria-hidden="true">
            <svg viewBox="0 0 60 70" width="60" height="70">
              <circle cx="30" cy="12" r="9" fill="#f1c27d" />
              <rect x="16" y="22" width="28" height="26" rx="6" fill="var(--kit)" />
              <rect x="4" y="24" width="12" height="7" rx="3.5" fill="var(--kit)" /><rect x="44" y="24" width="12" height="7" rx="3.5" fill="var(--kit)" />
              <circle cx="4" cy="27" r="5" fill="#fff" /><circle cx="56" cy="27" r="5" fill="#fff" />
              <rect x="19" y="48" width="9" height="18" rx="3" fill="#222" /><rect x="32" y="48" width="9" height="18" rx="3" fill="#222" />
            </svg>
          </span>
        </div>
        <span className={`pen-ball${anim ? ' fly' : ''}`} style={anim ? { left: `${10 + anim.ball.x * 0.8}%`, top: `${8 + anim.ball.y * 0.52}%` } : undefined}>⚽</span>
        {anim && <span className={`pen-say${anim.good ? ' good' : ' bad'}`}>{anim.say}</span>}
      </section>

      <div className="pen-controls">
        {phase === 'idle' && <button className="btn pen-start" onClick={start}>⚽ Start a shootout</button>}
        {phase === 'aim' && <p className="pen-hint">Your kick! <b>Tap where to aim.</b> Top corners are hard to save.</p>}
        {phase === 'power' && <PowerBar onStop={shoot} />}
        {phase === 'dive' && (
          <>
            <p className="pen-hint">You&apos;re in goal! <b>Which way will you dive?</b></p>
            <div className="pen-dive">
              {['⬅️ Left', '⬆️ Stay', 'Right ➡️'].map((t, col) => <button key={col} className="btn btn-ghost" onClick={() => dive(col)}>{t}</button>)}
            </div>
          </>
        )}
        {phase === 'over' && game && (
          <section className="card pen-over">
            <b className="pen-result">{game.result === 'won' ? '🏆 You won!' : game.result === 'lost' ? '😩 You lost' : '🤝 A draw!'} {game.you}–{game.cpu}</b>
            <p className="hint">{game.points} points ({game.you} goals + {game.saves} stops). Your best game each day earns 2 XP a point.</p>
            <button className="btn" onClick={start}>Play again</button>
          </section>
        )}
      </div>

      {!board ? <Spinner /> : (
        <section className="card">
          <h2 className="section-title">Today&apos;s best</h2>
          {board.stats && <p className="hint">You: {board.stats.today ?? '–'} today · best ever {board.stats.best} · {board.stats.wins} wins from {board.stats.played}</p>}
          {board.mates.length ? (
            <ul className="mc-mates">
              {board.mates.map((m) => (
                <li key={m.uid}><Avatar user={m} size={30} /><span className="who"><strong>{m.nickname}</strong><small>{m.result === 'won' ? 'won' : m.result === 'lost' ? 'lost' : 'drew'} their best game</small></span><span className="pts-chip exact">{m.points}</span></li>
              ))}
            </ul>
          ) : <p className="hint">None of your league mates have played today. Set a score for them to beat!</p>}
        </section>
      )}
    </div>
  );
}
