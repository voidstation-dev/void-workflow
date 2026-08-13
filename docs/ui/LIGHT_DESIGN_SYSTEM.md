# Void Workflow — Light Design System

**Phase:** UI Phase 1 — Light Design System
**Status:** DONE (tokens live)
**Spec:** [VOID_WORKFLOW_LIGHT_UI_SPEC.md](../../VOID_WORKFLOW_LIGHT_UI_SPEC.md) §1, §24, §25, §26, §29
**Implementation:** [src/App.css](../../src/App.css) — `:root` + `@theme inline` + `@layer base`.

> The token system is `var()`-based. A single light `:root` block (no dark block,
> no `data-theme` switch) retargets every Tailwind utility and every shadcn alias
> automatically — **no component edits were required to flip the palette.** This is
> the foundation every later phase builds on.

---

## 1. Design intent (spec §1)

Clean SaaS workflow builder + professional desktop automation tool + lightweight node
editor. Emphasize clarity, hierarchy, calm spacing, compact cards, low visual noise,
obvious drag affordances, easy scanning of execution logic, right-side build library,
workspace-first layout. **Avoid** heavy dark styling, giant cards, excessive borders,
neon accents, dashboard-card grids, floating-glass overuse.

## 2. Color palette (spec §24)

Light neutral canvas, white panels, indigo accent. Centralized as tokens; semantic
status uses **muted** tones (not vivid), always paired with icon + text (status is
never color-only — §27 contract).

| Token | Value | Use |
|---|---|---|
| `--surface-canvas` | `#F7F7F5` | Canvas background |
| `--surface-canvas-grid` | `#E2E4E8` | React Flow dotted grid (low-opacity on canvas) |
| `--surface-sidebar` | `#FFFFFF` | Header, library, inspector, toolbar |
| `--surface-panel` | `#FFFFFF` | Dock, sections, inputs, node cards |
| `--surface-elevated` | `#FFFFFF` | Popovers, menus, selected, toasts (lifted by shadow, not tint) |
| `--surface-hover` | `#F2F3F5` | Hover / active row fill |
| `--surface-input` | `#FFFFFF` | Form control bg (border defines it on white) |
| `--surface-overlay` | `rgba(23,24,28,0.45)` | Modal scrim |
| `--border-subtle` | `#E6E7E9` | Zone separators (1px) |
| `--border-default` | `#C9CBD0` | Popover / menu / input borders |
| `--border-focus` | `#5267E9` | **Accent / focus / selection ring** |
| `--border-status` | `#C9CBD0` | Status badge outlines, progress track |
| `--text-primary` | `#17181A` | Primary text (~16:1 on panel — AAA) |
| `--text-secondary` | `#64676D` | Secondary text (~5.3:1 — AA) |
| `--text-muted` | `#92969E` | Muted / decorative (AA-large; use for ≥14px or decorative) |
| `--text-disabled` | `#C0C4CC` | Disabled / decorative small text |
| `--text-error` | `#C5303C` | Error text (~4.6:1 — AA) |
| `--text-accent` | `#3F52D4` | Accent-tinted text on white (links, run %) — darker than the fill for contrast |
| `--text-on-accent` | `#FFFFFF` | On accent fills (Run button label) |
| `--text-on-status` | `#FFFFFF` | In filled status badges |
| `--accent` | `#5267E9` | Indigo accent (was blue `#1d6fd0` — whole hue family moved) |
| `--accent-hover` | `#4554D6` | Hover on accent fills (darkens, never opacity-down) |
| `--accent-subtle` | `rgba(82,103,233,0.10)` | Selection highlight, focus subtle fill |

### Status (muted tones — spec §24)

| Token | Value | Note |
|---|---|---|
| `--status-idle` | `#92969E` | |
| `--status-queued` | `#8B7AC4` | |
| `--status-running` | `#5267E9` | Follows the new accent — "live" color |
| `--status-success` | `#3FAE7A` | |
| `--status-warning` | `#C8861E` | |
| `--status-error` | `#C5303C` | |
| `--status-error-strong` | `#B02733` | Filled error buttons/badges (text-on-status, 4.5:1+) |
| `--status-error-hover` | `#9E2230` | Error hover darkens |
| `--status-cancelled` | `#7A8089` | |
| `--status-skipped` | `#A0A5AD` | |

