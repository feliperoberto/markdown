# 2. Internationalization strategy: pt-BR only, no i18n layer

## Status

Accepted — signed off by product-owner (issue #42).

## Context

The entire UI is hardcoded Portuguese: `docs/copy-guide.md` documents a
deliberate, distinctive product voice built around the "marcar" (markup →
manual marking gesture) wordplay, anchored by the splash-screen tagline:

> "Você marca com a mão. A máquina lê a estrutura."
> ("You mark by hand. The machine reads the structure.")

This tagline is the conceptual root of the product name itself — "Marcar
para Existir" ("Mark to Exist") — and of recurring terms throughout the UI:
the footer's edit-mode tab literally reads "Marcar" (`src/features/editor/
EditorFooter.tsx`), the manifest short name is "Marcar", and the copy guide
explicitly calls out "marcar" as brand-voice vocabulary distinct from the
more functional "escrever" used in operational copy.

None of this is incidental phrasing that a translation layer could carry
over 1:1. "Marcar" simultaneously means "to mark/tick" (the literal editor
action), evokes "marcar presença" (to make your presence known — hence
"para Existir", "to exist"), and sets up the hand/machine ("mão"/"máquina")
alliteration in the tagline. An English (or any other language) rendering
of this wordplay is not a translation problem, it's a copywriting problem:
the closest literal English ("You mark by hand. The machine reads the
structure.") loses the alliteration and the double meaning of "marcar"
entirely. A faithful equivalent would need to be authored fresh in the
target language, not looked up in a dictionary.

Two paths were considered:

- **Become i18n-ready now** — extract every UI string (all
  `src/features/*/copy.ts` files, inline JSX strings, ARIA labels, toasts)
  into a lightweight key-based dictionary (not a heavyweight framework
  like `i18next`/`react-intl`, given the app's size), so a future language
  could be added by supplying a second dictionary file.
- **Stay pt-BR-only** — treat Portuguese as a permanent, first-class
  product decision rather than a temporary gap to be engineered around.

## Decision

**Stay pt-BR-only for the foreseeable future. Do not build an i18n layer
speculatively.**

Reasoning:

- The product's identity is _inseparable_ from a specific Portuguese
  wordplay. Extracting strings into a generic key→value dictionary today,
  before any second language is actually committed to, would either (a)
  encode English placeholder values that don't carry the brand voice and
  would need to be rewritten anyway once a real localization effort
  starts, or (b) require inventing the English brand voice _now_, as pure
  speculative work, with no user or business need pulling it into
  existence.
- There is no signal (from Customer Success, Sales, or roadmap) indicating
  demand for a non-Portuguese audience. Building i18n infrastructure ahead
  of that demand is speculative engineering effort against the "keep the
  app small and easy to extend" goal recorded in
  [`0001-frontend-stack.md`](0001-frontend-stack.md) — every extra
  indirection (string keys instead of literal JSX text) has an ongoing
  maintenance cost for a benefit that may never be realized.
- This is explicitly **not** "we'll never support another language" — it's
  "we are not paying the i18n-readiness tax until a language addition is
  actually planned." If English (or another language) support is ever
  greenlit, that decision should come with its own scoped, funded effort
  that:
  1. Authors a **distinct, adapted brand voice** for the target language
     (not a literal translation of the pt-BR copy) — the tagline, the
     "Marcar" wordplay, and the copy-guide voice principles
     (`docs/copy-guide.md` §1) need a from-scratch equivalent, likely
     requiring a fresh copy-guide pass in that language.
  2. Only then extracts strings into a lightweight key-based dictionary
     (as scoped in the original issue #42 body) — this ordering matters
     because extracting strings first, with content decided second, risks
     freezing an English-placeholder wording into the architecture that
     doesn't match the eventual real copy.

## Consequences

- No i18n extraction work is scheduled. `src/features/*/copy.ts` files,
  inline JSX copy, and ARIA labels remain hardcoded Portuguese strings, as
  today.
- No follow-up SWE task ("Extract UI strings into a lightweight i18n
  layer") is being spun off from this decision, per the pt-BR-only
  outcome. If this decision is reversed in the future, that follow-up task
  (string extraction) should be created **after** a target-language brand
  voice has been drafted, not before.
- **Minor fix included alongside this decision**: `app.html` declared
  `<html lang="en">` while every piece of rendered UI copy is Portuguese
  (confirmed against `src/features/*/copy.ts`, `EditorFooter.tsx`, and the
  original `prototype/index.html`, which correctly used `lang="pt-BR"`).
  This was a pre-existing inconsistency (likely a leftover from
  scaffolding), not an intentional interim state, so it has been corrected
  to `lang="pt-BR"` to match actual content — this is a one-line
  correctness fix, not part of the i18n-readiness question above.

## Reversal path

To revisit this decision:

1. Confirm there is real demand for a second language (user request,
   market signal, or strategic decision recorded by product-owner/
   C-Level).
2. Draft a target-language brand voice/copy-guide pass equivalent to
   `docs/copy-guide.md`, adapting (not translating) the "marcar"/hand/
   machine concept.
3. Only then file a SWE task to extract strings into a lightweight
   key-based i18n dictionary, using the adapted copy from step 2 as the
   first non-Portuguese dictionary.
4. Update this ADR's Status to "Superseded by ADR-000N" once that work
   begins.
