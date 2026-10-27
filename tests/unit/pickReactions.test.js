import { describe, it, expect } from 'vitest';
import { reactionText, visible } from '../../server/pickReactions.js';

describe('pick reactions', () => {
  const m = { home: { tla: 'CHE' }, away: { tla: 'MUN' } };
  it('words the chat line', () => {
    expect(reactionText('😂', 'Amy', 'Seb', { home: 4, away: 0 }, m)).toBe("😂 Amy laughed at Seb's 4-0 pick for CHE v MUN");
    expect(reactionText('🎯', 'Amy', 'Chris', { home: 1, away: 1 }, m)).toBe("🎯 Amy says Chris' 1-1 pick for CHE v MUN is spot on");
  });
  it('counts only the viewer\'s mates, in a fixed order', () => {
    const r = { '😂': ['a', 'x'], '🔥': ['me', 'a'], '👀': ['x'] };
    expect(visible(r, new Set(['a', 'me']), 'me')).toEqual([{ emoji: '🔥', count: 2, mine: true }, { emoji: '😂', count: 1, mine: false }]);
  });
});