### Ports (color-secondary; shape + icon primary — §1 "avoid neon")

Desaturated from the dark palette so they read as cues, not neon, on white. Shape and
icon remain the primary port cue (contract-compliant).

| Token | Value |
|---|---|
| `--port-text` | `#64748B` |
| `--port-number` | `#2E96C9` |
| `--port-boolean` | `#D9A21B` |
| `--port-json` | `#7C5DD6` |
| `--port-file` | `#857F77` |
| `--port-media` | `#E07A3C` |
| `--port-audio` | `#1FA89A` |
| `--port-video` | `#C266D9` |
| `--port-artifact` | `#22A06B` |
| `--port-any` | `#64748B` |

## 3. Radius & shadow (spec §25)

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius-node` | `10px` | **Node cards** (distinct from 12px panels) |
| `--radius-panel` | `12px` | Panels, popovers, menus |
| `--radius-control` | `8px` | Buttons, inputs, small controls (spec 7–9px) |
| `--radius-chip` | `6px` | Metadata chips, badges (spec 5–6px) |
| `--radius-full` | `9999px` | Dots, circular port handles |

> The prior dark scale was control 4px / panel 6px — below spec. Node radius (10px) is
> deliberately smaller than panel radius (12px) so node cards stay distinct from the
> panels that contain them.

### Shadow

| Token | Value | Use |
|---|---|---|
| `--shadow-node` | `0 2px 8px rgba(0,0,0,0.05)` | Node cards (spec §25) |
| `--shadow-node-selected` | `0 4px 16px rgba(0,0,0,0.10)` | Selected node card (spec §25 "slightly stronger shadow + accent outline") |
| `--shadow-popover` | `0 4px 16px rgba(0,0,0,0.08)` | Popovers, menus, tooltips |
| `--shadow-modal` | `0 8px 32px rgba(0,0,0,0.12)` | Modals, dialogs |

> The prior dark `--shadow-node` was `rgba(0,0,0,0.35)` — 7× too strong for a light
> canvas. Light shadows are subtle; the selected-card state gets a stronger shadow
> **and** an accent outline (applied in Phase 4, not via a token alone).

## 4. Edges (spec §11)

Subtle, readable, 1–1.5px neutral; selected = accent 2px; running = optional animated
dash (preserved). The edge CSS in [App.css](../../src/App.css) reads these tokens
unchanged.

| Token | Value |
|---|---|
| `--edge-stroke` | `#B6BAC1` (visible-but-subtle on `#F7F7F5`) |
| `--edge-stroke-width` | `1.5px` (`--border-width-edge`) |
| `--edge-stroke-selected` | `var(--accent)` |
| `--edge-stroke-selected-width` | `2px` (`--border-width-strong`) |

## 5. Motion, z-index, fonts, spacing

Unchanged from the prior system (these are theme-independent):

- **Motion:** fast 80ms / base 120ms, `cubic-bezier(0.2,0,0,1)`. `prefers-reduced-motion`
  zeroes durations and strips the run-payload edge dash (contract).
- **Z-index:** canvas 0 / node-selected 5 / panel 10 / toolbar 20 / popover 30 / toast 40 / modal 50.
- **Fonts:** Inter stack (sans), JetBrains Mono stack (mono). Root font-size 13px for desktop density.
- **Spacing:** 4/8/12/16/20/24 (`--space-1..6`).
- **Focus ring:** 2px `--border-focus`, offset 2px; `prefers-contrast: more` widens to 3px.
- **`::selection`:** `--accent-subtle` background (low-alpha indigo, reads cleanly on white).

## 6. colorMode + color-scheme (the flagged contract change)

