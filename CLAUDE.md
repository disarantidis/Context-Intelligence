# DS Context Intelligence — AI / Claude Code orientation

## Project

Figma plugin that evaluates **Design System maturity** (tokens, styles, components) and
also **creates a new foundation from scratch** through a 13-step Onboarding Wizard that
writes live to Figma variables. Maturity is computed with every **Scan Selection**; no
separate "Run Maturity Analysis" step.

## Stack

- **TypeScript** + webpack → `dist/code.js`, `dist/ui.html`
- **Figma Plugin API** only in worker; no DOM in `code.ts`. Storage: `figma.clientStorage`
- **UI**: single `src/ui.html` (vanilla JS + Preact for some views)
- **Build-time inlining**: `scripts/write-version.js` copies `src/ui.html` → `dist/ui.html`,
  substitutes `__BUILD_VERSION__`, and inlines `canvas-confetti` at the `<!-- __CANVAS_CONFETTI__ -->`
  marker (used by the wizard completion screen).

## Critical constraints

- Plugin runs in Figma's sandbox: no Node APIs, no arbitrary `fetch` to non-whitelisted
  URLs (rubric fetch is allowed). **Nested iframes to external origins are blocked** even
  with `allowedDomains` whitelisted — that's why the completion confetti is bundled JS, not
  a LottieFiles iframe.
- If you are working on a **legacy ES5** single-file `code.js` (e.g. from another repo), use
  **ES5 only**: `var`, function declarations, no arrow functions, no template literals.

## Key files

| Purpose | File(s) |
|--------|---------|
| Plugin entry, scan flow, message handler, live commits | `src/code.ts` |
| Token scoring (signals, reverse index, scoreToken) | `src/token-scorer.ts` |
| Context maturity (dimensions for radar) | `src/context-evaluator.ts`, `src/maturity-engine.ts` |
| UI, radar chart, wizard, results view | `src/ui.html` |
| Wizard commit ops (`.core`, light, dark, typography, validate) | `src/onboarding/commit/*.ts` |
| Wizard shared types + draft schema | `src/onboarding/state/types.ts` |
| Bridge for MCP (execute, screenshot) | `src/bridge.ts` |
| Maturity scoring guide + task list | `docs/MATURITY_SCORING_GUIDE.md` |

## Onboarding Wizard (13 steps, 0–12)

- Draft persisted in `figma.clientStorage` under `onboarding_draft`
  (see `OnboardingDraft` in `src/onboarding/state/types.ts`).
- Live commits per step (no single "Commit" button at the end); history tracked via
  `WIZARD_TAKE_SNAPSHOT` / `WIZARD_UNDO_LAST`.
- Header title reflects `onbDraft.name`; "System: RADD 2.0/3.0" is shown as a small tonal
  tag beneath the title. Logo in the header is clickable → jumps back to Step 0.
- Completion screen (`onbShowCompletionScreen`) fires a 3-stage canvas-confetti burst
  over the logo + draft name on Finish.

### Colour pipeline highlights

- **Logo → brand colours**: `onbExtractLogoColor` runs an 18-bin weighted-hue histogram;
  returns `{primary, secondary}` when a second hue ≥30° away with ≥20% of the primary
  score is found.
- **Secondary commit**: writes into `core-colours/brand/Secondary/<variant>` as a sibling
  of the Primary folder so both palettes share nesting structure
  (`wizardWritePaletteToSpecificCollection` in `src/code.ts`).
- **Auto-access pass** (`onbAutoAccessPass`) has four phases:
  - Phase −1: rebase `accent-sec`/`on-accent-sec` to neutral when no secondary brand.
  - Phase 0: proactively promote accent/text-link/text-dominant to the sibling `/brand`
    token when compatible.
  - Phase 1: fix the label (on-accent) first to preserve the accent shade.
  - Phase 2: swap the accent only as fallback, choosing the closest-lightness shade.
- Each token row shows a **WCAG ax badge** (AAA / AA / AA-large / fail).

### Typography highlights

- Step 07 (Type families) has an **Apply** button per family; writes to
  `.core/font-family/<role>` live via `ONBOARDING_SET_FONT_FAMILY_TOKEN`.
- Step 08 (Text Styles) **auto-applies** the primary family to every style's `fontFamily`
  field when there is no secondary family (one batch UPDATE_VARIABLE burst + one refetch,
  signature-cached in `window.onbTsLastAutoApplySig` so it fires once per change).

## Maturity scoring

- **Token maturity**: `extractTokenSignals` → `buildReverseIndex` → `computeAlignmentSignals`
  → `detectGaps` → `scoreToken`. Weights from rubric (cached or remote).
- **Context maturity**: per-issue dimensions (dataDensity, semanticAlignment, ambiguity) →
  radar chart and overall % in results.
- Full logic and **tasks for next**: see **`docs/MATURITY_SCORING_GUIDE.md`**.

## Tasks for next (summary)

- Unify token maturity with Variables scan and show tier/gaps in results (T1–T2). ✅
- Extend radar (more factors, drill-down) (T3–T4). T4 ✅
- Rubric hosting and UI for weights (T5–T6).
- Reverse index without component library + load from file/URL (T7–T8). T7 ✅
- Gaps in UI and export (T9–T10). ✅
- Unit tests and Node test script for scorer (T11–T12).
- Docs: "How to read the radar" and context vs token maturity (T13–T14). T13 ✅

Details and checkboxes: **`docs/MATURITY_SCORING_GUIDE.md`** § 8.

## Build

```bash
npm install
npm run build          # one-shot
npm run watch          # webpack watch mode
```

`npm run build` runs `scripts/write-version.js` → webpack → copies `manifest.dist.json`
into `dist/manifest.json`. Load `dist/manifest.json` in Figma Desktop
(Plugins → Development → Import plugin from manifest).

> **Always build after edits** — run `npm run build` after every source change.
