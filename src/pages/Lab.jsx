import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useMatches, useMyPicks, useTitle } from '../lib/hooks';
import { ratings, forecast, backtest, clampSettings, DEFAULT_SETTINGS } from '../lib/model';
import { dayLabel } from '../lib/format';
import { useToast } from '../components/Toast';
import Crest from '../components/Crest';
import { ChanceBar } from '../components/ModelCard';
import { Spinner, ErrorBox, PageHead } from '../components/Bits';

const formLabel = (f) => (f < 0.2 ? 'Whole season' : f < 0.45 ? 'Mostly season' : f < 0.7 ? 'Balanced' : f < 0.9 ? 'Mostly recent' : 'Last few games');

function Score({ label, pts, exact, result, games, best }) {
  return (
    <div className={`lab-score${best ? ' best' : ''}`}>
      <span className="lab-who">{label}{best && ' 👑'}</span>
      <b>{pts}</b><small>pts</small>
      <span className="lab-sub">🎯 {exact} exact · ✅ {result} results · {games} games</span>
    </div>
  );
}

export default function Lab() {
  const { user, priv } = useSession();
  const toast = useToast();
  useTitle('Stats Lab');
  const { data, error, loading, reload } = useMatches('PL');
  const myPicks = useMyPicks(user?.uid);
  const [draft, setDraft] = useState(null); // slider values not yet saved
  const base = draft || (priv?.model ? clampSettings(priv.model) : DEFAULT_SETTINGS);
  const { form, home } = base;
  const s = useMemo(() => ({ form, home }), [form, home]);
  const [showAll, setShowAll] = useState(false);

  // Save the sliders a moment after they stop moving.
  const timer = useRef(null);
  const save = (next) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await api('/api/me/model', { method: 'POST', body: next }); } catch (e) { toast(e.message, 'bad'); }
    }, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const reset = async () => {
    clearTimeout(timer.current);
    setDraft(DEFAULT_SETTINGS);
    try { await api('/api/me/model', { method: 'POST', body: { reset: true } }); toast('Back to the standard model', 'good'); } catch (e) { toast(e.message, 'bad'); }
  };

  const matches = useMemo(() => data?.matches || [], [data]);
  const picks = useMemo(() => Object.fromEntries(Object.entries(myPicks).filter(([, p]) => (p.competition || 'PL') === 'PL')), [myPicks]);
  const mine = useMemo(() => backtest(matches, s, picks), [matches, s, picks]);
  const standard = useMemo(() => backtest(matches, DEFAULT_SETTINGS, picks), [matches, picks]);
  const now = useMemo(() => ratings(matches, { form }), [matches, form]);
  const upcoming = useMemo(() => matches.filter((m) => m.status === 'upcoming' || m.status === 'live')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)).slice(0, 10)
    .map((m) => ({ m, f: forecast(m, now, s) })), [matches, now, s]);
  const table = useMemo(() => {
    const names = new Map(matches.flatMap((m) => [[m.home.id, m.home], [m.away.id, m.away]]));
    return [...now.teams.entries()].map(([id, r]) => ({ team: names.get(id), ...r }))
      .sort((a, b) => (b.attack - b.defence) - (a.attack - a.defence));
  }, [matches, now]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;

  const t = mine.totals, st = standard.totals;
  const tuned = s.form !== DEFAULT_SETTINGS.form || s.home !== DEFAULT_SETTINGS.home;
  const scores = [
    { key: 'you', label: 'You', pts: t.youOnPicked, exact: t.youExact, result: t.youResult, games: t.picked },
    { key: 'mine', label: tuned ? 'Your model' : 'The Model', pts: t.modelOnPicked, exact: mine.rows.filter((r) => r.mine && r.modelPoints === 3).length, result: mine.rows.filter((r) => r.mine && r.modelPoints === 1).length, games: t.picked },
    ...(tuned ? [{ key: 'std', label: 'Standard model', pts: st.modelOnPicked, exact: standard.rows.filter((r) => r.mine && r.modelPoints === 3).length, result: standard.rows.filter((r) => r.mine && r.modelPoints === 1).length, games: st.picked }] : []),
  ];
  const top = Math.max(...scores.map((x) => x.pts));
  const example = upcoming[0];

  return (
    <div className="page lab">
      <PageHead title="Stats Lab" sub="Build a prediction model, test it on this season, and see if it beats you." />

      <section className="card">
        <h2 className="section-title">⚔️ You vs the Model</h2>
        {t.picked === 0 ? (
          <p className="hint">Once you&apos;ve made picks for finished Premier League games, you&apos;ll see how you compare with the model on the same games.</p>
        ) : (
          <>
            <div className="lab-scores">{scores.map(({ key, ...x }) => <Score key={key} {...x} best={x.pts === top && top > 0} />)}</div>
            <p className="hint">On the {t.picked} finished games you picked. Over all {t.games} games this season, {tuned ? 'your model' : 'the model'} scored {t.model} pts.</p>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">🎛️ Tune your model</h2>
        <label className="lab-slider">
          <span><b>Recent form</b><small>{formLabel(s.form)}</small></span>
          <input type="range" min="0" max="1" step="0.05" value={s.form} onChange={(e) => save({ ...s, form: Number(e.target.value) })} aria-label="Recent form" />
          <span className="lab-ends"><small>Whole season counts the same</small><small>Last few games count most</small></span>
        </label>
        <label className="lab-slider">
          <span><b>Home advantage</b><small>{s.home === 1 ? 'None' : `Home teams score ${Math.round((s.home - 1) * 100)}% more`}</small></span>
          <input type="range" min="1" max="1.6" step="0.05" value={s.home} onChange={(e) => save({ ...s, home: Number(e.target.value) })} aria-label="Home advantage" />
          <span className="lab-ends"><small>None</small><small>Huge</small></span>
        </label>
        <p className="hint">Move a slider and the scoreboard re-runs the whole season straight away. Each game only uses results from before it, so the model can&apos;t cheat. {tuned && <button className="link-btn" onClick={reset}>Reset to standard</button>}</p>
      </section>

      {upcoming.length > 0 && (
        <section className="card">
          <h2 className="section-title">🔮 Next games</h2>
          <ul className="lab-games">
            {upcoming.map(({ m, f }) => (
              <li key={m.id}>
                <Link to={`/match/${m.id}?c=PL`} className="lab-game-top">
                  <span><Crest team={m.home} size={18} /> {m.home.tla} <b>{f.pick.home}–{f.pick.away}</b> {m.away.tla} <Crest team={m.away} size={18} /></span>
                  <small>xG {f.xg.home.toFixed(1)}–{f.xg.away.toFixed(1)}{picks[m.id] ? ` · you: ${picks[m.id].home}–${picks[m.id].away}` : ''}</small>
                </Link>
                <ChanceBar chances={f.chances} m={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">📜 How it did</h2>
        <ul className="lab-history">
          {mine.rows.slice(0, showAll ? 200 : 12).map((r) => (
            <li key={r.match.id}>
              <span className="lab-h-game"><small>{dayLabel(r.match.kickoff)}</small><span>{r.match.home.tla} <b>{r.match.score.home}–{r.match.score.away}</b> {r.match.away.tla}</span></span>
              <span className={`lab-h-pick p${r.modelPoints}`}>🤖 {r.model.home}–{r.model.away}</span>
              <span className={`lab-h-pick${r.mine ? ` p${r.minePoints}` : ' none'}`}>{r.mine ? `🙋 ${r.mine.home}–${r.mine.away}` : '–'}</span>
            </li>
          ))}
        </ul>
        {mine.rows.length > 12 && <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${mine.rows.length}`}</button>}
      </section>

      <section className="card">
        <h2 className="section-title">📊 Team ratings</h2>
        <p className="hint">1.00 is an average team. Attack above 1 scores more than average; defence below 1 lets in fewer.</p>
        <table className="league-table lab-table">
          <thead><tr><th className="left">Team</th><th>Attack</th><th>Defence</th><th>Games</th></tr></thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.team?.id}>
                <td className="left"><span className="tbl-team"><Crest team={r.team} size={18} />{r.team?.name}</span></td>
                <td className={r.attack >= 1 ? 'good' : 'bad'}>{r.attack.toFixed(2)}</td>
                <td className={r.defence <= 1 ? 'good' : 'bad'}>{r.defence.toFixed(2)}</td>
                <td>{r.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <details className="card how">
        <summary>🧮 How the model works</summary>
        <ol className="steps">
          <li><b>Average goals.</b> This season, a team scores {now.avg.toFixed(2)} goals a game on average.</li>
          <li><b>Ratings.</b> Each team gets an attack rating (goals scored ÷ average) and a defence rating (goals let in ÷ average). Early on, everyone starts close to 1.00 so one big win doesn&apos;t fool it.</li>
          <li><b>Expected goals (xG).</b> Average × your attack × their defence, then a nudge for home advantage.
            {example && <> For {example.m.home.name} v {example.m.away.name}: {now.avg.toFixed(2)} × {example.f.ratings.home.attack.toFixed(2)} × {example.f.ratings.away.defence.toFixed(2)} × home boost = <b>{example.f.xg.home.toFixed(2)}</b> for {example.m.home.tla}.</>}
          </li>
          <li><b>The Poisson formula.</b> Turns expected goals into the chance of scoring 0, 1, 2, 3… goals. Multiply the two teams&apos; chances to get every scoreline, then add them up for home win, draw and away win.</li>
          <li><b>The pick.</b> The single likeliest score. (It loves 1–1 and 1–0, because they&apos;re the most common scores in football.)</li>
        </ol>
        <p className="hint">Real clubs and TV analysts use the same idea, with more data such as shots and chances.</p>
      </details>
    </div>
  );
}
