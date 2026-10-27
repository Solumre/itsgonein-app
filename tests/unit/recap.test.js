import { describe, it, expect } from 'vitest';
import { gameweekComplete, rankRows } from '../../src/lib/game.js';
import { latestCompletedMatchday } from '../../server/recap.js';
import { headline } from '../../src/lib/recapImage.js';

const now = Date.parse('2026-11-10T12:00:00Z');
const m = (md, status, daysAgo) => ({ matchday: md, status, kickoff: new Date(now - daysAgo * 86_400_000).toISOString() });

describe('gameweekComplete', () => {
  it('needs every game finished or postponed', () => {
    const ms = [m(8, 'finished', 3), m(8, 'postponed', 3), m(9, 'finished', 1), m(9, 'upcoming', -1)];
    expect(gameweekComplete(ms, 8)).toBe(true);
    expect(gameweekComplete(ms, 9)).toBe(false);
    expect(gameweekComplete([m(7, 'postponed', 9)], 7)).toBe(false);
  });
});

describe('latestCompletedMatchday', () => {
  it('returns the newest finished gameweek from the last 8 days', () => {
    expect(latestCompletedMatchday([m(8, 'finished', 3), m(9, 'live', 0)], now)).toBe(8);
    expect(latestCompletedMatchday([m(8, 'finished', 10), m(9, 'live', 0)], now)).toBe(null);
  });
});

describe('rankRows', () => {
  it('shares positions on equal points', () => {
    const r = rankRows([{ nickname: 'b', points: 5 }, { nickname: 'a', points: 9 }, { nickname: 'c', points: 5 }, { nickname: 'd', points: 1 }]);
    expect(r.map((x) => [x.nickname, x.rank])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
  });
});

describe('headline', () => {
  const base = { leagues: [], percentile: null, players: 0, seasonPoints: 40 };
  it('celebrates winning a league week', () => {
    expect(headline({ ...base, leagues: [{ rank: 1, size: 5 }] })).toBe('👑 Won the week in my league!');
    expect(headline({ ...base, leagues: [{ rank: 2, size: 5 }] })).toBe('2nd of 5 in my league this week');
  });
  it('says round for the Champions League', () => {
    expect(headline({ ...base, competition: 'CL', leagues: [{ rank: 1, size: 3 }] })).toBe('👑 Won the round in my league!');
  });
  it('falls back to percentile, then season points', () => {
    expect(headline({ ...base, percentile: 72, players: 30 })).toBe('Better than 72% of players');
    expect(headline(base)).toBe('40 points this season');
  });
});
