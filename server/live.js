// Live picks: quick questions during a game, settled from the score.
//   next_H-A  "Who scores next?" asked at score H-A: home, away or none (no more goals).
//             A new one opens after every goal. 2 points.
//   h1 / h2   "Goal before half-time?" / "Goal in the second half?": yes or no, open only
//             while that half is still goalless. 1 point.
import { db, FieldValue } from './firebase.js';

const col = db.collection('livePicks');
export const LIVE_POINTS = { next: 2, h1: 1, h2: 1 };
export const LIVE_XP = 5; // XP per live point

// The match minute, estimated from kickoff when the feed doesn't give one.
export function minuteOf(m, now = Date.now()) {
  if (m.minute != null) return Number(m.minute);
  const e = Math.floor((now - new Date(m.kickoff).getTime()) / 60_000) + 1;
  return e <= 45 ? Math.max(1, e) : e <= 60 ? 45 : Math.min(90, e - 15);
}
const secondHalf = (m, now) => !m.paused && (m.half != null || minuteOf(m, now) > 45);

// Questions open right now for a match.
export function openQuestions(m, now = Date.now()) {
  if (m.status !== 'live' || !m.score) return [];
  const min = minuteOf(m, now);
  const s = m.score;
  const qs = [];
  if (min < 85) {
    qs.push({ id: `next_${s.home}-${s.away}`, kind: 'next', at: { ...s }, options: ['home', 'none', 'away'] });
  }
  if (!m.paused && !secondHalf(m, now) && min <= 35 && s.home + s.away === 0) {
    qs.push({ id: 'h1', kind: 'h1', options: ['yes', 'no'] });
  }
  if (secondHalf(m, now) && m.half && min <= 80 && s.home === m.half.home && s.away === m.half.away) {
    qs.push({ id: 'h2', kind: 'h2', options: ['yes', 'no'] });
  }
  return qs;
}

// The right answer to a question, once it's known (null = not yet, 'void' = can't tell).
export function outcome(qid, m, now = Date.now()) {
  if (!m.score || (m.status !== 'live' && m.status !== 'finished')) return m.status === 'postponed' ? 'void' : null;
  const s = m.score;
  if (qid.startsWith('next_')) {
    const [h, a] = qid.slice(5).split('-').map(Number);
    const dh = s.home - h, da = s.away - a;
    if (dh > 0 && da > 0) return 'void'; // both scored between two looks: can't tell who was first
    if (dh > 0) return 'home';
    if (da > 0) return 'away';
    return m.status === 'finished' ? 'none' : null;
  }
  if (qid === 'h1') {
    if (s.home + s.away > 0 && !secondHalf(m, now) && m.status === 'live') return 'yes';
    if (m.half) return m.half.home + m.half.away > 0 ? 'yes' : 'no';
    if (m.status === 'finished' || m.paused || secondHalf(m, now)) return s.home + s.away === 0 ? 'no' : 'void';
    return null;
  }
  if (qid === 'h2') {
    if (!m.half) return m.status === 'finished' ? 'void' : null;
    if (s.home + s.away > m.half.home + m.half.away) return 'yes';
    return m.status === 'finished' ? 'no' : null;
  }
  return 'void';
}

export const kindOf = (qid) => (qid.startsWith('next_') ? 'next' : qid);
export const pointsFor = (qid, answer, right) => (right && right !== 'void' && answer === right ? LIVE_POINTS[kindOf(qid)] : 0);

// ---- Firestore ----

export async function answer({ uid, match, qid, choice, now = Date.now() }) {
  const q = openQuestions(match, now).find((x) => x.id === qid);
  if (!q) throw Object.assign(new Error('That question has closed.'), { status: 409, expose: true });
  if (!q.options.includes(choice)) throw Object.assign(new Error('Pick one of the options.'), { status: 400, expose: true });
  try {
    await col.doc(`${match.id}_${qid}_${uid}`).create({
      uid, matchId: match.id, competition: match.competition, qid, kind: q.kind, answer: choice,
      at: FieldValue.serverTimestamp(), result: null, points: 0,
    });
  } catch (e) {
    if (e.code === 6) throw Object.assign(new Error('You\'ve already answered that one.'), { status: 409, expose: true });
    throw e;
  }
}

export async function picksForMatch(matchId) {
  return (await col.where('matchId', '==', String(matchId)).get()).docs.map((d) => d.data());
}

// Settle answers whose result is now known. Returns the players whose totals changed.
export async function settleLive(matches, now = Date.now()) {
  const open = await col.where('result', '==', null).get();
  if (open.empty) return [];
  const byId = new Map(matches.map((m) => [m.id, m]));
  const changed = new Set();
  const batch = db.batch();
  let writes = 0;
  for (const d of open.docs) {
    const p = d.data();
    const m = byId.get(p.matchId);
    if (!m) continue;
    const right = outcome(p.qid, m, now);
    if (!right) continue;
    const points = pointsFor(p.qid, p.answer, right);
    batch.update(d.ref, { result: right, points, settledAt: FieldValue.serverTimestamp() });
    if (points) changed.add(p.uid);
    if (++writes >= 450) break; // the rest next time
  }
  if (writes) await batch.commit();
  return [...changed];
}

export async function liveTotal(uid) {
  const snap = await col.where('uid', '==', uid).get();
  return snap.docs.reduce((s, d) => s + (d.data().points || 0), 0);
}
