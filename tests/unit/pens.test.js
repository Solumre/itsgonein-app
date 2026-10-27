import { describe, it, expect } from 'vitest';
import { shotResult, saveResult, tally } from '../../server/pens.js';

const G = { result: 'goal' }, S = { result: 'saved' }, M = { result: 'miss' };

describe('shotResult and saveResult', () => {
  it('scores your shot unless it goes over or the keeper guesses right', () => {
    expect(shotResult({ col: 0, row: 1 }, 2, false)).toBe('goal');
    expect(shotResult({ col: 0, row: 1 }, 0, true)).toBe('saved'); // low and the keeper went that way
    expect(shotResult({ col: 0, row: 0 }, 0, true)).toBe('goal'); // top corner beats him
    expect(shotResult({ col: 0, row: 0 }, 0, false)).toBe('saved');
    expect(shotResult({ col: 1, row: 0 }, 1, true)).toBe('saved'); // straight down the middle, top or not
    expect(shotResult({ col: 2, row: 0, over: true }, 0, true)).toBe('miss');
  });
  it('saves their shot when you dive the right way', () => {
    expect(saveResult(1, { col: 1, row: 1 })).toBe('saved');
    expect(saveResult(0, { col: 1, row: 1 })).toBe('goal');
    expect(saveResult(2, { col: 2, row: 0, beatsKeeper: true })).toBe('goal');
    expect(saveResult(2, { col: 2, row: 0, beatsKeeper: false })).toBe('saved');
    expect(saveResult(0, { col: 1, row: 1, off: true })).toBe('miss');
  });
});

describe('tally', () => {
  it('alternates your kick and their kick', () => {
    expect(tally([]).next).toBe('shoot');
    expect(tally([G]).next).toBe('save');
    expect(tally([G, S])).toMatchObject({ you: 1, cpu: 0, saves: 1, done: false, next: 'shoot' });
  });
  it('ends early when one side can\'t catch up', () => {
    // you 3, they 0 after three each: they can get 2 more at most
    expect(tally([G, S, G, S, G, S])).toMatchObject({ done: true, result: 'won', points: 6 });
    // you 0 after 3, they 3 after 3: you can reach 2
    expect(tally([S, G, S, G, S, G])).toMatchObject({ done: true, result: 'lost' });
    expect(tally([G, G, G, G])).toMatchObject({ done: false });
  });
  it('goes to sudden death when level after five each', () => {
    const level = [G, G, S, S, G, G, M, M, G, G]; // 3-3
    expect(tally(level)).toMatchObject({ you: 3, cpu: 3, done: false });
    expect(tally([...level, G])).toMatchObject({ done: false }); // they still get to reply
    expect(tally([...level, G, S])).toMatchObject({ done: true, result: 'won', you: 4, cpu: 3 });
    expect(tally([...level, G, G])).toMatchObject({ done: false });
  });
  it('calls it a draw after ten rounds each', () => {
    const kicks = Array.from({ length: 20 }, () => G);
    expect(tally(kicks)).toMatchObject({ done: true, result: 'draw', points: 10 });
  });
});
