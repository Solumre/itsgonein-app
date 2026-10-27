// Game rules shared by the server (settling) and the app (live "if it ends now" points).
// Plain JS with no imports so Node and Vite can both load it.

export const POINTS_EXACT = 3;
export const POINTS_RESULT = 1;

const outcome = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');

// Points for one pick against a score. `double` doubles them (one Double Up per gameweek).
export function scorePick(pick, score, double = false) {
  if (!pick || !score || score.home == null || score.away == null) return 0;
  let pts = 0;
  if (pick.home === score.home && pick.away === score.away) pts = POINTS_EXACT;
  else if (outcome(pick.home, pick.away) === outcome(score.home, score.away)) pts = POINTS_RESULT;
  return double ? pts * 2 : pts;
}

export function pickKind(pick, score) {
  if (!pick || !score || score.home == null) return null;
  if (pick.home === score.home && pick.away === score.away) return 'exact';
  if (outcome(pick.home, pick.away) === outcome(score.home, score.away)) return 'result';
  return 'miss';
}

export const BADGES = [
  { id: 'first_pick', emoji: '🎟️', name: 'Off the Mark', desc: 'Your first pick was settled' },
  { id: 'sniper', emoji: '🎯', name: 'Sniper', desc: 'Nailed an exact score' },
  { id: 'hat_trick', emoji: '🎩', name: 'Hat-trick', desc: '3 exact scores' },
  { id: 'on_fire', emoji: '🔥', name: 'On Fire', desc: 'Scored points on 3 picks in a row' },
  { id: 'unstoppable', emoji: '🚀', name: 'Unstoppable', desc: 'Scored points on 7 picks in a row' },
  { id: 'double_trouble', emoji: '✌️', name: 'Double Trouble', desc: 'Double Up on an exact score' },
  { id: 'draw_master', emoji: '🤝', name: 'Draw Master', desc: 'Called 3 draws right' },
  { id: 'loyal', emoji: '💙', name: 'Loyal Fan', desc: "Called your club's result 5 times" },
  { id: 'full_house', emoji: '🏠', name: 'Full House', desc: 'Picked every game in a gameweek' },
  { id: 'perfect_week', emoji: '🌟', name: 'Perfect Week', desc: 'Points on every game in a gameweek' },
  { id: 'centurion', emoji: '💯', name: 'Centurion', desc: '100 points in a season' },
];

export const LEVELS = [
  { xp: 0, name: 'Sunday League' },
  { xp: 100, name: 'Academy' },
  { xp: 300, name: 'Reserves' },
  { xp: 600, name: 'First Team' },
  { xp: 1000, name: 'Captain' },
  { xp: 1600, name: 'International' },
  { xp: 2500, name: 'Legend' },
  { xp: 4000, name: 'GOAT' },
];

export function levelFor(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const next = LEVELS[i + 1];
  return {
    level: i + 1,
    name: LEVELS[i].name,
    xp,
    floor: LEVELS[i].xp,
    next: next ? next.xp : null,
    progress: next ? (xp - LEVELS[i].xp) / (next.xp - LEVELS[i].xp) : 1,
  };
}

// Which pick's Double Up counts in each gameweek: the one on the earliest kickoff.
// The app only lets you hold one, so this only matters if two slip through.
export function validDoubles(picks, matchesById) {
  const byGw = new Map();
  for (const p of picks) {
    if (!p.double) continue;
    const m = matchesById.get(String(p.matchId));
    if (!m) continue;
    const cur = byGw.get(m.matchday);
    if (!cur || m.kickoff < matchesById.get(String(cur.matchId)).kickoff) byGw.set(m.matchday, p);
  }
  return new Set([...byGw.values()].map((p) => String(p.matchId)));
}

