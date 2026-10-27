// football-data.org v4 client: one cached copy of each feed shared by every visitor,
// so the free tier (10 calls a minute) is plenty. Set FOOTBALL_DATA_MOCK=1 to use a
// generated season instead (local dev and tests).
import { mockFeed } from './mock.js';

const BASE = 'https://api.football-data.org/v4';
const KEY = process.env.FOOTBALL_DATA_KEY;
const MOCK = process.env.FOOTBALL_DATA_MOCK === '1';
// Calls a minute to allow. The free plan allows 10, so the default leaves headroom;
// set FOOTBALL_DATA_CALLS_PER_MIN a little under a paid plan's limit (e.g. 25 for 30).
const CALLS_PER_MIN = Math.max(1, Number(process.env.FOOTBALL_DATA_CALLS_PER_MIN) || 8);
// With room to spare, refresh live feeds twice as often.
const LIVE_TTL = CALLS_PER_MIN >= 20 ? 30_000 : 60_000;

// Free-tier competitions worth showing. PL is the one the game is played on.
export const COMPETITIONS = [
  { code: 'PL', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'ELC', name: 'Championship', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'CL', name: 'Champions League', flag: '⭐' },
  { code: 'PD', name: 'La Liga', flag: '🇪🇸' },
  { code: 'BL1', name: 'Bundesliga', flag: '🇩🇪' },
  { code: 'SA', name: 'Serie A', flag: '🇮🇹' },
  { code: 'FL1', name: 'Ligue 1', flag: '🇫🇷' },
];
export const GAME_COMPETITION = 'PL';
// Competitions you can predict. The Champions League runs alongside as a mini-league.
export const GAME_COMPETITIONS = ['PL', 'CL'];

// Champions League rounds as numbers, so they work like gameweeks: league phase
// matchdays 1-8, then the knockout rounds.
const CL_ROUNDS = { PLAYOFFS: 9, LAST_16: 10, QUARTER_FINALS: 11, SEMI_FINALS: 12, FINAL: 13 };
function roundOf(m, competition) {
  if (competition !== 'CL') return m.matchday ?? null;
  if (m.stage === 'LEAGUE_STAGE') return m.matchday ?? null;
  return CL_ROUNDS[m.stage] ?? null; // qualifiers aren't part of the game
}
const CODES = new Set(COMPETITIONS.map((c) => c.code));
export const isCompetition = (code) => CODES.has(code);

// Stay under the plan's calls-a-minute limit.
const callTimes = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (callTimes.length && now - callTimes[0] > 60_000) callTimes.shift();
    if (callTimes.length < CALLS_PER_MIN) { callTimes.push(now); return; }
    await new Promise((r) => setTimeout(r, 60_000 - (now - callTimes[0]) + 50));
  }
}

async function get(path) {
  if (MOCK) return mockFeed(path);
  if (!KEY) throw new Error('FOOTBALL_DATA_KEY is not set');
  await throttle();
  const res = await fetch(BASE + path, { headers: { 'X-Auth-Token': KEY } });
  if (!res.ok) throw new Error(`football-data ${res.status} for ${path}`);
  return res.json();
}

const cache = new Map(); // key -> { data, at, ttl, pending }

// Serve from cache; refetch when stale; if the refetch fails, keep serving the old copy.
export async function cached(key, ttlFn, loader) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit?.data && now - hit.at < hit.ttl) return hit.data;
  if (hit?.pending) return hit.pending;
  const pending = loader()
    .then((data) => {
      cache.set(key, { data, at: Date.now(), ttl: ttlFn(data) });
      return data;
    })
    .catch((err) => {
      console.error(`feed ${key}:`, err.message);
      if (hit?.data) {
        cache.set(key, { ...hit, at: Date.now(), ttl: 60_000 });
        return hit.data;
      }
      cache.delete(key);
      throw err;
    });
  cache.set(key, { ...hit, pending });
  return pending;
}

export function clearCache() { cache.clear(); }

const STATUS = {
  SCHEDULED: 'upcoming', TIMED: 'upcoming',
  IN_PLAY: 'live', PAUSED: 'live', LIVE: 'live',
  FINISHED: 'finished', AWARDED: 'finished',
  POSTPONED: 'postponed', SUSPENDED: 'postponed', CANCELLED: 'postponed',
};

const team = (t) => ({
  id: t.id,
  name: t.shortName || t.name,
  tla: t.tla || (t.shortName || t.name || '???').slice(0, 3).toUpperCase(),
  crest: t.crest || null,
});

export function normalizeMatch(m, competition) {
  const status = STATUS[m.status] || 'upcoming';
  // Predictions are on the score after 90 minutes, so ignore extra time and penalties.
  const ft = (m.score?.duration && m.score.duration !== 'REGULAR' && m.score.regularTime) || m.score?.fullTime || {};
  const hasScore = ft.home != null && ft.away != null;
  return {
    id: String(m.id),
    competition,
    matchday: roundOf(m, competition),
    stage: m.stage || null,
    kickoff: m.utcDate,
    status,
    paused: m.status === 'PAUSED',
    minute: m.minute ?? null,
    home: team(m.homeTeam),
    away: team(m.awayTeam),
    score: hasScore ? { home: ft.home, away: ft.away } : status === 'live' ? { home: 0, away: 0 } : null,
  };
}

