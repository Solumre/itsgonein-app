// Penalty shootout against the emulators.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, me, amy;

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) });
  const j = await res.json();
  return { uid: j.localId, token: j.idToken };
}
async function call(user, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user && { authorization: `Bearer ${user.token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
// Play a whole shootout, aiming bottom-left and diving left every time.
async function playGame(user) {
  const { body: g } = await call(user, 'POST', '/api/pens');
  let r = g;
  let turns = 0;
  while (!r.done) {
    r = (await call(user, 'POST', `/api/pens/${g.id}/kick`, { type: r.next, col: 0, row: 1 })).body;
    if (++turns > 40) throw new Error('never ended');
  }
  return { id: g.id, ...r };
}

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  [me, amy] = await Promise.all([signUp('pens-me@example.com'), signUp('pens-amy@example.com')]);
  await db.doc(`users/${me.uid}`).set({ nickname: 'Me', avatar: '⚽', stats: { points: 0, gw: {} } });
  await db.doc(`users/${amy.uid}`).set({ nickname: 'Amy', avatar: '🐯', stats: { points: 0, gw: {} } });
  await db.doc('leagues/PENS').set({ name: 'Pens', members: [me.uid, amy.uid] });
});
afterAll(() => server?.close());

describe('penalty shootout', () => {
  it('needs you signed in and takes kicks in turn', async () => {
    expect((await call(null, 'POST', '/api/pens')).status).toBe(401);
    const { body: g } = await call(me, 'POST', '/api/pens');
    expect(g).toMatchObject({ you: 0, cpu: 0, next: 'shoot', done: false });
    expect((await call(me, 'POST', `/api/pens/${g.id}/kick`, { type: 'save', col: 0 })).status).toBe(409);
    expect((await call(me, 'POST', `/api/pens/${g.id}/kick`, { type: 'shoot', col: 5, row: 0 })).status).toBe(400);
    expect((await call(amy, 'POST', `/api/pens/${g.id}/kick`, { type: 'shoot', col: 0, row: 0 })).status).toBe(404);
    const over = await call(me, 'POST', `/api/pens/${g.id}/kick`, { type: 'shoot', col: 2, row: 0, over: true });
    expect(over.body).toMatchObject({ kick: { result: 'miss', over: true }, you: 0, next: 'save' });
    const save = await call(me, 'POST', `/api/pens/${g.id}/kick`, { type: 'save', col: 1 });
    expect(['goal', 'saved', 'miss']).toContain(save.body.kick.result);
    expect(save.body.next).toBe('shoot');
  });

  it('plays to a finish, adds XP once a day for your best, and shows on mates\' board', async () => {
    const games = [await playGame(me), await playGame(me)];
    for (const g of games) {
      expect(['won', 'lost', 'draw']).toContain(g.result);
      expect((await call(me, 'POST', `/api/pens/${g.id}/kick`, { type: g.next, col: 0, row: 1 })).status).toBe(409);
    }
    const best = Math.max(...games.map((g) => g.points));
    const stats = (await db.doc(`users/${me.uid}`).get()).data().stats;
    expect(stats.pens).toMatchObject({ played: 3 - 1, best, today: best });
    expect(stats.xp).toBeGreaterThanOrEqual(Math.min(10, best) * 2);
    const { body } = await call(amy, 'GET', '/api/pens');
    expect(body.mates).toEqual([{ uid: me.uid, nickname: 'Me', avatar: '⚽', points: best, result: expect.any(String) }]);
    expect(body.stats).toMatchObject({ played: 0, today: null });
    expect(body.stats.xp).toBeUndefined();
  });
});
