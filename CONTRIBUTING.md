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

## Commit message style

Write clear, readable commit messages that explain *what* changed and, where
useful, *why*. Prefixing with a short type (`feat:`, `fix:`, `docs:`,
`chore:`) is welcomed and mirrors most of the project's existing history, but
it is **not enforced** by tooling — don't let commit-message formatting slow
down small changes.
