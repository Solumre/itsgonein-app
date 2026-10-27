import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, auth, FieldValue } from './firebase.js';
import {
  COMPETITIONS, GAME_COMPETITION, GAME_COMPETITIONS, isCompetition, getMatches, getStandings, getScorers, getTeams, currentMatchday,
  getMatchDetail, getHead2Head,
} from './football.js';
import { syncNow, startSyncLoop, toGameMatch, gameMatches, recomputeUser, matchesByCompetition } from './sync.js';
import { buildRecap, gameweekComplete } from './recap.js';
import { createChallenge, respondChallenge, cancelChallenge, listChallenges, openRound } from './h2h.js';
import { listTrophies } from './trophies.js';
import { quizDate, getQuiz, getPlay, answerQuestion, quizStats, playsFor, publicQuestion } from './quiz.js';
import { startGame, kick as penKick, penStats, bestToday } from './pens.js';
import { openQuestions, answer as answerLive, picksForMatch } from './live.js';
import { findHighlights, getHighlight, getPreview, searchFor, searchCandidates, latestHighlights, getChannels, setChannels, resolveChannel, saveVideo, videoIdFrom, quotaToday } from './highlights.js';
import { getBonus, saveBonus, setCustomQuestion, markCustomAnswer, listCustomQuestions, bonusPlayers } from './bonus.js';
import { checkText, checkNickname, QUICK_CHAT, REACTIONS, rateLimit } from './moderation.js';
import { scorePick, validDoubles, AVATARS, GAMES } from '../src/lib/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'tm@solumre.com').split(',').map((s) => s.trim().toLowerCase());
const MAX_MEMBERS = 50;
const MAX_LEAGUES = 10;

export const app = express();
app.set('trust proxy', 1);
if (process.env.ALLOWED_ORIGINS) app.use(cors({ origin: process.env.ALLOWED_ORIGINS.split(',') }));
app.use(express.json({ limit: '10kb' }));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- auth ---------------------------------------------------------------------------
async function readUser(req) {
  const h = req.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    return await auth.verifyIdToken(h.slice(7));
  } catch {
    return null;
  }
}
const requireUser = wrap(async (req, _res, next) => {
  req.user = await readUser(req);
  if (!req.user) fail(401, 'Please sign in.');
  next();
});
const optionalUser = wrap(async (req, _res, next) => { req.user = await readUser(req); next(); });
const isAdmin = (u) => !!u && u.email_verified && ADMIN_EMAILS.includes((u.email || '').toLowerCase());
const requireAdmin = (req, _res, next) => (isAdmin(req.user) ? next() : next(new HttpError(403, 'Admins only.')));

const users = db.collection('users');
const privates = db.collection('private');
const leagues = db.collection('leagues');

// Leagues and chat need a finished profile, a parent's OK for under-13s, and no ban.
async function socialCheck(uid) {
  const [u, p, ban] = await Promise.all([users.doc(uid).get(), privates.doc(uid).get(), db.collection('bans').doc(uid).get()]);
  if (!u.exists || !p.exists) fail(403, 'Finish setting up your profile first.');
  if (ban.exists) fail(403, 'Your account has been blocked from chat and leagues.');
  const consent = p.data().consent;
  if (consent !== 'not_needed' && consent !== 'approved') fail(403, 'A parent needs to OK your account before you can join leagues and chat.');
  return { user: u.data(), priv: p.data() };
}

// --- football data -------------------------------------------------------------------
const competition = (req) => {
  const c = String(req.query.competition || GAME_COMPETITION).toUpperCase();
  if (!isCompetition(c)) fail(400, 'Unknown competition');
  return c;
};

const gameCompetition = (req) => {
  const c = String(req.query.competition || GAME_COMPETITION).toUpperCase();
  if (!GAME_COMPETITIONS.includes(c)) fail(400, 'Unknown competition');
  return c;
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/competitions', (_req, res) => res.json({ competitions: COMPETITIONS, game: GAME_COMPETITION, games: GAME_COMPETITIONS }));

app.get('/api/matches', wrap(async (req, res) => {
  const code = competition(req);
  const matches = await getMatches(code);
  if (GAME_COMPETITIONS.includes(code)) syncNow().catch((e) => console.error('sync', e.message));
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ matches, currentMatchday: currentMatchday(matches) });
}));

app.get('/api/standings', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=120');
  res.json({ standings: await getStandings(competition(req)) });
}));

app.get('/api/scorers', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ scorers: await getScorers(competition(req)) });
}));

// Match centre: the match (with goals, cards and line-ups when the data plan has them),
// head-to-head and form, plus your pick and your league mates' picks once it kicks off.
// A game's saved video, or a quick search for one (given 4 seconds; it carries on and is
// saved for next time if it takes longer).
async function videoFor(kind, m) {
  const get = kind === 'highlight' ? getHighlight : getPreview;
  const saved = await get(m.id).catch(() => null);
  if (saved) return saved;
  const found = await Promise.race([searchFor(m), new Promise((r) => { setTimeout(() => r(null), 4000).unref?.(); })]);
  return found ? get(m.id).catch(() => null) : null;
}

