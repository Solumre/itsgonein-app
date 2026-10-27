// Champions League picks settle into their own table, recap and wrap message.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.FOOTBALL_DATA_MOCK = '1';
process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
let db, syncNow, buildRecap, cl, pl;

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  ({ syncNow } = await import('../../server/sync.js'));
  ({ buildRecap } = await import('../../server/recap.js'));
  const football = await import('../../server/football.js');
  [cl, pl] = await Promise.all([football.getMatches('CL'), football.getMatches('PL')]);
  const club = { name: 'Arsenal', tla: 'ARS', primary: '#EF0107', secondary: '#FFFFFF' };
  for (const [uid, nickname] of [['ann', 'AnnGoals'], ['ben', 'BenTen']]) {
    await db.doc(`users/${uid}`).set({ nickname, avatar: '⚽', club, stats: { points: 0, gw: {}, badges: [] } });
  }
  await db.doc('leagues/LEAGUE').set({ name: 'Year 8 Legends', owner: 'ann', members: ['ann', 'ben'], memberCount: 2 });
  const put = (uid, m, h, a, extra = {}) => db.doc(`predictions/${uid}_${m.id}`).set({ uid, matchId: m.id, home: h, away: a, double: false, matchday: m.matchday, kickoff: new Date(m.kickoff), ...extra });
  // A pick that's always wrong: back the side that didn't win (or a winner, for a draw).
  const miss = (s) => (s.home > s.away ? [0, 5] : [5, 0]);
  // Champions League matchday 3 is finished in the mock: Ann gets 2 exact, Ben 0.
  const md3 = cl.filter((m) => m.matchday === 3 && m.status === 'finished');
  for (const [i, m] of md3.entries()) {
    await put('ann', m, ...(i < 2 ? [m.score.home, m.score.away] : miss(m.score)), { competition: 'CL' });
    await put('ben', m, ...miss(m.score), { competition: 'CL' });
  }
  // One Premier League pick (old-style, no competition field) for Ann.
  const plGame = pl.find((m) => m.matchday === 8 && m.status === 'finished');
  await put('ann', plGame, plGame.score.home, plGame.score.away);
  await syncNow();
});

describe('Champions League', () => {
  it('keeps its points separate from the Premier League', async () => {
    const ann = (await db.doc('users/ann').get()).data();
    expect(ann.statsCL).toMatchObject({ points: 6, exact: 2, gw: { 3: 6 } });
    expect(ann.stats).toMatchObject({ points: 3, exact: 1 });
    expect(ann.stats.xp).toBeGreaterThan(3 * 10 + 1 * 2); // CL points still earn XP
  });

  it('posts its own wrap message', async () => {
    const msg = (await db.doc('leagues/LEAGUE/messages/gw_CL_3').get()).data();
    expect(msg).toMatchObject({ event: 'wrap', competition: 'CL', matchday: 3 });
    expect(msg.text).toContain('📊 ⭐ UCL Matchday 3 wrapped! 👑 AnnGoals won the round with 6 pts');
  });

  it('builds a Champions League recap', async () => {
    const r = await buildRecap('ann', 3, cl, 'CL');
    expect(r).toMatchObject({ competition: 'CL', roundLabel: 'Matchday 3', points: 6, exact: 2, seasonPoints: 6 });
    expect(r.leagues[0]).toMatchObject({ rank: 1, size: 2 });
  });
});
