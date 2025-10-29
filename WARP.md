# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

- Preview (static): open `index.html` in a browser.
- Dev server (Python 3):
  - `python -m http.server 5173`
  - then visit http://localhost:5173

Notes
- There is no `package.json`, Makefile, or build step; this is a static site.
- No linting or test configuration is present.

## High-level architecture

This is a minimal static web app intended to grow into a multimedia whānau archive.

- Entry point: `index.html`
  - Semantic sections (IDs): `kainga`, `korero`, `whakapapa`, `waiata`, `nga-toi`
  - Header with nav and a mobile toggle (`button.nav-toggle` with `aria-expanded`)
- Client code: `assets/app.js`
  - Toggles the mobile nav (reads/writes `aria-expanded`, shows/hides `#whanau-nav`)
  - Sets the current year in `<span id="year">`
  - Placeholder for future content loading from `content/*.json`
- Styles: `assets/styles.css`
  - CSS variables theme, responsive nav (breakpoint 720px), panel layout
- No frameworks or bundlers; all assets are static and referenced from HTML.

Planned structure (from README)
- `public/` static media (images, audio, video)
- `assets/` styles and client-side scripts (exists)
- `src/` future JS/TS modules
- `content/` structured content (JSON/MD) for stories & profiles
- `scripts/` helper scripts for dev/ops

## Key project intent (from README)
- Māori-first UX: te reo Māori in headings/labels; grounded in tikanga Māori
- Focus areas: kōrero (stories), whakapapa (family tree/pepeha), waiata/karakia, media galleries
- Long-lived, user-driven archive with room for new whānau and intergenerational learning
