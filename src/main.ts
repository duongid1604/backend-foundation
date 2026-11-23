import kit from 'virtual:kit';
import { load, save, pageWidthCss, validWidth, type PageWidth, type Settings, type Theme, type View } from './storage';
import { renderWeek, chainHtml, esc, sectionTag } from './read-view';
import * as P from './progress';
import type { Part, Section, Week } from './types';
import { setupMenu } from './ui/menu';
import { createPalette, type Command } from './ui/palette';
import { toast } from './ui/toast';
import { Outline } from './ui/outline';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const root = document.documentElement;
const prefersDark = matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* Content index ---------------------------------------------------------- */

interface SecInfo {
  s: Section;
  part: Part;
  week: Week;
}
const cardById = new Map(kit.cards.map((c) => [c.id, c]));
const secInfo = new Map<string, SecInfo>();
for (const week of kit.weeks) for (const part of week.parts) for (const s of part.sections) secInfo.set(s.id, { s, part, week });
const NB_CARDS = kit.cards.filter((c) => c.nb);
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const tagOf = (id: string) => {
  const x = secInfo.get(id)!;
  return sectionTag(x.week, x.part.num, x.s);
};

/* Settings --------------------------------------------------------------- */

const settings: Settings = { theme: 'system', view: 'read', week: kit.weeks[0].num, serif: false, outline: true, qfirst: true, width: null, ...load<Partial<Settings>>('settings', {}) };
settings.width = validWidth(settings.width);
if (!kit.weeks.some((w) => w.num === settings.week)) settings.week = kit.weeks[0].num;
const persistSettings = () => save('settings', settings);
const currentWeek = () => kit.weeks.find((w) => w.num === settings.week)!;

/* Progress --------------------------------------------------------------- */

const seeds = import.meta.glob<{ default: unknown }>('./content/seed-progress.json', { eager: true });
function initialProgress(): P.Progress {
  const stored = load<unknown>('progress', null);
  if (P.isValid(stored)) return P.clean(kit, stored);
  const seed = Object.values(seeds)[0]?.default;
  if (P.isValid(seed)) return P.clean(kit, seed);
  return P.fresh();
}
let S = initialProgress();
if (!S.pass) S = P.newPass(kit, S);
let flipped = false;
let undoStack: P.Progress[] = [];

function commit(next: P.Progress) {
  S = { ...next, updatedAt: Date.now() };
  const ok = save('progress', S);
  const el = $('#stat-saved');
  el.dataset.state = ok ? 'saved' : 'error';
  el.textContent = ok ? 'Saved on this device' : 'Not saved: storage is full or blocked';
  renderStatus();
}
const coldCount = (ids: string[]) => ids.filter((id) => S.history[id] === 'cold').length;

/* Read view -------------------------------------------------------------- */

const readEl = $('#read');
const readScroll = $('#read-scroll');
const outline = new Outline($('#toc'), readScroll, (id) => scrollToId(id));

function renderRead() {
  const w = currentWeek();
  readEl.innerHTML = renderWeek(kit, w, { qfirst: settings.qfirst });
  readEl.classList.toggle('serif', settings.serif);
  outline.setWeek(w);
  $('#week-num').textContent = `Week ${w.num}`;
  $('#week-theme').textContent = w.theme;
  renderReadState();
  root.classList.remove('prerender-stale');
}

function renderReadState() {
  for (const el of readEl.querySelectorAll<HTMLElement>('[data-qcnt]')) {
    const s = secInfo.get(el.dataset.qcnt!)!.s;
    el.textContent = `${coldCount(s.cards)} of ${s.cards.length} cold`;
  }
  for (const box of readEl.querySelectorAll<HTMLInputElement>('[data-got]')) {
    const on = S.history[box.dataset.got!] === 'cold';
    box.checked = on;
    box.closest('details')?.classList.toggle('got', on);
  }
  outline.setProgress(coldCount);
  renderStatus();
}

readEl.addEventListener('change', (e) => {
  const box = (e.target as HTMLElement).closest<HTMLInputElement>('[data-got]');
  if (!box) return;
  const history = { ...S.history };
  if (box.checked) history[box.dataset.got!] = 'cold';
  else delete history[box.dataset.got!];
  commit({ ...S, history });
  renderReadState();
});

