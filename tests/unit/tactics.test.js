import { describe, it, expect } from 'vitest';
import { FORMATIONS, autoFill, compareXI, cleanBoard, posGroup, slotGroup } from '../../src/lib/tactics.js';

const squad = [
  ['Raya', 'Goalkeeper'], ['Arrizabalaga', 'Goalkeeper'], ['Saliba', 'Centre-Back'], ['Gabriel', 'Defence'], ['White', 'Right-Back'],
  ['Timber', 'Defence'], ['Calafiori', 'Left-Back'], ['Rice', 'Defensive Midfield'], ['Ødegaard', 'Attacking Midfield'], ['Zubimendi', 'Midfield'],
  ['Merino', 'Central Midfield'], ['Saka', 'Right Winger'], ['Gyökeres', 'Centre-Forward'], ['Martinelli', 'Left Winger'], ['Trossard', 'Offence'],
].map(([name, position]) => ({ name, position }));

describe('tactics', () => {
  it('every formation has 11 spots with a keeper first', () => {
    for (const [name, spots] of Object.entries(FORMATIONS)) {
      expect(spots, name).toHaveLength(11);
      expect(slotGroup(spots[0][1], 0)).toBe('GK');
      const [d, mi, f] = name.split('-').map(Number);
      expect(spots.filter(([, y], i) => i > 0 && slotGroup(y, i) === 'DEF')).toHaveLength(d);
      expect(d + mi + (f || 0) + (name.split('-')[3] ? Number(name.split('-')[3]) : 0)).toBe(10);
    }
  });
  it('reads football-data positions', () => {
    expect(['Goalkeeper', 'Centre-Back', 'Defence', 'Defensive Midfield', 'Left Winger', 'Offence', 'Centre-Forward', null].map(posGroup))
      .toEqual(['GK', 'DEF', 'DEF', 'MID', 'FWD', 'FWD', 'FWD', null]);
  });
  it('auto-fills keepers in goal and defenders at the back', () => {
    const p = autoFill('4-3-3', squad);
    expect(p[0].name).toBe('Raya');
    expect(p.slice(1, 5).map((x) => x.name)).toEqual(['Saliba', 'Gabriel', 'White', 'Timber']);
    expect(new Set(p.map((x) => x.name)).size).toBe(11);
  });
  it('checks a predicted XI against the real one', () => {
    const board = { formation: '4-3-3', players: autoFill('4-3-3', squad).map(({ name, x, y }) => ({ name, x, y })) };
    const real = { formation: '4-3-3', starting: ['Raya', 'Saliba', 'Gabriel', 'White', 'Calafiori', 'Rice', 'Odegaard', 'Zubimendi', 'Saka', 'Gyökeres', 'Martinelli'].map((name) => ({ name })) };
    const c = compareXI(board, real);
    expect(c.correct).toBe(10); // Timber missed; Ødegaard matches "Odegaard"
    expect(c.formationRight).toBe(true);
    expect(compareXI(board, { formation: null, starting: [] })).toBeNull();
  });
  it('only accepts squad players, once each, on the pitch', () => {
    const names = squad.map((p) => p.name);
    const players = autoFill('4-4-2', squad).map(({ name, x, y }) => ({ name, x, y }));
    expect(cleanBoard({ formation: '4-4-2', players, arrows: [{ kind: 'run', x1: -5, y1: 10, x2: 50, y2: 300 }] }, names).board.arrows[0]).toEqual({ kind: 'run', x1: 0, y1: 10, x2: 50, y2: 100 });
    expect(cleanBoard({ formation: '9-9-9', players }, names).error).toBeTruthy();
    expect(cleanBoard({ formation: '4-4-2', players: players.slice(0, 10) }, names).error).toBe('A team needs 11 players.');
    expect(cleanBoard({ formation: '4-4-2', players: [{ name: 'Messi', x: 1, y: 1 }, ...players.slice(1)] }, names).error).toMatch(/squad/);
    expect(cleanBoard({ formation: '4-4-2', players: [players[1], ...players.slice(1)] }, names).error).toMatch(/twice/);
    expect(cleanBoard({ formation: '4-4-2', players: [{ name: null, x: 50, y: 5 }, ...players.slice(1)] }, names).board.players[0].name).toBeNull();
  });
});