app.get('/api/match/:id', optionalUser, wrap(async (req, res) => {
  const id = String(req.params.id);
  // Past meetings can be from cups we don't list; those are looked up by id alone below.
  const asked = String(req.query.competition || '').toUpperCase();
  const comp = isCompetition(asked) ? asked : GAME_COMPETITION;
  const base = (await getMatches(comp)).find((m) => m.id === id);
  if (!base) {
    // Not in this season's fixtures: an older game, e.g. a past head-to-head meeting.
    const old = await getMatchDetail(id, null).catch(() => null);
    if (!old) fail(404, 'Match not found.');
    const [h2h, highlight] = await Promise.all([getHead2Head(id).catch(() => null), videoFor('highlight', old)]);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({ match: old, h2h, form: null, mine: null, mates: null, past: true, highlight });
  }
  const [detail, h2h, standings, highlight] = await Promise.all([
    getMatchDetail(id, comp).catch(() => null),
    getHead2Head(id).catch(() => null),
    getStandings(comp).catch(() => null),
    base.status === 'finished' ? videoFor('highlight', base) : null,
  ]);
  const preview = base.status === 'upcoming' ? await videoFor('preview', base) : null;
  // The fixtures feed can be fresher than a cached detail; keep the newer score and status.
  const match = detail ? { ...detail, status: base.status, minute: base.minute ?? detail.minute, paused: base.paused, score: base.score } : { ...base, events: [], lineups: null };
  const row = (teamId) => standings?.flatMap((s) => s.table).find((r) => r.team.id === teamId) || null;
  const form = { home: row(match.home.id), away: row(match.away.id) };

  let mine = null, mates = null, live = null;
  let memberIds = [], people = [];
  if (req.user && GAME_COMPETITIONS.includes(comp)) {
    const uid = req.user.uid;
    const pickRef = (u) => db.collection('predictions').doc(`${u}_${id}`);
    const myPick = await pickRef(uid).get();
    const started = match.status !== 'upcoming' || new Date(match.kickoff).getTime() <= Date.now();
    const scoreNow = match.status === 'live' || match.status === 'finished';
    const pts = (p) => (p.points != null ? p.points : scoreNow ? scorePick(p, match.score, !!p.double) : null);
    if (myPick.exists) { const p = myPick.data(); mine = { home: p.home, away: p.away, double: !!p.double, points: pts(p) }; }
    memberIds = [...new Set((await leagues.where('members', 'array-contains', uid).get()).docs.flatMap((l) => l.data().members))].filter((u) => u !== uid);
    if (memberIds.length) {
      let picks;
      [picks, people] = await Promise.all([db.getAll(...memberIds.map(pickRef)), db.getAll(...memberIds.map((u) => users.doc(u)))]);
      const pickBy = Object.fromEntries(picks.filter((d) => d.exists).map((d) => [d.data().uid, d.data()]));
      if (!started) {
        mates = { revealed: false, picked: Object.keys(pickBy).length, total: memberIds.length };
      } else {
        const list = people.filter((d) => d.exists && pickBy[d.id]).map((d) => {
          const p = pickBy[d.id];
          return { uid: d.id, nickname: d.data().nickname, avatar: d.data().avatar, club: d.data().club || null, pick: { home: p.home, away: p.away, double: !!p.double }, points: pts(p) };
        }).sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.nickname.localeCompare(b.nickname));
        const side = (p) => Math.sign(p.home - p.away);
        mates = {
          revealed: true, picked: list.length, total: memberIds.length, list,
          split: { home: list.filter((m) => side(m.pick) > 0).length, draw: list.filter((m) => side(m.pick) === 0).length, away: list.filter((m) => side(m.pick) < 0).length },
        };
      }
    }
  }
  if (req.user && GAME_COMPETITIONS.includes(comp) && (match.status === 'live' || match.status === 'finished')) {
    live = await liveFor(req.user.uid, match, memberIds, people);
  }
  res.set('Cache-Control', req.user ? 'no-store' : 'public, max-age=15');
  res.json({ match, h2h, form, mine, mates, highlight, preview, live });
}));

// Live picks for the match centre: open questions with your answer, how league mates
// answered, and points so far in this game.
async function liveFor(uid, match, memberIds, people) {
  const all = await picksForMatch(match.id);
  const mateSet = new Set(memberIds);
  const who = Object.fromEntries(people.filter((d) => d.exists).map((d) => [d.id, { nickname: d.data().nickname, avatar: d.data().avatar }]));
  const mineBy = Object.fromEntries(all.filter((p) => p.uid === uid).map((p) => [p.qid, p]));
  const matesFor = (qid) => all.filter((p) => p.qid === qid && mateSet.has(p.uid) && who[p.uid]).map((p) => ({ ...who[p.uid], answer: p.answer }));
  const open = openQuestions(match).map((q) => ({ ...q, mine: mineBy[q.id]?.answer || null, mates: matesFor(q.id) }));
  const openIds = new Set(open.map((q) => q.id));
  const history = Object.values(mineBy).filter((p) => !openIds.has(p.qid))
    .map((p) => ({ qid: p.qid, kind: p.kind, answer: p.answer, result: p.result, points: p.points || 0 }))
    .sort((a, b) => b.qid.localeCompare(a.qid));
  const table = new Map();
  for (const p of all) if ((p.uid === uid || (mateSet.has(p.uid) && who[p.uid]))) table.set(p.uid, (table.get(p.uid) || 0) + (p.points || 0));
  const board = [...table.entries()].map(([u, points]) => ({ uid: u, me: u === uid, points, ...(who[u] || { nickname: 'You' }) }))
    .sort((a, b) => b.points - a.points || (a.me ? -1 : b.me ? 1 : 0));
  if (!open.length && !history.length) return null;
  return { open, history, board, points: history.reduce((s, h) => s + h.points, 0) };
}

// --- penalty shootout ----------------------------------------------------------------------
app.get('/api/pens', requireUser, wrap(async (req, res) => {
  const uid = req.user.uid;
  const ids = [...new Set((await leagues.where('members', 'array-contains', uid).get()).docs.flatMap((l) => l.data().members))].filter((u) => u !== uid);
  const [stats, best, people] = await Promise.all([penStats(uid), bestToday(ids), ids.length ? db.getAll(...ids.map((u) => users.doc(u))) : []]);
  const mates = people.filter((d) => d.exists && best[d.id])
    .map((d) => ({ uid: d.id, nickname: d.data().nickname, avatar: d.data().avatar, ...best[d.id] }))
    .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname));
  const { xp, ...rest } = stats; // eslint-disable-line no-unused-vars
  res.set('Cache-Control', 'no-store');
  res.json({ stats: rest, mates });
}));

