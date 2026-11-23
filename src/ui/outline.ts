import type { Week } from '../types';

interface Item {
  id: string;
  level: 1 | 2;
  label: string;
  cards: string[];
}

/**
 * Folio's outline: a quiet column of short dashes at the reading pane's right edge (one per part and section) that
 * opens into the list on hover, tracking the section in view. Two additions: a section whose questions you can all
 * answer cold turns green, and on touch screens a tap on the rail opens the list.
 */
export class Outline {
  private items: Item[] = [];
  private frame = 0;
  private rail: HTMLElement;
  private list: HTMLElement;

  constructor(
    private nav: HTMLElement,
    private scroller: HTMLElement,
    private onJump: (id: string) => void,
  ) {
    this.rail = nav.querySelector('.toc-rail')!;
    this.list = nav.querySelector('.toc-list')!;
    scroller.addEventListener(
      'scroll',
      () => {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.updateActive());
      },
      { passive: true },
    );
    this.list.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-id]');
      if (!a) return;
      e.preventDefault();
      this.nav.classList.remove('open');
      this.onJump(a.dataset.id!);
    });
    this.rail.addEventListener('click', () => this.nav.classList.toggle('open'));
    document.addEventListener('pointerdown', (e) => {
      if (!this.nav.contains(e.target as Node)) this.nav.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.nav.classList.remove('open');
    });
  }

  setWeek(week: Week) {
    this.items = [];
    for (const p of week.parts) {
      this.items.push({ id: p.id, level: 1, label: p.title, cards: p.sections.flatMap((s) => s.cards) });
      for (const s of p.sections) {
        if (s.num || s.cards.length) this.items.push({ id: s.id, level: 2, label: s.label, cards: s.cards });
      }
    }
    this.list.replaceChildren(
      ...this.items.map((it) => {
        const li = document.createElement('li');
        li.className = `l${it.level}`;
        const a = document.createElement('a');
        a.href = `#${it.id}`;
        a.dataset.id = it.id;
        a.title = it.label;
        const text = document.createElement('span');
        text.textContent = it.label;
        a.append(text);
        if (it.cards.length) {
          const cnt = document.createElement('span');
          cnt.className = 'cnt';
          a.append(cnt);
        }
        li.append(a);
        return li;
      }),
    );
    this.rail.replaceChildren(
      ...this.items.map((it, i) => {
        const s = document.createElement('span');
        s.className = `l${it.level}`;
        s.dataset.index = String(i);
        return s;
      }),
    );
    this.updateActive();
  }

  /** `cold(ids)` = how many of these questions are answered cold. */
  setProgress(cold: (ids: string[]) => number) {
    const links = this.list.querySelectorAll<HTMLElement>('a');
    const dashes = this.rail.children;
    this.items.forEach((it, i) => {
      if (!it.cards.length) return;
      const k = cold(it.cards);
      const done = k === it.cards.length;
      const cnt = links[i]?.querySelector('.cnt');
      if (cnt) cnt.textContent = `${k}/${it.cards.length}`;
      links[i]?.parentElement?.classList.toggle('done', done);
      dashes[i]?.classList.toggle('done', done);
    });
  }

  set visible(on: boolean) {
    this.nav.hidden = !on;
  }

  updateActive() {
    if (this.nav.hidden || !this.items.length) return;
    const s = this.scroller;
    if (!s.offsetParent) return; // pane hidden (Practice view)
    const y = s.getBoundingClientRect().top + 96;
    let active = -1;
    if (s.scrollTop + s.clientHeight >= s.scrollHeight - 4) active = this.items.length - 1;
    else {
      // Walk every section element in reading order; map intro sections without a list entry to their part.
      for (let i = 0; i < this.items.length; i++) {
        const el = document.getElementById(this.items[i].id);
        if (el && el.getBoundingClientRect().top <= y) active = i;
        else if (el) break;
      }
    }
    this.list.querySelectorAll('a').forEach((a, i) => a.classList.toggle('active', i === active));
    for (const span of this.rail.children) span.classList.toggle('active', Number((span as HTMLElement).dataset.index) === active);
  }
}
