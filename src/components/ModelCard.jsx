import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMatches } from '../lib/hooks';
import { useSession } from '../lib/session';
import { ratings, forecast, clampSettings, DEFAULT_SETTINGS } from '../lib/model';

const pct = (x) => `${Math.round(x * 100)}%`;

// Home / draw / away chances as one bar.
export function ChanceBar({ chances, m }) {
  return (
    <div className="chance-bar" role="img" aria-label={`${m.home.tla} ${pct(chances.home)}, draw ${pct(chances.draw)}, ${m.away.tla} ${pct(chances.away)}`}>
      {[['home', m.home.tla], ['draw', 'Draw'], ['away', m.away.tla]].map(([k, label]) => (
        <span key={k} className={`cb-${k}`} style={{ flex: Math.max(chances[k], 0.08) }}>{label} {pct(chances[k])}</span>
      ))}
    </div>
  );
}

// "The Model says": the forecast for a game, made only from results before it.
export default function ModelCard({ m }) {
  const { priv } = useSession();
  const { data } = useMatches(m.competition);
  const { form, home } = priv?.model ? clampSettings(priv.model) : DEFAULT_SETTINGS;
  const f = useMemo(() => {
    if (!data?.matches) return null;
    const r = ratings(data.matches, { form, before: new Date(m.kickoff).getTime() });
    return r.games >= 4 ? forecast(m, r, { form, home }) : null;
  }, [data, m, form, home]);
  if (!f) return null;
  const actual = m.status === 'finished' && m.score;
  const right = actual && f.pick.home === m.score.home && f.pick.away === m.score.away;
  return (
    <section className="card model-card">
      <header className="lp-head">
        <h2 className="section-title">🤖 {priv?.model ? 'Your model' : 'The Model'} says</h2>
        <Link to="/lab" className="mc-link">Stats Lab ›</Link>
      </header>
      <div className="xg-row">
        <div><b>{f.xg.home.toFixed(1)}</b><small>{m.home.tla} expected goals</small></div>
        <div className="xg-pick"><small>Likeliest score</small><b>{f.pick.home}–{f.pick.away}</b>{actual && <small>{right ? '🎯 Spot on!' : `Actual ${m.score.home}–${m.score.away}`}</small>}</div>
        <div><b>{f.xg.away.toFixed(1)}</b><small>{m.away.tla} expected goals</small></div>
      </div>
      <ChanceBar chances={f.chances} m={m} />
      <p className="hint">Top scores: {f.top.map((s) => `${s.home}–${s.away} (${pct(s.p)})`).join(' · ')}. Worked out from this season&apos;s results before kickoff.</p>
    </section>
  );
}
