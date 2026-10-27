// A generated season in football-data.org's response shape, for local dev and tests.
// It's anchored to when the server started: earlier gameweeks are finished, the current
// one has finished, live and upcoming games, and live scores tick on in real time.

const PL = [
  [57, 'Arsenal', 'ARS', 'Red / White'], [58, 'Aston Villa', 'AVL', 'Claret / Sky Blue'],
  [1044, 'Bournemouth', 'BOU', 'Red / Black'], [402, 'Brentford', 'BRE', 'Red / White'],
  [397, 'Brighton', 'BHA', 'Blue / White'], [328, 'Burnley', 'BUR', 'Claret / Sky Blue'],
  [61, 'Chelsea', 'CHE', 'Royal Blue / White'], [354, 'Crystal Palace', 'CRY', 'Red / Blue'],
  [62, 'Everton', 'EVE', 'Blue / White'], [63, 'Fulham', 'FUL', 'White / Black'],
  [341, 'Leeds United', 'LEE', 'White / Yellow'], [64, 'Liverpool', 'LIV', 'Red / White'],
  [65, 'Man City', 'MCI', 'Sky Blue / White'], [66, 'Man United', 'MUN', 'Red / White'],
  [67, 'Newcastle', 'NEW', 'Black / White'], [351, "Nott'm Forest", 'NOT', 'Red / White'],
  [71, 'Sunderland', 'SUN', 'Red / White'], [73, 'Tottenham', 'TOT', 'Navy Blue / White'],
  [563, 'West Ham', 'WHU', 'Claret / Sky Blue'], [76, 'Wolves', 'WOL', 'Gold / Black'],
];
const ELC = [
  [1076, 'Birmingham', 'BIR', 'Blue / White'], [59, 'Blackburn', 'BLA', 'Blue / White'],
  [384, 'Bristol City', 'BRC', 'Red / White'], [1082, 'Charlton', 'CHA', 'Red / White'],
  [1072, 'Coventry', 'COV', 'Sky Blue / White'], [342, 'Derby County', 'DER', 'White / Black'],
  [322, 'Hull City', 'HUL', 'Amber / Black'], [349, 'Ipswich', 'IPS', 'Blue / White'],
  [338, 'Leicester', 'LEI', 'Blue / White'], [343, 'Middlesbrough', 'MID', 'Red / White'],
  [1081, 'Millwall', 'MIL', 'Navy Blue / White'], [1043, 'Norwich', 'NOR', 'Yellow / Green'],
  [1068, 'Oxford United', 'OXF', 'Yellow / Navy Blue'], [325, 'Portsmouth', 'POR', 'Blue / White'],
  [69, 'Preston', 'PNE', 'White / Navy Blue'], [68, 'QPR', 'QPR', 'Blue / White'],
  [356, 'Sheffield Utd', 'SHU', 'Red / White'], [345, 'Sheffield Wed', 'SHW', 'Blue / White'],
  [340, 'Southampton', 'SOU', 'Red / White'], [70, 'Stoke City', 'STK', 'Red / White'],
  [72, 'Swansea', 'SWA', 'White / Black'], [346, 'Watford', 'WAT', 'Yellow / Black'],
  [74, 'West Brom', 'WBA', 'Navy Blue / White'], [1073, 'Wrexham', 'WRE', 'Red / White'],
];
const CL = [
  [57, 'Arsenal', 'ARS', 'Red / White'], [64, 'Liverpool', 'LIV', 'Red / White'], [65, 'Man City', 'MCI', 'Sky Blue / White'],
  [61, 'Chelsea', 'CHE', 'Royal Blue / White'], [73, 'Tottenham', 'TOT', 'Navy Blue / White'], [67, 'Newcastle', 'NEW', 'Black / White'],
  [86, 'Real Madrid', 'RMA', 'White / Purple'], [81, 'Barcelona', 'BAR', 'Red / Navy Blue'], [78, 'Atlético', 'ATM', 'Red / White'],
  [77, 'Athletic Club', 'ATH', 'Red / White'], [94, 'Villarreal', 'VIL', 'Yellow / Blue'], [5, 'Bayern', 'BAY', 'Red / White'],
  [4, 'Dortmund', 'BVB', 'Yellow / Black'], [3, 'Leverkusen', 'B04', 'Red / Black'], [19, 'Frankfurt', 'SGE', 'Black / Red'],
  [108, 'Inter', 'INT', 'Blue / Black'], [109, 'Juventus', 'JUV', 'White / Black'], [113, 'Napoli', 'NAP', 'Sky Blue / White'],
  [102, 'Atalanta', 'ATA', 'Blue / Black'], [524, 'PSG', 'PSG', 'Navy Blue / Red'], [516, 'Marseille', 'MAR', 'White / Sky Blue'],
  [548, 'Monaco', 'MON', 'Red / White'], [1903, 'Benfica', 'BEN', 'Red / White'], [498, 'Sporting', 'SCP', 'Green / White'],
  [503, 'Porto', 'FCP', 'Blue / White'], [674, 'PSV', 'PSV', 'Red / White'], [678, 'Ajax', 'AJA', 'White / Red'],
  [851, 'Club Brugge', 'CLU', 'Blue / Black'], [610, 'Galatasaray', 'GAL', 'Red / Yellow'], [654, 'Olympiacos', 'OLY', 'Red / White'],
  [930, 'Slavia Praha', 'SLA', 'Red / White'], [1876, 'København', 'KOB', 'White / Blue'], [5721, 'Bodø/Glimt', 'BOD', 'Yellow / Black'],
  [7283, 'Qarabağ', 'QAR', 'Black / White'], [6806, 'Union SG', 'USG', 'Yellow / Blue'], [1887, 'Pafos', 'PAF', 'Blue / White'],
];
// currentMd: the round in progress when the server starts. CL only has its 8-matchday league phase.
const LEAGUES = {
  PL: { teams: PL, idBase: 500000, currentMd: 9 },
  ELC: { teams: ELC, idBase: 600000, currentMd: 9 },
  CL: { teams: CL, idBase: 700000, currentMd: 4, rounds: 8, stage: 'LEAGUE_STAGE' },
};
const START = Number(process.env.MOCK_NOW) || Date.now();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const goalsFor = (r, strength) => {
  const n = r() * (1.2 + strength);
  return n < 0.45 ? 0 : n < 1.1 ? 1 : n < 1.7 ? 2 : n < 2.1 ? 3 : 4;
};

