// Match talk and reactions on picks, against the emulators with the mock season.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, seb, amy, zed, live, upcoming;

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) });
  const j = await res.json();
  return { uid: j.localId, token: j.idToken };
}
async function call(user, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user && { authorization: `Bearer ${user.token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const react = (user, target, emoji, matchId = live.id) => call(user, 'POST', '/api/picks/react', { matchId, target: target.uid, emoji });

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const pl = await (await import('../../server/football.js')).getMatches('PL');
  live = pl.find((m) => m.status === 'live');
  upcoming = pl.find((m) => m.status === 'upcoming' && new Date(m.kickoff) > Date.now() + 3600_000);
  [seb, amy, zed] = await Promise.all([signUp('talk-seb@example.com'), signUp('talk-amy@example.com'), signUp('talk-zed@example.com')]);
  for (const [u, nickname] of [[seb, 'Seb'], [amy, 'Amy'], [zed, 'Zed']]) {
    await db.doc(`users/${u.uid}`).set({ nickname, avatar: '⚽', stats: { points: 0, gw: {} } });
    await db.doc(`private/${u.uid}`).set({ consent: 'not_needed', blocked: [] });
    for (const m of [live, upcoming]) await db.doc(`predictions/${u.uid}_${m.id}`).set({ uid: u.uid, matchId: m.id, competition: 'PL', matchday: m.matchday, home: 2, away: 1 });
  }
  await db.doc('leagues/TALK').set({ name: 'Talkers', members: [seb.uid, amy.uid], owner: seb.uid });
  await db.doc('leagues/ZED').set({ name: 'Zed only', members: [zed.uid, seb.uid], owner: zed.uid });
});
afterAll(() => server?.close());

describe('match talk', () => {
  it('tags a message with the game it is about', async () => {
    const r = await call(seb, 'POST', '/api/leagues/TALK/messages', { text: 'What a game', matchId: live.id });
    const msg = (await db.doc(`leagues/TALK/messages/${r.body.id}`).get()).data();
    expect(msg).toMatchObject({ text: 'What a game', matchId: live.id, matchComp: 'PL', matchLabel: `${live.home.tla} v ${live.away.tla}` });
    const quick = await call(seb, 'POST', '/api/leagues/TALK/messages', { quick: Object.keys((await import('../../server/moderation.js')).QUICK_CHAT)[0], matchId: live.id });
    expect((await db.doc(`leagues/TALK/messages/${quick.body.id}`).get()).data().matchId).toBe(live.id);
  });
  it('still filters what is said', async () => {
    expect((await call(seb, 'POST', '/api/leagues/TALK/messages', { text: 'call me on 07700 900123', matchId: live.id })).status).toBe(400);
  });
});

describe('reactions on picks', () => {
  it('only after kickoff, only on a league mate, not your own', async () => {
    expect((await react(seb, amy, '🔥', upcoming.id)).status).toBe(400);
    expect((await react(seb, seb, '🔥')).status).toBe(400);
    expect((await react(amy, zed, '🔥')).status).toBe(403); // not in a league together
    expect((await react(seb, amy, '💩')).status).toBe(400);
  });

  it('toggles a reaction and posts (then removes) a line in the shared league chat', async () => {
    expect((await react(seb, amy, '😂')).body).toEqual({ on: true });
    const msg = (await db.doc(`leagues/TALK/messages/pr_${live.id}_${amy.uid}_${seb.uid}`).get()).data();
    expect(msg).toMatchObject({ type: 'system', event: 'pickreact', matchId: live.id, text: `😂 Seb laughed at Amy's 2-1 pick for ${live.home.tla} v ${live.away.tla}` });
    expect((await react(seb, amy, '😂')).body).toEqual({ on: false });
    expect((await db.doc(`leagues/TALK/messages/pr_${live.id}_${amy.uid}_${seb.uid}`).get()).exists).toBe(false);
    await react(seb, amy, '🔥');
  });

  it('shows reactions from your league mates only, in the match centre and the Picks tab', async () => {
    await react(zed, seb, '🎯'); // Zed shares a league with Seb, not Amy
    const forAmy = (await call(amy, 'GET', `/api/match/${live.id}?competition=PL`)).body;
    expect(forAmy.mine.reactions).toEqual([{ emoji: '🔥', count: 1, mine: false }]);
    expect(forAmy.mates.list.find((p) => p.uid === seb.uid).reactions).toEqual([]); // Zed's 🎯 isn't Amy's business
    const forSeb = (await call(seb, 'GET', `/api/match/${live.id}?competition=PL`)).body;
    expect(forSeb.mine.reactions).toEqual([{ emoji: '🎯', count: 1, mine: false }]);
    const board = (await call(seb, 'GET', `/api/leagues/TALK/board?matchday=${live.matchday}`)).body;
    const row = board.picks.find((p) => p.matchId === live.id).picks;
    expect(row[amy.uid].reactions).toEqual([{ emoji: '🔥', count: 1, mine: true }]);
    expect(row[seb.uid].reactions).toEqual([]); // Zed isn't in this league
  });

  it('respects blocks', async () => {
    await db.doc(`private/${amy.uid}`).set({ blocked: [seb.uid] }, { merge: true });
    expect((await react(seb, amy, '👀')).status).toBe(403);
  });
});
