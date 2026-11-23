/* The Read view as an HTML string. Pure, so vite.config.ts can pre-render week 1 into index.html (like Folio's
   welcome page) and the app renders the same markup at runtime. */
import type { Card, Kit, Section, Week } from './types';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "a → b · c": arrows and dots in the accent color. */
export const chainHtml = (k: string) => esc(k).replace(/(→|·)/g, '<span class="ar">$1</span>');

export function sectionTag(week: Week, partNum: number, s: Section): string {
  return `Week ${week.num} · Part ${partNum}${s.num ? ` · §${s.num}` : ''}`;
}

export function questionHtml(c: Card, n: number, total: number): string {
  return `<details class="q" data-id="${c.id}"><summary><span class="q-text">${c.q}</span><span class="q-tags">${c.nb ? '<span class="tag tag-nb">notebook</span>' : ''}<span class="tag${c.level === 'core' ? ' tag-core' : ''}">${esc(c.level)}</span><span class="q-n" title="Question ${n} of ${total} in this section">${n}/${total}</span></span></summary>
<div class="q-body">
<p class="q-chain">${chainHtml(c.k)}</p>
<p class="q-label">Key points</p><ul>${c.keys.map((k) => `<li>${k}</li>`).join('')}</ul>
${c.answer ? `<p class="q-label">Say it like this</p><p class="q-answer">${c.answer}</p>` : ''}
${c.wrong.length ? `<p class="q-extra"><b>Traps</b> ${c.wrong.join(' · ')}</p>` : ''}
${c.follow.length ? `<p class="q-extra"><b>Follow-ups</b> ${c.follow.join(' · ')}</p>` : ''}
<label class="q-got"><input type="checkbox" data-got="${c.id}"> I can say this cold</label>
</div></details>`;
}

/**
 * One week of reading. `qfirst` (the default) puts each section's question list above its reading, so you guess
 * before you read (pretesting); otherwise the list follows the reading. The answers stay folded either way.
 */
export function renderWeek(kit: Kit, week: Week, opts: { qfirst?: boolean } = {}): string {
  const qfirst = opts.qfirst ?? true;
  const byId = new Map(kit.cards.map((c) => [c.id, c]));
  let out = `<header class="week-head"><p class="eyebrow">Week ${week.num} · ${esc(week.dates)}</p><h1>${esc(week.theme)}</h1></header>`;
  for (const p of week.parts) {
    out += `<h2 class="part-title" id="${p.id}"><span class="part-num">Part ${p.num}</span>${esc(p.title)}</h2>`;
    for (const s of p.sections) {
      let qs = '';
      if (s.cards.length) {
        qs = `<div class="qs" data-pos="${qfirst ? 'top' : 'end'}"><p class="qs-head">Questions<span class="qs-count" data-qcnt="${s.id}"></span></p>`;
        s.cards.forEach((id, i) => {
          const c = byId.get(id);
          if (c) qs += questionHtml(c, i + 1, s.cards.length);
        });
        qs += `</div>`;
      }
      out += `<section class="sec" id="${s.id}">`;
      if (s.num) out += `<h3 class="sec-title">${esc(s.title)}</h3>`;
      out += qfirst ? qs + s.html : s.html + qs;
      out += `</section>`;
    }
  }
  return out;
}
