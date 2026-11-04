// Junior Editors against the emulators.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
process.env.ADMIN_EMAILS = 'admin@example.com';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, quiz, admin, seb, kid;

async function signIn(email, google) {
  const res = google
    ? await fetch(`${AUTH}/accounts:signInWithIdp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true }))}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }) })
    : await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) });
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
  quiz = await import('../../server/quiz.js');
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  [admin, seb, kid] = await Promise.all([signIn('admin@example.com', true), signIn('ed-seb@example.com'), signIn('ed-kid@example.com')]);
  for (const [u, nickname] of [[seb, 'SebTheEditor'], [kid, 'OtherKid']]) {
    await db.doc(`users/${u.uid}`).set({ nickname, avatar: '⚽' });
    await db.doc(`private/${u.uid}`).set({ consent: 'not_needed' });
    await db.doc(`nicknames/${nickname.toLowerCase()}`).set({ uid: u.uid });
  }
});
afterAll(() => server?.close());

describe('Junior Editors', () => {
  it('only admins can make an editor, by nickname', async () => {
    expect((await call(seb, 'POST', '/api/admin/ticker', { message: 'Hi' })).status).toBe(403);
    expect((await call(kid, 'POST', '/api/admin/editors', { nickname: 'SebTheEditor' })).status).toBe(403);
    expect((await call(admin, 'POST', '/api/admin/editors', { nickname: 'nobody' })).status).toBe(404);
    expect((await call(admin, 'POST', '/api/admin/editors', { nickname: 'sebtheeditor' })).status).toBe(200);
    expect((await call(admin, 'GET', '/api/admin/editors')).body.editors.map((e) => e.nickname)).toEqual(['SebTheEditor']);
  });

  it('lets an editor post the ticker, a poll and a bonus question, credited to them', async () => {
    expect((await call(seb, 'POST', '/api/admin/ticker', { message: '🚨 Derby day!' })).status).toBe(200);
    expect((await db.doc('settings/ticker').get()).data()).toMatchObject({ message: '🚨 Derby day!', by: 'SebTheEditor' });
    expect((await call(seb, 'POST', '/api/admin/ticker', { message: 'call 07700 900123' })).status).toBe(400); // still filtered
    expect((await call(seb, 'POST', '/api/admin/poll', { options: [{ name: 'Saka', team: 'Arsenal' }, { name: 'Palmer', team: 'Chelsea' }] })).status).toBe(200);
    expect((await call(null, 'GET', '/api/poll')).body.poll.by).toBe('SebTheEditor');
    const { body: b } = await call(seb, 'GET', '/api/admin/bonus');
    expect((await call(seb, 'POST', '/api/admin/bonus', { matchday: b.nextMatchday, question: 'Who scores first at the Emirates?', options: ['Saka', 'Havertz', 'Nobody'] })).status).toBe(200);
    expect((await call(seb, 'GET', '/api/admin/bonus')).body.questions[0]).toMatchObject({ by: 'SebTheEditor' });
  });

  it('keeps the safety side admin-only', async () => {
    for (const path of ['/api/admin/overview', '/api/admin/highlights', '/api/admin/editors']) expect((await call(seb, 'GET', path)).status).toBe(403);
    expect((await call(seb, 'POST', '/api/admin/ban', { uid: kid.uid })).status).toBe(403);
    expect((await call(seb, 'POST', '/api/admin/sync')).status).toBe(403);
  });

  it('takes quiz questions, checks them, and uses one a day with their name', async () => {
    expect((await call(seb, 'POST', '/api/editor/quiz', { question: 'Who is the best?', right: 'Me', wrong: ['Me', 'You', 'Them'] })).status).toBe(400);
    const add = await call(seb, 'POST', '/api/editor/quiz', { question: 'Which club plays at the Emirates?', right: 'Arsenal', wrong: ['Chelsea', 'Spurs', 'Fulham'] });
    expect(add.status).toBe(200);
    await call(seb, 'POST', '/api/editor/quiz', { question: 'Which club are the Toffees?', right: 'Everton', wrong: ['Leeds', 'Wolves', 'Hull'] });
    const qs = await quiz.getQuiz('2030-01-01', async () => ({}));
    expect(qs.filter((q) => q.kind === 'editor')).toEqual([expect.objectContaining({ text: 'Which club plays at the Emirates?', by: 'SebTheEditor' })]);
    const list = (await call(seb, 'GET', '/api/editor/quiz')).body.questions;
    expect(list.find((x) => x.id === add.body.id).usedOn).toBe('2030-01-01');
    expect((await call(seb, 'DELETE', `/api/editor/quiz/${add.body.id}`)).status).toBe(409); // already used
    const next = list.find((x) => !x.usedOn);
    expect((await call(admin, 'DELETE', `/api/editor/quiz/${next.id}`)).status).toBe(200);
  });

  it('can be switched off again', async () => {
    await call(admin, 'POST', '/api/admin/editors', { uid: seb.uid, editor: false });
    expect((await call(seb, 'POST', '/api/admin/ticker', { message: 'still here?' })).status).toBe(403);
  });
});