function scrollToId(id: string, smooth = true) {
  const el = document.getElementById(id);
  if (!el) return;
  readScroll.scrollTo({ top: el.offsetTop - 24, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
}

function setWeek(n: number, opts: { scroll?: boolean } = {}) {
  if (!kit.weeks.some((w) => w.num === n)) return;
  const changed = settings.week !== n;
  settings.week = n;
  persistSettings();
  if (changed) {
    renderRead();
    if (opts.scroll !== false) readScroll.scrollTop = 0;
  }
  renderWeekMenu();
}

/** Go to a section (or a question inside it) in the Read view. */
function reveal(secId: string, cardId?: string) {
  const info = secInfo.get(secId);
  if (!info) return;
  setView('read');
  setWeek(info.week.num, { scroll: false });
  requestAnimationFrame(() => {
    if (cardId) {
      const d = readEl.querySelector<HTMLDetailsElement>(`details.q[data-id="${cardId}"]`);
      if (d) {
        d.open = true;
        readScroll.scrollTo({ top: d.offsetTop - 96 });
        d.querySelector('summary')?.focus({ preventScroll: true });
        return;
      }
    }
    scrollToId(secId, false);
  });
}

/* Page width handles (Folio's) ------------------------------------------ */

const paneRead = $('.pane-read');
const pageHandles = Array.from(document.querySelectorAll<HTMLElement>('.page-handle'));
const HANDLE_GAP = 14; // px between the text edge and the handle, so it never sits on the text
const MIN_TEXT = 280; // narrowest text column, px

/** Padding on both sides of the page; the stored width includes it (border-box). */
function pagePadding() {
  const cs = getComputedStyle(readEl);
  return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
}

function placePageHandles() {
  const pane = paneRead.getBoundingClientRect();
  const r = readEl.getBoundingClientRect();
  if (!r.width) return;
  const cs = getComputedStyle(readEl);
  const left = r.left - pane.left + parseFloat(cs.paddingLeft) - HANDLE_GAP;
  const right = r.right - pane.left - parseFloat(cs.paddingRight) + HANDLE_GAP;
  for (const h of pageHandles) h.style.left = `${h.dataset.side === 'left' ? left : right}px`;
}

function setPageWidth(width: PageWidth) {
  settings.width = width;
  root.style.setProperty('--prose-width', pageWidthCss(width));
  placePageHandles();
}

/** Apply a dragged width in px: snaps to 'full' once it reaches the pane. */
function dragPageWidth(px: number) {
  const max = readScroll.clientWidth;
  setPageWidth(px >= max - 1 ? 'full' : Math.max(MIN_TEXT + pagePadding(), px));
}

function pageWidthChanged() {
  persistSettings();
  outline.updateActive();
}

for (const handle of pageHandles) {
  const dir = handle.dataset.side === 'left' ? -1 : 1; // moving outward makes the page wider
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-page');
    handle.classList.add('dragging');
    const startX = e.clientX;
    const startWidth = readEl.getBoundingClientRect().width;
    // The page is centred, so each side moves by half the change.
    const move = (ev: PointerEvent) => dragPageWidth(startWidth + 2 * dir * (ev.clientX - startX));
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('lostpointercapture', end);
      document.body.classList.remove('resizing-page');
      handle.classList.remove('dragging');
      pageWidthChanged();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', end); // fires after pointerup/cancel, even off-window
  });
  handle.addEventListener('dblclick', () => {
    setPageWidth(null);
    pageWidthChanged();
  });
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 64 : 16;
    const delta = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    dragPageWidth(readEl.getBoundingClientRect().width + 2 * dir * delta);
    pageWidthChanged();
  });
}

/* Show a grip only when the pointer comes near its edge, at the pointer's height. */
const NEAR = 48; // px from the handle
let nearFrame = 0;
let lastPointer: { x: number; y: number } | null = null;

function updateNearHandles() {
  nearFrame = 0;
  const pane = paneRead.getBoundingClientRect();
  for (const h of pageHandles) {
    const x = pane.left + parseFloat(h.style.left || '-1000');
    h.classList.toggle('near', !!lastPointer && Math.abs(lastPointer.x - x) <= NEAR);
  }
  if (lastPointer) {
    const y = Math.min(pane.height - 40, Math.max(40, lastPointer.y - pane.top));
    paneRead.style.setProperty('--grip-y', `${y}px`);
  }
}

paneRead.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType === 'touch') return;
    lastPointer = { x: e.clientX, y: e.clientY };
    if (!nearFrame) nearFrame = requestAnimationFrame(updateNearHandles);
  },
  { passive: true },
);
paneRead.addEventListener('pointerleave', () => {
  lastPointer = null;
  if (!nearFrame) nearFrame = requestAnimationFrame(updateNearHandles);
});

if ('ResizeObserver' in window) {
  new ResizeObserver(placePageHandles).observe(readEl);
  new ResizeObserver(placePageHandles).observe(paneRead);
}

/* Week menu -------------------------------------------------------------- */

