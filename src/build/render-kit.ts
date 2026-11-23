/* Build-time only (imported by vite.config.ts): turns src/content/kit.json (markdown, exported from opt-prep by
   tools/build_kit.py --export) into the HTML the app shows. Code blocks are highlighted here with Shiki, so the
   browser never loads a highlighter. */
import MarkdownIt from 'markdown-it';
import { createHighlighter } from 'shiki';
import { accessibleColors } from './contrast';
import type { Kit, RawKit } from '../types';

const THEMES = { light: 'vitesse-light', dark: 'vitesse-dark' } as const;
const LANGS = ['go', 'sql', 'json', 'dockerfile', 'shellscript', 'yaml'];
const ALIAS: Record<string, string> = { sh: 'shellscript', bash: 'shellscript', shell: 'shellscript', golang: 'go' };

export async function renderKit(raw: RawKit): Promise<Kit> {
  const shiki = await createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: LANGS });
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });

  // Code fences: Folio's wrapper (language label + highlighted <pre>).
  md.renderer.rules.fence = (tokens, idx) => {
    const t = tokens[idx];
    const info = t.info ? md.utils.unescapeAll(t.info).trim() : '';
    const given = (info.split(/\s+/)[0] ?? '').toLowerCase();
    const lang = ALIAS[given] ?? given;
    const code = t.content.replace(/\n$/, '');
    const body = LANGS.includes(lang)
      ? accessibleColors(shiki.codeToHtml(code, { lang, themes: THEMES, defaultColor: false }))
      : `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`;
    return `<div class="code-block"><div class="code-head"><span class="code-lang">${md.utils.escapeHtml(given)}</span></div>${body}</div>\n`;
  };

  const inline = (s: string) => md.renderInline(s);

  return {
    exported: raw.exported,
    weeks: raw.weeks.map((w) => ({
      ...w,
      parts: w.parts.map((p) => ({
        ...p,
        sections: p.sections.map(({ md: src, ...s }) => ({ ...s, html: md.render(src) })),
      })),
    })),
    cards: raw.cards.map((c) => ({
      id: c.id,
      sec: c.sec,
      week: c.week,
      level: c.level,
      nb: c.nb,
      term: c.term,
      k: c.k,
      q: inline(c.q),
      keys: c.keys.map(inline),
      answer: inline(c.answer),
      wrong: c.wrong.map(inline),
      follow: c.follow.map(inline),
    })),
  };
}
