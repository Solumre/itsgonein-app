// The match centre endpoint against the emulators with the mock season.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, me, live, upcoming;

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  });
  const j = await res.json();
  return { uid: j.localId, token: j.idToken };
}
const get = async (path, user) => {
  const res = await fetch(base + path, { headers: user ? { authorization: `Bearer ${user.token}` } : {} });
  return { status: res.status, body: await res.json() };
};
const pick = (uid, m, home, away) => db.doc(`predictions/${uid}_${m.id}`).set({ uid, matchId: m.id, competition: 'PL', matchday: m.matchday, home, away });

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const pl = await (await import('../../server/football.js')).getMatches('PL');
  live = pl.find((m) => m.status === 'live');
  upcoming = pl.find((m) => m.status === 'upcoming' && new Date(m.kickoff) > Date.now() + 3600_000);
  me = await signUp('match@example.com');
  for (const [uid, nickname] of [[me.uid, 'Me'], ['amy', 'Amy'], ['bob', 'Bob'], ['zed', 'Zed']]) {
    await db.doc(`users/${uid}`).set({ nickname, avatar: '⚽' });
  }
  await db.doc('leagues/MATES').set({ name: 'Mates', members: [me.uid, 'amy', 'bob'] });
  await db.doc('leagues/ELSE').set({ name: 'Else', members: ['zed'] });
  const s = live.score;
  await pick(me.uid, live, s.home, s.away); // exact so far
  // Two picks on the wrong result, whatever the mock score is.
  const n = s.home + s.away + 1;
  if (s.home >= s.away) { await pick('amy', live, 0, n); await pick('bob', live, 1, n + 1); }
  else { await pick('amy', live, n, 0); await pick('bob', live, n + 1, 1); }
  await pick('zed', live, 3, 3); // not a league mate
  await pick('amy', upcoming, 2, 0);
});
afterAll(() => server?.close());

describe('GET /api/match/:id', () => {
  it('gives the match, timeline, line-ups, form and history to anyone', async () => {
    const r = await get(`/api/match/${live.id}?competition=PL`);
    expect(r.status).toBe(200);
    expect(r.body.match).toMatchObject({ id: live.id, status: 'live', venue: expect.any(String), referee: 'M. Oliver' });
    expect(r.body.match.lineups.home.starting).toHaveLength(11);
    expect(r.body.h2h.count).toBe(6);
    expect(r.body.form.home).toMatchObject({ position: expect.any(Number) });
    expect(r.body.mine).toBeNull();
    expect(r.body.mates).toBeNull();
  });

  it('shows league mates’ picks and live points once the game has started', async () => {
    const { body } = await get(`/api/match/${live.id}?competition=PL`, me);
    expect(body.mine).toMatchObject({ home: live.score.home, away: live.score.away, points: 3 });
    expect(body.mates).toMatchObject({ revealed: true, picked: 2, total: 2 });
    expect(body.mates.list.map((p) => [p.nickname, p.points])).toEqual([['Amy', 0], ['Bob', 0]]);
    expect(body.mates.split.home + body.mates.split.away + body.mates.split.draw).toBe(2);
    expect(JSON.stringify(body)).not.toContain('Zed');
  });

  it('keeps mates’ picks secret before kickoff, only saying how many have picked', async () => {
    const { body } = await get(`/api/match/${upcoming.id}?competition=PL`, me);
    expect(body.mine).toBeNull();
    expect(body.mates).toEqual({ revealed: false, picked: 1, total: 2 });
  });

  it('opens a past meeting from the head-to-head list, without picks or this season\'s form', async () => {
    const { body: now } = await get(`/api/match/${live.id}?competition=PL`, me);
    const old = now.h2h.matches[0];
    const r = await get(`/api/match/${old.id}?competition=${old.competition}`, me);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ past: true, form: null, mine: null, mates: null, match: { id: old.id, status: 'finished', score: old.score } });
    expect(r.body.match.events.filter((e) => e.kind === 'goal')).toHaveLength(old.score.home + old.score.away);
    expect((await get(`/api/match/${old.id}?competition=FAC`)).status).toBe(200); // a cup we don't list
  });

  it('404s an unknown match', async () => {
    expect((await get('/api/match/123?competition=PL')).status).toBe(404);
  });
});
