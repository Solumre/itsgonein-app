// Live picks against the emulators with the mock season.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, live, sync, me, amy, game;

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) });
  const j = await res.json();
  return { uid: j.localId, token: j.idToken };
}
async function call(user, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user && { authorization: `Bearer ${user.token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  live = await import('../../server/live.js');
  sync = await import('../../server/sync.js');
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const pl = await (await import('../../server/football.js')).getMatches('PL');
  game = pl.find((m) => m.status === 'live' && live.openQuestions(m).length);
  [me, amy] = await Promise.all([signUp('live-me@example.com'), signUp('live-amy@example.com')]);
  await db.doc(`users/${me.uid}`).set({ nickname: 'Me', avatar: '⚽', stats: { points: 0, gw: {} } });
  await db.doc(`users/${amy.uid}`).set({ nickname: 'Amy', avatar: '🐯', stats: { points: 0, gw: {} } });
  await db.doc('leagues/LIVE').set({ name: 'Live', members: [me.uid, amy.uid] });
});
afterAll(() => server?.close());

const next = () => `next_${game.score.home}-${game.score.away}`;
const url = () => `/api/match/${game.id}/live?competition=PL`;

describe('answering', () => {
  it('shows the open questions in the match centre', async () => {
    const { body } = await call(me, 'GET', `/api/match/${game.id}?competition=PL`);
    expect(body.live.open.map((q) => q.id)).toContain(next());
    expect(body.live.open.find((q) => q.id === next())).toMatchObject({ mine: null, mates: [] });
  });

  it('takes one answer per question, and only for open ones', async () => {
    expect((await call(null, 'POST', url(), { qid: next(), answer: 'home' })).status).toBe(401);
    expect((await call(me, 'POST', url(), { qid: next(), answer: 'maybe' })).status).toBe(400);
    expect((await call(me, 'POST', url(), { qid: 'next_9-9', answer: 'home' })).status).toBe(409);
    expect((await call(me, 'POST', url(), { qid: next(), answer: 'home' })).status).toBe(200);
    expect((await call(me, 'POST', url(), { qid: next(), answer: 'away' })).status).toBe(409);
    expect((await call(amy, 'POST', url(), { qid: next(), answer: 'away' })).status).toBe(200);
  });

  it('shows league mates\' answers', async () => {
    const { body } = await call(me, 'GET', `/api/match/${game.id}?competition=PL`);
    expect(body.live.open.find((q) => q.id === next())).toMatchObject({ mine: 'home', mates: [{ nickname: 'Amy', answer: 'away' }] });
  });
});

describe('settling', () => {
  it('scores right answers when the next goal goes in, and adds XP', async () => {
    const scored = { ...game, score: { home: game.score.home + 1, away: game.score.away } };
    const before = (await db.doc(`users/${me.uid}`).get()).data().stats?.xp || 0;
    expect((await live.settleLive([scored])).sort()).toEqual([me.uid]);
    const mine = (await db.doc(`livePicks/${game.id}_${next()}_${me.uid}`).get()).data();
    expect(mine).toMatchObject({ result: 'home', points: 2 });
    expect((await db.doc(`livePicks/${game.id}_${next()}_${amy.uid}`).get()).data()).toMatchObject({ result: 'home', points: 0 });
    await sync.recomputeUser(me.uid, sync.matchesByCompetition(await sync.gameMatches()));
    const stats = (await db.doc(`users/${me.uid}`).get()).data().stats;
    expect(stats.live).toBe(2);
    expect(stats.xp - before).toBe(10);
    expect(stats.points).toBe(0); // league points untouched
    expect(await live.settleLive([scored])).toEqual([]); // only once
  });

  it('lists settled answers and the game\'s board in the match centre', async () => {
    await db.doc(`livePicks/${game.id}_${next()}_${me.uid}`).update({ result: 'home', points: 2 });
    const { body } = await call(me, 'GET', `/api/match/${game.id}?competition=PL`);
    expect(body.live.board.map((b) => [b.me ? 'me' : b.nickname, b.points])).toEqual([['me', 2], ['Amy', 0]]);
  });
});
