import { describe, expect, it } from 'vitest';
import * as P from '../src/progress';
import type { Card, Kit } from '../src/types';

const card = (id: string, sec: string, nb = false): Card => ({
  id, sec, week: 1, q: id, term: id, k: 'a → b', level: 'core', keys: [], wrong: [], follow: [], answer: '', nb,
});
const kit: Kit = {
  exported: '2026-11-18',
  weeks: [{
    num: 1, theme: 't', dates: 'd',
    parts: [{ id: 'w1-p1', num: 1, title: 'Part', sections: [
      { id: 'w1-p1-s1', num: 1, title: 'A', label: 'A', html: '', cards: ['a1', 'a2', 'a3'] },
      { id: 'w1-p1-s2', num: 2, title: 'B', label: 'B', html: '', cards: ['b1', 'b2'] },
    ] }],
  }],
  cards: [card('a1', 'w1-p1-s1'), card('a2', 'w1-p1-s1', true), card('a3', 'w1-p1-s1'), card('b1', 'w1-p1-s2'), card('b2', 'w1-p1-s2')],
};
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('passes', () => {
  it('starts with every card in shuffle mode', () => {
    const s = P.newPass(kit, P.fresh(), undefined, seq(0.1, 0.5, 0.9, 0.3, 0.7));
    expect(s.pass!.mode).toBe('all');
    expect([...s.pass!.order].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
    expect(s.passCount).toBe(1);
  });

  it('limits a part pass to the picked sections, plus the notebook when picked', () => {
    let s = P.newPass(kit, P.fresh(), { mode: 'part', parts: ['w1-p1-s2'], seq: 'kit' });
    expect(s.pass!.order).toEqual(['b1', 'b2']);
    s = P.newPass(kit, s, { mode: 'part', parts: [P.NOTEBOOK, 'w1-p1-s2'], seq: 'kit' });
    expect(s.pass!.order).toEqual(['a2', 'b1', 'b2']);
  });

  it('falls back to all cards when the picked parts no longer exist', () => {
    const s = P.newPass(kit, P.fresh(), { mode: 'part', parts: ['gone'] });
    expect(s.pass!.mode).toBe('all');
    expect(s.pass!.order).toHaveLength(5);
  });

  it('brings a missed card back later in the same pass, once', () => {
    let s = P.newPass(kit, P.fresh(), { mode: 'all' }, () => 0.5);
    s = { ...s, pass: { ...s.pass!, order: ['a1', 'a2', 'a3', 'b1', 'b2'] } };
    s = P.grade(s, 'missed', () => 0);
    expect(s.history.a1).toBe('missed');
    expect(s.pass!.order.filter((x) => x === 'a1')).toHaveLength(2);
    expect(s.pass!.pos).toBe(1);
    // the retry, graded missed again, is not queued a third time
    while (P.current(s) && P.current(s) !== 'a1') s = P.grade(s, 'cold');
    s = P.grade(s, 'missed', () => 0);
    expect(s.pass!.order.filter((x) => x === 'a1')).toHaveLength(2);
    expect(P.tallies(s)).toEqual({ cold: 4, missed: 1 });
  });

  it('keeps reading order when asked', () => {
    const s = P.newPass(kit, P.fresh(), { mode: 'part', parts: ['w1-p1-s1', 'w1-p1-s2'], seq: 'kit' });
    expect(s.pass!.order).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  });
});

describe('storage safety', () => {
  it('validates and cleans stored progress', () => {
    expect(P.isValid(null)).toBe(false);
    expect(P.isValid({ v: 2 })).toBe(false);
    const dirty: P.Progress = { ...P.fresh(), history: { a1: 'cold', gone: 'cold' }, pass: { n: 1, mode: 'all', parts: [], seq: 'shuffle', order: ['a1', 'gone'], pos: 0, retried: [], results: {} } };
    const c = P.clean(kit, dirty);
    expect(c.history).toEqual({ a1: 'cold' });
    expect(c.pass).toBeNull();
  });

  it('merges an import without losing cold answers from either side', () => {
    const local: P.Progress = { ...P.fresh(), history: { a1: 'cold', b1: 'missed' }, updatedAt: 10, passCount: 2 };
    const incoming: P.Progress = { ...P.fresh(), history: { b1: 'cold', a2: 'missed' }, updatedAt: 20, passCount: 5 };
    const m = P.merge(local, incoming);
    expect(m.history).toEqual({ a1: 'cold', b1: 'cold', a2: 'missed' });
    expect(m.passCount).toBe(5);
  });
});
