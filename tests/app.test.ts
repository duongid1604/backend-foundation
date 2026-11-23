// Boots the real app (index.html + main.ts + the virtual kit module) in jsdom and drives it like a user would.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const key = (k: string, init: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));

beforeAll(async () => {
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.scrollTo = function () {} as never;
  Element.prototype.scrollIntoView = function () {} as never;
  localStorage.clear();
  await import('../src/main');
});

describe('app', () => {
  it('renders week 1 with its questions and the outline', () => {
    expect($('#read').querySelectorAll('details.q').length).toBe(42);
    expect($('#toc').querySelectorAll('.toc-list a').length).toBeGreaterThan(10);
    expect($('#week-theme').textContent).toContain('network');
    expect($('#stat-cold').textContent).toBe('0 of 42 cold');
  });

  it('puts the question list above the reading by default and moves it from the menu', () => {
    const list = () => $('#read').querySelector<HTMLElement>('.sec .qs')!;
    const isFirst = () => list().previousElementSibling === null || list().previousElementSibling!.matches('.sec-title');
    expect($('#read').querySelectorAll('.qs[data-pos="top"]').length).toBeGreaterThan(0);
    expect($('#read').querySelectorAll('.qs[data-pos="end"]').length).toBe(0);
    expect(isFirst()).toBe(true);
    $('#menu-btn').click();
    $('#menu [data-action="toggle-qfirst"]').click();
    expect(isFirst()).toBe(false);
    expect(list().nextElementSibling).toBeNull();
    expect($('#read').querySelectorAll('details.q').length).toBe(42); // moved, not duplicated
    expect(JSON.parse(localStorage.getItem('bf:settings')!).qfirst).toBe(false);
    $('#menu-btn').click();
    $('#menu [data-action="toggle-qfirst"]').click();
    expect(isFirst()).toBe(true);
  });

  it('ticks a question cold from the Read view', () => {
    const box = $<HTMLInputElement>('#read [data-got]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#stat-cold').textContent).toBe('1 of 42 cold');
    expect(JSON.parse(localStorage.getItem('bf:progress')!).history[box.dataset.got!]).toBe('cold');
  });

  it("has Folio's page width grips; double-click resets the width", () => {
    const grips = document.querySelectorAll('.page-handle');
    expect(grips.length).toBe(2);
    document.documentElement.style.setProperty('--prose-width', '900px');
    grips[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(document.documentElement.style.getPropertyValue('--prose-width')).toBe('70ch');
    expect(JSON.parse(localStorage.getItem('bf:settings')!).width).toBeNull();
  });

  it('switches weeks from the week menu', () => {
    $('#week-btn').click();
    $('#week-menu [data-action="week-3"]').click();
    expect($('#week-num').textContent).toBe('Week 3');
    expect($('#read').innerHTML).toContain('Isolation');
  });

  it('practises: flip, grade, reread in the sheet, undo', () => {
    $('[data-view-btn="practice"]').click();
    expect(document.documentElement.dataset.view).toBe('practice');
    expect($('#card')).toBeTruthy();
    key(' ');
    expect($('.card-back')).toBeTruthy();
    $<HTMLButtonElement>('[data-reread]').click();
    expect($('#sheet').hidden).toBe(false);
    expect($('#sheet-body').innerHTML.length).toBeGreaterThan(100);
    key('Escape');
    expect($('#sheet').hidden).toBe(true);
    key('2');
    expect($('#t-cold').textContent).toBe('1 cold');
    key('u');
    expect($('#t-cold').textContent).toBe('0 cold');
  });

  it('picks parts and starts a part pass', () => {
    $('[data-mode="part"]').click();
    expect($('#picker').hidden).toBe(false);
    $('#pick-weeks [data-week="2"]').click();
    $('#parts [data-part]:not([data-part="notebook"])').click();
    $('#pick-start').click();
    // mid-pass with nothing graded: no confirmation needed
    expect($('#mode-note').textContent).toMatch(/cards · shuffled/);
    expect($('#picker').hidden).toBe(true);
  });

  it('opens the command menu and jumps to a question', async () => {
    key('k', { metaKey: true });
    expect($('#palette').hidden).toBe(false);
    const input = $<HTMLInputElement>('#palette-input');
    input.value = 'three-way handshake';
    input.dispatchEvent(new Event('input'));
    expect($('#palette-list').textContent).toContain('three-way handshake');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect($('#palette').hidden).toBe(true);
    expect(document.documentElement.dataset.view).toBeUndefined();
    expect($('#week-num').textContent).toBe('Week 1');
    await new Promise((r) => setTimeout(r, 50)); // the jump opens the question on the next frame
    expect($<HTMLDetailsElement>('details.q[data-id="net-tcp-handshake"]').open).toBe(true);
  });
});
