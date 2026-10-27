import { describe, it, expect } from 'vitest';
import { bonusQuestions, scoreBonus, validBonusAnswer } from '../../src/lib/game.js';

const team = (tla) => ({ tla, name: tla });
const g = (id, h, a, status = 'finished') => ({ id, matchday: 10, status, home: team(`H${id}`), away: team(`A${id}`), score: status === 'finished' ? { home: h, away: a } : null });
const gw = [g('1', 2, 1), g('2', 0, 0), g('3', 3, 2), g('4', 1, 4), g('5', 0, 0, 'postponed')];

describe('bonusQuestions', () => {
  it('builds three questions, plus a custom one, and leaves out postponed games', () => {
    const qs = bonusQuestions(10, gw, { question: 'First scorer?', options: [{ id: 'o1', label: 'Saka' }, { id: 'o2', label: 'Son' }] });
    expect(qs.map((q) => q.id)).toEqual(['goals', 'goalfest', 'nil', 'custom']);
    expect(qs[1].options.map((o) => o.id)).toEqual(['1', '2', '3', '4']);
    expect(validBonusAnswer(qs[0], 30)).toBe(true);
    expect(validBonusAnswer(qs[0], 61)).toBe(false);
    expect(validBonusAnswer(qs[0], 2.5)).toBe(false);
    expect(validBonusAnswer(qs[1], '5')).toBe(false);
    expect(validBonusAnswer(qs[3], 'o2')).toBe(true);
  });
});

describe('scoreBonus', () => {
  it('waits for the gameweek to finish', () => {
    expect(scoreBonus({}, [g('1', 1, 0), g('2', 0, 0, 'live')])).toBe(null);
  });
  it('scores every question', () => {
    // 13 goals; games 3 and 4 tie on 5; there was a 0-0
    const r = scoreBonus({ goals: 13, goalfest: '4', nil: 'yes', custom: 'o1' }, gw, { question: 'q', answer: 'o1' });
    expect(r.correct).toEqual({ goals: 13, goalfest: ['3', '4'], nil: 'yes', custom: 'o1' });
    expect(r.points).toEqual({ goals: 3, goalfest: 2, nil: 1, custom: 2 });
    expect(r.total).toBe(8);
  });
  it('gives 1 point within two goals, and nothing for wrong or missing answers', () => {
    const r = scoreBonus({ goals: 11, goalfest: '1', nil: 'no' }, gw, { question: 'q', answer: null });
    expect(r.points).toEqual({ goals: 1, goalfest: 0, nil: 0, custom: 0 });
    expect(r.customPending).toBe(true);
    expect(scoreBonus({ goals: 10 }, gw).total).toBe(0);
  });
});