app.post('/api/pens', requireUser, wrap(async (req, res) => {
  if (!rateLimit(`pens:${req.user.uid}`, { max: 40, windowMs: 60 * 60_000 })) fail(429, 'Take a break! Try again in a bit.');
  res.json(await startGame(req.user.uid));
}));

app.post('/api/pens/:id/kick', requireUser, wrap(async (req, res) => {
  const r = await penKick({ uid: req.user.uid, id: req.params.id, type: String(req.body?.type || ''), col: Number(req.body?.col), row: Number(req.body?.row ?? 1), over: !!req.body?.over });
  if (r.done) await recomputeUser(req.user.uid, matchesByCompetition(await gameMatches())).catch((e) => console.error('pens xp', e.message));
  res.json(r);
}));

// --- daily quiz -------------------------------------------------------------------------
const loadQuizData = async () => {
  const [matches, standings, scorers, teams] = await Promise.all([
    getMatches('PL').catch(() => []), getStandings('PL').catch(() => []), getScorers('PL').catch(() => []), getTeams('PL').catch(() => []),
  ]);
  return { matches, table: standings[0]?.table || [], scorers, teams };
};

// Today's questions (answers only for ones you've answered), your progress, and your
// league mates' scores.
app.get('/api/quiz', optionalUser, wrap(async (req, res) => {
  const date = quizDate();
  const questions = await getQuiz(date, loadQuizData);
  let play = null, stats = null, mates = [];
  if (req.user) {
    const uid = req.user.uid;
    [play, stats] = await Promise.all([getPlay(uid, date), quizStats(uid, date)]);
    const ids = [...new Set((await leagues.where('members', 'array-contains', uid).get()).docs.flatMap((l) => l.data().members))].filter((u) => u !== uid);
    const [ps, people] = await Promise.all([playsFor(ids, date), ids.length ? db.getAll(...ids.map((u) => users.doc(u))) : []]);
    const who = Object.fromEntries(people.filter((d) => d.exists).map((d) => [d.id, d.data()]));
    mates = ps.filter((p) => who[p.uid]).map((p) => ({ uid: p.uid, nickname: who[p.uid].nickname, avatar: who[p.uid].avatar, score: p.score, done: !!p.done }))
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    date,
    questions: questions.map((x, i) => (play?.answers?.[i] != null ? { ...x, chosen: play.answers[i] } : publicQuestion(x))),
    play: play && { score: play.score, done: !!play.done },
    stats, mates,
  });
}));

app.post('/api/quiz/answer', requireUser, wrap(async (req, res) => {
  const date = quizDate();
  const questions = await getQuiz(date, loadQuizData);
  const r = await answerQuestion({ uid: req.user.uid, date, questions, n: Number(req.body?.n), choice: Number(req.body?.choice) });
  if (r.done) {
    await recomputeUser(req.user.uid, matchesByCompetition(await gameMatches())).catch((e) => console.error('quiz xp', e.message));
    if (r.score === questions.length) await announcePerfectQuiz(req.user.uid, date).catch((e) => console.error('quiz announce', e.message));
  }
  res.json(r);
}));

// A perfect score gets a shout in the player's leagues.
async function announcePerfectQuiz(uid, date) {
  const me = await users.doc(uid).get();
  if (!me.exists) return;
  const ls = await leagues.where('members', 'array-contains', uid).get();
  for (const l of ls.docs) {
    await l.ref.collection('messages').doc(`quiz_${date}_${uid}`).set({
      type: 'system', event: 'quiz', text: `🧠 ${me.data().nickname} got 5/5 in today's quiz! Can you match it?`,
      createdAt: FieldValue.serverTimestamp(), reactions: {},
    });
  }
}

app.post('/api/match/:id/live', requireUser, wrap(async (req, res) => {
  const comp = String(req.query.competition || req.body?.competition || '').toUpperCase();
  if (!GAME_COMPETITIONS.includes(comp)) fail(400, 'Live picks are for Premier League and Champions League games.');
  const match = (await getMatches(comp)).find((m) => m.id === String(req.params.id));
  if (!match) fail(404, 'Match not found.');
  await answerLive({ uid: req.user.uid, match, qid: String(req.body?.qid || ''), choice: String(req.body?.answer || '') });
  res.json({ ok: true });
}));

// Latest match highlights, newest game first.
app.get('/api/highlights', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const c = String(req.query.competition || '').toUpperCase();
  res.json({ highlights: await latestHighlights(10, isCompetition(c) ? c : null) });
}));

// Clubs to pick from: Premier League and Championship.
app.get('/api/teams', wrap(async (_req, res) => {
  const [pl, elc] = await Promise.all([getTeams('PL'), getTeams('ELC').catch(() => [])]);
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ groups: [{ name: 'Premier League', teams: pl }, { name: 'Championship', teams: elc }] });
}));

// --- profile & parent consent ---------------------------------------------------------
function ageFrom(year, month, now = new Date()) {
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month) age--;
  return age;
}

const HEX = /^#[0-9a-f]{6}$/i;
function cleanClub(c) {
  if (c == null) return null;
  if (typeof c !== 'object') fail(400, 'Bad club');
  const club = {
    id: c.id == null ? null : Number(c.id),
    name: String(c.name || '').slice(0, 40),
    tla: String(c.tla || '').slice(0, 4).toUpperCase(),
    crest: typeof c.crest === 'string' && /^https:\/\/crests\.football-data\.org\//.test(c.crest) ? c.crest : null,
    primary: HEX.test(c.primary) ? c.primary : '#16a34a',
    secondary: HEX.test(c.secondary) ? c.secondary : '#ffffff',
  };
  if (!club.name) fail(400, 'Pick a club');
  return club;
}

