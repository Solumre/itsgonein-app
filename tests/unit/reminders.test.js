import { describe, it, expect } from 'vitest';
import { dueSlots, reminderText, LEAD_MS } from '../../server/reminders.js';

const now = Date.parse('2026-11-07T14:00:00Z');
const m = (id, mins, status = 'upcoming', home = 'ARS', away = 'CHE') => ({
  id, status, kickoff: new Date(now + mins * 60_000).toISOString(),
  home: { name: home, tla: home }, away: { name: away, tla: away },
});

describe('dueSlots', () => {
  it('groups games by kickoff time inside the next hour', () => {
    const slots = dueSlots([m('a', 59), m('b', 59), m('c', 30), m('d', 61), m('e', -5), m('f', 20, 'postponed')], now);
    expect(slots.map((s) => s.matches.map((x) => x.id))).toEqual([['c'], ['a', 'b']]);
    expect(slots[0].key).toBe(`ko_${now + 30 * 60_000}`);
  });
  it('uses a one hour lead', () => { expect(LEAD_MS).toBe(3_600_000); });
});

describe('reminderText', () => {
  it('names a single game with UK time', () => {
    const t = reminderText([m('a', 60, 'upcoming', 'Arsenal', 'Chelsea')], now + 3_600_000);
    expect(t.title).toBe('⏰ Arsenal v Chelsea kicks off at 15:00');
  });
  it('counts several games', () => {
    const t = reminderText([m('a', 60), m('b', 60, 'upcoming', 'LIV', 'EVE')], now + 3_600_000);
    expect(t.title).toBe('⏰ 2 games kick off at 15:00');
    expect(t.body).toContain('ARS v CHE, LIV v EVE');
  });
});
