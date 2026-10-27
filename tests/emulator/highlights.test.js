// Highlights: finding videos in the (mock) channel feed, admin controls and the API.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
process.env.ADMIN_EMAILS = 'admin@example.com';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, hl, admin, kid, pl;

async function signIn(email, google) {
  const res = google
    ? await fetch(`${AUTH}/accounts:signInWithIdp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true }))}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }) })
    : await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) });
  return { token: (await res.json()).idToken };
}
async function call(user, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user && { authorization: `Bearer ${user.token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  hl = await import('../../server/highlights.js');
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  pl = await (await import('../../server/football.js')).getMatches('PL');
  [admin, kid] = await Promise.all([signIn('admin@example.com', true), signIn('kid@example.com')]);
});
afterAll(() => server?.close());

// Pretend the last two finished games ended yesterday, so they're due a video.
const recent = () => pl.filter((m) => m.status === 'finished').slice(-2).map((m, i) => ({ ...m, kickoff: new Date(Date.now() - (30 - i) * 3600_000).toISOString() }));

describe('finding highlights', () => {
  it('saves a video for each recent game, once', async () => {
    const games = recent();
    expect(await hl.findHighlights({ matches: games, force: true })).toEqual({ found: 2 });
    expect(await hl.findHighlights({ matches: games, force: true })).toEqual({ found: 0 });
    const h = await hl.getHighlight(games[1].id);
    expect(h).toMatchObject({ matchId: games[1].id, auto: true, channel: 'Sky Sports Premier League', home: { tla: games[1].home.tla } });
    expect(h.title).toContain('Highlights');
  });

  it('serves the latest highlights and adds them to the match centre', async () => {
    const games = recent();
    const r = await call(null, 'GET', '/api/highlights');
    expect(r.body.highlights.map((h) => h.matchId)).toEqual([games[1].id, games[0].id]);
    const m = await call(null, 'GET', `/api/match/${games[1].id}?competition=PL`);
    expect(m.body.highlight.videoId).toBe(r.body.highlights[0].videoId);
  });
});

describe('admin', () => {
  it('only lets admins in', async () => {
    expect((await call(kid, 'GET', '/api/admin/highlights')).status).toBe(403);
    expect((await call(admin, 'GET', '/api/admin/highlights')).body.channels).toEqual(hl.DEFAULT_CHANNELS);
  });

  it('adds and removes channels', async () => {
    const add = await call(admin, 'POST', '/api/admin/highlights/channels', { add: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv' });
    expect(add.body.channels.map((c) => c.id)).toEqual([hl.DEFAULT_CHANNELS[0].id, 'UCabcdefghijklmnopqrstuv']);
    expect((await call(admin, 'POST', '/api/admin/highlights/channels', { add: 'UCabcdefghijklmnopqrstuv' })).status).toBe(409);
    expect((await call(admin, 'POST', '/api/admin/highlights/channels', { add: 'not a channel!' })).status).toBe(400);
    const rm = await call(admin, 'POST', '/api/admin/highlights/channels', { remove: 'UCabcdefghijklmnopqrstuv' });
    expect(rm.body.channels).toHaveLength(1);
  });

  it('sets, replaces and hides a game\'s video by hand', async () => {
    const [game] = recent();
    expect((await call(admin, 'POST', '/api/admin/highlights/match', { competition: 'PL', matchId: game.id, url: 'nope' })).status).toBe(400);
    const set = await call(admin, 'POST', '/api/admin/highlights/match', { competition: 'PL', matchId: game.id, url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(set.body.videoId).toBe('dQw4w9WgXcQ');
    expect((await hl.getHighlight(game.id))).toMatchObject({ videoId: 'dQw4w9WgXcQ', auto: false });
    await call(admin, 'POST', '/api/admin/highlights/match', { competition: 'PL', matchId: game.id, url: '' });
    expect(await hl.getHighlight(game.id)).toBeNull();
    // a hidden video isn't found again automatically
    expect(await hl.findHighlights({ matches: [game], force: true })).toEqual({ found: 0 });
  });
});
