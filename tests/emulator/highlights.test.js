// Highlights: finding videos in the (mock) channel feed, admin controls and the API.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
process.env.ADMIN_EMAILS = 'admin@example.com';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, hl, admin, kid, pl, db;

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
  ({ db } = await import('../../server/firebase.js'));
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  pl = await (await import('../../server/football.js')).getMatches('PL');
  [admin, kid] = await Promise.all([signIn('admin@example.com', true), signIn('hl-kid@example.com')]);
});
afterAll(() => server?.close());

// Pretend the last two finished games ended yesterday, so they're due a video.
const recent = () => pl.filter((m) => m.status === 'finished').slice(-2).map((m, i) => ({ ...m, kickoff: new Date(Date.now() - (30 - i) * 3600_000).toISOString() }));

describe('finding highlights', () => {
  it('saves a video for each recent game, once', async () => {
    const games = recent();
    expect(await hl.findHighlights({ matches: games, force: true })).toMatchObject({ found: 2 });
    expect(await hl.findHighlights({ matches: games, force: true })).toMatchObject({ found: 0 });
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
    expect((await call(admin, 'GET', '/api/admin/highlights')).body.channels.map(({ status, ...c }) => c)).toEqual(hl.DEFAULT_CHANNELS); // eslint-disable-line no-unused-vars
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

describe('previews, older games and leagues', () => {
  const quota = async () => (await call(admin, 'GET', '/api/admin/highlights')).body.quota.used;

  it('finds previews for games in the next few days from the channel feed', async () => {
    const next = pl.filter((m) => m.status === 'upcoming' && new Date(m.kickoff) - Date.now() < 2 * 86400_000);
    expect(next.length).toBeGreaterThan(0);
    const r = await hl.findHighlights({ matches: next, force: true });
    expect(r.found).toBe(next.length);
    const m = await call(null, 'GET', `/api/match/${next[0].id}?competition=PL`);
    expect(m.body.preview).toMatchObject({ matchId: next[0].id, channel: 'Sky Sports Premier League' });
    expect(m.body.preview.title).toContain('Preview');
  });

  it('searches YouTube for an older game when it is opened, once, within the budget', async () => {
    const old = pl.find((m) => m.status === 'finished' && Date.now() - new Date(m.kickoff) > 6 * 86400_000);
    const before = await quota();
    const first = await call(null, 'GET', `/api/match/${old.id}?competition=PL`);
    expect(first.body.highlight).toMatchObject({ matchId: old.id, searched: true });
    expect(await quota()).toBe(before + 100);
    await call(null, 'GET', `/api/match/${old.id}?competition=PL`);
    expect(await quota()).toBe(before + 100); // saved, not searched again
  });

  it('stops searching when the day\'s budget is spent, and remembers misses', async () => {
    const olds = pl.filter((m) => m.status === 'finished' && Date.now() - new Date(m.kickoff) > 6 * 86400_000);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
    await db.doc('settings/youtubeQuota').set({ day, used: hl.DAILY_BUDGET });
    const r = await call(null, 'GET', `/api/match/${olds[1].id}?competition=PL`);
    expect(r.body.highlight).toBeNull();
    expect((await db.doc(`highlights/${olds[1].id}`).get()).data()).toMatchObject({ videoId: null, searchedAt: expect.any(Number) });
    await db.doc('settings/youtubeQuota').set({ day, used: 0 });
    await call(null, 'GET', `/api/match/${olds[1].id}?competition=PL`); // a recent miss isn't searched again
    expect(await quota()).toBe(0);
  });

  it('tags channels by league and filters the highlights list', async () => {
    const [ch] = (await call(admin, 'GET', '/api/admin/highlights')).body.channels;
    const up = await call(admin, 'POST', '/api/admin/highlights/channels', { update: ch.id, competitions: ['PL', 'cl', 'XX'] });
    expect(up.body.channels[0].competitions).toEqual(['PL', 'CL']);
    const add = await call(admin, 'POST', '/api/admin/highlights/channels', { add: 'UCzzzzzzzzzzzzzzzzzzzzzz', competitions: ['PD'] });
    expect(add.body.channels[1]).toMatchObject({ id: 'UCzzzzzzzzzzzzzzzzzzzzzz', competitions: ['PD'] });
    expect((await call(null, 'GET', '/api/highlights?competition=PL')).body.highlights.every((h) => h.competition === 'PL')).toBe(true);
    expect((await call(null, 'GET', '/api/highlights?competition=PD')).body.highlights).toEqual([]);
  });

  it('lets an admin set a preview by hand', async () => {
    const up = pl.find((m) => m.status === 'upcoming' && new Date(m.kickoff) - Date.now() > 5 * 86400_000);
    await call(admin, 'POST', '/api/admin/highlights/match', { competition: 'PL', matchId: up.id, url: 'https://youtu.be/bbbbbbbbbbb', kind: 'preview' });
    expect(await hl.getPreview(up.id)).toMatchObject({ videoId: 'bbbbbbbbbbb', auto: false });
  });
});

describe('admin search', () => {
  it('shows what YouTube has for a game and saves the one picked', async () => {
    const game = pl.filter((m) => m.status === 'finished').at(-5);
    expect((await call(kid, 'POST', '/api/admin/highlights/search', { competition: 'PL', matchId: game.id })).status).toBe(403);
    const r = await call(admin, 'POST', '/api/admin/highlights/search', { competition: 'PL', matchId: game.id });
    expect(r.body.candidates.length).toBeGreaterThan(0);
    expect(r.body.best).toBe(r.body.candidates[0].videoId);
    const v = r.body.candidates[0];
    await call(admin, 'POST', '/api/admin/highlights/match', { competition: 'PL', matchId: game.id, url: v.videoId, title: v.title, channel: v.channel });
    expect(await hl.getHighlight(game.id)).toMatchObject({ videoId: v.videoId, title: v.title, channel: v.channel, auto: false });
  });
});

describe('wrong picks', () => {
  it('hides an auto-picked video that is not highlights and replaces it', async () => {
    const [game] = recent();
    await db.doc(`highlights/${game.id}`).set({ matchId: game.id, competition: 'PL', kickoff: game.kickoff, videoId: 'nevilletalk', title: '"It\'s the dream of every coach!" | Gary Neville', auto: true, channel: 'Sky Sports Premier League', home: game.home, away: game.away });
    hl.resetVideoIndex();
    expect(await hl.getHighlight(game.id)).toBeNull();
    const r = await hl.findHighlights({ matches: [game], force: true });
    expect(r.found).toBeGreaterThanOrEqual(1); // other leagues' channels tagged earlier find theirs too
    const h = await hl.getHighlight(game.id);
    expect(h.videoId).not.toBe('nevilletalk');
    expect(h.title).toContain('Highlights');
  });
});

describe('finding a channel', () => {
  it('searches all of YouTube and adds a result\'s channel for the league', async () => {
    const game = pl.filter((m) => m.status === 'finished').at(-6);
    const r = await call(admin, 'POST', '/api/admin/highlights/search', { competition: 'PL', matchId: game.id, anywhere: true });
    const v = r.body.candidates[0];
    expect(v).toMatchObject({ channel: 'Mock Sports', channelId: 'UCmockmockmockmockmockmo' });
    const add = await call(admin, 'POST', '/api/admin/highlights/channels', { add: v.channelId, name: v.channel, competitions: ['CL'] });
    expect(add.body.channels.at(-1)).toEqual({ id: 'UCmockmockmockmockmockmo', name: 'Mock Sports', competitions: ['CL'] });
  });
});
