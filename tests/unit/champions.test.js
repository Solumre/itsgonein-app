import { describe, it, expect } from 'vitest';
import { normalizeMatch } from '../../server/football.js';
import { roundLabel, competitionOf, GAMES } from '../../src/lib/game.js';

const raw = (over = {}) => ({
  id: 1, utcDate: '2027-03-10T20:00:00Z', status: 'FINISHED', matchday: null, stage: 'LAST_16',
  homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' },
  awayTeam: { id: 86, name: 'Real Madrid CF', shortName: 'Real Madrid', tla: 'RMA' },
  score: { duration: 'REGULAR', fullTime: { home: 2, away: 1 } },
  ...over,
});

describe('Champions League matches', () => {
  it('turns stages into rounds after the 8 league matchdays', () => {
    expect(normalizeMatch(raw({ stage: 'LEAGUE_STAGE', matchday: 6 }), 'CL').matchday).toBe(6);
    expect(normalizeMatch(raw(), 'CL').matchday).toBe(10);
    expect(normalizeMatch(raw({ stage: 'FINAL' }), 'CL').matchday).toBe(13);
    expect(normalizeMatch(raw({ stage: 'QUALIFICATION_ROUND_2' }), 'CL').matchday).toBe(null);
    expect(normalizeMatch(raw({ stage: 'REGULAR_SEASON', matchday: 12 }), 'PL').matchday).toBe(12);
  });
  it('scores knockouts on the 90-minute result', () => {
    const pens = raw({ score: { duration: 'PENALTY_SHOOTOUT', fullTime: { home: 6, away: 5 }, regularTime: { home: 1, away: 1 } } });
    expect(normalizeMatch(pens, 'CL').score).toEqual({ home: 1, away: 1 });
    const et = raw({ score: { duration: 'EXTRA_TIME', fullTime: { home: 3, away: 2 }, regularTime: { home: 2, away: 2 } } });
    expect(normalizeMatch(et, 'CL').score).toEqual({ home: 2, away: 2 });
    expect(normalizeMatch(raw(), 'CL').score).toEqual({ home: 2, away: 1 });
  });
  it('labels rounds', () => {
    expect(roundLabel('PL', 9)).toBe('Gameweek 9');
    expect(roundLabel('CL', 4)).toBe('Matchday 4');
    expect(roundLabel('CL', 10)).toBe('Round of 16');
    expect(roundLabel('CL', 13)).toBe('Final');
  });
  it('treats picks without a competition as Premier League', () => {
    expect(competitionOf({})).toBe('PL');
    expect(competitionOf({ competition: 'CL' })).toBe('CL');
    expect(GAMES.CL.statsKey).toBe('statsCL');
  });
});
