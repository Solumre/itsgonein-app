// Gameweek wrap messages and the personal recap, on the emulator with the mock season.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
let db, syncNow, buildRecap, wrapGameweek, matches;

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  ({ syncNow } = await import('../../server/sync.js'));
  ({ buildRecap, wrapGameweek } = await import('../../server/recap.js'));
  matches = await (await import('../../server/football.js')).getMatches('PL');
  const club = { name: 'Arsenal', tla: 'ARS', primary: '#EF0107', secondary: '#FFFFFF' };
  for (const [uid, nickname] of [['ann', 'AnnGoals'], ['ben', 'BenTen'], ['cat', 'CatKeeper']]) {
    await db.doc(`users/${uid}`).set({ nickname, avatar: '⚽', club, stats: { points: 0, gw: {}, badges: [] } });
  }
  await db.doc('leagues/LEAGUE').set({ name: 'Year 8 Legends', owner: 'ann', members: ['ann', 'ben', 'cat'], memberCount: 3 });
  // Gameweek 8 is fully finished in the mock season. Ann calls 3 exactly, Ben 1, Cat doesn't play.
  const gw8 = matches.filter((m) => m.matchday === 8 && m.status === 'finished');
  const put = (uid, m, h, a) => db.doc(`predictions/${uid}_${m.id}`).set({ uid, matchId: m.id, home: h, away: a, double: false, matchday: 8, kickoff: new Date(m.kickoff) });
  for (const [i, m] of gw8.entries()) {
    await put('ann', m, i < 3 ? m.score.home : m.score.home + 3, m.score.away);
    await put('ben', m, i < 1 ? m.score.home : 9, i < 1 ? m.score.away : 9);
  }
  await syncNow(); // settles, then wraps gameweek 8
});

describe('gameweek wrap', () => {
  it('posts the podium into the league chat once', async () => {
    const msg = (await db.doc('leagues/LEAGUE/messages/gw_8').get()).data();
    expect(msg).toMatchObject({ type: 'system', event: 'wrap', matchday: 8 });
    expect(msg.text).toContain('📊 Gameweek 8 wrapped! 👑 AnnGoals won the week');
    expect(msg.text).toContain('2nd BenTen');
    expect(msg.text).toContain('Sharpshooter: AnnGoals with 3 exact scores');
    expect(msg.text).not.toContain('CatKeeper');
    expect(await wrapGameweek(matches)).toBe(null);
  });
});

describe('buildRecap', () => {
  it('summarises a player\'s gameweek', async () => {
    const r = await buildRecap('ann', 8, matches);
    expect(r).toMatchObject({ matchday: 8, nickname: 'AnnGoals', exact: 3, picked: r.games, percentile: 100 });
    expect(r.points).toBeGreaterThanOrEqual(9);
    expect(r.best).toMatchObject({ kind: 'exact', points: 3 });
    expect(r.leagues).toEqual([expect.objectContaining({ name: 'Year 8 Legends', rank: 1, size: 2, winner: { nickname: 'AnnGoals', points: r.points } })]);
    const ben = await buildRecap('ben', 8, matches);
    expect(ben.leagues[0]).toMatchObject({ rank: 2, size: 2 });
    expect(ben.percentile).toBe(0);
  });
});
