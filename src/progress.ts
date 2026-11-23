/* Practice state: grades per question and the current pass. Pure functions (no DOM, no storage) so they are tested
   directly. Same rules as the Cram Cards deck: a missed card comes back 6–9 cards later, once per pass; the next
   pass puts missed and notebook cards earlier. */
import type { Card, Kit } from './types';

export type Grade = 'cold' | 'missed';
export type Mode = 'all' | 'part';
export type Seq = 'shuffle' | 'kit';

export interface Pass {
  n: number;
  mode: Mode;
  parts: string[]; // section ids, plus "notebook"
  seq: Seq;
  order: string[];
  pos: number;
  retried: string[];
  results: Record<string, Grade>;
}
export interface Progress {
  v: 1;
  passCount: number;
  history: Record<string, Grade>;
  pass: Pass | null;
  updatedAt: number;
}
export interface PassConfig {
  mode: Mode;
  parts?: string[];
  seq?: Seq;
}

export const NOTEBOOK = 'notebook';
const W_LAST: Record<Grade, number> = { missed: 3, cold: 1 };

export const fresh = (): Progress => ({ v: 1, passCount: 0, history: {}, pass: null, updatedAt: 0 });

export function inParts(c: Card, parts: string[]): boolean {
  return parts.includes(c.sec) || (parts.includes(NOTEBOOK) && c.nb);
}

export function passCards(kit: Kit, p: Pick<Pass, 'mode' | 'parts'> | null): Card[] {
  return p && p.mode === 'part' ? kit.cards.filter((c) => inParts(c, p.parts)) : kit.cards;
}

/** Weighted shuffle (missed ×3, notebook ×2), then spread so two cards of one section rarely sit together. */
export function buildOrder(history: Record<string, Grade>, cards: Card[], seq: Seq, rand = Math.random): string[] {
  if (seq === 'kit') return cards.map((c) => c.id);
  const order = cards
    .map((c) => ({ c, key: -Math.log(1 - rand()) / ((W_LAST[history[c.id]] ?? 1) * (c.nb ? 2 : 1)) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.c);
  for (let i = 1; i < order.length; i++) {
    if (order[i].sec !== order[i - 1].sec) continue;
    const j = order.findIndex((c, k) => k > i && c.sec !== order[i - 1].sec);
    if (j !== -1) [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((c) => c.id);
}

/** Starts a new pass; with no config it repeats the current pass's setup. */
export function newPass(kit: Kit, s: Progress, cfg?: PassConfig, rand = Math.random): Progress {
  const prev = s.pass;
  const want = cfg ?? { mode: prev?.mode ?? 'all', parts: prev?.parts ?? [], seq: prev?.seq };
  const secIds = new Set(kit.weeks.flatMap((w) => w.parts.flatMap((p) => p.sections.map((x) => x.id))));
  const parts = (want.parts ?? []).filter((a) => a === NOTEBOOK || secIds.has(a));
  const usable = want.mode === 'part' && parts.length > 0 && kit.cards.some((c) => inParts(c, parts));
  const mode: Mode = usable ? 'part' : 'all';
  const seq: Seq = usable && want.seq === 'kit' ? 'kit' : 'shuffle';
  const n = s.passCount + 1;
  const pass: Pass = {
    n,
    mode,
    parts: usable ? parts : [],
    seq,
    order: buildOrder(s.history, passCards(kit, { mode, parts }), seq, rand),
    pos: 0,
    retried: [],
    results: {},
  };
  return { ...s, passCount: n, pass };
}

export function current(s: Progress): string | null {
  const p = s.pass;
  return p && p.pos < p.order.length ? p.order[p.pos] : null;
}

export function grade(s: Progress, g: Grade, rand = Math.random): Progress {
  const p = s.pass;
  const id = current(s);
  if (!p || !id) return s;
  const order = [...p.order];
  const retried = [...p.retried];
  if (g === 'missed' && !retried.includes(id)) {
    retried.push(id);
    const at = Math.min(order.length, p.pos + 1 + 5 + Math.floor(rand() * 4));
    order.splice(at, 0, id);
  }
  return {
    ...s,
    history: { ...s.history, [id]: g },
    pass: { ...p, order, retried, pos: p.pos + 1, results: { ...p.results, [id]: g } },
  };
}

export function tallies(s: Progress): Record<Grade, number> {
  const t = { cold: 0, missed: 0 };
  for (const g of Object.values(s.pass?.results ?? {})) t[g]++;
  return t;
}

export function isValid(x: unknown): x is Progress {
  const s = x as Progress;
  return !!s && s.v === 1 && typeof s.history === 'object' && s.history !== null && (!s.pass || Array.isArray(s.pass.order));
}

/** Drops grades for questions that no longer exist; a pass that refers to one is discarded. */
export function clean(kit: Kit, s: Progress): Progress {
  const ids = new Set(kit.cards.map((c) => c.id));
  const history = Object.fromEntries(Object.entries(s.history).filter(([id, g]) => ids.has(id) && (g === 'cold' || g === 'missed')));
  const pass = s.pass && s.pass.order.every((id) => ids.has(id)) ? s.pass : null;
  return { ...s, history, pass };
}

/** Import: keep the newer grade-set, never lose a cold answer from either side. */
export function merge(local: Progress, incoming: Progress): Progress {
  const newer = incoming.updatedAt > local.updatedAt ? incoming : local;
  const older = newer === incoming ? local : incoming;
  const history = { ...older.history, ...newer.history };
  for (const [id, g] of Object.entries(older.history)) if (g === 'cold' && !newer.history[id]) history[id] = g;
  return { ...newer, history, passCount: Math.max(local.passCount, incoming.passCount) };
}