const weekMenuEl = $('#week-menu');
function renderWeekMenu() {
  weekMenuEl.replaceChildren(
    ...kit.weeks.map((w) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(w.num === settings.week));
      b.dataset.action = `week-${w.num}`;
      const ids = kit.cards.filter((c) => c.week === w.num).map((c) => c.id);
      b.innerHTML = `<span class="wm-num">Week ${w.num}</span><span class="wm-theme">${esc(w.theme)}</span><span class="wm-count">${coldCount(ids)}/${ids.length}</span>`;
      return b;
    }),
  );
}
renderWeekMenu();
setupMenu($('#week-btn'), weekMenuEl, (action) => {
  setWeek(Number(action.slice(5)));
  setView('read');
});
$('#week-btn').addEventListener('click', renderWeekMenu, { capture: true });

/* Views ------------------------------------------------------------------ */

function setView(v: View) {
  settings.view = v;
  persistSettings();
  if (v === 'practice') root.dataset.view = 'practice';
  else delete root.dataset.view;
  for (const b of document.querySelectorAll<HTMLElement>('[data-view-btn]')) b.setAttribute('aria-pressed', String(b.dataset.viewBtn === v));
  if (v === 'practice') renderPractice(true);
  else {
    renderReadState();
    outline.updateActive();
    placePageHandles();
  }
  renderStatus();
}
for (const b of document.querySelectorAll<HTMLElement>('[data-view-btn]')) b.addEventListener('click', () => setView(b.dataset.viewBtn as View));

/* Status bar ------------------------------------------------------------- */

function renderStatus() {
  const ids = kit.cards.filter((c) => c.week === settings.week).map((c) => c.id);
  const missed = ids.filter((id) => S.history[id] === 'missed').length;
  $('#stat-week').textContent = `Week ${settings.week}`;
  $('#stat-cold').textContent = `${coldCount(ids)} of ${ids.length} cold`;
  $('#stat-missed').textContent = `${missed} missed`;
  const p = S.pass;
  const done = p ? Object.keys(p.results).length : 0;
  $('#stat-pass').textContent = p ? `Pass ${p.n} · ${done}/${P.passCards(kit, p).length} graded` : 'No pass yet';
}

/* Practice --------------------------------------------------------------- */

const stage = $('#stage');
let pickerOpen = false;
let picked = new Set<string>();
let pickSeq: P.Seq = 'shuffle';
let pickWeek = settings.week;

const partName = (a: string) => (a === P.NOTEBOOK ? 'Notebook' : (secInfo.get(a)?.s.label ?? a));
const partLabel = (parts: string[]) => (parts.length <= 2 ? parts.map(partName).join(' + ') : `${parts.length} parts`);

function startPass(cfg?: P.PassConfig) {
  S = P.newPass(kit, S, cfg);
  flipped = false;
  undoStack = [];
  commit(S);
}

/** Switching mid-pass drops this pass's grades (history stays), so ask first. */
function requestSwitch(cfg: P.PassConfig, label: string, after?: () => void) {
  const p = S.pass;
  const done = p ? Object.keys(p.results).length : 0;
  const run = () => {
    if (!done) S = { ...S, passCount: Math.max(0, S.passCount - 1) };
    startPass(cfg);
    pickerOpen = false;
    after?.();
    renderPractice(true);
  };
  if (!(done && p && p.pos < p.order.length)) return run();
  askConfirm({
    title: `Switch to ${label}?`,
    body: `You've graded ${done} of ${P.passCards(kit, p).length} cards in pass ${p.n}. Switching starts a new pass and clears this pass's grades. Your grade history stays and still decides the order.`,
    ok: 'Switch',
    run,
  });
}

function practiceParts(parts: string[], label: string) {
  if (!parts.length) return;
  save('picked', { parts, seq: 'shuffle' });
  setView('practice');
  requestSwitch({ mode: 'part', parts, seq: 'shuffle' }, label);
}
const practiceWeek = () => {
  const w = currentWeek();
  practiceParts(
    w.parts.flatMap((p) => p.sections.filter((s) => s.cards.length).map((s) => s.id)),
    `all of week ${w.num}`,
  );
};
const practiceNotebook = () => practiceParts([P.NOTEBOOK], 'the notebook');

function grade(g: P.Grade) {
  if (!flipped || !P.current(S)) return;
  undoStack.push(S);
  if (undoStack.length > 30) undoStack.shift();
  flipped = false;
  commit(P.grade(S, g));
  renderPractice(true);
}
function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  flipped = true;
  commit(prev);
  renderPractice(true);
}
function flip() {
  if (flipped || !P.current(S)) return;
  flipped = true;
  renderPractice(true);
}

