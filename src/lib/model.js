// The Model: a Poisson score predictor, the method behind real "expected goals" forecasts.
//
// 1. Ratings. Each team gets an attack rating (goals scored compared with the average team)
//    and a defence rating (goals let in compared with the average), from games already
//    played. Early in the season the ratings lean towards average (a few pretend "average"
//    games), so one big win doesn't make a team look world-beating.
// 2. Recent form (0 to 1) decides how much the latest games count: 0 treats every game
//    this season the same, 1 makes the last few count far more.
// 3. Home advantage (1 = none, 1.5 = home teams score 50% more than away teams).
// 4. Expected goals: average goals x attack x the other side's defence, nudged by home
//    advantage. Then the Poisson formula turns expected goals into the chance of every
//    score, and those add up to home win / draw / away win chances.

export const DEFAULT_SETTINGS = { form: 0.5, home: 1.25 };
const PRIOR_GAMES = 3; // pretend average games added to every team's record
const MAX_GOALS = 7;

export function clampSettings(s = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    form: Math.min(1, Math.max(0, num(s.form, DEFAULT_SETTINGS.form))),
    home: Math.min(1.6, Math.max(1, num(s.home, DEFAULT_SETTINGS.home))),
  };
}

// How much a game n games ago counts. Form 0: all the same. Form 1: halves every 2 games.
function weight(age, form) {
  if (form <= 0) return 1;
  const halfLife = 2 + (1 - form) * 18; // 2 games (form 1) to 20 games (form ~0)
  return 0.5 ** (age / halfLife);
}

// Ratings from finished games (only ones before `before`, if given).
export function ratings(matches, { form = DEFAULT_SETTINGS.form, before = Infinity } = {}) {
  const played = matches
    .filter((m) => m.status === 'finished' && m.score && new Date(m.kickoff).getTime() < before)
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)); // newest first
  const goals = played.reduce((s, m) => s + m.score.home + m.score.away, 0);
  const avg = played.length ? goals / (played.length * 2) : 1.4; // goals per team per game
  const teams = new Map();
  const team = (id) => {
    if (!teams.has(id)) teams.set(id, { gf: 0, ga: 0, w: 0, n: 0 });
    return teams.get(id);
  };
  for (const m of played) {
    for (const [side, other] of [['home', 'away'], ['away', 'home']]) {
      const t = team(m[side].id);
      const w = weight(t.n, form);
      t.gf += w * m.score[side];
      t.ga += w * m.score[other];
      t.w += w;
      t.n++;
    }
  }
  const out = new Map();
  for (const [id, t] of teams) {
    out.set(id, {
      attack: (t.gf + PRIOR_GAMES * avg) / (t.w + PRIOR_GAMES) / avg,
      defence: (t.ga + PRIOR_GAMES * avg) / (t.w + PRIOR_GAMES) / avg,
      played: t.n,
    });
  }
  return { avg, teams: out, games: played.length };
}

const poisson = (k, l) => {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
};

// The forecast for one game: expected goals, win/draw/loss chances and the likeliest scores.
export function forecast(match, r, settings = DEFAULT_SETTINGS) {
  const { home } = clampSettings(settings);
  const h = r.teams.get(match.home.id) || { attack: 1, defence: 1, played: 0 };
  const a = r.teams.get(match.away.id) || { attack: 1, defence: 1, played: 0 };
  const boost = Math.sqrt(home);
  const xgHome = r.avg * h.attack * a.defence * boost;
  const xgAway = (r.avg * a.attack * h.defence) / boost;
  const scores = [];
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poisson(i, xgHome) * poisson(j, xgAway);
      scores.push({ home: i, away: j, p });
      if (i > j) pHome += p; else if (i === j) pDraw += p; else pAway += p;
    }
  }
  const total = pHome + pDraw + pAway;
  scores.sort((x, y) => y.p - x.p);
  return {
    xg: { home: xgHome, away: xgAway },
    chances: { home: pHome / total, draw: pDraw / total, away: pAway / total },
    top: scores.slice(0, 3).map((s) => ({ ...s, p: s.p / total })),
    pick: { home: scores[0].home, away: scores[0].away },
    ratings: { home: h, away: a },
  };
}

// Points for a pick, the same as the game: 3 exact, 1 right result.
export function pickPoints(pick, score) {
  if (!pick || !score) return 0;
  if (pick.home === score.home && pick.away === score.away) return 3;
  return Math.sign(pick.home - pick.away) === Math.sign(score.home - score.away) ? 1 : 0;
}

// Run the model over every finished game, each one using only the results before it, and
// compare with your own picks. Returns totals plus one row per game.
export function backtest(matches, settings, myPicks = {}) {
  const s = clampSettings(settings);
  const done = matches.filter((m) => m.status === 'finished' && m.score)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const rows = [];
  const tot = { model: 0, modelExact: 0, modelResult: 0, you: 0, youExact: 0, youResult: 0, games: 0, picked: 0, youOnPicked: 0, modelOnPicked: 0 };
  const cache = new Map(); // ratings per kickoff time
  for (const m of done) {
    const ko = new Date(m.kickoff).getTime();
    if (!cache.has(ko)) cache.set(ko, ratings(matches, { form: s.form, before: ko }));
    const f = forecast(m, cache.get(ko), s);
    const mp = pickPoints(f.pick, m.score);
    const mine = myPicks[m.id];
    const yp = mine ? pickPoints(mine, m.score) : null;
    tot.games++;
    tot.model += mp;
    if (mp === 3) tot.modelExact++; else if (mp === 1) tot.modelResult++;
    if (yp != null) {
      tot.picked++;
      tot.you += yp;
      tot.youOnPicked += yp;
      tot.modelOnPicked += mp;
      if (yp === 3) tot.youExact++; else if (yp === 1) tot.youResult++;
    }
    rows.push({ match: m, model: f.pick, modelPoints: mp, chances: f.chances, mine: mine ? { home: mine.home, away: mine.away } : null, minePoints: yp });
  }
  return { totals: tot, rows: rows.reverse() };
}
