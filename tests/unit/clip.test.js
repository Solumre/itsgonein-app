import { describe, it, expect } from 'vitest';
import { clip, checkText } from '../../server/moderation.js';

describe('emoji in text', () => {
  it('cuts to a length without breaking an emoji', () => {
    expect(clip('GOAL ⚽⚽', 6)).toBe('GOAL ⚽'); // ⚽ is 1 unit
    expect(clip('Win 🏆🏆', 6)).toBe('Win 🏆'); // 🏆 is 2 units: the second doesn't fit
    expect(clip('🏴󠁧󠁢󠁥󠁮󠁧󠁿 come on', 5)).toBe(''); // a whole flag or nothing
    expect(clip('short', 140)).toBe('short');
  });
  it('lets emoji through the chat filter', () => {
    expect(checkText('What a goal 🔥🔥 😱')).toEqual({ ok: true, text: 'What a goal 🔥🔥 😱' });
  });
});
