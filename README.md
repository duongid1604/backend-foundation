# Backend Foundation

Eight weeks of backend interview prep in one quiet page: read each section, then drill its questions until you can
answer them cold. Static and client-only, like Folio: no server, progress stays in the browser, works offline once
visited, and installs to the iPad home screen.

## What's in it

**Read**
- Seven weekly reading packs (networking, Go core and concurrency, OS, SQL, DynamoDB, Redis, auth and security,
  messaging, containers and delivery, reliability, observability). Week 8 is drills and mocks, so it reuses these.
- Every section ends with the interview questions it answers. Open one for the recall chain, key points, a model
  answer, traps and follow-ups; tick "I can say this cold" when you can.
- Outline rail at the right edge (hover, or tap on a phone), week switcher in the title, `⌘K` to jump to any section
  or question.

**Practice**
- Flashcards over all 212 questions, or pick parts by week, or the notebook. `Space` flips, `1` missed, `2` cold,
  `R` rereads the section in a side sheet without losing your place, `U` undoes.
- Missed cards come back later in the same pass; the next pass puts missed and notebook cards first.

**Progress**
- Saved in this browser only. To move it between devices: ⋯ → **Export progress** (a small `.json` file), then
  ⋯ → **Import progress** on the other device. Importing merges and never loses a cold answer.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # progress rules, content rendering, and a jsdom run-through of the app
npm run build     # static site in dist/
npm run preview   # serve dist/ locally (the service worker runs here, not in dev)
```

## Deploy (GitHub Pages)

1. Create a GitHub repo (e.g. `backend-foundation`) and push this folder to `main`, including `.github/`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`: install, test, build, publish `dist/`.
   The site appears at `https://<you>.github.io/backend-foundation/`.

Asset paths are relative, so the same build also works on Cloudflare Pages, Netlify or a custom domain.

From an iPad: unzip in Files, then push with a git client such as Working Copy. The `.github` folder is hidden in
Files and can be dropped by a browser upload, and without it nothing deploys.

## Update the content

The reading packs and questions live in `opt-prep` (`reading/*-week.md`, `core/concepts/*.py`,
`tools/kits/*.py`). After changing them:

```bash
cd ../opt-prep && python3 tools/build_kit.py --export ../backend-foundation/src/content
```

Commit `src/content/kit.json` and push; the site rebuilds. Notebook flags are a snapshot from the export day.

## Design

Folio's design system, unchanged: `src/styles/tokens.css` (palette, Inter / Source Serif 4 / JetBrains Mono, light and
dark), `prose.css` for the reading, Folio's top bar, segmented controls, menus, toasts, status bar, outline rail and
command menu. Code is highlighted at build time with Shiki's Vitesse themes, colors adjusted for contrast as in Folio.
