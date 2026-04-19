# DS Context Intelligence

A Figma plugin for building, auditing, and evolving design systems. It covers the full lifecycle: onboarding a new design system from scratch, scanning and scoring existing tokens/components/styles, enriching context with AI, and syncing to external systems like GitHub and Notion.

---

## What It Does

The plugin operates across four main areas:

1. **Onboarding Wizard** — Guide-driven setup to create a complete token foundation in Figma variables
2. **Scan & Audit** — Evaluate components, tokens, and styles for design system maturity
3. **Foundation Edit** — Edit existing foundation tokens (colors, typography breakpoints) interactively
4. **Sync & Export** — Push tokens to GitHub, sync findings to Notion, export JSON

---

## Onboarding Wizard

A 13-step wizard that writes a complete token foundation into Figma variables. Every
step **commits live** as you move through — there is no single "Commit to Figma" pass
at the end. Finishing the wizard plays a **celebratory confetti screen** over the
system logo and name.

### Steps

| # | Label | What happens |
|---|-------|-------------|
| 0 | Name & Logo | Set the design system name and upload a logo; hue histogram auto-suggests primary + secondary brand colors |
| 1 | Brand Colours | Generate 10-shade tonal palettes from the seed(s); primary + optional secondary |
| 2 | Neutrals | Build the neutral gray scale |
| 3 | Functional Colours | Set destructive, warning, success, and info colors |
| 4 | Semantic — Basic | Map background, surface, border, text slots |
| 5 | Semantic — Shades | Assign shade-level semantic tokens |
| 6 | Semantic — Functional / States / Elevation | Map functional + interaction + shadow tokens |
| 7 | Type Families | Primary (and optional secondary) font family; **Apply** button writes to `.core/font-family/<role>` live |
| 8 | Text Styles | Map Figma text styles to `.breakpoint` typography tokens; auto-applies primary family to every style when no secondary family is configured |
| 9–11 | Spacing / Radius / Effects | Scale tokens for layout, corners, shadows |
| 12 | Finish | Celebratory completion screen with confetti |

### Header

- Title reflects the **name you entered in Step 0** (e.g. "Acme DS") instead of a generic
  "Foundation setup". The detected system family (e.g. `System: RADD 2.0`) is shown as
  a small tonal tag directly beneath the title.
- The **logo is clickable** — tap it any time to jump back to Step 0.

### Wizard Capabilities

- **Auto palette generation** — seed hex → full 10-shade scale computed automatically
- **Two-colour logo detection** — `onbExtractLogoColor` runs an 18-bin weighted-hue
  histogram and returns a secondary brand colour when a distinct second hue is present
  (≥30° away, ≥20% of the primary score). Secondary writes into
  `core-colours/brand/Secondary/<variant>` as a sibling of the Primary folder so both
  palettes share structure.
- **Auto-access (WCAG) pass** — after each semantic commit, a four-phase pass repairs
  contrast failures:
  - **Phase −1** rebases `accent-sec`/`on-accent-sec` to neutral when there is no
    secondary brand.
  - **Phase 0** proactively promotes `accent` / `text-link` / `text-dominant` to the
    sibling `/brand` token when compatible.
  - **Phase 1** fixes the label (on-accent) first to preserve the brand accent shade.
  - **Phase 2** swaps the accent only as a last-resort fallback, picking the closest
    lightness.
- **WCAG ax badges** on every token row: `AAA`, `AA`, `AA-large`, or `fail`.
- **Live font-family commit** — Step 07 writes to `.core/font-family/primary|secondary`
  via `ONBOARDING_SET_FONT_FAMILY_TOKEN` on Apply.
- **Auto-apply primary to all text styles** — when only one family is configured,
  Step 08 batches a single `UPDATE_VARIABLE` burst to set every style's `fontFamily`,
  then refetches once. A signature cache prevents re-firing on rerender.
- **Searchable token pickers** — each field has a combobox: search existing tokens in
  the same folder, or enter a custom value
- **Live font preview** — text styles render in their actual family (Google Fonts
  loaded on demand)
- **Draft persistence** — progress auto-saved to `figma.clientStorage` under
  `onboarding_draft`; resume any time
- **Undo per step** — `WIZARD_TAKE_SNAPSHOT` / `WIZARD_UNDO_LAST` track per-step
  history
- **AI descriptions** — generate token descriptions via Claude (Anthropic API key
  required)
- **Code syntax** — set per-platform export names (Web / Android / iOS) per token
- **Token scopes** — assign Figma variable scopes (ALL_SCOPES, TEXT_CONTENT, etc.)
  during setup
- **Completion screen** — on Finish, a 3-stage `canvas-confetti` burst fires over the
  pulsing logo + system name. The library is inlined at build time (see
  `scripts/write-version.js`) because Figma's sandbox blocks nested iframes to
  external origins.

---

## Foundation Edit

For files that already have a token foundation, the Foundation Edit view lets you make targeted changes without re-running the full wizard.

### Color Foundation

- Browse all foundation color variables grouped by collection and folder
- Edit values inline — color picker or hex input
- Swap aliases between tokens in the same folder
- Changes write immediately to Figma variables

### Typography Foundation

- Lists all text styles in the file with a live font preview
- Shows the corresponding `.breakpoint` typography variables for each style (e.g. `breakpoint/typography/display/font-size`)
- Each variable has a searchable combobox: pick another token from the same folder, or enter a custom value
- Reopening a picker restores the available token list for that group
- Writes changes via `UPDATE_VARIABLE` — automatically applied across all modes in the `.breakpoint` collection

