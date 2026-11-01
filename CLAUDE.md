# markdown

Vite + Preact + TypeScript PWA. See `docs/architecture.md` and `docs/adr/`.

## Spec-driven development

- Specs live in `openspec/` (`specs/` = current behavior, `changes/` = proposals). Use `/opsx:*` commands (from the `.claude` submodule).
- Behavior changes go through an OpenSpec change; never edit `openspec/specs/` directly.
- Drift check: `python3 .claude/scripts/openspec_drift_check.py --validate`.

## Workflow

- Validate with `npm run lint && npm run typecheck && npm test`; e2e with `npm run test:e2e`.
- `.claude/` is a git submodule: after a plain clone run `git submodule update --init .claude`. Never commit inside it.
- Never commit to `main` without explicit permission; work on a branch.