app.post('/api/profile', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  const body = req.body || {};
  const userRef = users.doc(uid);
  const privRef = privates.doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [u, p] = await Promise.all([tx.get(userRef), tx.get(privRef)]);
    const update = {};
    const privUpdate = {};

    if (!p.exists) {
      const year = Number(body.birthYear), month = Number(body.birthMonth);
      const thisYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < thisYear - 100 || year > thisYear - 5 || !(month >= 1 && month <= 12)) fail(400, 'Tell us your birthday month and year.');
      const under13 = ageFrom(year, month) < 13;
      Object.assign(privUpdate, {
        birthYear: year, birthMonth: month, under13,
        consent: under13 ? 'pending' : 'not_needed',
        consentToken: under13 ? crypto.randomBytes(16).toString('hex') : null,
        blocked: [], createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (body.nickname !== undefined) {
      const check = checkNickname(body.nickname);
      if (!check.ok) fail(400, check.reason);
      const key = check.nickname.toLowerCase();
      const oldKey = u.exists ? u.data().nickname?.toLowerCase() : null;
      if (key !== oldKey) {
        const taken = await tx.get(db.collection('nicknames').doc(key));
        if (taken.exists && taken.data().uid !== uid) fail(409, 'That nickname is taken — try another.');
        tx.set(db.collection('nicknames').doc(key), { uid });
        if (oldKey) tx.delete(db.collection('nicknames').doc(oldKey));
      }
      update.nickname = check.nickname;
    } else if (!u.exists) fail(400, 'Pick a nickname.');

    if (body.avatar !== undefined) {
      if (!AVATARS.includes(body.avatar)) fail(400, 'Pick an avatar.');
      update.avatar = body.avatar;
    } else if (!u.exists) update.avatar = AVATARS[0];

    if (body.club !== undefined) update.club = cleanClub(body.club);
    else if (!u.exists) fail(400, 'Pick a club.');

    if (!u.exists) {
      update.createdAt = FieldValue.serverTimestamp();
      update.stats = { points: 0, played: 0, exact: 0, results: 0, streak: 0, bestStreak: 0, gw: {}, badges: [], xp: 0, level: 1 };
    }
    tx.set(userRef, update, { merge: true });
    if (Object.keys(privUpdate).length) tx.set(privRef, privUpdate, { merge: true });
    return { created: !u.exists };
  });
  res.json(result);
}));

const byToken = async (token) => {
  if (!/^[0-9a-f]{32}$/.test(token)) fail(404, 'This link isn\'t valid.');
  const snap = await privates.where('consentToken', '==', token).limit(1).get();
  if (snap.empty) fail(404, 'This link isn\'t valid.');
  return snap.docs[0];
};

app.get('/api/consent/:token', wrap(async (req, res) => {
  const p = await byToken(req.params.token);
  const u = await users.doc(p.id).get();
  res.json({ nickname: u.data()?.nickname, avatar: u.data()?.avatar, club: u.data()?.club?.name, status: p.data().consent });
}));

app.post('/api/consent/:token', requireUser, wrap(async (req, res) => {
  const p = await byToken(req.params.token);
  const approve = req.body?.approve !== false;
  if (p.id === req.user.uid) fail(400, 'A parent or carer needs to sign in with their own account.');
  const parentPriv = await privates.doc(req.user.uid).get();
  if (parentPriv.exists && parentPriv.data().under13) fail(400, 'A parent or carer needs to sign in with their own account.');
  if (approve && req.body?.confirm !== true) fail(400, 'Please confirm you are the parent or carer.');
  const existing = p.data().parent;
  if (existing && existing.uid !== req.user.uid) fail(403, 'Another parent account already manages this player.');
  await p.ref.update({
    consent: approve ? 'approved' : 'pending',
    parent: { uid: req.user.uid, email: req.user.email || null, at: new Date().toISOString() },
  });
  res.json({ status: approve ? 'approved' : 'pending' });
}));

app.get('/api/parent', requireUser, wrap(async (req, res) => {
  const snap = await privates.where('parent.uid', '==', req.user.uid).get();
  const kids = await Promise.all(snap.docs.map(async (d) => {
    const u = await users.doc(d.id).get();
    return { token: d.data().consentToken, status: d.data().consent, nickname: u.data()?.nickname, avatar: u.data()?.avatar };
  }));
  res.json({ children: kids });
}));

// Kick-off reminders: turn on (adding this device's push token) or off.
app.post('/api/me/reminders', requireUser, wrap(async (req, res) => {
  const ref = privates.doc(req.user.uid);
  const token = req.body?.token;
  if (token != null && (typeof token !== 'string' || token.length > 4096)) fail(400, 'Bad token');
  if (req.body?.on) {
    if (!token) fail(400, 'Bad token');
    await db.runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) fail(403, 'Finish setting up your profile first.');
      // Keep the five most recent devices.
      const tokens = [...(p.data().pushTokens || []).filter((t) => t !== token), token].slice(-5);
      tx.update(ref, { notifyKickoff: true, pushTokens: tokens });
    });
  } else {
    await ref.set({ notifyKickoff: false, ...(token && { pushTokens: FieldValue.arrayRemove(token) }) }, { merge: true });
  }
  res.json({ ok: true });
}));

app.get('/api/me/trophies', requireUser, wrap(async (req, res) => {
  res.json({ trophies: await listTrophies(req.user.uid) });
}));

app.post('/api/me/block', requireUser, wrap(async (req, res) => {
  const target = String(req.body?.uid || '');
  if (!target || target === req.user.uid) fail(400, 'Bad user');
  await privates.doc(req.user.uid).set({
    blocked: req.body?.blocked === false ? FieldValue.arrayRemove(target) : FieldValue.arrayUnion(target),
  }, { merge: true });
  res.json({ ok: true });
}));

