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