// Recompute a player's season stats from all their picks. Idempotent, so the server can
// re-run it whenever a result lands or changes.
// picks: [{ matchId, home, away, double }]
// matchesById: Map(id -> { kickoff (ms), matchday, status, score, home: {tla}, away: {tla} })
export function computeStats(picks, matchesById, { clubTla } = {}) {
  const doubles = validDoubles(picks, matchesById);
  const settled = picks
    .map((p) => ({ p, m: matchesById.get(String(p.matchId)) }))
    .filter(({ m }) => m && m.status === 'finished' && m.score)
    .sort((a, b) => a.m.kickoff - b.m.kickoff);

  const perPick = {};
  const gw = {};
  const gwPicked = {};
  const gwScored = {};
  let points = 0, exact = 0, results = 0, draws = 0, loyal = 0;
  let streak = 0, bestStreak = 0, doubleExact = false;

  for (const { p, m } of settled) {
    const isDouble = doubles.has(String(p.matchId));
    const pts = scorePick(p, m.score, isDouble);
    const kind = pickKind(p, m.score);
    perPick[p.matchId] = { points: pts, kind, double: isDouble };
    points += pts;
    gw[m.matchday] = (gw[m.matchday] || 0) + pts;
    gwPicked[m.matchday] = (gwPicked[m.matchday] || 0) + 1;
    if (pts > 0) gwScored[m.matchday] = (gwScored[m.matchday] || 0) + 1;
    if (kind === 'exact') exact++;
    if (kind !== 'miss') {
      results++;
      if (m.score.home === m.score.away) draws++;
      if (clubTla && (m.home.tla === clubTla || m.away.tla === clubTla)) loyal++;
    }
    if (kind === 'exact' && isDouble) doubleExact = true;
    streak = pts > 0 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  // A gameweek counts as "full" when every match in it was picked and has finished.
  const gwSize = {};
  const gwFinished = {};
  for (const m of matchesById.values()) {
    if (m.status === 'postponed') continue;
    gwSize[m.matchday] = (gwSize[m.matchday] || 0) + 1;
    if (m.status === 'finished') gwFinished[m.matchday] = (gwFinished[m.matchday] || 0) + 1;
  }
  const fullWeeks = Object.keys(gwPicked).filter((d) => gwPicked[d] === gwSize[d] && gwFinished[d] === gwSize[d]);

  const earned = new Set();
  if (settled.length > 0) earned.add('first_pick');
  if (exact >= 1) earned.add('sniper');
  if (exact >= 3) earned.add('hat_trick');
  if (bestStreak >= 3) earned.add('on_fire');
  if (bestStreak >= 7) earned.add('unstoppable');
  if (doubleExact) earned.add('double_trouble');
  if (draws >= 3) earned.add('draw_master');
  if (loyal >= 5) earned.add('loyal');
  if (fullWeeks.length > 0) earned.add('full_house');
  if (fullWeeks.some((d) => gwScored[d] === gwPicked[d])) earned.add('perfect_week');
  if (points >= 100) earned.add('centurion');

  const badges = BADGES.filter((b) => earned.has(b.id)).map((b) => b.id);
  const xp = points * 10 + settled.length * 2 + badges.length * 25;

  return {
    stats: { points, played: settled.length, exact, results, streak, bestStreak, gw, badges, xp, level: levelFor(xp).level },
    perPick,
  };
}

export const AVATARS = ['⚽', '🦁', '🐺', '🦅', '🐝', '🔥', '⚡', '👑', '🐉', '🦊', '🐯', '🚀', '🦈', '🐻', '🧤', '🥅'];

// Quick-chat phrases and message reactions (the server only accepts these).
export const QUICK_CHAT = {
  called_it: '😎 Called it!',
  get_in: '🔥 GET IN!',
  robbed: '😭 Robbed!',
  no_chance: '🙅 No chance!',
  var: '📺 VAR!!',
  bottled: '🍾 Bottled it',
  what_a_goal: '🚀 What a goal!',
  gg: '🤝 GG everyone',
  lucky: '🍀 Lucky!',
  top_of_league: '👑 Top of the league!',
};

export const REACTIONS = ['🔥', '😂', '😮', '👏', '😭', '⚽'];
// Reactions on a league mate's pick, after kickoff.
export const PICK_REACTIONS = ['🔥', '😂', '🤡', '🎯', '👀'];

// A gameweek is finished once every game is played (or postponed).
const done = (m) => m.status === 'finished' || m.status === 'postponed';

export function gameweekComplete(matches, md) {
  const gw = matches.filter((m) => m.matchday === md);
  return gw.length > 0 && gw.every(done) && gw.some((m) => m.status === 'finished');
}

// Rank players by gameweek points; equal points share a position.
export function rankRows(rows) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname));
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.points !== sorted[i - 1].points) rank = i + 1;
    return { ...r, rank };
  });
}


