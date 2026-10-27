import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, auth, FieldValue } from './firebase.js';
import {
  COMPETITIONS, GAME_COMPETITION, isCompetition, getMatches, getStandings, getScorers, getTeams, currentMatchday,
} from './football.js';
import { syncNow, startSyncLoop, toGameMatch } from './sync.js';
import { buildRecap, gameweekComplete } from './recap.js';
import { checkText, checkNickname, QUICK_CHAT, REACTIONS, rateLimit } from './moderation.js';
import { scorePick, validDoubles, AVATARS } from '../src/lib/game.js';

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

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/competitions', (_req, res) => res.json({ competitions: COMPETITIONS, game: GAME_COMPETITION }));

app.get('/api/matches', wrap(async (req, res) => {
  const code = competition(req);
  const matches = await getMatches(code);
  if (code === GAME_COMPETITION) syncNow().catch((e) => console.error('sync', e.message));
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
  const all = await getMatches(GAME_COMPETITION);
  const md = Number(req.query.matchday) || currentMatchday(all);
  const gwMatches = all.filter((m) => m.matchday === md).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const { members, owner, name } = l.data();

  const userDocs = await db.getAll(...members.map((u) => users.doc(u)));
  const refs = members.flatMap((u) => gwMatches.map((m) => db.collection('predictions').doc(`${u}_${m.id}`)));
  const pickDocs = refs.length ? await db.getAll(...refs) : [];
  const picks = new Map(pickDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
  const byId = new Map(all.map((m) => [m.id, toGameMatch(m)]));
  const now = Date.now();

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
    const settledGw = u.stats?.gw?.[md] || 0;
    return {
      uid: d.id, nickname: u.nickname, avatar: u.avatar, club: u.club || null,
      season: (u.stats?.points || 0) - settledGw + gw + live, gw: gw + live, live,
      streak: u.stats?.streak || 0, level: u.stats?.level || 1, picked: mine.length,
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

  res.json({ code: l.id, name, owner, matchday: md, matches: gwMatches, rows, picks: revealed });
}));

// Your recap for a finished gameweek.
app.get('/api/recap', requireUser, wrap(async (req, res) => {
  const matches = await getMatches(GAME_COMPETITION);
  const md = Number(req.query.matchday);
  if (!Number.isInteger(md) || !gameweekComplete(matches, md)) fail(400, "That gameweek isn't finished yet.");
  res.json({ recap: await buildRecap(req.user.uid, md, matches) });
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
    const m = (await getMatches(GAME_COMPETITION)).find((x) => x.id === String(body.pickMatchId));
    const p = await db.collection('predictions').doc(`${uid}_${body.pickMatchId}`).get();
    if (!m || !p.exists) fail(400, 'Make a pick first!');
    const { home, away, double } = p.data();
    Object.assign(msg, {
      type: 'pick', matchId: m.id,
      text: `I'm going ${m.home.name} ${home}-${away} ${m.away.name}${double ? ' ✌️ Double Up!' : ''}`,
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

// --- errors & the app itself ------------------------------------------------------------------
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : 'Something went wrong — try again.' });
});

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist, { maxAge: '1h', index: false }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => console.log(`ItsGoneIn server on :${PORT}${process.env.FOOTBALL_DATA_MOCK === '1' ? ' (mock data)' : ''}`));
  startSyncLoop();
}