function renderMeter() {
  const p = S.pass;
  const n = P.passCards(kit, p).length || 1;
  const t = P.tallies(S);
  $('#b-cold').style.width = `${(t.cold / n) * 100}%`;
  $('#b-missed').style.width = `${(t.missed / n) * 100}%`;
  $('#t-cold').textContent = `${t.cold} cold`;
  $('#t-missed').textContent = `${t.missed} missed`;
  const done = p ? Object.keys(p.results).length : 0;
  $('#pass-label').innerHTML = `<b>Pass ${p?.n ?? 1}</b> · ${done} / ${P.passCards(kit, p).length} graded`;
}

function renderModes() {
  const p = S.pass;
  const mode = p?.mode === 'part' ? 'part' : 'all';
  for (const b of document.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === (pickerOpen ? 'part' : mode)));
  $('#picker').hidden = !pickerOpen;
  $('#mode-note').textContent =
    mode === 'part' && p
      ? `${partLabel(p.parts)} · ${P.passCards(kit, p).length} cards · ${p.seq === 'kit' ? 'reading order' : 'shuffled'}`
      : `All ${kit.cards.length} cards · weighted shuffle`;
}

function partButton(id: string, name: string, ids: string[]) {
  const miss = ids.filter((x) => S.history[x] === 'missed').length;
  return `<button class="part" data-part="${id}" aria-pressed="${picked.has(id)}"><b>${esc(name)}</b><small>${ids.length} cards · ${coldCount(ids)} cold${miss ? ` · <span class="m">${miss} missed</span>` : ''}</small></button>`;
}
function renderPicker() {
  $('#pick-weeks').innerHTML = kit.weeks
    .map((w) => `<button data-week="${w.num}" aria-pressed="${w.num === pickWeek}" aria-label="Week ${w.num}">${w.num}</button>`)
    .join('');
  const w = kit.weeks.find((x) => x.num === pickWeek)!;
  let h = '';
  if (NB_CARDS.length) {
    h += `<div class="pgroup"><div class="pg-head"><span class="pg-label">Your notebook · any week</span></div><div class="parts">${partButton(P.NOTEBOOK, 'Notebook', NB_CARDS.map((c) => c.id))}</div></div>`;
  }
  for (const p of w.parts) {
    const secs = p.sections.filter((s) => s.cards.length);
    if (!secs.length) continue;
    h += `<div class="pgroup"><div class="pg-head"><span class="pg-label">Part ${p.num} · ${esc(p.title)}</span><button class="text-btn" data-pick-all="${p.id}">Select part</button></div><div class="parts">${secs.map((s) => partButton(s.id, s.label, s.cards)).join('')}</div></div>`;
  }
  $('#parts').innerHTML = h;
  updatePicker();
}
function updatePicker() {
  for (const b of document.querySelectorAll<HTMLElement>('[data-part]')) b.setAttribute('aria-pressed', String(picked.has(b.dataset.part!)));
  for (const b of document.querySelectorAll<HTMLElement>('[data-seq]')) b.setAttribute('aria-pressed', String(b.dataset.seq === pickSeq));
  const n = kit.cards.filter((c) => P.inParts(c, [...picked])).length;
  const others = [...picked].filter((a) => a !== P.NOTEBOOK && secInfo.get(a)?.week.num !== pickWeek).length;
  const btn = $<HTMLButtonElement>('#pick-start');
  btn.disabled = !n;
  btn.textContent = n ? `Study ${n} card${n === 1 ? '' : 's'}${others ? ` (incl. other weeks)` : ''}` : 'Pick a part';
}