// Competitions you can predict. Premier League points live in `stats`, Champions League
// points in `statsCL`, so every league has a separate Champions League table.
const CL_ROUND_NAMES = { 9: 'Play-offs', 10: 'Round of 16', 11: 'Quarter-finals', 12: 'Semi-finals', 13: 'Final' };
export const GAMES = {
  PL: { code: 'PL', name: 'Premier League', short: 'Premier League', statsKey: 'stats', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  CL: { code: 'CL', name: 'Champions League', short: 'UCL', statsKey: 'statsCL', emoji: '⭐' },
};
export const competitionOf = (pick) => pick.competition || 'PL';

export function roundLabel(competition, md) {
  if (competition === 'CL') return CL_ROUND_NAMES[md] || `Matchday ${md}`;
  return `Gameweek ${md}`;
}

// ---- Weekly bonus questions (Premier League) ----
// Three are generated from the fixtures, so they can be settled from scores alone.
// An admin can add a fourth multiple-choice question each gameweek and mark it.
export const BONUS_POINTS = { goals: { exact: 3, close: 1 }, goalfest: 2, nil: 1, custom: 2 };
export const BONUS_MAX = 3 + 2 + 1 + 2;

export function bonusQuestions(md, gwMatches, custom) {
  const games = gwMatches.filter((m) => m.status !== 'postponed');
  const qs = [
    { id: 'goals', type: 'number', max: 60, text: `How many goals will be scored in Gameweek ${md}?`, hint: '3 pts exact · 1 pt within 2' },
    { id: 'goalfest', type: 'choice', text: 'Which game will have the most goals?', hint: '2 pts',
      options: games.map((m) => ({ id: String(m.id), label: `${m.home.tla} v ${m.away.tla}` })) },
    { id: 'nil', type: 'choice', text: 'Will any game finish 0–0?', hint: '1 pt',
      options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
  ];
  if (custom?.question) qs.push({ id: 'custom', type: 'choice', text: custom.question, hint: '2 pts', options: custom.options, custom: true });
  return qs;
}

export function validBonusAnswer(q, value) {
  if (!q) return false;
  if (q.type === 'number') return Number.isInteger(value) && value >= 0 && value <= q.max;
  return q.options.some((o) => o.id === value);
}

// Points for a set of answers once the gameweek is finished; null until then.
// The custom question only scores once an admin has marked the answer.
export function scoreBonus(answers = {}, gwMatches, custom) {
  const md = gwMatches[0]?.matchday;
  if (md == null || !gameweekComplete(gwMatches, md)) return null;
  const done = gwMatches.filter((m) => m.status === 'finished' && m.score);
  const totals = done.map((m) => ({ id: String(m.id), goals: m.score.home + m.score.away }));
  const goals = totals.reduce((s, t) => s + t.goals, 0);
  const most = Math.max(...totals.map((t) => t.goals));
  const goalfest = totals.filter((t) => t.goals === most).map((t) => t.id);
  const nil = done.some((m) => m.score.home === 0 && m.score.away === 0) ? 'yes' : 'no';
  const correct = { goals, goalfest, nil, custom: custom?.answer ?? null };
  const points = {
    goals: answers.goals == null ? 0 : answers.goals === goals ? BONUS_POINTS.goals.exact : Math.abs(answers.goals - goals) <= 2 ? BONUS_POINTS.goals.close : 0,
    goalfest: goalfest.includes(answers.goalfest) ? BONUS_POINTS.goalfest : 0,
    nil: answers.nil === nil ? BONUS_POINTS.nil : 0,
    custom: custom?.answer != null && answers.custom === custom.answer ? BONUS_POINTS.custom : 0,
  };
  return { correct, points, total: points.goals + points.goalfest + points.nil + points.custom, customPending: !!custom?.question && custom.answer == null };
}

// ---- Trophies (won inside a league) ----
export const TROPHIES = {
  gw: { emoji: '🏅', name: 'Gameweek winner', desc: 'Top of a league for a Premier League gameweek' },
  ucl_round: { emoji: '⭐', name: 'UCL round winner', desc: 'Top of a league for a Champions League round' },
  month: { emoji: '🥇', name: 'Player of the Month', desc: 'Most Premier League points in a league in a month' },
  champion: { emoji: '🏆', name: 'League champion', desc: 'Top of a league at the end of the season' },
  boot: { emoji: '👟', name: 'Golden Boot', desc: 'Most exact scores in a league in a season' },
  ucl_champion: { emoji: '🌟', name: 'UCL champion', desc: "Top of a league's Champions League table after the final" },
};

const LONDON = 'Europe/London';
// "2026-10" for a time, in UK time (a 10pm game on the 31st counts as that month).
export function monthKey(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, year: 'numeric', month: '2-digit' }).formatToParts(new Date(ms));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}
export const monthName = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: LONDON });

// Gameweeks belong to the month their last game was played in. A month can be awarded
// once it's over and no gameweek that started in it is still unfinished.
export function monthToAward(matches, now) {
  const current = monthKey(now);
  const byMd = new Map();
  for (const m of matches) {
    if (m.matchday == null || m.status === 'postponed') continue;
    const t = new Date(m.kickoff).getTime();
    const r = byMd.get(m.matchday) || { first: Infinity, last: 0, done: true };
    r.first = Math.min(r.first, t);
    r.last = Math.max(r.last, t);
    if (m.status !== 'finished') r.done = false;
    byMd.set(m.matchday, r);
  }
  const months = [...new Set([...byMd.values()].filter((r) => r.done).map((r) => monthKey(r.last)))].filter((k) => k < current).sort();
  const month = months.at(-1);
  if (!month) return null;
  if ([...byMd.values()].some((r) => !r.done && monthKey(r.first) <= month)) return null; // still waiting on a game
  const mds = [...byMd].filter(([, r]) => r.done && monthKey(r.last) === month).map(([md]) => md).sort((a, b) => a - b);
  return { month, mds };
}

export function seasonLabel(matches) {
  const first = Math.min(...matches.map((m) => new Date(m.kickoff).getTime()));
  const y = new Date(first).getUTCFullYear();
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}
