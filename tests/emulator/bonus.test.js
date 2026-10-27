// Bonus questions on the emulator with the mock season.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
let db, sync, bonus, recap, game, pl, correct, gw8;

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  sync = await import('../../server/sync.js');
  bonus = await import('../../server/bonus.js');
  recap = await import('../../server/recap.js');
  game = await import('../../src/lib/game.js');
  pl = await (await import('../../server/football.js')).getMatches('PL');
  for (const uid of ['ann', 'ben']) await db.doc(`users/${uid}`).set({ nickname: uid.toUpperCase(), avatar: '⚽', stats: { points: 0, gw: {} } });
  gw8 = pl.filter((m) => m.matchday === 8);
  correct = game.scoreBonus({}, gw8).correct;
  const wrongGame = gw8.find((m) => m.status === 'finished' && !correct.goalfest.includes(m.id)).id;
  // Answers made before gameweek 8 locked (written directly, since it's finished now).
  const put = (uid, answers) => db.doc(`bonusAnswers/${uid}_PL_8`).set({ uid, competition: 'PL', matchday: 8, key: 'PL_8', answers });
  await put('ann', { goals: correct.goals, goalfest: correct.goalfest[0], nil: correct.nil, custom: 'o2' }); // 3 + 2 + 1
  await put('ben', { goals: correct.goals + 2, goalfest: wrongGame, nil: correct.nil === 'yes' ? 'no' : 'yes' }); // 1
  await db.doc('bonusQuestions/PL_8').set({ matchday: 8, question: 'Who scores first?', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }], answer: null });
  await sync.syncNow();
});

describe('settling bonus points', () => {
  it('adds them to the gameweek and season once the gameweek is done', async () => {
    const ann = (await db.doc('users/ann').get()).data().stats;
    expect(ann).toMatchObject({ points: 6, bonus: 6, gw: { 8: 6 } });
    expect((await db.doc('users/ben').get()).data().stats).toMatchObject({ points: 1, gw: { 8: 1 } });
    expect((await db.doc('bonusAnswers/ann_PL_8').get()).data()).toMatchObject({ points: 6, breakdown: { goals: 3, goalfest: 2, nil: 1, custom: 0 } });
  });

  it('re-scores when the admin marks the extra question', async () => {
    await bonus.markCustomAnswer(8, 'o2');
    const byComp = sync.matchesByCompetition(await sync.gameMatches());
    for (const uid of await bonus.bonusPlayers([8])) await sync.recomputeUser(uid, byComp);
    expect((await db.doc('users/ann').get()).data().stats).toMatchObject({ points: 8, gw: { 8: 8 } });
    const r = await recap.buildRecap('ann', 8, pl, 'PL');
    expect(r).toMatchObject({ bonus: 8, points: 8 });
  });
});

describe('answering', () => {
  it('saves answers for an open gameweek and refuses locked or invalid ones', async () => {
    const gw10 = pl.filter((m) => m.matchday === 10);
    await bonus.saveBonus('ann', 10, { goals: 27, goalfest: gw10[0].id, nil: 'no' });
    const view = await bonus.getBonus('ann', 10);
    expect(view).toMatchObject({ matchday: 10, locked: false, answers: { goals: 27, nil: 'no' }, result: null });
    expect(view.questions.map((q) => q.id)).toEqual(['goals', 'goalfest', 'nil']);
    const err = (p) => p.then(() => 'ok', (e) => e.status);
    expect(await err(bonus.saveBonus('ann', 9, { goals: 20 }))).toBe(400); // gameweek 9 has kicked off
    expect(await err(bonus.saveBonus('ann', 10, { goals: 99 }))).toBe(400);
    expect(await err(bonus.saveBonus('ann', 10, { goalfest: 'nope' }))).toBe(400);
  });

  it('lets the admin add a fourth question before kickoff', async () => {
    await bonus.setCustomQuestion(10, 'Who scores first in ARS v TOT?', ['Saka', 'Son', 'Nobody']);
    expect((await bonus.getBonus('ben', 10)).questions.at(-1)).toMatchObject({ id: 'custom', options: [{ id: 'o1', label: 'Saka' }, { id: 'o2', label: 'Son' }, { id: 'o3', label: 'Nobody' }] });
    const err = await bonus.setCustomQuestion(9, 'Too late?', ['a', 'b']).then(() => 'ok', (e) => e.status);
    expect(err).toBe(400);
  });
});
