// Head-to-head challenges against the emulator with the mock season.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
let db, h2h, pl;
const msgs = async (code) => (await db.collection(`leagues/${code}/messages`).get()).docs.map((d) => d.data().text);

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  h2h = await import('../../server/h2h.js');
  pl = await (await import('../../server/football.js')).getMatches('PL');
  const people = { ann: 'not_needed', ben: 'not_needed', cat: 'not_needed', dan: 'pending', eve: 'not_needed' };
  for (const [uid, consent] of Object.entries(people)) {
    await db.doc(`users/${uid}`).set({ nickname: uid.toUpperCase(), avatar: '⚽', stats: { points: 0, gw: {} } });
    await db.doc(`private/${uid}`).set({ consent, blocked: uid === 'eve' ? ['ann'] : [] });
  }
  await db.doc('leagues/LEAGUE').set({ name: 'Mates', members: ['ann', 'ben', 'dan', 'eve'] });
  await db.doc('leagues/OTHER').set({ name: 'Other', members: ['cat'] });
});

const ann = { nickname: 'ANN', avatar: '⚽' };

describe('creating challenges', () => {
  it('challenges a league mate for the next round that has not started', async () => {
    const r = await h2h.createChallenge({ from: 'ann', fromUser: ann, to: 'ben', leagueCode: 'LEAGUE', competition: 'PL' });
    expect(r.matchday).toBe(10); // gameweek 9 is already under way in the mock
    const c = (await db.doc(`challenges/${r.id}`).get()).data();
    expect(c).toMatchObject({ status: 'pending', from: 'ann', to: 'ben', players: ['ann', 'ben'], league: 'LEAGUE' });
    expect(await msgs('LEAGUE')).toContain('⚔️ ANN challenged BEN to a head-to-head for Gameweek 10!');
  });

  it('refuses duplicates, strangers, unapproved, blocked and yourself', async () => {
    const tryIt = (to, leagueCode = 'LEAGUE', from = 'ann') => h2h.createChallenge({ from, fromUser: ann, to, leagueCode, competition: 'PL' }).then(() => 'ok', (e) => e.status);
    expect(await tryIt('ben')).toBe(409);
    expect(await tryIt('ann', 'LEAGUE', 'ben')).toBe(409); // same pair, other way round
    expect(await tryIt('cat')).toBe(403); // not in a shared league
    expect(await tryIt('cat', 'OTHER')).toBe(403);
    expect(await tryIt('dan')).toBe(400); // parent hasn't said OK
    expect(await tryIt('eve')).toBe(400); // eve blocked ann
    expect(await tryIt('ann')).toBe(400);
  });
});

describe('answering', () => {
  it('only the challenged player can accept, and accepting is announced', async () => {
    const id = 'PL_10_ann_ben';
    expect(await h2h.respondChallenge({ id, uid: 'ann', accept: true }).then(() => 'ok', (e) => e.status)).toBe(404);
    expect(await h2h.respondChallenge({ id, uid: 'ben', accept: true })).toEqual({ status: 'accepted' });
    expect((await msgs('LEAGUE')).some((t) => t.startsWith('🤝 BEN accepted ANN'))).toBe(true);
    expect(await h2h.respondChallenge({ id, uid: 'ben', accept: false }).then(() => 'ok', (e) => e.status)).toBe(400);
  });
});

describe('settling', () => {
  it('scores a finished round, keeps a record and posts the result once', async () => {
    await db.doc('users/ann').set({ stats: { gw: { 8: 7 } } }, { merge: true });
    await db.doc('users/ben').set({ stats: { gw: { 8: 4 } } }, { merge: true });
    await db.doc('challenges/PL_8_ann_ben').set({
      competition: 'PL', matchday: 8, startsAt: new Date(Date.now() - 7 * 86_400_000), from: 'ben', to: 'ann', players: ['ben', 'ann'],
      league: 'LEAGUE', names: { ann: 'ANN', ben: 'BEN' }, avatars: {}, status: 'accepted',
    });
    await db.doc('challenges/PL_9_ann_eve').set({
      competition: 'PL', matchday: 9, startsAt: new Date(Date.now() - 3600_000), from: 'eve', to: 'ann', players: ['eve', 'ann'],
      league: 'LEAGUE', names: { ann: 'ANN', eve: 'EVE' }, avatars: {}, status: 'pending',
    });
    expect(await h2h.settleChallenges(pl)).toEqual({ settled: 1 });
    expect((await db.doc('challenges/PL_8_ann_ben').get()).data()).toMatchObject({ status: 'done', result: { winner: 'ann', score: { ann: 7, ben: 4 } } });
    expect((await db.doc('rivalries/ann_ben').get()).data()).toMatchObject({ wins: { ann: 1, ben: 0 }, draws: 0 });
    expect((await db.doc('challenges/PL_9_ann_eve').get()).data().status).toBe('expired');
    expect(await msgs('LEAGUE')).toContain('⚔️ Head-to-head, Gameweek 8: BEN 4 – 7 ANN. ANN wins! ANN leads 1–0.');
    expect(await h2h.settleChallenges(pl)).toEqual({ settled: 0 });
    expect((await db.doc('rivalries/ann_ben').get()).data().wins.ann).toBe(1);
  });

  it('lists challenges with scores and the record', async () => {
    const list = await h2h.listChallenges('ann');
    expect(list.map((c) => [c.matchday, c.status])).toEqual([[10, 'accepted'], [9, 'expired'], [8, 'done']]);
    expect(list[2]).toMatchObject({ winner: 'ann', score: { ann: 7, ben: 4 }, record: { wins: { ann: 1, ben: 0 } } });
    expect(list[0]).toMatchObject({ roundLabel: 'Gameweek 10', started: false });
  });
});
