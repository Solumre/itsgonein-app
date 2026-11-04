import { describe, it, expect } from 'vitest';
import { ratings, forecast, backtest, pickPoints, clampSettings, DEFAULT_SETTINGS } from '../../src/lib/model.js';

const T = (id) => ({ id, name: `T${id}`, tla: `T${id}` });
let day = 0;
const g = (h, a, hs, as, status = 'finished') => ({ id: `m${++day}`, status, kickoff: new Date(Date.UTC(2026, 7, 1) + day * 86400_000).toISOString(), home: T(h), away: T(a), score: status === 'finished' ? { home: hs, away: as } : null });

// Team 1 scores lots, team 4 lets lots in.
const season = [g(1, 2, 3, 0), g(3, 4, 1, 3), g(1, 3, 4, 1), g(2, 4, 2, 2), g(4, 1, 0, 3), g(2, 3, 1, 1), g(1, 4, 5, 0), g(3, 2, 0, 1)];
const next = g(1, 4, 0, 0, 'upcoming');

describe('model', () => {
  it('rates strong attacks and weak defences', () => {
    const r = ratings(season);
    expect(r.teams.get(1).attack).toBeGreaterThan(1.3);
    expect(r.teams.get(4).defence).toBeGreaterThan(1.2);
    expect(r.teams.get(1).defence).toBeLessThan(0.8);
  });

  it('forecasts a sensible game: chances add up and the favourite is favoured', () => {
    const f = forecast(next, ratings(season), DEFAULT_SETTINGS);
    const { home, draw, away } = f.chances;
    expect(home + draw + away).toBeCloseTo(1, 6);
    expect(home).toBeGreaterThan(0.6);
    expect(f.xg.home).toBeGreaterThan(f.xg.away);
    expect(f.pick.home).toBeGreaterThan(f.pick.away);
    expect(f.top).toHaveLength(3);
  });

  it('home advantage moves expected goals towards the home side', () => {
    const r = ratings(season);
    const even = forecast(g(2, 3, 0, 0, 'upcoming'), r, { form: 0.5, home: 1 });
    const strong = forecast(g(2, 3, 0, 0, 'upcoming'), r, { form: 0.5, home: 1.6 });
    expect(strong.chances.home).toBeGreaterThan(even.chances.home);
    expect(strong.xg.away).toBeLessThan(even.xg.away);
  });

  it('recent form weights the latest games more', () => {
    // Team 9 lost its first 6 heavily, then won its last 3 well.
    const games = [];
    for (let i = 0; i < 6; i++) games.push(g(9, 8, 0, 3));
    for (let i = 0; i < 3; i++) games.push(g(9, 8, 3, 0));
    const season0 = ratings(games, { form: 0 }).teams.get(9).attack;
    const recent = ratings(games, { form: 1 }).teams.get(9).attack;
    expect(recent).toBeGreaterThan(season0);
  });

  it('starts every team near average with no games', () => {
    const f = forecast(g(5, 6, 0, 0, 'upcoming'), ratings([]), { form: 0.5, home: 1 });
    expect(f.chances.home).toBeCloseTo(f.chances.away, 6);
  });

  it('back-tests without peeking at the result', () => {
    const r1 = backtest(season, DEFAULT_SETTINGS);
    // Change only the last game's score: earlier predictions must not change.
    const changed = season.map((m, i) => (i === season.length - 1 ? { ...m, score: { home: 7, away: 0 } } : m));
    const r2 = backtest(changed, DEFAULT_SETTINGS);
    const strip = (r) => r.rows.slice(0).reverse().map((x) => x.model);
    expect(strip(r2)).toEqual(strip(r1));
    expect(r1.totals.games).toBe(season.length);
  });

  it('scores you and the model the same way as the game', () => {
    expect(pickPoints({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(3);
    expect(pickPoints({ home: 1, away: 0 }, { home: 3, away: 1 })).toBe(1);
    expect(pickPoints({ home: 1, away: 1 }, { home: 0, away: 2 })).toBe(0);
    const mine = { [season[0].id]: { home: 3, away: 0 }, [season[1].id]: { home: 2, away: 0 } };
    const r = backtest(season, DEFAULT_SETTINGS, mine);
    expect(r.totals).toMatchObject({ picked: 2, you: 3, youExact: 1 });
  });

  it('keeps settings in range', () => {
    expect(clampSettings({ form: 5, home: 0 })).toEqual({ form: 1, home: 1 });
    expect(clampSettings({ form: 'x' })).toEqual(DEFAULT_SETTINGS);
  });
});
