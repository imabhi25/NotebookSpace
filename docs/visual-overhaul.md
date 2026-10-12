# NotebookSpace visual overhaul

Branch: `design/visual-overhaul`. Baseline: `60b7c56`. This is a frontend visual pass; API contracts, backend code, data models, navigation structure, and production configuration are unchanged.

## Visual system

`frontend/src/tokens.css` is the only home for literal visual values. It defines warm background/surface/border/text neutrals and one muted blue accent, with derived hover, selection, and focus surfaces. Error, conflict, upload, and success states retain their existing text and icons on neutral surfaces instead of introducing competing colored themes.

The UI type scale is display 28px, title 20px, heading 16px, body 15px, and caption 12px. Each has a line-height token; reading content uses 1.75. One system font stack serves the UI. Code keeps a monospace stack, and third-party KaTeX keeps the mathematical fonts it needs.

Spacing uses a 4px base. Radii are 4/8/12/16px, with separate circle/pill geometry. There are two elevation shadows. Hover transitions use 150ms ease, panel transitions use 200ms ease, and reduced motion is respected. The progress spinner remains an ordinary loading indicator. Layout dimensions and optical border/focus widths are separate geometry tokens so this pass does not rearrange the panels.

## Components

`frontend/src/components.css` owns the shared visual treatments for primary, secondary, and ghost controls; fields; cards; badges; menus; modals; tabs; checkboxes; citations; reading content; and empty states. Superseded declarations were removed from the existing stylesheet. Inline colors, padding, margins, and fixed spinner styling moved into CSS. Long names keep ellipsis/title hints. Counts and dates use tabular numerals.

The largest visual changes are unified buttons/fields, quiet source and note cards, consistent modal spacing, readable citations, neutral status surfaces, and a shared empty-state icon. Existing empty-state wording and existing adjacent CTAs are retained rather than adding new search/reset actions or changing behavior. Tooltips remain native title tooltips rather than introducing a new tooltip interaction system.

Mobile controls have 44px minimum targets. The checkbox has a 44px hit area with a smaller visible mark. Existing clickable source, conversation, and note rows now expose their existing action to keyboard activation; no data action was added.

## Verification

- Existing frontend tests: 34/34 passed.
- TypeScript and production Vite build: passed.
- `node scripts/check-visual-tokens.cjs`: passed; no app-owned literal colors or CSS lengths outside the token definitions, and no undefined token references.
- Grep for literal colors, font sizes, padding/margins/gaps in app source: no matches outside definitions. Structural media-query breakpoints and SVG drawing coordinates are not visual spacing values.
- `git diff --check`: passed.
- Final browser sessions: no console errors.
- Baseline and branch both emit the same six React test `act(...)` warnings and the existing Vite >500kB JavaScript chunk advisory. No new warning category was introduced or hidden.

Browser checks used an isolated local guest and a clearly labelled synthetic lecture. A real local backend answer was rendered with citations; this is visual QA, not a claim of broad answer-quality validation. A temporary, untracked development proxy allowed the new preview port to reach the existing local backend without changing CORS or production code.

| Width | Dashboard | Open notebook | Modal |
| --- | --- | --- | --- |
| 1440px | Warm surfaces, unified controls, empty-state hierarchy inspected | Source card, real cited answer, passage, composer and keyboard focus inspected | Create and Add Source forms inspected; focus ring and Tab movement verified |
| 768px | Empty dashboard inspected | Reading view and contextual passage drawer inspected | Create form fits; checked controls meet 44px targets |
| 390px | Empty dashboard inspected | Populated reading view and source drawer inspected; visible buttons and checkbox targets measured at least 44px | Create form fits within viewport; no undersized form targets |

## Deliberate limits

The pre-existing full-width workspace can clip when the outer notebook sidebar and all inner panels are open. Narrow source drawers can also extend their footer below the viewport. These layout rules remain unchanged because layout changes were explicitly excluded. Collapsing the outer sidebar restores the normal desktop reading workspace. A separate layout correction should address these issues.

No dark mode, new dependency, new provider, paid service, copy rewrite, main-branch merge, or production deployment was added.
