// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderKit } from '../src/build/render-kit';
import { renderWeek, chainHtml } from '../src/read-view';
import type { RawKit } from '../src/types';

const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'src/content/kit.json'), 'utf8')) as RawKit;

describe('content', () => {
  it('maps every card to a section that lists it', async () => {
    const secs = new Map(raw.weeks.flatMap((w) => w.parts.flatMap((p) => p.sections.map((s) => [s.id, s] as const))));
    for (const c of raw.cards) expect(secs.get(c.sec)?.cards).toContain(c.id);
    expect(new Set(raw.cards.map((c) => c.id)).size).toBe(raw.cards.length);
  });
});

describe('build-time rendering', () => {
  it('renders markdown, highlights Go, and keeps inline code in questions', async () => {
    const kit = await renderKit(raw);
    const all = kit.weeks.flatMap((w) => w.parts.flatMap((p) => p.sections.map((s) => s.html))).join('\n');
    expect(all).toContain('<div class="code-block"><div class="code-head"><span class="code-lang">go</span>');
    expect(all).toContain('class="shiki');
    expect(all).not.toMatch(/\*\*\w/); // no stray bold markers
    expect(kit.cards.some((c) => c.q.includes('<code>'))).toBe(true);
  }, 30000);

  it('renders a week with one question block per section that has questions', async () => {
    const kit = await renderKit(raw);
    const w = kit.weeks[0];
    const html = renderWeek(kit, w);
    const withCards = w.parts.flatMap((p) => p.sections).filter((s) => s.cards.length).length;
    expect(html.match(/class="qs"/g)?.length).toBe(withCards);
    expect(html.match(/<details class="q"/g)?.length).toBe(kit.cards.filter((c) => c.week === w.num).length);
  }, 30000);

  it('escapes chains and marks the arrows', () => {
    expect(chainHtml('a < b → c · d')).toBe('a &lt; b <span class="ar">→</span> c <span class="ar">·</span> d');
  });
});
