import { describe, it, expect } from 'vitest';
import { openQuestions, outcome, minuteOf, pointsFor } from '../../server/live.js';

const ko = Date.parse('2026-10-31T15:00:00Z');
const m = (minute, home, away, extra = {}) => ({ id: '1', status: 'live', kickoff: new Date(ko).toISOString(), minute, paused: false, half: null, score: { home, away }, ...extra });
const ids = (match) => openQuestions(match).map((q) => q.id);

describe('openQuestions', () => {
  it('asks who scores next and about a first-half goal while it is 0-0', () => {
    expect(ids(m(10, 0, 0))).toEqual(['next_0-0', 'h1']);
    expect(ids(m(36, 0, 0))).toEqual(['next_0-0']); // too late for the first-half one
    expect(ids(m(20, 1, 0))).toEqual(['next_1-0']); // a goal already: no first-half question
  });
  it('asks about a second-half goal until one goes in', () => {
    const half = { home: 1, away: 0 };
    expect(ids(m(60, 1, 0, { half }))).toEqual(['next_1-0', 'h2']);
    expect(ids(m(60, 1, 1, { half }))).toEqual(['next_1-1']);
    expect(ids(m(45, 1, 0, { half, paused: true }))).toEqual(['next_1-0']); // half-time: nothing for halves
    expect(ids(m(86, 1, 0, { half }))).toEqual([]); // closes near the end
  });
  it('asks nothing before kickoff or after full time', () => {
    expect(openQuestions({ ...m(null, null, null), status: 'upcoming', score: null })).toEqual([]);
    expect(openQuestions({ ...m(90, 1, 0), status: 'finished' })).toEqual([]);
  });
});

describe('outcome', () => {
  it('settles "who scores next" from the score', () => {
    expect(outcome('next_1-0', m(50, 1, 0))).toBeNull();
    expect(outcome('next_1-0', m(55, 1, 1))).toBe('away');
    expect(outcome('next_1-0', m(55, 2, 0))).toBe('home');
    expect(outcome('next_1-0', m(55, 2, 1))).toBe('void');
    expect(outcome('next_1-0', { ...m(90, 1, 0), status: 'finished' })).toBe('none');
  });
  it('settles the half questions', () => {
    expect(outcome('h1', m(30, 0, 0))).toBeNull();
    expect(outcome('h1', m(30, 0, 1))).toBe('yes');
    expect(outcome('h1', m(45, 0, 0, { paused: true, half: { home: 0, away: 0 } }))).toBe('no');
    expect(outcome('h1', m(70, 2, 0, { half: { home: 0, away: 0 } }))).toBe('no'); // goals came after the break
    expect(outcome('h2', m(70, 1, 0, { half: { home: 1, away: 0 } }))).toBeNull();
    expect(outcome('h2', m(75, 1, 1, { half: { home: 1, away: 0 } }))).toBe('yes');
    expect(outcome('h2', { ...m(90, 1, 0, { half: { home: 1, away: 0 } }), status: 'finished' })).toBe('no');
  });
  it('voids games that are postponed', () => {
    expect(outcome('next_0-0', { ...m(null, null, null), status: 'postponed', score: null })).toBe('void');
  });
});

describe('minuteOf and pointsFor', () => {
  it('estimates the minute from kickoff when the feed has none', () => {
    expect(minuteOf(m(null, 0, 0), ko + 20 * 60_000)).toBe(21);
    expect(minuteOf(m(null, 0, 0), ko + 50 * 60_000)).toBe(45); // half-time break
    expect(minuteOf(m(null, 0, 0), ko + 80 * 60_000)).toBe(66);
  });
  it('scores right answers only', () => {
    expect(pointsFor('next_0-0', 'home', 'home')).toBe(2);
    expect(pointsFor('h1', 'yes', 'yes')).toBe(1);
    expect(pointsFor('h1', 'yes', 'no')).toBe(0);
    expect(pointsFor('next_0-0', 'home', 'void')).toBe(0);
  });
});
