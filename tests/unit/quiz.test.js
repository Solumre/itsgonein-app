import { describe, it, expect } from 'vitest';
import { buildQuiz, quizStreak, quizDate, TRIVIA, QUIZ_LENGTH } from '../../server/quiz.js';

const now = Date.parse('2026-10-31T18:00:00Z');
const team = (id, name) => ({ id, name, tla: name.slice(0, 3).toUpperCase(), crest: `https://crests.example/${id}.png` });
const teams = Array.from({ length: 20 }, (_, i) => team(i + 1, `Club ${String.fromCharCode(65 + i)}`));
const table = teams.map((t, i) => ({ position: i + 1, team: t, points: 40 - i * 2 }));
const matches = [{ id: 'm1', status: 'finished', kickoff: '2026-10-29T19:45:00Z', home: teams[0], away: teams[1], score: { home: 2, away: 1 } }];
const scorers = [{ name: 'Erling Haaland', team: teams[2], goals: 11 }, { name: 'Bukayo Saka', team: teams[0], goals: 6 }];
const data = { matches, table, scorers, teams };

describe('buildQuiz', () => {
  it('makes five questions, each with four different options and one right answer', () => {
    const qs = buildQuiz('2026-10-31', data, now);
    expect(qs).toHaveLength(QUIZ_LENGTH);
    for (const q of qs) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
    expect(qs.map((q) => q.n)).toEqual([0, 1, 2, 3, 4]);
  });

  it('uses the real data: last results, the table and scorers or badges', () => {
    const qs = buildQuiz('2026-10-31', data, now);
    const kinds = qs.map((q) => q.kind);
    expect(kinds).toContain('result');
    expect(kinds).toContain('table');
    expect(kinds.filter((k) => k === 'scorer' || k === 'crest')).toHaveLength(1);
    const res = qs.find((q) => q.kind === 'result');
    expect(res.options[res.answer]).toBe('2–1');
    const tab = qs.find((q) => q.kind === 'table');
    const pos = tab.text.includes('top') ? 1 : tab.text.includes('bottom') ? 20 : parseInt(tab.text.match(/(\d+)/)[1], 10);
    expect(tab.options[tab.answer]).toBe(table[pos - 1].team.name);
  });

  it('is the same all day and different the next day', () => {
    expect(buildQuiz('2026-10-31', data, now)).toEqual(buildQuiz('2026-10-31', data, now));
    expect(buildQuiz('2026-11-01', data, now).map((q) => q.text)).not.toEqual(buildQuiz('2026-10-31', data, now).map((q) => q.text));
  });

  it('falls back to the fact bank when there is no data', () => {
    const qs = buildQuiz('2026-10-31', {}, now);
    expect(qs.every((q) => q.kind === 'trivia')).toBe(true);
    expect(new Set(qs.map((q) => q.text)).size).toBe(5);
  });

  it('skips a table question when the answer is tied on points', () => {
    const tied = table.map((r) => ({ ...r, points: 10 }));
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
      expect(buildQuiz(d, { ...data, table: tied }, now).some((q) => q.kind === 'table')).toBe(false);
    }
  });

  it('has a sound fact bank', () => {
    for (const [text, ...opts] of TRIVIA) {
      expect(text.endsWith('?')).toBe(true);
      expect(new Set(opts).size).toBe(4);
    }
  });
});

describe('quizStreak and quizDate', () => {
  it('counts days in a row, ending today or yesterday', () => {
    expect(quizStreak(['2026-10-29', '2026-10-30', '2026-10-31'], '2026-10-31')).toBe(3);
    expect(quizStreak(['2026-10-29', '2026-10-30'], '2026-10-31')).toBe(2); // not played yet today
    expect(quizStreak(['2026-10-28', '2026-10-30'], '2026-10-31')).toBe(1);
    expect(quizStreak(['2026-10-28'], '2026-10-31')).toBe(0);
    expect(quizStreak(['2026-10-31', '2026-11-01'], '2026-11-01')).toBe(2); // across months
  });
  it('uses the UK date', () => {
    expect(quizDate(Date.parse('2026-07-01T23:30:00Z'))).toBe('2026-07-02'); // BST
    expect(quizDate(Date.parse('2026-12-01T23:30:00Z'))).toBe('2026-12-01'); // GMT
  });
});
