import { describe, it, expect } from 'vitest';
import { normalizeDetail, formFromMatches } from '../../server/football.js';

const ars = { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'a.png' };
const che = { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crest: 'c.png' };
const raw = (extra = {}) => ({
  id: 1, utcDate: '2026-11-07T15:00:00Z', status: 'IN_PLAY', minute: 70, matchday: 11,
  homeTeam: { ...ars }, awayTeam: { ...che }, score: { duration: 'REGULAR', fullTime: { home: 1, away: 1 } },
  ...extra,
});

describe('normalizeDetail', () => {
  it('copes with the free plan, which has no events or line-ups', () => {
    const d = normalizeDetail(raw(), 'PL');
    expect(d).toMatchObject({ id: '1', status: 'live', minute: 70, score: { home: 1, away: 1 }, events: [], lineups: null, venue: null, referee: null });
  });

  it('builds a timeline in minute order and line-ups when the plan has them', () => {
    const d = normalizeDetail(raw({
      venue: 'Emirates Stadium',
      referees: [{ name: 'Lino', type: 'ASSISTANT_REFEREE_N1' }, { name: 'M. Oliver', type: 'REFEREE' }],
      goals: [
        { minute: 55, type: 'OWN', team: che, scorer: { name: 'Gabriel' }, score: { home: 1, away: 1 } },
        { minute: 12, type: 'PENALTY', team: ars, scorer: { name: 'Saka' }, assist: null, score: { home: 1, away: 0 } },
      ],
      bookings: [{ minute: 45, injuryTime: 2, team: che, player: { name: 'Caicedo' }, card: 'YELLOW_RED' }],
      substitutions: [{ minute: 60, team: ars, playerIn: { name: 'Trossard' }, playerOut: { name: 'Martinelli' } }],
      homeTeam: { ...ars, formation: '4-3-3', coach: { name: 'Arteta' }, lineup: [{ name: 'Raya', shirtNumber: 1, position: 'Goalkeeper' }], bench: [{ name: 'Trossard', shirtNumber: 19 }] },
      awayTeam: { ...che, formation: '4-2-3-1', lineup: [{ name: 'Sanchez', shirtNumber: 1 }] },
    }), 'PL');
    expect(d.events.map((e) => [e.kind, e.clock, e.side])).toEqual([
      ['penalty', '12', 'home'], ['second_yellow', '45+2', 'away'], ['own_goal', '55', 'away'], ['sub', '60', 'home'],
    ]);
    expect(d.events[3]).toMatchObject({ player: 'Trossard', out: 'Martinelli' });
    expect(d.referee).toBe('M. Oliver');
    expect(d.venue).toBe('Emirates Stadium');
    expect(d.lineups.home).toEqual({ formation: '4-3-3', coach: 'Arteta', starting: [{ name: 'Raya', number: 1, position: 'Goalkeeper' }], bench: [{ name: 'Trossard', number: 19 }] });
    expect(d.lineups.away).toMatchObject({ formation: '4-2-3-1', coach: null, bench: [] });
  });

  it('leaves line-ups out until both teams are announced', () => {
    const d = normalizeDetail(raw({ homeTeam: { ...ars, lineup: [{ name: 'Raya' }] } }), 'PL');
    expect(d.lineups).toBeNull();
  });
});

describe('formFromMatches', () => {
  const g = (day, home, away, h, a, status = 'finished') => ({ kickoff: `2026-10-${String(day).padStart(2, '0')}T15:00:00Z`, status, home: { id: home }, away: { id: away }, score: status === 'finished' ? { home: h, away: a } : null });
  it('gives the last five results per team, oldest first, ignoring unplayed games', () => {
    const form = formFromMatches([
      g(20, 1, 2, 0, 0), g(1, 1, 3, 2, 0), g(6, 4, 1, 1, 0), g(10, 1, 5, 3, 3), g(14, 6, 1, 0, 4), g(17, 1, 7, 1, 2), g(25, 1, 8, 0, 0, 'upcoming'),
    ]);
    expect(form.get(1)).toBe('LDWLD'); // the 1 Oct win has dropped off
    expect(form.get(2)).toBe('D');
    expect(form.get(4)).toBe('W');
    expect(form.has(8)).toBe(false);
  });
});