// Round-robin fixtures (circle method), home/away mirrored for the second half.
function schedule(n) {
  const ids = [...Array(n).keys()];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return [...rounds, ...rounds.map((p) => p.map(([a, b]) => [b, a]))];
}

// Kickoffs in the current gameweek, relative to server start.
const CURRENT_OFFSETS = [-3 * HOUR, -3 * HOUR, -40 * 60_000, -40 * 60_000, 2 * HOUR, 2 * HOUR, 5 * HOUR, DAY, DAY, DAY + 2 * HOUR, DAY + 2 * HOUR, DAY + 4 * HOUR];

const memo = {};
function season(code) {
  if (memo[code]) return memo[code];
  const { teams, idBase, currentMd: CURRENT_MD, rounds: maxRounds } = LEAGUES[code];
  const strength = Object.fromEntries(teams.map(([id], i) => [id, 1 - i / teams.length + rng(id)() * 0.6]));
  const rounds = schedule(teams.length).slice(0, maxRounds);
  const matches = [];
  rounds.forEach((pairs, r) => {
    const md = r + 1;
    pairs.forEach(([h, a], i) => {
      const home = teams[h], away = teams[a];
      const id = idBase + md * 100 + i;
      const kickoff = md === CURRENT_MD
        ? START + CURRENT_OFFSETS[i % CURRENT_OFFSETS.length]
        : START + (md - CURRENT_MD) * 7 * DAY + (i % 3) * 2 * HOUR;
      const r1 = rng(id * 7919);
      const final = { home: goalsFor(r1, strength[home[0]] + 0.2), away: goalsFor(r1, strength[away[0]]) };
      const goalMinutes = [
        ...Array.from({ length: final.home }, () => ['home', 1 + Math.floor(r1() * 90)]),
        ...Array.from({ length: final.away }, () => ['away', 1 + Math.floor(r1() * 90)]),
      ];
      matches.push({ id, md, kickoff, home, away, final, goalMinutes, postponed: md === CURRENT_MD - 2 && i === 3 });
    });
  });
  memo[code] = matches;
  return matches;
}

const toTeam = ([id, name, tla, colors]) => ({ id, name, shortName: name, tla, crest: null, clubColors: colors });

function matchState(m, now) {
  if (m.postponed) return { status: 'POSTPONED', score: { home: null, away: null } };
  const elapsed = (now - m.kickoff) / 60_000;
  if (elapsed < 0) return { status: 'TIMED', score: { home: null, away: null } };
  if (elapsed >= 110) return { status: 'FINISHED', score: m.final };
  // Rough clock: 45 min, a 15 min break, then the second half.
  const minute = elapsed < 45 ? Math.floor(elapsed) + 1 : elapsed < 60 ? 45 : Math.min(90, Math.floor(elapsed - 15) + 1);
  const score = { home: 0, away: 0 };
  for (const [side, min] of m.goalMinutes) if (min <= minute) score[side]++;
  return { status: elapsed >= 45 && elapsed < 60 ? 'PAUSED' : 'IN_PLAY', score, minute };
}