function renderPractice(focus = false) {
  renderMeter();
  renderModes();
  renderStatus();
  const p = S.pass;
  const id = P.current(S);
  if (!p || !id) return renderSummary(focus);
  const c = cardById.get(id)!;
  const info = secInfo.get(c.sec)!;
  const isRetry = id in p.results;
  const seen = Object.keys(p.results).length + (isRetry ? 0 : 1);
  stage.innerHTML = `
    <article class="card${flipped ? ' flipped' : ''}" id="card" tabindex="0" aria-label="Flashcard. ${flipped ? 'Answer shown.' : 'Press Space to show the answer.'}">
      <div class="card-top">
        <div class="chips"><span class="chip">W${c.week} · ${esc(info.s.label)}</span><span class="chip">${esc(c.level)}</span>${c.nb ? '<span class="chip chip-nb">Notebook</span>' : ''}${isRetry ? '<span class="chip chip-retry">Retry</span>' : ''}</div>
        <span class="card-pos">${isRetry ? 'retry' : `${seen} / ${P.passCards(kit, p).length}`}</span>
      </div>
      <div class="card-front"><p class="card-q">${c.q}</p><span class="card-term">${esc(c.term)}</span></div>
      ${
        flipped
          ? `<div class="card-back">
        <div><span class="lbl">Chain</span><p class="card-chain">${chainHtml(c.k)}</p></div>
        <div><span class="lbl">Full answer</span><p class="card-answer">${c.answer}</p></div>
        <button class="reread" data-reread="${c.sec}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4.2C6.6 3.2 4.6 2.8 2 3v9.3c2.6-.2 4.6.2 6 1.2 1.4-1 3.4-1.4 6-1.2V3c-2.6-.2-4.6.2-6 1.2zM8 4.2v9.3"/></svg>Reread · ${esc(info.s.label)}<kbd class="hide-sm">R</kbd></button>
      </div>`
          : `<div class="card-hint">Say it out loud, then flip.</div>`
      }
    </article>
    ${
      flipped
        ? `<div class="grade" role="group" aria-label="How did you do?"><button class="g-missed" data-g="missed">Missed<small>1 · comes back soon</small></button><button class="g-cold" data-g="cold">Cold<small>2 · knew it</small></button></div>`
        : `<button class="show-btn" id="show-btn">Show answer</button>`
    }
    ${undoStack.length ? `<div class="undo-row"><button class="text-btn" id="undo">Undo last grade</button></div>` : ''}`;
  if (focus && settings.view === 'practice' && $('#sheet').hidden) $('#card').focus({ preventScroll: true });
}

function renderSummary(focus: boolean) {
  const p = S.pass;
  const t = P.tallies(S);
  const rows: { sec: string; cold: number; missed: number }[] = [];
  for (const c of P.passCards(kit, p)) {
    let g = rows.find((x) => x.sec === c.sec);
    if (!g) rows.push((g = { sec: c.sec, cold: 0, missed: 0 }));
    const r = p?.results[c.id];
    if (r) g[r]++;
  }
  const weak = kit.cards.filter((c) => p?.results[c.id] === 'missed');
  stage.innerHTML = `
    <section class="summary">
      <h2>Pass ${p?.n ?? 1} done</h2>
      <div class="sum-big"><div class="c"><b>${t.cold}</b><span>Cold</span></div><div class="m"><b>${t.missed}</b><span>Missed</span></div></div>
      <table class="sum-table"><thead><tr><th>Section</th><th class="n">Cold</th><th class="n">Missed</th></tr></thead>
      <tbody>${rows.map((g) => `<tr><td>${esc(tagOf(g.sec))} · ${esc(secInfo.get(g.sec)!.s.label)}</td><td class="n">${g.cold}</td><td class="n${g.missed ? ' m' : ''}">${g.missed}</td></tr>`).join('')}</tbody></table>
      ${weak.length ? `<div class="weak"><span class="pg-label">Missed this pass · reread its section</span>${weak.map((c) => `<button data-reread="${c.sec}">${c.q}</button>`).join('')}</div>` : ''}
      <p>${p?.mode === 'part' ? 'The next pass goes through the same parts again; missed cards come earlier.' : 'The next pass reshuffles everything; missed and notebook cards come earlier.'}</p>
      <button class="primary-btn" id="next-pass">Start pass ${(p?.n ?? 0) + 1}</button>
    </section>`;
  if (focus && settings.view === 'practice') $('#next-pass').focus({ preventScroll: true });
}

stage.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const g = t.closest<HTMLElement>('[data-g]');
  if (g) return grade(g.dataset.g as P.Grade);
  const r = t.closest<HTMLElement>('[data-reread]');
  if (r) return openSheet(r.dataset.reread!);
  if (t.closest('#show-btn')) return flip();
  if (t.closest('#undo')) return undo();
  if (t.closest('#next-pass')) {
    startPass();
    return renderPractice(true);
  }
  if (t.closest('#card')) flip();
});

