# 1. Frontend stack: Vite + Preact + TypeScript

## Status

Proposed — pending product-owner sign-off (issue #12).

## Context

"Marcar para Existir" is a local-first markdown notebook that must run as a
lightweight, installable PWA. There is no server-side rendering, auth
backend, or API layer to coordinate with: state lives in the browser
(localStorage, optional Google Drive sync) and the whole app is a static
bundle deployed to GitHub Pages. The prior prototype was a single
`index.html` loading `marked`, `DOMPurify`, and `JSZip` from CDNs with no
build step, no types, and no component model.

Tasks #9–#11 already scaffolded the replacement (Vite + Preact + TypeScript,
a feature-sliced folder taxonomy, pinned npm dependencies). This ADR records
*why* that stack was chosen, so the decision isn't re-litigated later.

Options considered:

- **Next.js** — a full metaframework with SSR, file-based routing, API
  routes, etc.
- **Vite + full React**
- **Vite + Preact** (chosen)
- **No framework / native Web Components**

## Decision

Use **Vite + Preact + TypeScript** as the frontend stack.

- **Vite over Next.js** — the app has no server-side rendering or API-route
  requirement; every feature (editor, projects, import/export, Drive sync,
  theme, onboarding) runs client-side. Next.js's server runtime, routing
  conventions, and deployment model add complexity with no corresponding
  benefit for a static, installable PWA. Vite gives a fast dev server and a
  minimal, static build with a small config footprint.
- **Preact over full React** — Preact's ~10KB runtime keeps the shipped
  bundle small, which matters for install size and cold-load time on a PWA.
  It's API-compatible with React (hooks, JSX, the ecosystem we actually
  need) so we get the same developer experience without the extra runtime
  weight, and without importing the React ecosystem features (e.g.
  concurrent rendering, server components) that this app has no use for.
- **Framework over no-framework/Web Components** — building the editor,
  live preview, project list, and sync UI as plain Web Components was
  viable, but it pushes re-render/diffing and state-to-DOM plumbing onto us
  manually for every feature. Preact's component model and hooks give us
  that for free at a negligible size cost.
- **Why Preact specifically wins for this project**: first-class,
  well-maintained PWA tooling (`vite-plugin-pwa`, planned in a later task)
  integrates the same way it would with React, and its hooks/JSX API is
  exactly what most LLM coding agents already know well — relevant here
  since this codebase is largely agent-maintained.

TypeScript is used throughout for type safety across the storage adapter,
markdown pipeline, and feature modules.

For the resulting folder taxonomy and import rules, see
[`docs/architecture.md`](../architecture.md) — this ADR does not duplicate
that content.

## Consequences

- The app ships without SSR/hydration; any future requirement for
  server-rendered pages or API routes would require revisiting this
  decision (likely a migration to Next.js or a similar framework).
- Being Preact instead of React means occasional ecosystem libraries built
  React-specific (relying on internals rather than the public API) may not
  work out of the box; `preact/compat` is the escape hatch if that happens.
- The small runtime and simple client-only build keep the project easy for
  both humans and coding agents to reason about and extend, matching the
  "easy to add features" and "lightweight installable PWA" goals.
