# Architecture

> Status: migration in progress. The app currently ships as a single static
> `index.html` prototype (with CDN-loaded `marked`, `DOMPurify`, `JSZip`, and
> the Google OAuth/Drive JS client). It is being migrated to a Vite + Preact +
> TypeScript project, one task at a time. The prototype `index.html` remains
> live on GitHub Pages until the migration replaces it.

## Stack decision

- **Preact** instead of React: ~10KB runtime keeps the bundle small for a
  tool that should load fast, and it has first-class support for PWA tooling
  (`vite-plugin-pwa`, planned in a later task) without meaningful trade-offs
  for this app's needs.
- **Vite** instead of a metaframework (e.g. Next.js): the app has no
  server-side rendering requirement, so a plain client-side build with fast
  dev server and small config footprint is the better fit.

## Current scaffold

- `app.html` is the Vite entry point (kept separate from the legacy root
  `index.html`, which is left untouched for GitHub Pages).
- `src/` holds the Preact source, with path aliases `@/features`,
  `@/components`, `@/lib` mapped to `src/features`, `src/components`,
  `src/lib` respectively.
- `vite.config.ts` sets `base: '/'`, matching the custom domain configured in
  `CNAME` (`feliperoberto.com.br`), since the site is not served from a
  GitHub Pages repo subpath.

Later tasks own: feature/component/lib taxonomy, styling, business logic
migration, and PWA configuration.