$('.p-bar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
  if (!b) return;
  const p = S.pass;
  const mode = p?.mode === 'part' ? 'part' : 'all';
  if (b.dataset.mode === 'part') {
    if (pickerOpen) {
      pickerOpen = false;
      return renderModes();
    }
    if (mode === 'part' && p) {
      picked = new Set(p.parts);
      pickSeq = p.seq;
    } else {
      const saved = load<{ parts?: string[]; seq?: P.Seq } | null>('picked', null);
      picked = new Set((saved?.parts ?? []).filter((a) => a === P.NOTEBOOK || secInfo.has(a)));
      pickSeq = saved?.seq === 'kit' ? 'kit' : 'shuffle';
    }
    const first = [...picked].find((a) => secInfo.has(a));
    pickWeek = first ? secInfo.get(first)!.week.num : settings.week;
    pickerOpen = true;
    renderModes();
    renderPicker();
    return;
  }
  pickerOpen = false;
  if (mode === 'all') return renderModes();
  requestSwitch({ mode: 'all' }, 'the full deck');
});
$('#pick-weeks').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-week]');
  if (!b) return;
  pickWeek = Number(b.dataset.week);
  renderPicker();
});
$('#parts').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const all = t.closest<HTMLElement>('[data-pick-all]');
  if (all) {
    const info = kit.weeks.find((w) => w.num === pickWeek)!.parts.find((p) => p.id === all.dataset.pickAll)!;
    const ids = info.sections.filter((s) => s.cards.length).map((s) => s.id);
    const on = ids.every((a) => picked.has(a));
    for (const a of ids) on ? picked.delete(a) : picked.add(a);
    return updatePicker();
  }
  const b = t.closest<HTMLElement>('[data-part]');
  if (!b) return;
  const a = b.dataset.part!;
  picked.has(a) ? picked.delete(a) : picked.add(a);
  updatePicker();
});
$('.picker-foot').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-seq]');
  if (!b) return;
  pickSeq = b.dataset.seq as P.Seq;
  updatePicker();
});
$('#pick-clear').addEventListener('click', () => {
  picked.clear();
  updatePicker();
});
$('#pick-start').addEventListener('click', () => {
  const order = [P.NOTEBOOK, ...secInfo.keys()];
  const parts = order.filter((a) => picked.has(a));
  if (!parts.length) return;
  save('picked', { parts, seq: pickSeq });
  requestSwitch({ mode: 'part', parts, seq: pickSeq }, partLabel(parts));
});

/* Reread sheet ----------------------------------------------------------- */

const sheet = $('#sheet');
let sheetSec = '';
function openSheet(secId: string) {
  const info = secInfo.get(secId);
  if (!info) return;
  sheetSec = secId;
  $('#sheet-eyebrow').textContent = tagOf(secId);
  $('#sheet-title').textContent = info.s.num ? info.s.title : info.part.title;
  const body = $('#sheet-body');
  body.innerHTML = info.s.html;
  body.classList.toggle('serif', settings.serif);
  sheet.hidden = false;
  sheet.querySelector<HTMLElement>('.sheet-scroll')!.scrollTop = 0;
  sheet.querySelector<HTMLElement>('.sheet-foot .primary-btn')!.focus({ preventScroll: true });
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  if (settings.view === 'practice') (document.getElementById('card') ?? document.getElementById('next-pass'))?.focus({ preventScroll: true });
}
sheet.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-close]')) closeSheet();
});
$('#sheet-open').addEventListener('click', () => {
  const id = sheetSec;
  sheet.hidden = true;
  reveal(id);
});

/* Confirm ---------------------------------------------------------------- */

const confirmEl = $('#confirm');
let confirmRun: (() => void) | null = null;
let confirmTimer = 0;
function askConfirm({ title, body, ok, run }: { title: string; body: string; ok: string; run: () => void }) {
  confirmRun = run;
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  const btn = $<HTMLButtonElement>('#confirm-ok');
  let left = 3;
  btn.disabled = true;
  btn.textContent = `${ok} in ${left}`;
  clearInterval(confirmTimer);
  confirmTimer = window.setInterval(() => {
    left--;
    if (left > 0) {
      btn.textContent = `${ok} in ${left}`;
      return;
    }
    clearInterval(confirmTimer);
    btn.disabled = false;
    btn.textContent = ok;
  }, 1000);
  confirmEl.hidden = false;
  $('#confirm-cancel').focus();
}
function closeConfirm() {
  clearInterval(confirmTimer);
  confirmEl.hidden = true;
  confirmRun = null;
}
$('#confirm-cancel').addEventListener('click', closeConfirm);
confirmEl.addEventListener('pointerdown', (e) => {
  if (e.target === confirmEl) closeConfirm();
});
$('#confirm-ok').addEventListener('click', () => {
  const run = confirmRun;
  closeConfirm();
  run?.();
});
function restartPass() {
  const p = S.pass;
  const done = p ? Object.keys(p.results).length : 0;
  const run = () => {
    S = { ...S, passCount: Math.max(0, S.passCount - 1) };
    startPass();
    setView('practice');
  };
  if (!done) return run();
  askConfirm({
    title: 'Restart this pass?',
    body: `You've graded ${done} of ${P.passCards(kit, p).length} cards in pass ${p!.n}. Restarting starts the same cards over and clears this pass's grades. Your grade history stays.`,
    ok: 'Restart pass',
    run,
  });
}