function matchJson(m, code, now) {
  const st = matchState(m, now);
  return {
    id: m.id,
    utcDate: new Date(m.kickoff).toISOString(),
    status: st.status,
    minute: st.minute,
    matchday: m.md,
    competition: { code },
    stage: LEAGUES[code].stage || 'REGULAR_SEASON',
    homeTeam: toTeam(m.home),
    awayTeam: toTeam(m.away),
    score: { fullTime: st.score, halfTime: halfTime(m, st) },
  };
}

// The half-time score, once half-time has been reached.
function halfTime(m, st) {
  if (st.status === 'TIMED' || st.status === 'POSTPONED' || (st.status === 'IN_PLAY' && st.minute <= 45)) return { home: null, away: null };
  const ht = { home: 0, away: 0 };
  for (const [side, min] of m.goalMinutes) if (min <= 45) ht[side]++;
  return ht;
}

function standings(code, now) {
  const rows = new Map(LEAGUES[code].teams.map((t) => [t[0], { team: toTeam(t), playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, form: [] }]));
  for (const m of season(code).sort((a, b) => a.kickoff - b.kickoff)) {
    const st = matchState(m, now);
    if (st.status !== 'FINISHED') continue;
    const h = rows.get(m.home[0]), a = rows.get(m.away[0]);
    const { home: hg, away: ag } = st.score;
    h.playedGames++; a.playedGames++;
    h.goalsFor += hg; h.goalsAgainst += ag; a.goalsFor += ag; a.goalsAgainst += hg;
    if (hg > ag) { h.won++; a.lost++; h.form.push('W'); a.form.push('L'); }
    else if (hg < ag) { a.won++; h.lost++; a.form.push('W'); h.form.push('L'); }
    else { h.draw++; a.draw++; h.form.push('D'); a.form.push('D'); }
  }
  const table = [...rows.values()]
    .map((r) => ({ ...r, points: r.won * 3 + r.draw, goalDifference: r.goalsFor - r.goalsAgainst, form: null })) // like the real feed, which often has no form
    .sort((x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor)
    .map((r, i) => ({ ...r, position: i + 1 }));
  return { standings: [{ type: 'TOTAL', table }] };
}

const SCORER_NAMES = ['Erling Haaland', 'Mohamed Salah', 'Bukayo Saka', 'Cole Palmer', 'Ollie Watkins', 'Alexander Isak', 'Bryan Mbeumo', 'Jarrod Bowen', 'Chris Wood', 'Dominic Solanke', 'Jean-Philippe Mateta', 'Yoane Wissa'];
const SCORER_TEAMS = ['MCI', 'LIV', 'ARS', 'CHE', 'AVL', 'NEW', 'MUN', 'WHU', 'NOT', 'TOT', 'CRY', 'BRE'];

// Match detail as a paid plan returns it (goals, cards, subs, line-ups), so the match
// centre can be tried locally.
const SURNAMES = ['Smith', 'Silva', 'Jones', 'Okafor', 'Müller', 'García', 'Kane', 'Rossi', 'Diallo', 'Murphy', 'Costa', 'Nakamura', 'Walker', 'Dias', 'Reid', 'Kovač'];
function squad(team) {
  const r = rng(team[0] * 31);
  return Array.from({ length: 16 }, (_, i) => ({ id: team[0] * 100 + i, name: `${'ABCDEFGHJKLMNPRS'[Math.floor(r() * 16)]}. ${SURNAMES[Math.floor(r() * SURNAMES.length)]}`, shirtNumber: i + 1, position: i === 0 ? 'Goalkeeper' : i < 5 ? 'Defence' : i < 8 ? 'Midfield' : i < 11 ? 'Offence' : null }));
}
function findMock(id) {
  for (const code of Object.keys(LEAGUES)) {
    const m = season(code).find((x) => String(x.id) === String(id));
    if (m) return { m, code };
  }
  return null;
}
const pastMeetings = new Map(); // id -> raw match, filled by head2head()
function pastDetail(x) {
  const goals = [];
  for (const side of ['home', 'away']) {
    const team = side === 'home' ? x.homeTeam : x.awayTeam;
    for (let g = 0; g < x.score.fullTime[side]; g++) goals.push({ minute: 10 + ((g * 23 + (side === 'home' ? 7 : 31)) % 80), type: 'REGULAR', team, scorer: { name: `${SURNAMES[(team.id + g) % SURNAMES.length]}` } });
  }
  goals.sort((a, b) => a.minute - b.minute);
  const run = { home: 0, away: 0 };
  for (const g of goals) { run[g.team.id === x.homeTeam.id ? 'home' : 'away']++; g.score = { ...run }; }
  return { ...x, goals, bookings: [], substitutions: [], venue: `${x.homeTeam.name} Stadium`, referees: [{ name: 'A. Taylor', type: 'REFEREE' }] };
}
function matchDetail(id, now) {
  if (pastMeetings.has(String(id))) return pastDetail(pastMeetings.get(String(id)));
  const found = findMock(id);
  if (!found) return null;
  const { m, code } = found;
  const json = matchJson(m, code, now);
  const st = matchState(m, now);
  const upTo = st.status === 'FINISHED' ? 90 : st.minute || 0;
  const players = { home: squad(m.home), away: squad(m.away) };
  const teamOf = (side) => ({ id: m[side][0], name: m[side][1] });
  const running = { home: 0, away: 0 };
  json.goals = m.goalMinutes.filter(([, min]) => min <= upTo).sort((a, b) => a[1] - b[1]).map(([side, min], i) => {
    running[side]++;
    const pool = players[side].slice(5, 11);
    return { minute: min, injuryTime: null, type: i === 2 ? 'PENALTY' : 'REGULAR', team: teamOf(side),
      scorer: pool[(min + i) % pool.length], assist: i % 2 ? pool[(min + 1) % pool.length] : null, score: { ...running } };
  });
  json.bookings = st.status === 'TIMED' ? [] : [[34, 'home'], [61, 'away']].filter(([min]) => min <= upTo)
    .map(([min, side]) => ({ minute: min, team: teamOf(side), player: players[side][3], card: 'YELLOW' }));
  json.substitutions = st.status === 'TIMED' ? [] : [[66, 'home'], [72, 'away']].filter(([min]) => min <= upTo)
    .map(([min, side]) => ({ minute: min, team: teamOf(side), playerOut: players[side][9], playerIn: players[side][12] }));
  for (const side of ['home', 'away']) {
    const key = side === 'home' ? 'homeTeam' : 'awayTeam';
    json[key] = { ...json[key], formation: '4-3-3', coach: { name: `${m[side][1]} Manager` }, lineup: players[side].slice(0, 11), bench: players[side].slice(11) };
  }
  json.venue = `${m.home[1]} Stadium`;
  json.referees = [{ name: 'M. Oliver', type: 'REFEREE' }];
  return json;
}
function head2head(id) {
  const found = findMock(id);
  if (!found) return { matches: [] };
  const { m } = found;
  const r = rng(m.home[0] * m.away[0]);
  const matches = Array.from({ length: 6 }, (_, i) => {
    const [h, a] = i % 2 ? [m.away, m.home] : [m.home, m.away];
    return { id: 9_000_000 + Number(m.id) * 10 + i, utcDate: new Date(START - (i + 1) * 180 * DAY).toISOString(), status: 'FINISHED', competition: { code: 'PL' },
      homeTeam: toTeam(h), awayTeam: toTeam(a), score: { fullTime: { home: Math.floor(r() * 4), away: Math.floor(r() * 3) } } };
  });
  const wins = (team) => matches.filter((x) => {
    const { home, away } = x.score.fullTime;
    return (x.homeTeam.id === team[0] && home > away) || (x.awayTeam.id === team[0] && away > home);
  }).length;
  const draws = matches.filter((x) => x.score.fullTime.home === x.score.fullTime.away).length;
  for (const x of matches) pastMeetings.set(String(x.id), x);
  return { aggregates: { numberOfMatches: matches.length, homeTeam: { wins: wins(m.home), draws }, awayTeam: { wins: wins(m.away) } }, matches };
}

export function mockFeed(path) {
  const now = Date.now();
  const matchPath = path.split('?')[0].match(/^\/matches\/(\d+)(\/head2head)?$/);
  if (matchPath) {
    const out = matchPath[2] ? head2head(matchPath[1]) : matchDetail(matchPath[1], now);
    if (!out) throw new Error('football-data 404 for ' + path);
    return out;
  }
  const [, , code, kind] = path.split('?')[0].split('/');
  if (!LEAGUES[code]) return { matches: [], standings: [], scorers: [], teams: [] };
  if (kind === 'matches') return { matches: season(code).map((m) => matchJson(m, code, now)) };
  if (kind === 'standings') return standings(code, now);
  if (kind === 'teams') return { teams: LEAGUES[code].teams.map(toTeam) };
  if (kind === 'scorers') {
    const byTla = Object.fromEntries(LEAGUES.PL.teams.map((t) => [t[2], t]));
    return {
      scorers: code !== 'PL' ? [] : SCORER_NAMES.map((name, i) => ({
        player: { name }, team: toTeam(byTla[SCORER_TEAMS[i]]), goals: 11 - Math.floor(i * 0.8), assists: (i * 3) % 6,
      })),
    };
  }
  return {};
}
