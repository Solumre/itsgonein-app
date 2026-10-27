// Runs the real server against the Auth + Firestore emulators with the mock season.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
process.env.ADMIN_EMAILS = 'admin@example.com';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, syncNow;

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
  });
  const j = await res.json();
  return { uid: j.localId, token: j.idToken };
}

// A Google sign-in, which gives a verified email (needed for admin).
async function googleSignIn(email) {
  const res = await fetch(`${AUTH}/accounts:signInWithIdp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true }))}&providerId=google.com`,
      requestUri: 'http://localhost', returnSecureToken: true,
    }),
  });
  const j = await res.json();
  return { uid: j.localId, token: j.idToken };
}

async function api(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(user && { authorization: `Bearer ${user.token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const thisYear = new Date().getFullYear();
let sam, kid, parent, admin, league, matches;

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  ({ syncNow } = await import('../../server/sync.js'));
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  [sam, kid, parent] = await Promise.all([signUp('sam@example.com'), signUp('kid@example.com'), signUp('parent@example.com')]);
  admin = await googleSignIn('admin@example.com');
});
afterAll(() => server?.close());

const club = { name: 'Arsenal', tla: 'ARS', primary: '#ef0107', secondary: '#ffffff' };

describe('profiles and parent consent', () => {
  it('validates nicknames', async () => {
    const bad = await api(sam, 'POST', '/api/profile', { nickname: 'Admin', avatar: '⚽', club, birthYear: 2000, birthMonth: 1 });
    expect(bad.status).toBe(400);
  });

  it('creates a 13+ profile with no consent needed', async () => {
    const r = await api(sam, 'POST', '/api/profile', { nickname: 'SamTheMan', avatar: '🦁', club, birthYear: thisYear - 14, birthMonth: 1 });
    expect(r).toMatchObject({ status: 200, body: { created: true } });
    expect((await db.doc(`private/${sam.uid}`).get()).data().consent).toBe('not_needed');
    expect((await db.doc(`users/${sam.uid}`).get()).data()).toMatchObject({ nickname: 'SamTheMan', club: { tla: 'ARS' } });
  });

  it('keeps nicknames unique', async () => {
    const r = await api(kid, 'POST', '/api/profile', { nickname: 'samtheman', avatar: '⚽', club, birthYear: thisYear - 12, birthMonth: 1 });
    expect(r.status).toBe(409);
  });

  it('holds back leagues for under-13s until a parent says yes', async () => {
    await api(kid, 'POST', '/api/profile', { nickname: 'LittleLeo', avatar: '⚡', club, birthYear: thisYear - 12, birthMonth: 1 });
    const priv = (await db.doc(`private/${kid.uid}`).get()).data();
    expect(priv).toMatchObject({ under13: true, consent: 'pending' });
    expect((await api(kid, 'POST', '/api/leagues', { name: 'Kids League' })).status).toBe(403);

    const info = await api(null, 'GET', `/api/consent/${priv.consentToken}`);
    expect(info.body).toMatchObject({ nickname: 'LittleLeo', status: 'pending' });
    expect((await api(kid, 'POST', `/api/consent/${priv.consentToken}`, { confirm: true })).status).toBe(400); // can't approve yourself
    expect((await api(parent, 'POST', `/api/consent/${priv.consentToken}`, {})).status).toBe(400); // must confirm
    expect((await api(parent, 'POST', `/api/consent/${priv.consentToken}`, { confirm: true })).body.status).toBe('approved');
    expect((await api(parent, 'GET', '/api/parent')).body.children).toEqual([expect.objectContaining({ nickname: 'LittleLeo', status: 'approved' })]);
  });
});

describe('leagues, settling and chat', () => {
  it('creates and joins a league by code', async () => {
    const created = await api(sam, 'POST', '/api/leagues', { name: 'Year 8 Legends' });
    expect(created.status).toBe(200);
    league = created.body.code;
    expect(league).toMatch(/^[A-Z2-9]{6}$/);
    expect((await api(kid, 'POST', '/api/leagues/join', { code: 'NOPE00' })).status).toBe(404);
    expect((await api(kid, 'POST', '/api/leagues/join', { code: league.toLowerCase() })).body.name).toBe('Year 8 Legends');
    expect((await db.doc(`leagues/${league}`).get()).data().members).toEqual([sam.uid, kid.uid]);
  });

  it('settles finished games, posts results in chat and builds the table', async () => {
    matches = (await api(null, 'GET', '/api/matches')).body;
    expect(matches.currentMatchday).toBe(9);
    const gw9 = matches.matches.filter((m) => m.matchday === 9);
    const [fin] = gw9.filter((m) => m.status === 'finished');
    const [live] = gw9.filter((m) => m.status === 'live');
    const [upcoming] = gw9.filter((m) => m.status === 'upcoming');
    expect(fin && live && upcoming).toBeTruthy();

    // Picks made before kickoff (written directly: the rules tests cover the app path).
    const put = (u, m, home, away, double = false) => db.doc(`predictions/${u.uid}_${m.id}`).set({
      uid: u.uid, matchId: m.id, home, away, double, matchday: 9, kickoff: new Date(m.kickoff), updatedAt: new Date(),
    });
    await put(sam, fin, fin.score.home, fin.score.away, true); // exact, doubled: 6
    await put(kid, fin, fin.score.home + 1, fin.score.away + 5); // probably a miss
    await put(sam, live, live.score.home, live.score.away); // "exact if it ends now"
    await put(sam, upcoming, 1, 0);

    await syncNow();
    const samStats = (await db.doc(`users/${sam.uid}`).get()).data().stats;
    expect(samStats).toMatchObject({ points: 6, exact: 1, played: 1 });
    expect(samStats.badges).toEqual(expect.arrayContaining(['first_pick', 'sniper', 'double_trouble']));
    expect((await db.doc(`predictions/${sam.uid}_${fin.id}`).get()).data()).toMatchObject({ points: 6, kind: 'exact' });
    expect((await db.doc(`matches/${upcoming.id}`).get()).data().status).toBe('upcoming');

    const msgs = (await db.collection(`leagues/${league}/messages`).get()).docs.map((d) => [d.id, d.data().text]);
    const ft = msgs.find(([id]) => id === `ft_${fin.id}`);
    expect(ft[1]).toContain('SamTheMan nailed the exact score');
    expect(msgs.find(([id]) => id === `ko_${live.id}`)[1]).toContain('Picks locked');

    const board = (await api(kid, 'GET', `/api/leagues/${league}/board?matchday=9`)).body;
    const samRow = board.rows.find((r) => r.uid === sam.uid);
    expect(samRow.live).toBe(3);
    expect(samRow.gw).toBe(9);
    expect(samRow.season).toBe(9);
    const upPicks = board.picks.find((p) => p.matchId === upcoming.id).picks;
    expect(upPicks[sam.uid]).toEqual({ hidden: true }); // kid can't see Sam's pick before kickoff
    expect(board.picks.find((p) => p.matchId === live.id).picks[sam.uid]).toMatchObject({ home: live.score.home });
  });

  it('filters chat and lets you share your own pick', async () => {
    const path = `/api/leagues/${league}/messages`;
    expect((await api(kid, 'POST', path, { text: 'add me on snapchat' })).status).toBe(400);
    expect((await api(kid, 'POST', path, { text: 'what the fuck' })).status).toBe(400);
    expect((await api(kid, 'POST', path, { text: 'Arsenal are winning this' })).status).toBe(200);
    expect((await api(kid, 'POST', path, { quick: 'get_in' })).status).toBe(200);
    const upcoming = matches.matches.find((m) => m.matchday === 9 && m.status === 'upcoming');
    const shared = await api(sam, 'POST', path, { pickMatchId: upcoming.id });
    expect(shared.status).toBe(200);
    const msg = (await db.doc(`leagues/${league}/messages/${shared.body.id}`).get()).data();
    expect(msg).toMatchObject({ type: 'pick', nickname: 'SamTheMan' });
    expect(msg.text).toContain('1-0');
    expect((await api(parent, 'POST', path, { text: 'hi' })).status).toBe(403); // not a member (no profile)

    const react = await api(sam, 'POST', `${path}/${shared.body.id}/react`, { emoji: '🔥' });
    expect(react.status).toBe(200);
    expect((await db.doc(`leagues/${league}/messages/${shared.body.id}`).get()).data().reactions['🔥']).toEqual([sam.uid]);
  });

  it('reports go to the admin, who can ban', async () => {
    const id = (await api(kid, 'POST', `/api/leagues/${league}/messages`, { text: 'you are rubbish' })).body.id;
    expect((await api(sam, 'POST', '/api/reports', { code: league, messageId: id, reason: 'mean' })).status).toBe(200);
    expect((await api(sam, 'GET', '/api/admin/overview')).status).toBe(403);
    const ov = (await api(admin, 'GET', '/api/admin/overview')).body;
    expect(ov.reports).toHaveLength(1);
    await api(admin, 'POST', `/api/admin/reports/${ov.reports[0].id}`, { deleteMessage: true, ban: true });
    expect((await db.doc(`leagues/${league}/messages/${id}`).get()).data()).toMatchObject({ deleted: true, text: '' });
    expect((await api(kid, 'POST', `/api/leagues/${league}/messages`, { text: 'sorry' })).status).toBe(403);
    await api(admin, 'POST', '/api/admin/ban', { uid: kid.uid, banned: false });
    expect((await api(kid, 'POST', `/api/leagues/${league}/messages`, { text: 'sorry' })).status).toBe(200);
  });
});

describe('player of the week', () => {
  it('one vote each', async () => {
    expect((await api(admin, 'POST', '/api/admin/poll', { options: [{ name: 'Saka', team: 'Arsenal' }, { name: 'Salah', team: 'Liverpool' }] })).status).toBe(200);
    expect((await api(sam, 'POST', '/api/poll/vote', { option: 'p1' })).status).toBe(200);
    expect((await api(sam, 'POST', '/api/poll/vote', { option: 'p2' })).status).toBe(409);
    const poll = (await api(sam, 'GET', '/api/poll')).body.poll;
    expect(poll).toMatchObject({ myVote: 'p1', options: [{ name: 'Saka', votes: 1 }, { name: 'Salah', votes: 0 }] });
  });
});

describe('deleting an account', () => {
  it('removes the player and their data', async () => {
    expect((await api(kid, 'DELETE', '/api/me')).status).toBe(200);
    expect((await db.doc(`users/${kid.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`private/${kid.uid}`).get()).exists).toBe(false);
    expect((await db.doc('nicknames/littleleo').get()).exists).toBe(false);
    expect((await db.doc(`leagues/${league}`).get()).data().members).toEqual([sam.uid]);
    expect((await db.collection('predictions').where('uid', '==', kid.uid).get()).empty).toBe(true);
  });
});

describe('kick-off reminders setting', () => {
  it('turns on with a device token and off again', async () => {
    expect((await api(sam, 'POST', '/api/me/reminders', { on: true })).status).toBe(400);
    expect((await api(sam, 'POST', '/api/me/reminders', { on: true, token: 'device-1' })).status).toBe(200);
    await api(sam, 'POST', '/api/me/reminders', { on: true, token: 'device-2' });
    expect((await db.doc(`private/${sam.uid}`).get()).data()).toMatchObject({ notifyKickoff: true, pushTokens: ['device-1', 'device-2'] });
    await api(sam, 'POST', '/api/me/reminders', { on: false, token: 'device-1' });
    expect((await db.doc(`private/${sam.uid}`).get()).data()).toMatchObject({ notifyKickoff: false, pushTokens: ['device-2'] });
  });
});
