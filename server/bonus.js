// Weekly bonus questions for Premier League gameweeks. Answers lock at the gameweek's
// first kickoff and score when every game is done; points go into that gameweek's total.
import { db, FieldValue } from './firebase.js';
import { getMatches } from './football.js';
import { bonusQuestions, validBonusAnswer, scoreBonus } from '../src/lib/game.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status, expose: true }); };
const answersCol = db.collection('bonusAnswers');
const customCol = db.collection('bonusQuestions');
const key = (md) => `PL_${md}`;

// When answers lock: the first kickoff, or straight away if anything has started.
export function lockAt(gwMatches) {
  const games = gwMatches.filter((m) => m.status !== 'postponed');
  if (!games.length) return 0;
  if (games.some((m) => m.status !== 'upcoming')) return 0;
  return Math.min(...games.map((m) => new Date(m.kickoff).getTime()));
}

async function custom(md) {
  const d = await customCol.doc(key(md)).get();
  return d.exists ? d.data() : null;
}

export async function getBonus(uid, md) {
  const matches = await getMatches('PL');
  const gw = matches.filter((m) => m.matchday === md);
  if (!gw.length) fail(404, 'No games in that gameweek.');
  const [c, mine] = await Promise.all([custom(md), answersCol.doc(`${uid}_${key(md)}`).get()]);
  const answers = mine.exists ? mine.data().answers : {};
  const locks = lockAt(gw);
  return {
    matchday: md,
    questions: bonusQuestions(md, gw, c),
    answers,
    lockAt: locks,
    locked: locks <= Date.now(),
    result: scoreBonus(answers, gw, c),
  };
}

export async function saveBonus(uid, md, input) {
  const matches = await getMatches('PL');
  const gw = matches.filter((m) => m.matchday === md);
  if (!gw.length) fail(404, 'No games in that gameweek.');
  if (lockAt(gw) <= Date.now()) fail(400, 'Bonus answers are locked: the gameweek has kicked off.');
  const qs = bonusQuestions(md, gw, await custom(md));
  const answers = {};
  for (const [id, value] of Object.entries(input || {})) {
    if (value == null) continue;
    if (!validBonusAnswer(qs.find((q) => q.id === id), value)) fail(400, 'That answer isn’t valid.');
    answers[id] = value;
  }
  await answersCol.doc(`${uid}_${key(md)}`).set({
    uid, competition: 'PL', matchday: md, key: key(md), answers, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { answers };
}

// Bonus points per gameweek for one player, for recomputeUser. Also stores the points
// on each answers doc so recaps can show them.
export async function bonusForUser(uid, plMatches) {
  const snap = await answersCol.where('uid', '==', uid).get();
  if (snap.empty) return { total: 0, gw: {} };
  const mds = [...new Set(snap.docs.map((d) => d.data().matchday))];
  const customs = await db.getAll(...mds.map((md) => customCol.doc(key(md))));
  const customBy = Object.fromEntries(customs.map((d, i) => [mds[i], d.exists ? d.data() : null]));
  const gw = {};
  let total = 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    const { matchday, answers, points } = d.data();
    const r = scoreBonus(answers, plMatches.filter((m) => m.matchday === matchday), customBy[matchday]);
    if (!r) continue;
    gw[matchday] = r.total;
    total += r.total;
    if (points !== r.total) batch.update(d.ref, { points: r.total, breakdown: r.points });
  }
  await batch.commit();
  return { total, gw };
}

// Players who answered bonus questions for these gameweeks (to recompute when they finish).
export async function bonusPlayers(mds) {
  const keys = [...new Set(mds.filter((md) => md != null))].map(key);
  const uids = new Set();
  for (let i = 0; i < keys.length; i += 30) {
    const snap = await answersCol.where('key', 'in', keys.slice(i, i + 30)).get();
    snap.docs.forEach((d) => uids.add(d.data().uid));
  }
  return uids;
}

// --- admin -----------------------------------------------------------------------------
export async function setCustomQuestion(md, question, options) {
  const matches = await getMatches('PL');
  const gw = matches.filter((m) => m.matchday === md);
  if (!gw.length) fail(404, 'No games in that gameweek.');
  if (lockAt(gw) <= Date.now()) fail(400, 'That gameweek has kicked off, so it’s too late to add a question.');
  const text = String(question || '').trim().slice(0, 120);
  const opts = (options || []).map((o) => String(o || '').trim().slice(0, 40)).filter(Boolean);
  if (text.length < 5) fail(400, 'Write a question.');
  if (opts.length < 2 || opts.length > 4) fail(400, 'Give 2 to 4 answers.');
  await customCol.doc(key(md)).set({
    matchday: md, question: text, options: opts.map((label, i) => ({ id: `o${i + 1}`, label })), answer: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function markCustomAnswer(md, answer) {
  const ref = customCol.doc(key(md));
  const d = await ref.get();
  if (!d.exists) fail(404, 'No bonus question for that gameweek.');
  if (!d.data().options.some((o) => o.id === answer)) fail(400, 'Pick one of the answers.');
  await ref.update({ answer });
}

export async function listCustomQuestions() {
  const snap = await customCol.orderBy('matchday', 'desc').limit(10).get();
  return snap.docs.map((d) => d.data());
}