// Delete everything about a player (Children's Code: make leaving easy).
app.delete('/api/me', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  const u = await users.doc(uid).get();
  const picks = await db.collection('predictions').where('uid', '==', uid).get();
  const mine = await leagues.where('members', 'array-contains', uid).get();
  const writer = db.bulkWriter();
  picks.docs.forEach((d) => writer.delete(d.ref));
  for (const l of mine.docs) {
    const members = l.data().members.filter((m) => m !== uid);
    if (!members.length) await db.recursiveDelete(l.ref);
    else writer.update(l.ref, { members, memberCount: members.length, ...(l.data().owner === uid && { owner: members[0] }) });
    const msgs = await l.ref.collection('messages').where('uid', '==', uid).get();
    msgs.docs.forEach((m) => writer.update(m.ref, { deleted: true, text: '', nickname: 'Deleted player', uid: null }));
  }
  for (const col of ['challenges', 'rivalries']) {
    const snap = await db.collection(col).where('players', 'array-contains', uid).get();
    snap.docs.forEach((d) => writer.delete(d.ref));
  }
  for (const col of ['bonusAnswers', 'trophies']) {
    (await db.collection(col).where('uid', '==', uid).get()).docs.forEach((d) => writer.delete(d.ref));
  }
  if (u.exists && u.data().nickname) writer.delete(db.collection('nicknames').doc(u.data().nickname.toLowerCase()));
  writer.delete(users.doc(uid));
  writer.delete(privates.doc(uid));
  await writer.close();
  await auth.deleteUser(uid).catch(() => {});
  res.json({ ok: true });
}));

// --- leagues ---------------------------------------------------------------------------
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function memberLeague(code, uid) {
  const l = await leagues.doc(normCode(code)).get();
  if (!l.exists || !l.data().members.includes(uid)) fail(404, 'League not found.');
  return l;
}

app.post('/api/leagues', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  await socialCheck(uid);
  const check = checkText(req.body?.name, { max: 30 });
  if (!check.ok) fail(400, check.reason);
  const joined = await leagues.where('members', 'array-contains', uid).count().get();
  if (joined.data().count >= MAX_LEAGUES) fail(400, `You can be in up to ${MAX_LEAGUES} leagues.`);
  let code;
  await db.runTransaction(async (tx) => {
    for (let i = 0; i < 5; i++) {
      code = newCode();
      if (!(await tx.get(leagues.doc(code))).exists) break;
    }
    tx.set(leagues.doc(code), {
      name: check.text, owner: uid, members: [uid], memberCount: 1, createdAt: FieldValue.serverTimestamp(),
    });
  });
  await leagues.doc(code).collection('messages').doc('welcome').set({
    type: 'system', text: `🏟️ Welcome to ${check.text}! Share the code ${code} with your mates to get them in.`,
    createdAt: FieldValue.serverTimestamp(), reactions: {},
  });
  res.json({ code });
}));

app.post('/api/leagues/join', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  const { user } = await socialCheck(uid);
  if (!rateLimit(`join:${uid}`, { max: 10, windowMs: 10 * 60_000 })) fail(429, 'Too many tries — wait a few minutes.');
  const code = normCode(req.body?.code);
  const joined = await leagues.where('members', 'array-contains', uid).count().get();
  if (joined.data().count >= MAX_LEAGUES) fail(400, `You can be in up to ${MAX_LEAGUES} leagues.`);
  const name = await db.runTransaction(async (tx) => {
    const l = await tx.get(leagues.doc(code || '_'));
    if (!l.exists) fail(404, 'No league with that code — check it with your mate.');
    const { members, name, banned = [] } = l.data();
    if (banned.includes(uid)) fail(403, 'You can\'t rejoin this league.');
    if (members.includes(uid)) return name;
    if (members.length >= MAX_MEMBERS) fail(400, 'That league is full.');
    tx.update(l.ref, { members: FieldValue.arrayUnion(uid), memberCount: members.length + 1 });
    tx.set(l.ref.collection('messages').doc(), {
      type: 'system', text: `👋 ${user.nickname} joined the league!`, createdAt: FieldValue.serverTimestamp(), reactions: {},
    });
    return name;
  });
  res.json({ code, name });
}));

app.post('/api/leagues/:code/leave', requireUser, wrap(async (req, res) => {
  const l = await memberLeague(req.params.code, req.user.uid);
  const members = l.data().members.filter((m) => m !== req.user.uid);
  if (!members.length) await db.recursiveDelete(l.ref);
  else await l.ref.update({ members, memberCount: members.length, ...(l.data().owner === req.user.uid && { owner: members[0] }) });
  res.json({ ok: true });
}));

app.post('/api/leagues/:code/kick', requireUser, wrap(async (req, res) => {
  const l = await memberLeague(req.params.code, req.user.uid);
  if (l.data().owner !== req.user.uid) fail(403, 'Only the league owner can remove players.');
  const target = String(req.body?.uid || '');
  if (target === req.user.uid) fail(400, 'Use Leave instead.');
  const members = l.data().members.filter((m) => m !== target);
  await l.ref.update({ members, memberCount: members.length, banned: FieldValue.arrayUnion(target) });
  res.json({ ok: true });
}));