// Poll fast while games are on (or about to be), slowly otherwise.
function matchesTtl(matches) {
  const now = Date.now();
  const busy = matches.some((m) => m.status === 'live'
    || (m.status === 'upcoming' && Math.abs(new Date(m.kickoff) - now) < 15 * 60_000)
    || (m.status === 'upcoming' && new Date(m.kickoff) < now));
  return busy ? LIVE_TTL : 10 * 60_000;
}

export async function getMatches(code) {
  return cached(`matches:${code}`, matchesTtl, async () => {
    const json = await get(`/competitions/${code}/matches`);
    return (json.matches || []).map((m) => normalizeMatch(m, code));
  });
}

export async function getStandings(code) {
  return cached(`standings:${code}`, () => 10 * 60_000, async () => {
    const json = await get(`/competitions/${code}/standings`);
    const total = (json.standings || []).filter((s) => s.type === 'TOTAL');
    return total.map((s) => ({
      group: s.group || null,
      table: s.table.map((r) => ({
        position: r.position,
        team: team(r.team),
        played: r.playedGames,
        won: r.won, draw: r.draw, lost: r.lost,
        gf: r.goalsFor, ga: r.goalsAgainst, gd: r.goalDifference,
        points: r.points,
        form: (r.form || '').replace(/,/g, '').slice(-5),
      })),
    }));
  });
}

export async function getScorers(code) {
  return cached(`scorers:${code}`, () => 60 * 60_000, async () => {
    const json = await get(`/competitions/${code}/scorers?limit=20`);
    return (json.scorers || []).map((s) => ({
      name: s.player.name,
      team: team(s.team),
      goals: s.goals ?? 0,
      assists: s.assists ?? 0,
    }));
  });
}

export async function getTeams(code) {
  return cached(`teams:${code}`, () => 24 * 60 * 60_000, async () => {
    const json = await get(`/competitions/${code}/teams`);
    return (json.teams || []).map((t) => ({ ...team(t), colors: t.clubColors || '' }));
  });
}

// The gameweek to show by default: the first with a game not yet finished.
export function currentMatchday(matches) {
  const open = matches
    .filter((m) => m.matchday != null && m.status !== 'finished' && m.status !== 'postponed')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (open.length) return open[0].matchday;
  return Math.max(1, ...matches.map((m) => m.matchday || 1));
}

// ---- Match centre ----
// The free plan gives the score and minute. Paid plans add goals, cards, subs and line-ups
// to the same response; when they're missing those lists are just empty.
const clock = (e) => (e.minute == null ? null : e.injuryTime ? `${e.minute}+${e.injuryTime}` : String(e.minute));
const person = (p) => p?.name || null;

export function normalizeDetail(m, competition) {
  const base = normalizeMatch(m, competition);
  const side = (t) => (t?.id === m.homeTeam?.id ? 'home' : 'away');
  const events = [
    ...(m.goals || []).map((g) => ({
      kind: g.type === 'OWN' ? 'own_goal' : g.type === 'PENALTY' ? 'penalty' : 'goal',
      minute: g.minute ?? null, clock: clock(g), side: side(g.team), player: person(g.scorer), assist: person(g.assist),
      score: g.score ? { home: g.score.home, away: g.score.away } : null,
    })),
    ...(m.bookings || []).map((b) => ({
      kind: b.card === 'RED' ? 'red' : b.card === 'YELLOW_RED' ? 'second_yellow' : 'yellow',
      minute: b.minute ?? null, clock: clock(b), side: side(b.team), player: person(b.player),
    })),
    ...(m.substitutions || []).map((s) => ({
      kind: 'sub', minute: s.minute ?? null, clock: clock(s), side: side(s.team), player: person(s.playerIn), out: person(s.playerOut),
    })),
  ].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  const lineup = (t) => (t?.lineup?.length ? {
    formation: t.formation || null,
    coach: person(t.coach),
    starting: t.lineup.map((p) => ({ name: p.name, number: p.shirtNumber ?? null, position: p.position || null })),
    bench: (t.bench || []).map((p) => ({ name: p.name, number: p.shirtNumber ?? null })),
  } : null);
  const home = lineup(m.homeTeam), away = lineup(m.awayTeam);
  return {
    ...base,
    venue: m.venue || null,
    referee: person((m.referees || []).find((r) => r.type === 'REFEREE') || (m.referees || [])[0]),
    events,
    lineups: home && away ? { home, away } : null,
  };
}

export async function getMatchDetail(id, competition) {
  return cached(`match:${id}`, (d) => (d.status === 'live' || (d.status === 'upcoming' && new Date(d.kickoff) - Date.now() < 15 * 60_000) ? LIVE_TTL : 10 * 60_000), async () => {
    const json = await get(`/matches/${id}`);
    return normalizeDetail(json, competition || json.competition?.code || null);
  });
}

// Past meetings of the two teams in a match.
export async function getHead2Head(id) {
  return cached(`h2h:${id}`, () => 24 * 60 * 60_000, async () => {
    const json = await get(`/matches/${id}/head2head?limit=10`);
    const a = json.aggregates || {};
    return {
      count: a.numberOfMatches ?? (json.matches || []).length,
      home: { wins: a.homeTeam?.wins ?? 0, draws: a.homeTeam?.draws ?? 0 },
      away: { wins: a.awayTeam?.wins ?? 0 },
      matches: (json.matches || [])
        .filter((x) => x.status === 'FINISHED')
        .sort((x, y) => new Date(y.utcDate) - new Date(x.utcDate))
        .slice(0, 5)
        .map((x) => normalizeMatch(x, x.competition?.code || null)),
    };
  });
}
