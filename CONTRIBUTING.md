# Contributing

This is a small, low-release-cadence project (solo developer plus AI coding
agents). The processes here are intentionally lightweight — enough structure
to keep the project maintainable without adding ceremony that doesn't pay for
itself at this scale.

## Versioning and changelog

We use a **manual** versioning process:

- **Semantic Versioning** ([semver.org](https://semver.org/)) for the version
  in `package.json` — `MAJOR.MINOR.PATCH`.
- A hand-maintained `CHANGELOG.md` following the
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format, with an
  `[Unreleased]` section at the top for work that has landed on the default
  branch but hasn't been tagged as a release yet.
- **Git tags** (`vX.Y.Z`) on notable releases, pushed to the remote so they
  show up as GitHub releases/tags.

We deliberately **do not** use automated tooling like `semantic-release`.
That approach requires strict Conventional Commits discipline across every
commit, which is disproportionate overhead for a project with this release
cadence and team size. If commit-message discipline becomes a natural habit
and the project's cadence increases, this decision can be revisited — but for
now, a human writing a few changelog bullets per release is simpler and just
as useful to users.

### How to cut a release

1. Move relevant entries from `## [Unreleased]` in `CHANGELOG.md` into a new
   dated section, e.g. `## [0.2.0] - 2026-08-01`, summarizing what changed
   from a user's perspective (Added / Changed / Fixed / Removed, per Keep a
   Changelog).
2. Bump the `version` field in `package.json` to match (`0.2.0`).
3. Update the comparison links at the bottom of `CHANGELOG.md` (the
   `[Unreleased]` and new version links).
4. Commit the changes, e.g. `chore: release v0.2.0`.
5. Tag the release and push the tag:

   ```sh
   git tag v0.2.0
   git push --tags
   ```

6. Optionally, create a GitHub release from the tag using the corresponding
   `CHANGELOG.md` section as the release notes.

There is no automated workflow that creates tags or releases — this is a
manual step performed as part of merging a release-worthy change.

## Branching and pull requests

- **Branch naming**: `task/N-short-name` for planned work tied to an issue,
  `fix/N-short-name` for bug fixes, where `N` is the GitHub issue number
  (e.g. `task/40-license-contributing-templates`). This mirrors the naming
  already used across the project's epics and sub-issues.
- **Open the PR against the right base**: if the issue is part of an active
  epic integration branch (e.g. `epic-production-grade-43`), target the PR
  at that branch rather than `main`. Otherwise, target `main`.
- **Fill in `.github/pull_request_template.md`**: every PR should include a
  short summary and the "Ready to merge" checklist (CI green, manually
  tested, screenshots for UI changes, linked issue via `Closes #N`).
- **CI must pass before merging**: `.github/workflows/ci.yml` runs on every
  pull request and defines two required jobs:
  - `test` — lint, typecheck, unit tests, and build.
  - `e2e` — Playwright end-to-end tests.

  Both must be green. See "Branch protection" below for how these are
  enforced on `main`.

## Feature taxonomy

Code under `src/features/<feature>/` must not import from another
`src/features/<other-feature>/` directly. Each feature may only import from
`src/components/` and `src/lib/`. If one feature needs to compose with or
trigger behavior in another (e.g. `drive-sync` needing data from `projects`,
or `import-export` needing to trigger a save from `editor`), that
composition happens in `src/app/` through an explicit exported interface (a
function/hook exported from the feature's own index), not a direct import
of another feature's internals.

This keeps each feature independently understandable and replaceable. See
the "Folder taxonomy" section of `docs/architecture.md` for the full
rationale and folder-by-folder breakdown.

## Commit message style

Write clear, readable commit messages that explain _what_ changed and, where
useful, _why_. Prefixing with a short type (`feat:`, `fix:`, `docs:`,
`chore:`) is welcomed and mirrors most of the project's existing history, but
it is **not enforced** by tooling — don't let commit-message formatting slow
down small changes.

## Branch protection (manual step for repo owner)

This project is developed as a solo-developer-plus-AI-agents workflow, so
branch protection is optimized for automated safety nets (CI) rather than
multi-human review overhead.

Once `.github/workflows/ci.yml` (added in issue #35) has run at least once
on `main` — so its check names are known to GitHub — the repo owner
(Felipe) should manually configure the following branch protection rule
on `main` in GitHub Settings → Branches → Branch protection rules:

- **Require status checks to pass before merging**: enabled
  - Required checks: `test`, `e2e` (job names from `.github/workflows/ci.yml`)
  - Require branches to be up to date before merging: enabled
- **Require pull request before merging**: enabled
  - **Required approving reviews**: 0 (solo-plus-agents workflow; CI is the
    real gate here, not human approval count)
- **Allow specified actors to bypass required pull requests**: the repo
  owner should be allowed to bypass if needed (e.g. urgent hotfix, or
  merging their own solo work without waiting on a second reviewer that
  doesn't exist)
- Do **not** enable "Require signed commits" or other multi-human-review
  features that don't fit a solo-plus-agents team size.

This cannot be configured by an agent: changing repository security
settings is a repo-owner decision made directly in GitHub Settings, not
something delegated through a PR.

## Ready to merge

See `.github/pull_request_template.md` for the checklist every PR should
satisfy before merging: CI green (lint/typecheck/test/build/e2e), manual
testing done, screenshots for UI changes, and the related issue linked.