// League table for the season and a gameweek, with live "if it ends now" points and
// everyone's picks for games that have kicked off.
app.get('/api/leagues/:code/board', requireUser, wrap(async (req, res) => {
  const l = await memberLeague(req.params.code, req.user.uid);
  const comp = gameCompetition(req);
  const { statsKey } = GAMES[comp];
  const all = await getMatches(comp);
  const md = Number(req.query.matchday) || currentMatchday(all);
  const gwMatches = all.filter((m) => m.matchday === md).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const { members, owner, name } = l.data();

  const userDocs = await db.getAll(...members.map((u) => users.doc(u)));
  const refs = members.flatMap((u) => gwMatches.map((m) => db.collection('predictions').doc(`${u}_${m.id}`)));
  const pickDocs = refs.length ? await db.getAll(...refs) : [];
  const picks = new Map(pickDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
  const byId = new Map(all.map((m) => [m.id, toGameMatch(m)]));
  const now = Date.now();
  // Scored bonus question points for this gameweek (Premier League only).
  const bonusDocs = comp === 'PL' ? await db.getAll(...members.map((u) => db.collection('bonusAnswers').doc(`${u}_PL_${md}`))) : [];
  const bonusBy = Object.fromEntries(bonusDocs.filter((d) => d.exists).map((d) => [d.data().uid, d.data().points || 0]));

  const rows = userDocs.filter((d) => d.exists).map((d) => {
    const u = d.data();
    const mine = gwMatches.map((m) => picks.get(`${d.id}_${m.id}`)).filter(Boolean);
    const doubles = validDoubles(mine, byId);
    let gw = 0, live = 0;
    for (const p of mine) {
      const m = byId.get(p.matchId);
      if (m.status === 'finished') gw += p.points ?? scorePick(p, m.score, doubles.has(p.matchId));
      else if (m.status === 'live') live += scorePick(p, m.score, doubles.has(p.matchId));
    }
    gw += bonusBy[d.id] || 0;
    const cs = u[statsKey] || {};
    const settledGw = cs.gw?.[md] || 0;
    return {
      uid: d.id, nickname: u.nickname, avatar: u.avatar, club: u.club || null,
      season: (cs.points || 0) - settledGw + gw + live, gw: gw + live, live,
      streak: cs.streak || 0, level: u.stats?.level || 1, picked: mine.length,
      trophies: Object.values(u.trophies || {}).reduce((s, n) => s + n, 0),
    };
  });

  const revealed = gwMatches.map((m) => {
    const open = new Date(m.kickoff).getTime() > now && m.status === 'upcoming';
    return {
      matchId: m.id,
      picks: Object.fromEntries(members.map((u) => {
        const p = picks.get(`${u}_${m.id}`);
        if (!p) return [u, null];
        if (open && u !== req.user.uid) return [u, { hidden: true }];
        return [u, { home: p.home, away: p.away, double: !!p.double, points: p.points ?? null }];
      })),
    };
  });

  res.json({ code: l.id, name, owner, competition: comp, matchday: md, matches: gwMatches, rows, picks: revealed });
}));

// Your recap for a finished gameweek.
app.get('/api/recap', requireUser, wrap(async (req, res) => {
  const comp = gameCompetition(req);
  const matches = await getMatches(comp);
  const md = Number(req.query.matchday);
  if (!Number.isInteger(md) || !gameweekComplete(matches, md)) fail(400, "That round isn't finished yet.");
  res.json({ recap: await buildRecap(req.user.uid, md, matches, comp) });
}));

// --- bonus questions ----------------------------------------------------------------------
const mdParam = (v) => {
  const md = Number(v);
  if (!Number.isInteger(md) || md < 1) fail(400, 'Which gameweek?');
  return md;
};

app.get('/api/bonus', requireUser, wrap(async (req, res) => {
  res.json(await getBonus(req.user.uid, mdParam(req.query.matchday)));
}));

app.post('/api/bonus', requireUser, wrap(async (req, res) => {
  if (!(await users.doc(req.user.uid).get()).exists) fail(403, 'Finish setting up your profile first.');
  if (!rateLimit(`bonus:${req.user.uid}`, { max: 60, windowMs: 60_000 })) fail(429, 'Slow down a bit!');
  res.json(await saveBonus(req.user.uid, mdParam(req.body?.matchday), req.body?.answers));
}));

app.get('/api/admin/bonus', requireUser, requireAdmin, wrap(async (_req, res) => {
  const next = openRound(await getMatches('PL'));
  res.json({ questions: await listCustomQuestions(), nextMatchday: next?.matchday ?? null });
}));

app.post('/api/admin/bonus', requireUser, requireAdmin, wrap(async (req, res) => {
  await setCustomQuestion(mdParam(req.body?.matchday), req.body?.question, req.body?.options);
  res.json({ ok: true });
}));

// Marking the answer re-scores everyone who answered that gameweek.
app.post('/api/admin/bonus/:md/answer', requireUser, requireAdmin, wrap(async (req, res) => {
  const md = mdParam(req.params.md);
  await markCustomAnswer(md, req.body?.answer);
  const byComp = matchesByCompetition(await gameMatches());
  const uids = await bonusPlayers([md]);
  for (const uid of uids) await recomputeUser(uid, byComp);
  res.json({ ok: true, rescored: uids.size });
}));

// --- head-to-head challenges ----------------------------------------------------------
app.get('/api/challenges', requireUser, wrap(async (req, res) => {
  res.json({ challenges: await listChallenges(req.user.uid) });
}));

app.post('/api/challenges', requireUser, wrap(async (req, res) => {
  const { user } = await socialCheck(req.user.uid);
  if (!rateLimit(`h2h:${req.user.uid}`, { max: 10, windowMs: 10 * 60_000 })) fail(429, 'Slow down a bit!');
  const comp = String(req.body?.competition || GAME_COMPETITION).toUpperCase();
  res.json(await createChallenge({ from: req.user.uid, fromUser: user, to: String(req.body?.to || ''), leagueCode: req.body?.league, competition: comp }));
}));

app.post('/api/challenges/:id/respond', requireUser, wrap(async (req, res) => {
  await socialCheck(req.user.uid);
  res.json(await respondChallenge({ id: req.params.id, uid: req.user.uid, accept: req.body?.accept === true }));
}));

app.delete('/api/challenges/:id', requireUser, wrap(async (req, res) => {
  res.json(await cancelChallenge({ id: req.params.id, uid: req.user.uid }));
}));

// --- chat ----------------------------------------------------------------------------
app.post('/api/leagues/:code/messages', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  const { user } = await socialCheck(uid);
  const l = await memberLeague(req.params.code, uid);
  if (!rateLimit(`msg:${uid}`, { max: 6, windowMs: 30_000 })) fail(429, 'Slow down a bit!');
  const body = req.body || {};
  const msg = {
    uid, nickname: user.nickname, avatar: user.avatar, color: user.club?.primary || null,
    createdAt: FieldValue.serverTimestamp(), reactions: {},
  };
  if (body.quick) {
    if (!QUICK_CHAT[body.quick]) fail(400, 'Unknown quick chat');
    Object.assign(msg, { type: 'quick', text: QUICK_CHAT[body.quick] });
  } else if (body.pickMatchId) {
    // Share your own pick — the only way a pick is seen before kickoff.
    const m = (await gameMatches()).find((x) => x.id === String(body.pickMatchId));
    const p = await db.collection('predictions').doc(`${uid}_${body.pickMatchId}`).get();
    if (!m || !p.exists) fail(400, 'Make a pick first!');
    const { home, away, double } = p.data();
    Object.assign(msg, {
      type: 'pick', matchId: m.id,
      text: `${m.competition === 'CL' ? '⭐ UCL · ' : ''}I'm going ${m.home.name} ${home}-${away} ${m.away.name}${double ? ' ✌️ Double Up!' : ''}`,
    });
  } else {
    const check = checkText(body.text);
    if (!check.ok) fail(400, check.reason);
    Object.assign(msg, { type: 'text', text: check.text });
  }
  const ref = await l.ref.collection('messages').add(msg);
  res.json({ id: ref.id });
}));

