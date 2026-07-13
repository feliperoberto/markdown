# Marcar para Existir

> Você marca com a mão. A máquina lê a estrutura.

A markdown editor: write in Markdown, get a live-rendered preview, organize
your writing into projects/files, import/export as zip, and optionally sync
with Google Drive. The UI is pt-BR; code, comments, and docs are in English.

Live site: https://feliperoberto.com.br/

## Status

The app currently ships as a single static prototype (`prototype/index.html`),
still served on GitHub Pages. It is being migrated, one task at a time, to a
Vite + Preact + TypeScript project (`src/`, entry point `app.html`). See
[`docs/architecture.md`](./docs/architecture.md) for details.

## Local development

Requirements: Node.js 22+ (see `.nvmrc`).

```bash
git clone <this-repo-url>
cd markdown
npm install
npm run dev
```

This starts the Vite dev server for the app under migration (`app.html`).
The legacy prototype (`prototype/index.html`) is a standalone static file and
does not require a dev server.

Other useful scripts:

```bash
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # preview the production build locally
npm run typecheck  # tsc --noEmit only
```

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the folder taxonomy,
import rules, and the stack decision
([ADR 0001](./docs/adr/0001-frontend-stack.md)).

## Tests & linting

```bash
npm run test         # unit/component tests (Vitest), single run
npm run test:watch   # Vitest in watch mode
npm run coverage     # Vitest with coverage report
npm run test:e2e     # end-to-end tests (Playwright)
npm run lint         # ESLint
npm run lint:fix     # ESLint with autofix
npm run format       # Prettier, write mode
npm run format:check # Prettier, check only (used in CI)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, and e2e
tests on every pull request and on pushes to `main`.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds the app
and publishes `dist/` to GitHub Pages. The custom domain is configured via the
root `CNAME` file (`feliperoberto.com.br`), which is copied into `dist/` at
build time so the domain mapping survives the deploy.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for workflow and conventions, and
[`CHANGELOG.md`](./CHANGELOG.md) for release history.
