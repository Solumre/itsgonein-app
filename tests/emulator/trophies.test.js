// Trophies on the emulator.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
let db, t;
const msg = async (id) => (await db.doc(`leagues/LEAGUE/messages/${id}`).get()).data()?.text;
const fin = (md, iso) => ({ competition: 'PL', matchday: md, kickoff: iso, status: 'finished' });

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  t = await import('../../server/trophies.js');
  const stats = {
    ann: { points: 30, exact: 2, played: 10, gw: { 1: 5, 2: 6 } },
    ben: { points: 40, exact: 5, played: 10, gw: { 1: 9, 2: 1 } },
    cat: { points: 0, exact: 0, played: 0, gw: {} },
  };
  for (const [uid, s] of Object.entries(stats)) await db.doc(`users/${uid}`).set({ nickname: uid.toUpperCase(), stats: s });
  await db.doc('leagues/LEAGUE').set({ name: 'Year 8 Legends', members: ['ann', 'ben', 'cat'] });
});

describe('round winners', () => {
  it('ties share the trophy, and it is only awarded once', async () => {
    const winners = [{ uid: 'ann', points: 5 }, { uid: 'ben', points: 5 }];
    await t.awardRoundWinners({ competition: 'PL', md: 7, league: 'LEAGUE', leagueName: 'Year 8 Legends', winners });
    await t.awardRoundWinners({ competition: 'PL', md: 7, league: 'LEAGUE', leagueName: 'Year 8 Legends', winners });
    expect((await db.doc('users/ann').get()).data().trophies).toEqual({ gw: 1 });
    expect((await db.doc('trophies/gw_PL_md7_LEAGUE_ben').get()).data()).toMatchObject({ emoji: '🏅', name: 'Gameweek winner', label: 'Gameweek 7', points: 5 });
  });
});

describe('Player of the Month', () => {
  const matches = [fin(1, '2026-10-04T14:00:00Z'), fin(2, '2026-10-18T14:00:00Z')];
  it('goes to the most points from that month, once', async () => {
    const r = await t.awardMonthly(matches, { now: Date.parse('2026-11-03T12:00:00Z') });
    expect(r).toEqual({ month: '2026-10', awarded: 1 });
    expect((await db.doc('trophies/month_PL_2026-10_LEAGUE_ann').get()).data()).toMatchObject({ name: 'Player of the Month', label: 'October', points: 11 });
    expect(await msg('month_2026-10')).toBe("🥇 ANN is Year 8 Legends' Player of the Month for October with 11 pts! Trophy added to the cabinet.");
    expect(await t.awardMonthly(matches, { now: Date.parse('2026-11-04T12:00:00Z') })).toBe(null);
  });
});

describe('end of season', () => {
  it('crowns the champion and the Golden Boot', async () => {
    const [r] = await t.awardSeason([fin(1, '2026-08-15T14:00:00Z'), fin(38, '2027-05-23T15:00:00Z')]);
    expect(r).toEqual({ competition: 'PL', season: '2026/27', awarded: 2 });
    expect((await db.doc('trophies/champion_PL_2026-27_LEAGUE_ben').get()).data()).toMatchObject({ name: 'League champion', label: '2026/27', points: 40 });
    expect((await db.doc('trophies/boot_PL_2026-27_LEAGUE_ben').get()).data()).toMatchObject({ name: 'Golden Boot', points: 5 });
    expect(await t.awardSeason([fin(1, '2026-08-15T14:00:00Z'), fin(38, '2027-05-23T15:00:00Z')])).toEqual([]);
  });
});

describe('listing', () => {
  it('lists a player\'s trophies, newest first', async () => {
    const ben = await t.listTrophies('ben');
    expect(ben.map((x) => x.type).sort()).toEqual(['boot', 'champion', 'gw']);
    expect(await msg('season_PL_2026-27')).toContain('🏆 2026/27 champion of Year 8 Legends: BEN with 40 pts! 👟 Golden Boot: BEN with 5 exact scores.');
  });
});