app.post('/api/leagues/:code/messages/:id/react', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  await socialCheck(uid);
  const l = await memberLeague(req.params.code, uid);
  const emoji = req.body?.emoji;
  if (!REACTIONS.includes(emoji)) fail(400, 'Unknown reaction');
  const ref = l.ref.collection('messages').doc(String(req.params.id));
  await db.runTransaction(async (tx) => {
    const m = await tx.get(ref);
    if (!m.exists) fail(404, 'Message not found');
    const list = m.data().reactions?.[emoji] || [];
    tx.update(ref, { [`reactions.${emoji}`]: list.includes(uid) ? FieldValue.arrayRemove(uid) : FieldValue.arrayUnion(uid) });
  });
  res.json({ ok: true });
}));

app.delete('/api/leagues/:code/messages/:id', requireUser, wrap(async (req, res) => {
  const l = await memberLeague(req.params.code, req.user.uid);
  const ref = l.ref.collection('messages').doc(String(req.params.id));
  const m = await ref.get();
  if (!m.exists) fail(404, 'Message not found');
  if (m.data().uid !== req.user.uid && l.data().owner !== req.user.uid) fail(403, 'You can only delete your own messages.');
  await ref.update({ deleted: true, text: '' });
  res.json({ ok: true });
}));

app.post('/api/reports', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  if (!rateLimit(`report:${uid}`, { max: 10, windowMs: 60 * 60_000 })) fail(429, 'Thanks — we\'ve got your reports.');
  const l = await memberLeague(req.body?.code, uid);
  const m = await l.ref.collection('messages').doc(String(req.body?.messageId || '_')).get();
  if (!m.exists) fail(404, 'Message not found');
  const reason = ['mean', 'personal_info', 'inappropriate', 'spam', 'other'].includes(req.body?.reason) ? req.body.reason : 'other';
  await db.collection('reports').add({
    code: l.id, messageId: m.id, message: m.data(), reason, by: uid, status: 'open', createdAt: FieldValue.serverTimestamp(),
  });
  res.json({ ok: true });
}));

// --- player of the week ------------------------------------------------------------------
app.get('/api/poll', optionalUser, wrap(async (req, res) => {
  const poll = await db.collection('polls').doc('current').get();
  if (!poll.exists) return res.json({ poll: null });
  const { id, title, options } = poll.data();
  const votes = db.collection('polls').doc(id).collection('votes');
  const counts = await Promise.all(options.map((o) => votes.where('option', '==', o.id).count().get()));
  const mine = req.user ? await votes.doc(req.user.uid).get() : null;
  res.json({
    poll: { id, title, options: options.map((o, i) => ({ ...o, votes: counts[i].data().count })), myVote: mine?.exists ? mine.data().option : null },
  });
}));

app.post('/api/poll/vote', requireUser, wrap(async (req, res) => {
  const poll = await db.collection('polls').doc('current').get();
  if (!poll.exists) fail(404, 'No poll right now.');
  const { id, options } = poll.data();
  if (!options.some((o) => o.id === req.body?.option)) fail(400, 'Pick a player.');
  const ref = db.collection('polls').doc(id).collection('votes').doc(req.user.uid);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) fail(409, 'You\'ve already voted this week!');
    tx.set(ref, { option: req.body.option, at: FieldValue.serverTimestamp() });
  });
  res.json({ ok: true });
}));

// --- admin -------------------------------------------------------------------------------
app.get('/api/admin/overview', requireUser, requireAdmin, wrap(async (_req, res) => {
  const [usersCount, leaguesCount, reports, pending] = await Promise.all([
    users.count().get(), leagues.count().get(),
    db.collection('reports').where('status', '==', 'open').limit(100).get(),
    privates.where('consent', '==', 'pending').count().get(),
  ]);
  res.json({
    users: usersCount.data().count, leagues: leaguesCount.data().count, pendingConsent: pending.data().count,
    reports: reports.docs
      .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  });
}));

