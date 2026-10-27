import { describe, it, expect } from 'vitest';
import { openRound, pairKey } from '../../server/h2h.js';

const now = Date.parse('2026-11-07T10:00:00Z');
const m = (md, hoursFromNow, status = 'upcoming') => ({ matchday: md, status, kickoff: new Date(now + hoursFromNow * 3600_000).toISOString() });

describe('openRound', () => {
  it('skips a round that has started and picks the next', () => {
    expect(openRound([m(9, -2, 'finished'), m(9, 5), m(10, 170), m(10, 172), m(11, 340)], now)).toEqual({ matchday: 10, startsAt: now + 170 * 3600_000 });
  });
  it('uses the current round if nothing has kicked off', () => {
    expect(openRound([m(9, 3), m(9, 5), m(10, 170)], now).matchday).toBe(9);
  });
  it('ignores postponed games and returns null when nothing is left', () => {
    expect(openRound([m(38, -5, 'finished'), m(37, 2, 'postponed')], now)).toBe(null);
  });
});

describe('pairKey', () => {
  it('is the same whichever way round', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});
