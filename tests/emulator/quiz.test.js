// Daily quiz against the emulators with the mock season.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let server, base, db, quiz, me, amy, date, answers;

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
  quiz = await import('../../server/quiz.js');
  const { app } = await import('../../server/index.js');
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  [me, amy] = await Promise.all([signUp('quiz-me@example.com'), signUp('quiz-amy@example.com')]);
  await db.doc(`users/${me.uid}`).set({ nickname: 'Me', avatar: '⚽', stats: { points: 0, gw: {} } });
  await db.doc(`users/${amy.uid}`).set({ nickname: 'Amy', avatar: '🐯', stats: { points: 0, gw: {} } });
  await db.doc('leagues/QUIZ').set({ name: 'Quiz Kids', members: [me.uid, amy.uid] });
  date = quiz.quizDate();
});
afterAll(() => server?.close());

describe('the daily quiz', () => {
  it('gives everyone the same five questions, without the answers', async () => {
    const a = await call(null, 'GET', '/api/quiz');
    const b = await call(me, 'GET', '/api/quiz');
    expect(a.body.date).toBe(date);
    expect(a.body.questions).toHaveLength(5);
    expect(a.body.questions.map((q) => q.text)).toEqual(b.body.questions.map((q) => q.text));
    expect(a.body.questions.every((q) => q.answer === undefined)).toBe(true);
    answers = (await db.doc(`quizzes/${date}`).get()).data().questions.map((q) => q.answer);
  });

  it('marks each answer once and shows it afterwards', async () => {
    const r = await call(me, 'POST', '/api/quiz/answer', { n: 0, choice: answers[0] });
    expect(r.body).toMatchObject({ right: true, answer: answers[0], score: 1, done: false });
    expect((await call(me, 'POST', '/api/quiz/answer', { n: 0, choice: answers[0] })).status).toBe(409);
    expect((await call(me, 'POST', '/api/quiz/answer', { n: 9, choice: 0 })).status).toBe(400);
    expect((await call(me, 'POST', '/api/quiz/answer', { n: 1, choice: 7 })).status).toBe(400);
    expect((await call(null, 'POST', '/api/quiz/answer', { n: 1, choice: 0 })).status).toBe(401);
    const { body } = await call(me, 'GET', '/api/quiz');
    expect(body.questions[0]).toMatchObject({ chosen: answers[0], answer: answers[0] });
    expect(body.questions[1].answer).toBeUndefined();
  });

  it('finishes with XP, a streak and a shout in the league for 5/5', async () => {
    for (let n = 1; n < 5; n++) await call(me, 'POST', '/api/quiz/answer', { n, choice: answers[n] });
    const user = (await db.doc(`users/${me.uid}`).get()).data();
    expect(user.stats.quiz).toEqual({ total: 5, played: 1, streak: 1 });
    expect(user.stats.xp).toBeGreaterThanOrEqual(15);
    const msg = (await db.doc(`leagues/QUIZ/messages/quiz_${date}_${me.uid}`).get()).data();
    expect(msg.text).toBe('🧠 Me got 5/5 in today\'s quiz! Can you match it?');
  });

  it('shows league mates\' scores', async () => {
    await call(amy, 'POST', '/api/quiz/answer', { n: 0, choice: (answers[0] + 1) % 4 });
    const { body } = await call(amy, 'GET', '/api/quiz');
    expect(body.mates).toEqual([{ uid: me.uid, nickname: 'Me', avatar: '⚽', score: 5, done: true }]);
    expect(body.play).toEqual({ score: 0, done: false });
  });
});