---

## Scan & Audit

### Scan Types

| Mode | Scope |
|------|-------|
| Scan Selection | Selected nodes only |
| Scan Current Page | All components on the active page |
| Scan Entire File | Full file audit |
| Component Library Scan | Focused component audit with save/load |

### What Gets Scored

**Tokens & Variables**
- Naming conventions and hierarchy depth
- Description existence and quality
- Multi-mode support
- Alias chain depth
- Type-appropriate value consistency
- AI readiness (can an AI parser make sense of this token?)

**Components**
- Name quality and conventions
- Description completeness
- Documentation links
- Property naming and descriptions
- Variant structure
- Usage examples, accessibility notes, behavior documentation

**Styles**
- Naming conventions
- Description existence
- Purpose clarity

### Maturity Scoring

Each scanned entity receives a **Context Maturity** score across three dimensions:

| Dimension | What it measures |
|-----------|-----------------|
| **Data Density** | How complete and populated the entity is |
| **Semantic Alignment** | How well names and descriptions match their actual usage |
| **Ambiguity** | How clear and unambiguous the entity is for AI parsing |

Results are displayed in a **radar chart** and individual maturity stamps: `High`, `Medium`, `Needs Work`.

**Token Maturity** scores each token 0–100 with a tier:

| Tier | Range |
|------|-------|
| Good | 75–100 |
| Fair | 50–74 |
| Needs Work | < 50 |

Gap detection flags missing descriptions, broken aliases, missing scopes, and naming issues.

### Scan History

- Save snapshots of scan results with timestamps
- Load previous scans to compare over time
- Delete individual history entries

---

## AI & Context Enrichment

### AI Descriptions

- Generate descriptions for tokens and components using Claude (Anthropic API)
- Choose model: Claude Opus, Sonnet, or Haiku
- Feedback loop — rate generated descriptions to improve future suggestions
- Apply AI-suggested fixes directly to nodes or variables

### Rules Engine

- Load audit rules from local storage or a remote rubric URL
- Enrich rules via MCP bridge (design context, Storybook, Notion)
- Bake final rules for offline use
- Reset to defaults at any time
- Save/load named rule sets

### Learning Engine

- Learns patterns from completed scans
- Infer and confirm new rules
- Export the knowledge base
- Seed with pre-built design system patterns
- Clear and reset at any time

---

## Sync & Export

### GitHub

- Configure repository, branch, and file path
- Push token JSON to GitHub
- Pull tokens from GitHub
- Extract, transform, and export tokens in standard JSON format
- Theme/mode-specific exports

### Notion

- Sync audit findings to a Notion database
- Receive compliance scoring from Notion rules
- Enrich audit rules from Notion content

### MCP Bridge

The plugin exposes a bridge (`src/bridge.ts`) for MCP (Model Context Protocol) integration:

- Execute Figma plugin API code remotely
- Capture screenshots
- Receive enriched token/rule data from external agents

---

## Results Panel

After a scan the results view shows:

- **Radar chart** — data density / semantic alignment / ambiguity at a glance
- **Issue list** — every finding with severity (Critical / Warning / Info) and category
- **Token type badges** — Color / Float / String / Boolean / Paint / Text / Effect
- **Maturity stamps** — per-entity context maturity level
- **Reverse index hints** — usage data, hardcoded value warnings
- **Filters** — filter by severity, type, or radar dimension
- **Jump to canvas** — click any finding to select the node in Figma
- **Fix suggestions** — AI-powered suggestions per issue with one-click apply

---

## Settings

Accessible via the gear icon in the plugin header:

- Design system name and external docs/Storybook links
- DS logo upload (PNG, stored in plugin storage)
- Anthropic API key and model selection
- GitHub repository credentials and paths
- MCP endpoint configuration
- Light / Dark theme toggle

---

## Build & Development

**Prerequisites:** Node.js 18+, Figma Desktop

```bash
# Install
npm install

# Build once
npm run build

# Watch mode
npm run watch
```

**Load in Figma:** Plugins → Development → Import plugin from manifest → select `dist/manifest.json`

### Key Source Files

| File | Purpose |
|------|---------|
| `src/code.ts` | Plugin worker — all message handlers, scan flow, live wizard commits |
| `src/ui.html` | Full UI — onboarding wizard, scan results, foundation edit, settings |
| `src/onboarding/commit/*.ts` | Wizard commit ops: `.core`, light, dark, typography, validate |
| `src/onboarding/state/types.ts` | `OnboardingDraft` schema + shared wizard types |
| `src/token-scorer.ts` | Token maturity scoring (signals → reverse index → score) |
| `src/context-evaluator.ts` | Per-issue context dimension scoring |
| `src/maturity-engine.ts` | Overall maturity computation and radar data |
| `src/bridge.ts` | MCP bridge (execute, screenshot) |
| `scripts/write-version.js` | Build-time step: copies `src/ui.html` → `dist/ui.html`, stamps build version, inlines `canvas-confetti` at the `<!-- __CANVAS_CONFETTI__ -->` marker |
| `docs/MATURITY_SCORING_GUIDE.md` | Scoring methodology and task backlog |

---

## Privacy & Safety

- No external network calls except optional GitHub sync, Notion sync, and AI description generation (all user-configured)
- No telemetry or data collection
- Scan operations are read-only — nothing is modified unless you explicitly commit or apply a fix
- All storage is local to the Figma file via `figma.clientStorage`