- `color-scheme: light` in `:root` and `@layer base html` ([App.css](../../src/App.css)).
- `class="dark"` removed from [index.html](../../index.html).
- **`colorMode="light"`** on React Flow ([WorkflowCanvas.tsx:324](../../src/components/canvas/WorkflowCanvas.tsx#L324)) —
  the one frozen §27 contract item changed in this redesign. **Sign-off:** inherent to
  the user's explicit light-UI request; no code branches on `colorMode`'s value (verified),
  so the flip is pure presentation. Recorded in the [§27 ledger](../UI_LIGHT_REDESIGN_STATUS.md).

## 7. shadcn/ui decision (spec §26) — restyle-only

**Decision: keep the existing custom primitives; do NOT install shadcn in Phase 1.**

Rationale:
- **Lowest risk.** No `npx shadcn add` → no regenerating the documented
  [`--accent` alias trap](../../src/App.css) ([App.css:123-131](../../src/App.css#L123)) that previously shadowed the semantic `--accent` and broke Run/Save buttons.
- **Honors §40** ("do not force the suggested structure if the existing codebase has a good equivalent") and §26 ("do not blindly use shadcn demo styles — apply Void Workflow tokens"). The existing primitives (`Panel`, `PropertyRow`, `InspectorSection`, `NodeStatus`, `StatusBadge`, `ToolbarButton`, `EmptyState`) already use Void tokens by name.
- **No Tailwind v4 JS-config mismatch.** shadcn's CLI still assumes `tailwind.config.*`; this repo is CSS-config (`@tailwindcss/vite`). Installing now risks init friction.
- **Revisitable.** If a later phase needs a complex primitive the custom layer can't cheaply provide (e.g. the Phase 3 Build-panel `Sheet` drawer at small widths, or a `Command` palette), a **hybrid partial install** (only that primitive) remains open. Any `shadcn add` must re-verify Run/Save buttons against the `--accent` trap afterward.

The shadcn alias block in [App.css](../../src/App.css) is preserved so a future install
lands on the same tokens — `--accent`/`--accent-foreground` stay intentionally omitted
(see the comment there).

## 8. Tailwind v4 mapping (`@theme inline`)

Every `:root` token is exposed as a Tailwind utility namespace via `@theme inline` in
[App.css](../../src/App.css). Because `inline` makes utilities reference the `var()`
(not the resolved value), the light `:root` retargets every utility with zero component
edits. New namespaces added in Phase 1:

- `--radius-node` → `rounded-node`
- `--radius-chip` → `rounded-chip`
- `--shadow-node-selected` → `shadow-node-selected`

Full surface/border/text/status/accent/port/radius/spacing/shadow/motion/font namespaces
are unchanged in name; only their resolved values flipped to light.

## 9. Contrast notes (on `#FFFFFF`)

Contrast was re-derived for the light canvas, **not copied from dark**:

- `--text-primary` `#17181A` ≈ 16:1 on white (AAA).
- `--text-secondary` `#64676D` ≈ 5.3:1 (AA for normal text).
- `--text-muted` `#92969E` ≈ 3.2:1 — **AA only for large/decorative text**; never use it
  for body or interactive labels below ~14px. (Existing `text-text-muted` usages will be
  audited in Phase 10; any body-text misuse is fixed there.)
- `--text-error` `#C5303C` ≈ 4.6:1 (AA).
- `--text-accent` `#3F52D4` ≈ 6.6:1 — used for accent-tinted text on white (darker than
  the `#5267E9` fill, which is for fills/links-on-white-bg, not text-on-white).
- Filled status badges use `--text-on-status` `#FFFFFF`; error fills use
  `--status-error-strong`/`--status-error-hover` (darken on hover, never opacity-down).

## 10. Definition of Done (spec §36, Phase 1)

- [x] Light tokens live in `:root` (spec §24 palette).
- [x] `color-scheme: light` + `class="dark"` removed.
- [x] `colorMode="light"` (flagged contract change, documented + ledger-recorded).
- [x] Radius scale corrected (node 10 / panel 12 / control 8 / chip 6) + new tokens.
- [x] Shadow scale light-tuned (node 0.05 / selected 0.10) + `--shadow-node-selected`.
- [x] Status + port tokens re-contrasted on white (muted, not neon).
- [x] shadcn decision locked (restyle-only) + rationale recorded.
- [x] `@theme inline` extended for new radius/shadow namespaces.
- [x] Tauri window → default 1440×900, min 1200×760 (spec §29).
- [ ] Verification gate (tsc / build / runtime smoke) — run next.

**Phase 1 is complete pending the verification gate.** Proceeds to Phase 2 (Header &
Tabs) once the gate is green.