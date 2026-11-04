// Tactics board: formations, squads and checking a predicted XI against the real one.
// Pitch coordinates are percentages: x 0 (left) to 100 (right), y 0 (own goal) to 100
// (the goal you're attacking).

const row = (y, xs) => xs.map((x) => [x, y]);
const GK = [[50, 6]];
export const FORMATIONS = {
  '4-3-3': [...GK, ...row(25, [14, 37, 63, 86]), ...row(48, [28, 50, 72]), ...row(76, [18, 50, 82])],
  '4-4-2': [...GK, ...row(25, [14, 37, 63, 86]), ...row(50, [14, 37, 63, 86]), ...row(78, [36, 64])],
  '4-2-3-1': [...GK, ...row(24, [14, 37, 63, 86]), ...row(42, [36, 64]), ...row(62, [20, 50, 80]), ...row(82, [50])],
  '3-5-2': [...GK, ...row(24, [26, 50, 74]), ...row(48, [10, 32, 50, 68, 90]), ...row(78, [36, 64])],
  '3-4-3': [...GK, ...row(24, [26, 50, 74]), ...row(48, [14, 38, 62, 86]), ...row(76, [20, 50, 80])],
  '5-3-2': [...GK, ...row(24, [8, 29, 50, 71, 92]), ...row(50, [28, 50, 72]), ...row(78, [36, 64])],
  '4-1-4-1': [...GK, ...row(23, [14, 37, 63, 86]), ...row(38, [50]), ...row(58, [12, 36, 64, 88]), ...row(82, [50])],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

// The kind of player each spot wants, from its height up the pitch.
export const slotGroup = (y, i) => (i === 0 ? 'GK' : y < 35 ? 'DEF' : y < 68 ? 'MID' : 'FWD');

// football-data positions ("Goalkeeper", "Defence", "Centre-Back", "Left Winger"...) to groups.
export function posGroup(position) {
  const p = String(position || '').toLowerCase();
  if (/keeper/.test(p)) return 'GK';
  if (/midfield/.test(p)) return 'MID'; // before defence: "Defensive Midfield" is a midfielder
  if (/back|defen/.test(p)) return 'DEF';
  if (/offence|attack|forward|wing|striker/.test(p)) return 'FWD';
  return null;
}

// Fill the formation's spots with the squad, keepers in goal, defenders at the back, etc.
export function autoFill(formation, squad) {
  const spots = FORMATIONS[formation] || FORMATIONS['4-3-3'];
  const left = [...squad];
  const take = (group) => {
    const i = left.findIndex((p) => posGroup(p.position) === group);
    return i >= 0 ? left.splice(i, 1)[0] : null;
  };
  const players = spots.map(([x, y], i) => ({ x, y, group: slotGroup(y, i), name: null }));
  for (const p of players) p.name = take(p.group)?.name || null;
  for (const p of players) if (!p.name && left.length) p.name = left.shift().name; // anyone left
  return players;
}

// Names compared without accents or special letters (Ødegaard = Odegaard).
const normName = (n) => String(n || '').toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// How a predicted XI did: which players really started, and whether the shape was right.
export function compareXI(board, lineup) {
  if (!board || !lineup?.starting?.length) return null;
  const real = new Set(lineup.starting.map((p) => normName(p.name)));
  const hits = board.players.map((p) => !!p.name && real.has(normName(p.name)));
  return {
    correct: hits.filter(Boolean).length,
    total: 11,
    hits,
    formationRight: !!lineup.formation && lineup.formation === board.formation,
    formation: lineup.formation || null,
  };
}

// Check a board sent to the server: names from the squad, positions on the pitch.
export function cleanBoard(body, squadNames) {
  const formation = FORMATIONS[body?.formation] ? body.formation : null;
  if (!formation) return { error: 'Pick a formation.' };
  const allowed = new Set(squadNames);
  const players = Array.isArray(body.players) ? body.players : [];
  if (players.length !== 11) return { error: 'A team needs 11 players.' };
  const num = (v) => Math.round(Math.min(100, Math.max(0, Number(v) || 0)) * 10) / 10;
  const seen = new Set();
  const clean = [];
  for (const p of players) {
    const name = p?.name == null || p.name === '' ? null : String(p.name);
    if (name && !allowed.has(name)) return { error: 'Only players from the squad, please.' };
    if (name && seen.has(name)) return { error: `${name} is in twice!` };
    if (name) seen.add(name);
    clean.push({ name, x: num(p.x), y: num(p.y) });
  }
  const arrows = (Array.isArray(body.arrows) ? body.arrows : []).slice(0, 12).map((a) => ({
    kind: a?.kind === 'pass' ? 'pass' : 'run', x1: num(a?.x1), y1: num(a?.y1), x2: num(a?.x2), y2: num(a?.y2),
  }));
  return { board: { formation, players: clean, arrows } };
}
