import { describe, it, expect } from 'vitest';
import { monthKey, monthName, monthToAward, seasonLabel } from '../../src/lib/game.js';

const m = (md, iso, status = 'finished') => ({ matchday: md, kickoff: iso, status, competition: 'PL' });

describe('monthKey', () => {
  it('uses UK time', () => {
    expect(monthKey(Date.parse('2026-08-31T23:30:00Z'))).toBe('2026-09'); // 00:30 BST on 1 Sept
    expect(monthKey(Date.parse('2026-10-31T23:30:00Z'))).toBe('2026-10'); // 23:30 GMT
    expect(monthName('2026-10')).toBe('October');
  });
});

describe('monthToAward', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  it('awards the last finished month once it is over', () => {
    const ms = [m(9, '2026-10-04T14:00:00Z'), m(10, '2026-10-18T14:00:00Z'), m(11, '2026-10-31T15:00:00Z'), m(11, '2026-11-01T16:00:00Z'), m(12, '2026-11-08T15:00:00Z', 'upcoming')];
    expect(monthToAward(ms, now)).toEqual({ month: '2026-10', mds: [9, 10] }); // gameweek 11 ended in November
  });
  it('waits while a gameweek that started that month is unfinished', () => {
    expect(monthToAward([m(9, '2026-10-04T14:00:00Z'), m(10, '2026-10-31T14:00:00Z', 'live')], now)).toBe(null);
  });
  it('never awards the month still in progress', () => {
    expect(monthToAward([m(12, '2026-11-01T14:00:00Z')], now)).toBe(null);
  });
});

describe('seasonLabel', () => {
  it('names the season from its first game', () => {
    expect(seasonLabel([m(1, '2026-08-15T14:00:00Z'), m(38, '2027-05-23T15:00:00Z')])).toBe('2026/27');
  });
});
