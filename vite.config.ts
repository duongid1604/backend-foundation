import { defineConfig, type Plugin } from 'vitest/config';
import type { OutputChunk } from 'rollup';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderKit } from './src/build/render-kit';
import { renderWeek } from './src/read-view';
import type { Kit, RawKit } from './src/types';

const KIT_JSON = fileURLToPath(new URL('./src/content/kit.json', import.meta.url));
let kitPromise: Promise<Kit> | null = null;
const loadKit = () => (kitPromise ??= renderKit(JSON.parse(readFileSync(KIT_JSON, 'utf8')) as RawKit));

/**
 * `import kit from 'virtual:kit'`: the reading packs and questions, rendered to HTML at build time (markdown and
 * code highlighting never ship to the browser). Content comes from opt-prep: `tools/build_kit.py --export`.
 */
function kitContent(): Plugin {
  const id = 'virtual:kit';
  return {
    name: 'bf-kit',
    resolveId: (source) => (source === id ? '\0' + id : null),
    async load(resolved) {
      if (resolved !== '\0' + id) return null;
      this.addWatchFile(KIT_JSON);
      return `export default ${JSON.stringify(await loadKit())};`;
    },
    handleHotUpdate({ file, server }) {
      if (file !== KIT_JSON) return;
      kitPromise = null;
      const mod = server.moduleGraph.getModuleById('\0' + id);
      if (mod) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: 'full-reload' });
    },
  };
}

/** Bakes week 1 into index.html so the reading appears before any JavaScript runs (Folio's welcome-page trick). */
function prerenderWeek(): Plugin {
  return {
    name: 'bf-prerender',
    apply: 'build',
    async transformIndexHtml(html) {
      const kit = await loadKit();
      const from = '<article id="read" class="prose"></article>';
      if (!html.includes(from)) throw new Error(`prerender: "${from}" not found in index.html`);
      return html.replace(from, `<article id="read" class="prose">${renderWeek(kit, kit.weeks[0])}</article>`);
    },
  };
}

/** Emits `sw.js` with a precache list built from the real bundle (Folio's plugin): the app works offline. */
function serviceWorker(): Plugin {
  return {
    name: 'bf-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle);
      const entry = Object.values(bundle).find((f): f is OutputChunk => f.type === 'chunk' && f.isEntry);
      const precache = new Set<string>(['./', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png']);
      if (entry) {
        precache.add(entry.fileName);
        entry.imports.forEach((f) => precache.add(f));
        entry.viteMetadata?.importedCss.forEach((f) => precache.add(f));
      }
      files.filter((f) => /(inter|jetbrains-mono|source-serif-4)-latin-wght-normal.*\.woff2$/.test(f)).forEach((f) => precache.add(f));

      const version = createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify([...precache], null, 2)),
      });
    },
  };
}

/** With SITE_URL set at build time (e.g. https://you.github.io/backend-foundation), link previews get absolute URLs. */
function absoluteSocialUrls(): Plugin {
  return {
    name: 'bf-site-url',
    transformIndexHtml(html) {
      const site = process.env.SITE_URL?.replace(/\/+$/, '');
      if (!site) return html;
      return html
        .replace('content="./og-image.png"', `content="${site}/og-image.png"`)
        .replace('<meta property="og:type"', `<meta property="og:url" content="${site}/" />\n    <meta property="og:type"`);
    },
  };
}

export default defineConfig({
  // Relative asset paths: works at a domain root or under a GitHub Pages project path.
  base: './',
  plugins: [kitContent(), prerenderWeek(), serviceWorker(), absoluteSocialUrls()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200, // the reading packs are part of the bundle on purpose (offline)
  },
  test: {
    environment: 'jsdom',
  },
});