app.post('/api/admin/reports/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  const ref = db.collection('reports').doc(req.params.id);
  const r = await ref.get();
  if (!r.exists) fail(404, 'Report not found');
  if (req.body?.deleteMessage) {
    await leagues.doc(r.data().code).collection('messages').doc(r.data().messageId).update({ deleted: true, text: '' }).catch(() => {});
  }
  if (req.body?.ban && r.data().message?.uid) {
    await db.collection('bans').doc(r.data().message.uid).set({ at: FieldValue.serverTimestamp(), by: req.user.email, reason: r.data().reason });
  }
  await ref.update({ status: 'closed', closedBy: req.user.email, closedAt: FieldValue.serverTimestamp() });
  res.json({ ok: true });
}));

app.post('/api/admin/ban', requireUser, requireAdmin, wrap(async (req, res) => {
  const uid = String(req.body?.uid || '');
  if (!uid) fail(400, 'Bad user');
  if (req.body?.banned === false) await db.collection('bans').doc(uid).delete();
  else await db.collection('bans').doc(uid).set({ at: FieldValue.serverTimestamp(), by: req.user.email });
  res.json({ ok: true });
}));

app.post('/api/admin/ticker', requireUser, requireAdmin, wrap(async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 140);
  await db.collection('settings').doc('ticker').set({ message, active: !!message });
  res.json({ ok: true });
}));

app.post('/api/admin/poll', requireUser, requireAdmin, wrap(async (req, res) => {
  const title = String(req.body?.title || 'Player of the Week').slice(0, 60);
  const options = (req.body?.options || [])
    .map((o, i) => ({ id: `p${i + 1}`, name: String(o.name || '').trim().slice(0, 30), team: String(o.team || '').trim().slice(0, 30) }))
    .filter((o) => o.name);
  if (options.length < 2 || options.length > 6) fail(400, 'Add 2 to 6 players.');
  await db.collection('polls').doc('current').set({ id: `poll_${Date.now()}`, title, options, createdAt: FieldValue.serverTimestamp() });
  res.json({ ok: true });
}));

app.post('/api/admin/sync', requireUser, requireAdmin, wrap(async (_req, res) => res.json(await syncNow())));

// Highlights: which YouTube channels to watch, and setting a match's video by hand.
app.get('/api/admin/highlights', requireUser, requireAdmin, wrap(async (_req, res) => {
  res.json({ channels: await getChannels(), recent: await latestHighlights(15), quota: await quotaToday() });
}));

app.post('/api/admin/highlights/channels', requireUser, requireAdmin, wrap(async (req, res) => {
  let channels = await getChannels();
  const comps = (list) => (Array.isArray(list) ? list.map((c) => String(c).toUpperCase()).filter(isCompetition) : []);
  if (req.body?.remove) channels = channels.filter((c) => c.id !== req.body.remove);
  if (req.body?.update) channels = channels.map((c) => (c.id === req.body.update ? { ...c, competitions: comps(req.body.competitions) } : c));
  if (req.body?.add) {
    const resolved = await resolveChannel(req.body.add).catch(() => null);
    const ch = resolved && { ...resolved, competitions: comps(req.body.competitions) };
    if (!ch) fail(400, 'Couldn\'t find that channel. Paste its link (youtube.com/@name or /channel/UC...).');
    if (channels.some((c) => c.id === ch.id)) fail(409, 'Already on the list.');
    if (channels.length >= 10) fail(400, 'That\'s plenty of channels.');
    channels = [...channels, ch];
  }
  await setChannels(channels);
  res.json({ channels });
}));

app.post('/api/admin/highlights/match', requireUser, requireAdmin, wrap(async (req, res) => {
  const comp = String(req.body?.competition || '').toUpperCase();
  const kind = req.body?.kind === 'preview' ? 'preview' : 'highlight';
  const m = isCompetition(comp) && (await getMatches(comp)).find((x) => x.id === String(req.body?.matchId || ''));
  if (!m) fail(404, 'Match not found.');
  if (!req.body?.url) {
    await saveVideo(kind, m, { videoId: null, hidden: true, auto: false });
    return res.json({ ok: true, hidden: true });
  }
  const videoId = videoIdFrom(req.body.url);
  if (!videoId) fail(400, 'That doesn\'t look like a YouTube link.');
  const title = String(req.body.title || '').slice(0, 200) || `${m.home.name} v ${m.away.name}${kind === 'preview' ? ' preview' : ''}`;
  await saveVideo(kind, m, { videoId, title, channel: req.body.channel ? String(req.body.channel).slice(0, 80) : null, published: new Date().toISOString(), auto: false });
  res.json({ ok: true, videoId });
}));

// Show what YouTube has for a game, to pick from.
app.post('/api/admin/highlights/search', requireUser, requireAdmin, wrap(async (req, res) => {
  const comp = String(req.body?.competition || '').toUpperCase();
  const m = isCompetition(comp) && (await getMatches(comp)).find((x) => x.id === String(req.body?.matchId || ''));
  if (!m) fail(404, 'Match not found.');
  res.json(await searchCandidates(m, req.body?.kind === 'preview' ? 'preview' : 'highlight'));
}));

app.post('/api/admin/highlights/find', requireUser, requireAdmin, wrap(async (_req, res) => {
  res.json(await findHighlights({ matches: await gameMatches(), force: true }));
}));

// --- errors & the app itself ------------------------------------------------------------------
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const expected = err instanceof HttpError || err.expose;
  if (!expected) console.error(err);
  res.status(err.status || 500).json({ error: expected ? err.message : 'Something went wrong — try again.' });
});

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist, { maxAge: '1h', index: false }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => console.log(`ItsGoneIn server on :${PORT}${process.env.FOOTBALL_DATA_MOCK === '1' ? ' (mock data)' : ''}`));
  startSyncLoop();
}