/* Export / import -------------------------------------------------------- */

function exportProgress() {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify({ app: 'backend-foundation', exported: new Date().toISOString(), progress: S }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backend-foundation-progress-${date}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Progress exported');
}

const fileInput = $<HTMLInputElement>('#file-input');
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = P.isValid(data?.progress) ? data.progress : data;
    if (!P.isValid(incoming)) throw new Error('not a progress file');
    const before = S;
    let next = P.merge(S, P.clean(kit, incoming));
    if (!next.pass) next = P.newPass(kit, next);
    flipped = false;
    undoStack = [];
    commit(next);
    renderAll();
    const n = Object.values(S.history).filter((g) => g === 'cold').length;
    toast(`Imported · ${n} questions cold`, {
      action: {
        label: 'Undo',
        run: () => {
          commit(before);
          renderAll();
        },
      },
    });
  } catch {
    toast('That file is not a Backend Foundation progress export');
  }
});

/* Theme ------------------------------------------------------------------ */

const themeBtn = $('#theme-btn');
const menuEl = $('#menu');
const effectiveTheme = (): 'light' | 'dark' => (settings.theme === 'system' ? (prefersDark.matches ? 'dark' : 'light') : settings.theme);

function applyTheme(animate: boolean) {
  if (animate && !reducedMotion.matches) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 320);
  }
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  const mode = effectiveTheme();
  const nextLabel = mode === 'dark' ? 'Switch to light' : 'Switch to dark';
  themeBtn.dataset.mode = mode;
  themeBtn.dataset.tip = nextLabel;
  themeBtn.setAttribute('aria-label', nextLabel);
  setChecked('toggle-system', settings.theme === 'system');
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (settings.theme !== 'system') meta.content = mode === 'dark' ? '#1B1B1D' : '#FCFCFB';
  }
}
function setTheme(theme: Theme) {
  settings.theme = theme;
  persistSettings();
  applyTheme(true);
}
themeBtn.addEventListener('click', () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));
prefersDark.addEventListener('change', () => applyTheme(true));

/* More menu -------------------------------------------------------------- */

function setChecked(action: string, on: boolean) {
  menuEl.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-checked', String(on));
}
function toggleSerif() {
  settings.serif = !settings.serif;
  persistSettings();
  readEl.classList.toggle('serif', settings.serif);
  setChecked('toggle-serif', settings.serif);
}
function toggleOutline() {
  settings.outline = !settings.outline;
  persistSettings();
  outline.visible = settings.outline;
  setChecked('toggle-outline', settings.outline);
  outline.updateActive();
}
/** Moves each section's question list above or below its reading; keeps you on the section you were reading. */
function toggleQfirst() {
  settings.qfirst = !settings.qfirst;
  persistSettings();
  setChecked('toggle-qfirst', settings.qfirst);
  const top = readScroll.scrollTop + 32;
  const here = Array.from(readEl.querySelectorAll<HTMLElement>('.sec')).filter((s) => s.offsetTop <= top).pop();
  renderRead();
  if (here) scrollToId(here.id, false);
}
function closeAllQuestions() {
  for (const d of readEl.querySelectorAll<HTMLDetailsElement>('details.q[open]')) d.open = false;
}

const actions: Record<string, () => void> = {
  palette: () => palette.open(),
  'practice-week': practiceWeek,
  'practice-notebook': practiceNotebook,
  'close-all': closeAllQuestions,
  export: exportProgress,
  import: () => fileInput.click(),
  'toggle-outline': toggleOutline,
  'toggle-qfirst': toggleQfirst,
  'toggle-serif': toggleSerif,
  'toggle-system': () => setTheme(settings.theme === 'system' ? effectiveTheme() : 'system'),
};
setupMenu($('#menu-btn'), menuEl, (action) => actions[action]?.());

/* Command menu (⌘K) ------------------------------------------------------ */

