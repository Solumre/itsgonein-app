// Penalty shootout mini-game. You take five and face five against the computer, then
// sudden death. Every kick is decided here (where the keeper dives, where the computer
// shoots), so results can't be made up in the browser.
// Goal zones: col 0 left, 1 centre, 2 right; row 0 top, 1 bottom.
import crypto from 'node:crypto';
import { db, FieldValue } from './firebase.js';
import { quizDate } from './quiz.js';

const games = db.collection('penGames');
export const REGULATION = 5;
export const MAX_ROUNDS = 10; // after that it's a draw
export const PEN_XP = 2; // XP per point of your best game each day (max 10 points)

const rand = (n) => crypto.randomInt(n);
const chance = (p) => crypto.randomInt(1000) < p * 1000;

// ---- pure rules (unit tested) ----

// Your shot: over the bar misses; if the keeper goes the same way, a low one is saved and
// a top corner beats him half the time.
export function shotResult({ col, row, over }, keeperCol, topCornerBeatsKeeper) {
  if (over) return 'miss';
  if (keeperCol !== col) return 'goal';
  return row === 0 && col !== 1 && topCornerBeatsKeeper ? 'goal' : 'saved';
}

// The computer's shot against your dive.
export function saveResult(diveCol, shot) {
  if (shot.off) return 'miss';
  if (diveCol !== shot.col) return 'goal';
  return shot.row === 0 && shot.col !== 1 && shot.beatsKeeper ? 'goal' : 'saved';
}

// Score and whether it's over, from the kicks so far (yours on even turns, theirs on odd).
export function tally(kicks) {
  const you = kicks.filter((k, i) => i % 2 === 0 && k.result === 'goal').length;
  const cpu = kicks.filter((k, i) => i % 2 === 1 && k.result === 'goal').length;
  const youTaken = Math.ceil(kicks.length / 2), cpuTaken = Math.floor(kicks.length / 2);
  let done = false;
  if (youTaken <= REGULATION && cpuTaken <= REGULATION) {
    // Over early if one side can't catch up with the kicks left.
    const youLeft = REGULATION - youTaken, cpuLeft = REGULATION - cpuTaken;
    done = you + youLeft < cpu || cpu + cpuLeft < you || (youLeft === 0 && cpuLeft === 0 && you !== cpu);
  } else if (youTaken === cpuTaken) {
    done = you !== cpu || youTaken >= MAX_ROUNDS; // sudden death, after each pair
  }
  const saves = kicks.filter((k, i) => i % 2 === 1 && k.result !== 'goal').length;
  const result = !done ? null : you > cpu ? 'won' : you < cpu ? 'lost' : 'draw';
  return { you, cpu, saves, done, result, points: Math.min(10, you + saves), next: kicks.length % 2 === 0 ? 'shoot' : 'save' };
}

// ---- Firestore ----

const fail = (status, message) => { throw Object.assign(new Error(message), { status, expose: true }); };

export async function startGame(uid) {
  const ref = games.doc();
  await ref.set({ uid, date: quizDate(), kicks: [], done: false, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, ...tally([]) };
}

export async function kick({ uid, id, type, col, row = 1, over = false }) {
  if (![0, 1, 2].includes(col)) fail(400, 'Aim somewhere in the goal.');
  if (![0, 1].includes(row)) fail(400, 'Aim somewhere in the goal.');
  const ref = games.doc(String(id));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) fail(404, 'Game not found.');
    const g = snap.data();
    const before = tally(g.kicks);
    if (before.done) fail(409, 'This shootout is over.');
    if (type !== before.next) fail(409, before.next === 'shoot' ? 'It\'s your kick!' : 'Get ready to save!');
    let k;
    if (type === 'shoot') {
      const keeper = rand(3);
      k = { col, row, over: !!over, keeper, result: shotResult({ col, row, over }, keeper, chance(0.5)) };
    } else {
      const shot = { col: rand(3), row: rand(2), off: chance(0.08), beatsKeeper: chance(0.5) };
      k = { dive: col, col: shot.col, row: shot.row, off: shot.off, result: saveResult(col, shot) };
    }
    const kicks = [...g.kicks, k];
    const t = tally(kicks);
    tx.update(ref, { kicks, done: t.done, ...(t.done && { result: t.result, points: t.points, finishedAt: FieldValue.serverTimestamp() }) });
    return { kick: k, ...t };
  });
}

// Your record, plus XP: your best game each day, up to 10 points, is worth 2 XP a point.
export async function penStats(uid, today = quizDate()) {
  const snap = await games.where('uid', '==', uid).get();
  const done = snap.docs.map((d) => d.data()).filter((g) => g.done);
  const bestByDay = {};
  for (const g of done) bestByDay[g.date] = Math.max(bestByDay[g.date] || 0, g.points || 0);
  return {
    played: done.length,
    wins: done.filter((g) => g.result === 'won').length,
    best: Math.max(0, ...done.map((g) => g.points || 0)),
    today: bestByDay[today] ?? null,
    xp: Object.values(bestByDay).reduce((s, p) => s + Math.min(10, p) * PEN_XP, 0),
  };
}

// Best score today for each of these players.
export async function bestToday(uids, today = quizDate()) {
  const want = new Set(uids);
  const out = {};
  // One query on the date (no composite index needed); there aren't many games a day.
  for (const d of (await games.where('date', '==', today).get()).docs) {
    const g = d.data();
    if (!g.done || !want.has(g.uid)) continue;
    const cur = out[g.uid];
    if (!cur || g.points > cur.points) out[g.uid] = { points: g.points, result: g.result };
  }
  return out;
}
