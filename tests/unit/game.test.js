import { describe, it, expect } from 'vitest';
import { scorePick, computeStats, levelFor, validDoubles } from '../../src/lib/game.js';

const mk = (id, matchday, kickoff, score, status = 'finished', home = 'ARS', away = 'CHE') => [
  String(id), { id: String(id), matchday, kickoff, status, score, home: { tla: home }, away: { tla: away } },
];

describe('scorePick', () => {
  it('gives 3 for exact, 1 for result, 0 for a miss', () => {
    expect(scorePick({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(3);
    expect(scorePick({ home: 3, away: 0 }, { home: 2, away: 1 })).toBe(1);
    expect(scorePick({ home: 1, away: 1 }, { home: 0, away: 0 })).toBe(1);
    expect(scorePick({ home: 0, away: 1 }, { home: 2, away: 1 })).toBe(0);
  });
  it('doubles with Double Up', () => {
    expect(scorePick({ home: 2, away: 1 }, { home: 2, away: 1 }, true)).toBe(6);
    expect(scorePick({ home: 0, away: 1 }, { home: 2, away: 1 }, true)).toBe(0);
  });
  it('handles missing scores', () => {
    expect(scorePick({ home: 1, away: 0 }, null)).toBe(0);
  });
});

describe('validDoubles', () => {
  it('keeps only the earliest Double Up in a gameweek', () => {
    const matches = new Map([mk(1, 5, 200, null, 'upcoming'), mk(2, 5, 100, null, 'upcoming'), mk(3, 6, 50, null, 'upcoming')]);
    const picks = [{ matchId: '1', double: true }, { matchId: '2', double: true }, { matchId: '3', double: true }];
    expect([...validDoubles(picks, matches)].sort()).toEqual(['2', '3']);
  });
});

describe('computeStats', () => {
  it('totals points, gameweeks, streaks and badges in kickoff order', () => {
    const matches = new Map([
      mk(1, 1, 100, { home: 2, away: 1 }),
      mk(2, 1, 200, { home: 0, away: 0 }),
      mk(3, 2, 300, { home: 1, away: 3 }),
      mk(4, 2, 400, { home: 1, away: 0 }),
      mk(5, 3, 500, null, 'upcoming'),
    ]);
    const picks = [
      { matchId: '2', home: 1, away: 1 },          // result (draw) +1
      { matchId: '1', home: 2, away: 1, double: true }, // exact doubled +6
      { matchId: '3', home: 2, away: 0 },          // miss
      { matchId: '4', home: 1, away: 0 },          // exact +3
      { matchId: '5', home: 1, away: 0 },          // not played yet
    ];
    const { stats, perPick } = computeStats(picks, matches, { clubTla: 'ARS' });
    expect(stats.points).toBe(10);
    expect(stats.played).toBe(4);
    expect(stats.exact).toBe(2);
    expect(stats.gw).toEqual({ 1: 7, 2: 3 });
    expect(stats.bestStreak).toBe(2);
    expect(stats.streak).toBe(1);
    expect(perPick['1']).toEqual({ points: 6, kind: 'exact', double: true });
    expect(stats.badges).toEqual(expect.arrayContaining(['first_pick', 'sniper', 'double_trouble', 'full_house']));
    expect(stats.badges).toContain('perfect_week'); // gameweek 1: both scored (gameweek 2 had a miss)
  });
});

describe('levelFor', () => {
  it('maps xp to levels with progress', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: 'Sunday League', next: 100 });
    expect(levelFor(150)).toMatchObject({ level: 2, progress: 0.25 });
    expect(levelFor(99999)).toMatchObject({ level: 8, next: null, progress: 1 });
  });
});