function commands(): Command[] {
  const list: Command[] = [
    { id: 'p-week', group: 'Practice', title: `Practice week ${settings.week}`, keywords: 'drill cards study', run: practiceWeek },
    { id: 'p-nb', group: 'Practice', title: 'Practice the notebook', keywords: 'drill review missed', run: practiceNotebook },
    { id: 'p-all', group: 'Practice', title: 'Shuffle all cards', keywords: 'drill everything', run: () => { setView('practice'); requestSwitch({ mode: 'all' }, 'the full deck'); } },
    { id: 'p-restart', group: 'Practice', title: 'Restart this pass', keywords: 'again reset', run: restartPass },
    { id: 'v-read', group: 'View', title: 'Read', hint: '⌥1', keywords: 'reading view', run: () => setView('read') },
    { id: 'v-practice', group: 'View', title: 'Practice', hint: '⌥2', keywords: 'cards view', run: () => setView('practice') },
    { id: 'v-width', group: 'View', title: 'Reset page width', keywords: 'column measure size wide narrow full layout', run: () => { setPageWidth(null); pageWidthChanged(); } },
    { id: 'v-close', group: 'View', title: 'Close all questions', keywords: 'collapse', run: closeAllQuestions },
    { id: 'v-qfirst', group: 'View', title: settings.qfirst ? 'Questions after the reading' : 'Questions first', keywords: 'pretest guess before reading try first', run: toggleQfirst },
    { id: 'v-serif', group: 'View', title: settings.serif ? 'Sans-serif reading' : 'Serif reading', keywords: 'font typeface', run: toggleSerif },
    { id: 'v-outline', group: 'View', title: settings.outline ? 'Hide outline' : 'Show outline', keywords: 'toc rail sidebar', run: toggleOutline },
    { id: 't-light', group: 'View', title: 'Light theme', keywords: 'appearance color', run: () => setTheme('light') },
    { id: 't-dark', group: 'View', title: 'Dark theme', keywords: 'appearance color night', run: () => setTheme('dark') },
    { id: 't-system', group: 'View', title: 'Match system theme', keywords: 'appearance auto', run: () => setTheme('system') },
    { id: 'x-export', group: 'Progress', title: 'Export progress', keywords: 'save backup download file', run: exportProgress },
    { id: 'x-import', group: 'Progress', title: 'Import progress', keywords: 'load restore upload file', run: () => fileInput.click() },
  ];
  for (const w of kit.weeks) {
    list.push({ id: `w-${w.num}`, group: 'Weeks', title: `Week ${w.num} · ${w.theme}`, hint: w.dates, run: () => { setView('read'); setWeek(w.num); } });
  }
  for (const [id, x] of secInfo) {
    if (!x.s.num && !x.s.cards.length) continue;
    list.push({ id: `s-${id}`, group: 'Sections', title: x.s.num ? x.s.title : x.s.label, hint: `W${x.week.num} · ${x.part.title}`, keywords: `${x.s.label} ${x.week.theme}`, run: () => reveal(id) });
  }
  for (const c of kit.cards) {
    list.push({ id: `q-${c.id}`, group: 'Questions', title: plain(c.q), hint: `W${c.week} · ${c.term}`, keywords: c.term, run: () => reveal(c.sec, c.id) });
  }
  return list;
}
const palette = createPalette(commands);

/* Keyboard --------------------------------------------------------------- */

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    palette.toggle();
    return;
  }
  if (e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
    e.preventDefault();
    setView(e.code === 'Digit1' ? 'read' : 'practice');
    return;
  }
  if (e.key === 'Escape') {
    if (!sheet.hidden) return closeSheet();
    if (!confirmEl.hidden) return closeConfirm();
    if (pickerOpen) {
      pickerOpen = false;
      return renderModes();
    }
  }
  if (palette.isOpen || mod || e.altKey || !confirmEl.hidden || !sheet.hidden || settings.view !== 'practice') return;
  const tag = (e.target as HTMLElement).tagName;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
  if ((e.key === ' ' || e.key === 'Enter') && tag === 'BUTTON') return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (!flipped && P.current(S)) {
      e.preventDefault();
      flip();
    }
  } else if (e.key === '1') grade('missed');
  else if (e.key === '2' || e.key === '3') grade('cold');
  else if ((e.key === 'r' || e.key === 'R') && flipped && P.current(S)) openSheet(cardById.get(P.current(S)!)!.sec);
  else if (e.key === 'u' || e.key === 'U' || e.key === 'Backspace') {
    if (undoStack.length) {
      e.preventDefault();
      undo();
    }
  }
});

/* Offline support (Folio's) ---------------------------------------------- */

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const offer = (worker: ServiceWorker) =>
          toast('A new version is ready', { duration: 15000, action: { label: 'Reload', run: () => worker.postMessage('skip-waiting') } });
        if (reg.waiting && hadController) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
          });
        });
      })
      .catch((err) => console.warn('[sw] registration failed', err));
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

/* Boot ------------------------------------------------------------------- */

function renderAll() {
  renderRead();
  renderWeekMenu();
  if (pickerOpen) renderPicker();
  renderPractice(settings.view === 'practice');
}

setChecked('toggle-serif', settings.serif);
setChecked('toggle-outline', settings.outline);
setChecked('toggle-qfirst', settings.qfirst);
outline.visible = settings.outline;
applyTheme(false);
setPageWidth(settings.width);
renderRead();
setView(settings.view);
