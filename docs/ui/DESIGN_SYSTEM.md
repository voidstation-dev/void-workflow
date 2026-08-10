# Void Workflow — Design System (Phase 2)

**Status:** Frozen (UI Phase 2 — Design System)
**Scope:** A SPEC document only. No application source code, no `.tsx`/`.ts`/`.rs`/`.css` edits. This document defines the token system, typography, spacing, primitives, and visual rules that Phase 3 (Workspace Shell) and all later phases implement against.
**Inputs:** `VOID_WORKFLOW_UI_REDESIGN_AND_NODE_DESIGN_PLAN.md` (§7, §8, §13, §UI PHASE 2, §27, §28), `docs/ui/WORKSPACE_UX_SPEC.md` (Phase 1, frozen).
**Authority:** This is the binding visual contract for Phase 3+. Every token NAME the Phase 1 spec references (`surface.*`, `border.*`, `text.*`, `status.*`, `--border-focus`, `--surface-canvas-grid`, radius, focus, port, density, monospace, reduced-motion) receives its concrete VALUE here. Any deviation in a later phase requires editing this document first.
**Stack facts (verified, not contradicted):** Tailwind CSS v4 via `@tailwindcss/vite`; `src/App.css` is currently only `@import "tailwindcss";` with no `@theme` block and no `tailwind.config.*`. shadcn is NOT initialized (`components.json` absent) — this system is shadcn-**compatible** but assumes no shadcn primitives. `lucide-react@1.31.0`, `clsx` + `tailwind-merge` (`cn()` at `src/lib/utils.ts`), `zustand@5`, `zod@4`, React 19, `@xyflow/react@12`.

> **Synthesis note:** Token values are hex (verifiable for WCAG contrast computation). The palette unifies the accessibility-first contrast-verified surface scale with a single restrained blue accent (`#1d6fd0` — darkened from an earlier `#3b9eff` so that white Run-button labels clear 4.5:1 AA; see §12.1) and the tailwind-shadcn-native shadcn alias layer. Port colors use Okabe-Ito-informed hues with shape+icon as primary cues.

---

## 1. Overview & Principles

Void Workflow is a developer tool + creative workflow + media production workspace (plan §7). The visual system targets the feel of a DAW / IDE / node editor: neutral charcoal surfaces, one restrained accent, subtle borders, tight desktop density, functional typography, and the strongest contrast reserved for execution states — because run clarity is the product.

**Principles (operationalize plan §7, §8; spec §0):**

1. **Dark-first.** `color-scheme: dark` is the primary palette (spec §1). The dark palette is the `:root` token set. Light mode is a stretch goal (§13.4) — noted but not fully specified.
2. **One accent.** A single blue accent (`--accent`) carries focus, selection, and the `running` state. Status colors are semantic and separate from the accent except that `running` deliberately reuses the accent — the "live" color is the accent color.
3. **Neutral surfaces, subtle borders.** Five charcoal surfaces separated by 1px low-contrast borders, not by shadow or large gaps. No card grids, no neon, no SaaS dashboard wash, no giant node cards (plan §7).
4. **Compact desktop density.** 24×24px interactive floor (spec §1); 28px PropertyRow height (spec §8.2); 11–13px body text (plan §8); 12px panel padding, 8px toolbar/dock padding (spec §1).
5. **Status is never color-only** (spec §0.5, §6, §8, §11). Every status surface carries a text label + a lucide icon; color is a secondary cue. Color-blind safety is structural (shape + icon), not opt-in.
6. **Functional typography.** A clean system sans for UI chrome; a strong monospace for logs and values. No display faces.
7. **Motion is restrained.** Default transitions ≤120ms, opacity/translate only. `prefers-reduced-motion` makes all motion instant (0ms) (spec §1). No decorative animation.
8. **Tokens, not literals.** Phase 3 ships zero raw color literals (spec §1, R9). Every color goes through a `--*` CSS variable mapped into a Tailwind v4 `@theme` block.
9. **Accessibility is a token-level invariant.** WCAG AA minimum (4.5:1 text, 3:1 UI/large). Computed contrast ratios documented in §12. `prefers-reduced-motion` zeroes all motion globally. `prefers-contrast: more` widens focus rings to 3px and forces always-on status labels (spec §1).
10. **shadcn-compatible, not shadcn-dependent.** Tokens live as CSS custom properties on `:root` and are aliased into a Tailwind v4 `@theme inline` block. shadcn primitives (added in Phase 3+) consume the same vars; nothing here assumes shadcn is present.

Every plan §7 "Avoid" item maps to a token constraint: "Excessive neon" → no saturated status backgrounds; "Giant node cards" → node card dimensions capped in the node visual system; "SaaS dashboard" → neutral surfaces, no card grids.

---

## 2. Token System

Every token has a CSS variable, a Tailwind v4 `@theme` utility name, and a dark value. Components MUST use the utility class (`bg-surface-panel`) or `var(--…)` — never a raw literal. The `@theme utility` column gives the Tailwind class prefix generated from the `@theme` mapping.

### 2.1 Surface tokens

| Token name | CSS var | @theme utility | Dark value | shadcn alias | Usage |
|---|---|---|---|---|---|
| `surface.canvas` | `--surface-canvas` | `bg-surface-canvas` | `#0d0f13` | — (canvas-specific) | Canvas zone background (Zone C, spec §7); console log body. Deepest surface. |
| `surface.canvas-grid` | `--surface-canvas-grid` | (raw var) | `#1f232b` | — | React Flow `Background` dot grid (spec §7 names `--surface-canvas-grid`; replaces hardcoded `#334155`, audit §5.4). |
| `surface.sidebar` | `--surface-sidebar` | `bg-surface-sidebar` | `#14161b` | `--background` | App Rail, Node Library, Inspector, Top Toolbar (spec §3, §4, §5, §6, §8). |
| `surface.panel` | `--surface-panel` | `bg-surface-panel` | `#1a1d23` | `--card` | Dock body, search input, node cards, Inspector sections, PropertyRow inputs, toast body, empty-state action buttons (spec §6, §7.1, §8.2, §9, §10). |
| `surface.elevated` | `--surface-elevated` | `bg-surface-elevated` | `#22262e` | `--popover` | Selected node lift, popovers, menus, tooltips, health popover, modals (spec §5.2, §7.3, §10). |
| `surface.hover` | `--surface-hover` | `bg-surface-hover` | `#2a2f38` | `--secondary` | Hover/active row fill (library items, dock pills, rail items, menu items); active collapsed-dock pill. |
| `surface.input` | `--surface-input` | `bg-surface-input` | `#181b21` | `--input` (bg) | Form control background (inputs, selects, textareas). Slightly darker than panel for legibility. |
| `surface.overlay` | `--surface-overlay` | `bg-surface-overlay` | `rgba(7, 8, 10, 0.6)` | — (scrim) | Modal scrim (spec §10.3). Semi-transparent. |

### 2.2 Border tokens

| Token name | CSS var | @theme utility | Dark value | shadcn alias | Usage |
|---|---|---|---|---|---|
| `border.default` | `--border-default` | `border-border-default` | `#2e333d` | `--border` | Popover/menu/toast borders, node card border, input outlines, strong dividers (spec §10.1). |
| `border.subtle` | `--border-subtle` | `border-border-subtle` | `#21252d` | — | The 1px separator between all zones (spec §3 "1px border.subtle is the separator"); Inspector section dividers; danger-zone separator; tablist underline base. Lowest-contrast structural border. |
| `border.focus` | `--border-focus` | `border-border-focus` | `#1d6fd0` | `--ring` | `:focus-visible` ring; selection ring; focused edge stroke. THE accent border (spec §4, §6, §7.3, §9). Same value as `--accent`. |
| `border.status` | `--border-status` | `border-border-status` | `#3a4049` | — | Border on status-bearing elements (badge outlines, run-progress track). |

### 2.3 Text tokens

| Token name | CSS var | @theme utility | Dark value | shadcn alias | Usage | Contrast (vs surface) |
|---|---|---|---|---|---|---|
| `text.primary` | `--text-primary` | `text-text-primary` | `#e7e9ec` | `--foreground` | Current breadcrumb segment, node title, log message, input values, primary labels (spec §5.1, §9.3). | 13.88:1 vs `surface.panel` — PASS AA/AAA (§12) |
| `text.secondary` | `--text-secondary` | `text-text-secondary` | `#aeb4be` | `--muted-foreground` | Parent breadcrumb, log node name, problem message, secondary labels, "Unsaved" chip (spec §5.1, §9.3, §9.4). | 8.10:1 vs `surface.panel` — PASS AA/AAA |
| `text.muted` | `--text-muted` | `text-text-muted` | `#949aa6` | — | Metadata (11px), timestamps, placeholder, "Saved" chip, health label, dock summary, run-progress text (spec §5.1, §5.2, §9.3, §12). | 5.97:1 vs `surface.panel` — PASS AA |
| `text.disabled` | `--text-disabled` | `text-text-disabled` | `#6b7280` | — | Disabled control labels, unavailable rail items. **Documented decorative-only for small text** (§12). | 3.49:1 vs `surface.panel` — PASS 3:1 UI; decorative for normal text |
| `text.error` | `--text-error` | `text-text-error` | `#f0656a` | `--destructive` | Error labels, "Save failed" chip, danger-zone action text (spec §5.1, §8.2). | 5.45:1 vs `surface.panel` — PASS AA |
| `text.accent` | `--text-accent` | `text-text-accent` | `#4a9eff` | — | Accent-tinted text (links, active run percentage). | 6.57:1 vs `surface.sidebar` — PASS AA |
| `text.on-accent` | `--text-on-accent` | `text-text-on-accent` | `#ffffff` | `--primary-foreground` | Text on accent-filled surfaces (Run button, active rail fill). | 4.96:1 vs `accent` `#1d6fd0` — PASS AA (normal text; the Run label is 12px semibold = normal text per WCAG, not large) |
| `text.on-status` | `--text-on-status` | `text-text-on-status` | `#ffffff` | `--destructive-foreground` | Text inside filled status badges (rare; most status is dot+text, not filled). | per-status (§12) |

### 2.4 Status tokens

Status tokens are COLOR-SECONDARY cues. Every status usage MUST pair the token with a text label + icon (spec §0.5, §11). Status tokens appear as: (a) a 6px dot, (b) a 2px left-edge accent on node cards, (c) a 2px progress-bar fill, (d) an icon stroke color. **Never** a full-background wash on a node card (plan §12, spec §11.2).

| Token name | CSS var | @theme utility | Dark value | Usage |
|---|---|---|---|---|
| `status.idle` | `--status-idle` | `bg-status-idle / text-status-idle` | `#6b7280` | Idle state dot/text. Neutral. |
| `status.queued` | `--status-queued` | `bg-status-queued / text-status-queued` | `#b08ad3` | Queued state (starting, saving). Soft reddish-purple, non-alarming. |
| `status.running` | `--status-running` | `bg-status-running / text-status-running` | `#1d6fd0` | Running dot, animated edge, run-progress fill, per-node running. Same hue as accent — the "live" color is the accent. |
| `status.success` | `--status-success` | `bg-status-success / text-status-success` | `#36c98a` | Success dot, "Completed", "Saved", `✓` icon, health Ready. Bluish-green. |
| `status.warning` | `--status-warning` | `bg-status-warning / text-status-warning` | `#e8a317` | Warning dot, "Unsaved" chip, `△` icon, "Not executable yet" badge, health Configured/Degraded. Amber. |
| `status.error` | `--status-error` | `bg-status-error / text-status-error` | `#f0656a` | Error dot, "Failed", "Save failed", `✕` icon, health Down, Stop button fill, danger fills. Vermillion. |
| `status.cancelled` | `--status-cancelled` | `bg-status-cancelled / text-status-cancelled` | `#787e8a` | Cancelled dot/text. Lighter neutral than `status.idle` so the dot reads distinct from idle even before the `Ban` icon is processed. |
| `status.skipped` | `--status-skipped` | `bg-status-skipped / text-status-skipped` | `#5a6271` | Skipped dot/text. Darkest neutral status. |

> **Synthesis note:** `status.idle` (`#6b7280`) and `status.cancelled` (`#787e8a`) are both neutral but use distinct lightness levels so the cancelled dot reads as different from idle even before the icon (`Circle` hollow vs `Ban`) and label ("idle" vs "Cancelled") are processed — color is still secondary, but the dots are no longer identical. `status.skipped` is the darkest neutral (`#5a6271`) to read as the lowest-activity state. This unifies the accessibility-first neutral approach with the media-dev-tool restraint invariant.

### 2.5 Accent tokens

| Token name | CSS var | @theme utility | Dark value | shadcn alias | Usage |
|---|---|---|---|---|---|
| `accent` | `--accent` | `bg-accent` / `text-accent` / `border-accent` | `#1d6fd0` | `--primary` | Run button fill, active-tab underline, selected edge stroke, active rail accent bar, progress-bar fill. THE single accent. White text on this fill = 4.96:1 (PASS AA). |
| `accent.hover` | `--accent-hover` | `bg-accent-hover` | `#2874d4` | — | Hover for accent-filled controls. White text on hover = 4.63:1 (PASS AA). |
| `accent.subtle` | `--accent-subtle` | `bg-accent-subtle` | `rgba(29, 111, 208, 0.18)` | `--accent` | Active rail item background, hovered accent-tinted rows, `::selection` background. |

### 2.6 Port color tokens (plan §13, spec §7.3 — 10 families)

Port colors are SECONDARY cues. Shape + icon are primary (§10). Colors are Okabe-Ito-informed (color-blind-safe for protanopia, deuteranopia, tritanopia) and intentionally less saturated than status colors so they do not compete with execution states.

| Token name | CSS var | @theme utility | Dark value | Family |
|---|---|---|---|---|
| `port.text` | `--port-text` | `text-/border-port-text` | `#94a3b8` | Text |
| `port.number` | `--port-number` | `…-port-number` | `#38bdf8` | Number |
| `port.boolean` | `--port-boolean` | `…-port-boolean` | `#fbbf24` | Boolean |
| `port.json` | `--port-json` | `…-port-json` | `#a78bfa` | Json |
| `port.file` | `--port-file` | `…-port-file` | `#a8a29e` | File |
| `port.media` | `--port-media` | `…-port-media` | `#fb923c` | Media |
| `port.audio` | `--port-audio` | `…-port-audio` | `#2dd4bf` | Audio |
| `port.video` | `--port-video` | `…-port-video` | `#e879f9` | Video |
| `port.artifact` | `--port-artifact` | `…-port-artifact` | `#22c55e` | Artifact |
| `port.any` | `--port-any` | `…-port-any` | `#94a3b8` | Any |

> **Synthesis note:** `port.text` and `port.any` share `#94a3b8` (neutral) — they are distinguished by shape (both circle) + icon (`Type` vs `Asterisk`) + the `Any` handle's dashed outline, never by color. This is by design: both are "untyped-ish" and should read as low-visual-weight. No port color collides with a status color (`#1d6fd0` accent/running, `#36c98a` success, `#e8a317` warning, `#f0656a` error, `#b08ad3` queued are all distinct from the port hues). `port.artifact` uses `#22c55e` (a cleaner, more saturated green than the earlier `#34d399`) specifically to widen hue separation from `status.success` `#36c98a`; the two also never co-occur on the same pixel — `port.artifact` is a square handle with a `Package` icon, `status.success` is a dot with a `Check` icon.

### 2.7 Structural tokens (spacing, radius, motion, border-width, shadow, z-index)

#### Radius

| Token name | CSS var | @theme utility | Value | Usage |
|---|---|---|---|---|
| `radius.control` | `--radius-control` | `rounded-control` | `4px` | Buttons, inputs, selects, search, square port handles, pills, status badges. Spec §1. |
| `radius.panel` | `--radius-panel` | `rounded-panel` | `6px` | Panels, popovers, menus, toasts, node cards, Inspector sections, modals. Spec §1, §5.2. |
| `radius.full` | `--radius-full` | `rounded-full` | `9999px` | Status dots, circular port handles, save-chip dot. |

> **Synthesis note:** Using Tailwind v4's `@theme` with `--radius-control` generates `rounded-control` (not `rounded-radius-control`), matching the media-dev-tool-aesthetic proposal's cleaner utility names. This is the Tailwind v4 convention: `--radius-{name}` → `rounded-{name}`.

#### Spacing (plan §8: 4/8/12/16/20/24)

| Token name | CSS var | @theme utility | Value | Usage map |
|---|---|---|---|---|
| `space.1` | `--space-1` | `p-1` / `gap-1` / `m-1` | `4px` | Icon-to-text gap inside badges/chips; port-label gap; dot-to-label gap; tight inline padding. |
| `space.2` | `--space-2` | `p-2` / `gap-2` / `m-2` | `8px` | Toolbar horizontal edge padding (spec §1, §5); gap between toolbar items; dock 8px padding (spec §1); button internal px; library item 8px horizontal padding (spec §6); chevron-to-title gap. |
| `space.3` | `--space-3` | `p-3` / `gap-3` / `m-3` | `12px` | Panel internal padding (spec §1 "panels 12px"); Inspector section padding; node-card internal padding; popover padding. |
| `space.4` | `--space-4` | `p-4` / `gap-4` / `m-4` | `16px` | Section-to-section vertical gap; modal body padding; empty-state internal padding. |
| `space.5` | `--space-5` | `p-5` / `gap-5` / `m-5` | `20px` | Large section separation; empty-state vertical breathing room. |
| `space.6` | `--space-6` | `p-6` / `gap-6` / `m-6` | `24px` | Modal viewport margin; major region separation; dialog outer. |

> **Synthesis note:** Tailwind v4's default spacing scale already uses a 4px base (`p-1`=4px … `p-6`=24px), matching plan §8 exactly. The `--space-1..6` vars are exposed for non-utility contexts (React Flow inline styles, port positioning math) and align 1:1 with the numeric utilities.

#### Border width

| Token name | CSS var | Value | Usage |
|---|---|---|---|
| `border.width` | `--border-width` | `1px` | All `border.subtle` and `border.default` borders, zone separators, input outlines. |
| `border.width.strong` | `--border-width-strong` | `2px` | Focus/selection ring stroke, selected edge stroke. |
| `border.width.edge` | `--border-width-edge` | `1.5px` | Default canvas edge stroke (spec §7.3). |

#### Shadow

| Token name | CSS var | @theme utility | Value | Usage |
|---|---|---|---|---|
| `shadow.popover` | `--shadow-popover` | `shadow-popover` | `0 8px 24px rgba(0, 0, 0, 0.45)` | Popovers, menus, toasts (spec §5.2, §10.1). |
| `shadow.modal` | `--shadow-modal` | `shadow-modal` | `0 12px 40px rgba(0, 0, 0, 0.5)` | Modal dialogs (spec §10.3). |
| `shadow.node` | `--shadow-node` | `shadow-node` | `0 2px 8px rgba(0, 0, 0, 0.35)` | Node cards; selected node lift adds a 2px `--border-focus` ring instead of heavier shadow. |

Shadows are intentionally minimal (restrained, plan §7). No shadow on default panels — borders define edges.

#### Motion

| Token name | CSS var | @theme utility | Value | Usage |
|---|---|---|---|---|
| `motion.duration.fast` | `--motion-duration-fast` | `duration-fast` | `80ms` | Hover transitions, dot state changes. |
| `motion.duration.base` | `--motion-duration-base` | `duration-base` | `120ms` | Default max motion (spec §1: ≤120ms). Collapse/expand, toast appear. |
| `motion.easing` | `--motion-easing` | `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default easing (opacity/translate only, spec §1). |

> `prefers-reduced-motion` is handled globally (§3, §9): a media query sets all `--motion-duration-*` to `0ms` and a blanket `transition-duration: 0ms !important`. Components read the var, so reduced-motion is automatic.

#### Z-index

| Token name | CSS var | Value | Usage |
|---|---|---|---|
| `z.canvas` | `--z-canvas` | `0` | Canvas base. |
| `z.node-selected` | `--z-node-selected` | `5` | Selected node above unselected (spec §13). |
| `z.panel` | `--z-panel` | `10` | Panels, dock, inspector above canvas content. |
| `z.toolbar` | `--z-toolbar` | `20` | Top toolbar above panels. |
| `z.popover` | `--z-popover` | `30` | Popovers, menus, tooltips. |
| `z.toast` | `--z-toast` | `40` | Toast region. |
| `z.modal` | `--z-modal` | `50` | Modal + scrim. |

---

## 3. The `@theme` block + `:root` CSS variable declarations

Copy-paste-ready for Phase 3. This listing is SPEC (a code listing inside this doc), not application source. Phase 3 places this in `src/App.css` (or a `src/styles/tokens.css` imported first from `App.css`) replacing the current `@import "tailwindcss";` only line. The `:root` block defines the dark-first palette; the `@theme inline` block maps every var to a Tailwind v4 utility namespace so `bg-surface-panel`, `text-text-primary`, `border-border-focus`, `rounded-control`, etc. become available. `inline` makes utilities reference the `var()`, so a future `[data-theme="light"]` block overriding the `:root` vars retargets every utility automatically.

```css
@import "tailwindcss";

/* ============================================================================
   Void Workflow — Design System tokens (Phase 2 spec, Phase 3 implements)
   Dark-first. color-scheme: dark. Light mode is a stretch goal (§13.4).
   shadcn-compatible: background/foreground/primary/... aliases preserved.
   ========================================================================== */

:root {
  color-scheme: dark;

  /* --- Surface ---------------------------------------------------------- */
  --surface-canvas:       #0d0f13;  /* canvas bg, deepest surface            */
  --surface-canvas-grid:  #1f232b;  /* React Flow Background dots            */
  --surface-sidebar:      #14161b;  /* rail/library/inspector/toolbar        */
  --surface-panel:        #1a1d23;  /* dock/sections/inputs/node cards       */
  --surface-elevated:     #22262e;  /* popover/menu/selected/toast           */
  --surface-hover:        #2a2f38;  /* hover/active row fill                 */
  --surface-input:        #181b21;  /* form control bg (darker than panel)   */
  --surface-overlay:      rgba(7, 8, 10, 0.6); /* modal scrim               */

  /* --- Border ----------------------------------------------------------- */
  --border-subtle:        #21252d;  /* zone separators (1px)                 */
  --border-default:       #2e333d;  /* popover/menu/input borders            */
  --border-focus:         #1d6fd0;  /* THE accent / focus / selection ring   */
  --border-status:        #3a4049;  /* status badge outlines, progress track */

  /* --- Text ------------------------------------------------------------- */
  --text-primary:         #e7e9ec;  /* 13.88:1 vs panel — AAA                */
  --text-secondary:       #aeb4be;  /* 8.10:1  vs panel — AAA                */
  --text-muted:           #949aa6;  /* 5.97:1  vs panel — AA                 */
  --text-disabled:        #6b7280;  /* decorative small text (§12)           */
  --text-error:           #f0656a;  /* 5.45:1  vs panel — AA                 */
  --text-accent:          #4a9eff;  /* accent-tinted text (links, run %)     */
  --text-on-accent:       #ffffff;  /* on accent.fill (Run button label)     */
  --text-on-status:       #ffffff;  /* in filled status badges               */

  /* --- Status (color-SECONDARY; always pair with icon + label) ---------- */
  --status-idle:          #6b7280;
  --status-queued:        #b08ad3;
  --status-running:       #1d6fd0;  /* accent hue — "live" color             */
  --status-success:       #36c98a;
  --status-warning:       #e8a317;
  --status-error:         #f0656a;
  --status-cancelled:     #787e8a;
  --status-skipped:       #5a6271;

  /* --- Accent (single hue) ---------------------------------------------- */
  --accent:               #1d6fd0;
  --accent-hover:         #2874d4;
  --accent-subtle:        rgba(29, 111, 208, 0.18);

  /* --- Ports (color-SECONDARY; shape + icon primary) -------------------- */
  --port-text:            #94a3b8;
  --port-number:          #38bdf8;
  --port-boolean:         #fbbf24;
  --port-json:            #a78bfa;
  --port-file:            #a8a29e;
  --port-media:           #fb923c;
  --port-audio:           #2dd4bf;
  --port-video:           #e879f9;
  --port-artifact:        #22c55e;
  --port-any:             #94a3b8;

  /* --- Radius ------------------------------------------------------------ */
  --radius-control:       4px;      /* controls: buttons, inputs, ports      */
  --radius-panel:         6px;      /* panels, popovers, node cards          */
  --radius-full:          9999px;   /* dots, circular port handles           */

  /* --- Spacing (4/8/12/16/20/24 — plan §8) ------------------------------ */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;

  /* --- Border width ----------------------------------------------------- */
  --border-width:         1px;
  --border-width-strong:  2px;   /* focus/selection ring (3px under contrast) */
  --border-width-edge:    1.5px; /* canvas edges (spec §7.3)                  */

  /* --- Shadow ----------------------------------------------------------- */
  --shadow-popover:       0 8px 24px rgba(0, 0, 0, 0.45);
  --shadow-modal:         0 12px 40px rgba(0, 0, 0, 0.5);
  --shadow-node:          0 2px 8px  rgba(0, 0, 0, 0.35);

  /* --- Motion (≤120ms default; reduced-motion zeroes — see below) ------- */
  --motion-duration-fast: 80ms;
  --motion-duration-base: 120ms;
  --motion-easing:        cubic-bezier(0.2, 0, 0, 1);

  /* --- Z-index ---------------------------------------------------------- */
  --z-canvas:           0;
  --z-node-selected:    5;
  --z-panel:            10;
  --z-toolbar:          20;
  --z-popover:          30;
  --z-toast:            40;
  --z-modal:            50;

  /* --- Font stacks ------------------------------------------------------ */
  --font-sans-stack:
    "Inter", "SF Pro Text", "Segoe UI", system-ui, -apple-system,
    "Helvetica Neue", Arial, sans-serif;
  --font-mono-stack:
    "JetBrains Mono", "SF Mono", "Cascadia Code", "Consolas",
    "Liberation Mono", monospace;

  /* --- Focus ring composition (spec §1: 2px ring, offset 2px) ---------- */
  --ring-width:  var(--border-width-strong);
  --ring-offset: 2px;
  --ring-color:  var(--border-focus);

  /* --- Edge defaults (spec §7.3) --------------------------------------- */
  --edge-stroke:               var(--border-default);
  --edge-stroke-width:         var(--border-width-edge);
  --edge-stroke-selected:      var(--accent);
  --edge-stroke-selected-width: var(--border-width-strong);

  /* --- shadcn aliases (so `npx shadcn add` lands on the same vars) ----- */
  --background:              var(--surface-sidebar);
  --foreground:              var(--text-primary);
  --card:                    var(--surface-panel);
  --card-foreground:         var(--text-primary);
  --popover:                 var(--surface-elevated);
  --popover-foreground:      var(--text-primary);
  --primary:                 var(--accent);
  --primary-foreground:      var(--text-on-accent);
  --secondary:               var(--surface-hover);
  --secondary-foreground:    var(--text-primary);
  --muted:                   var(--surface-panel);
  --muted-foreground:        var(--text-secondary);
  --accent:                  var(--accent-subtle);
  --accent-foreground:       var(--text-primary);
  --destructive:             var(--status-error);
  --destructive-foreground:  var(--text-on-status);
  --border:                  var(--border-default);
  --input:                   var(--surface-input);
  --ring:                    var(--border-focus);
  --radius:                  var(--radius-panel); /* shadcn base radius */
}

/* --- Global focus-visible ring (every interactive element inherits) ----- */
:where(button, a, input, select, textarea, [role="tab"], [role="menuitem"],
       [role="button"], [tabindex], [role="separator"]):focus-visible {
  outline: var(--ring-width) solid var(--ring-color);
  outline-offset: var(--ring-offset);
  border-radius: inherit;
}

/* --- Selection ring (canvas nodes/edges) uses the same accent ----------- */
::selection {
  background: var(--accent-subtle);
  color: var(--text-primary);
}

/* --- prefers-contrast: more (spec §1) ----------------------------------- */
@media (prefers-contrast: more) {
  :root {
    --ring-width: 3px;   /* spec §1: focus rings widen to 3px              */
  }
  /* Status icons gain always-on text labels (component-level, Phase 3)    */
}

/* --- prefers-reduced-motion: reduce (spec §1) — 0ms hard contract ------ */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-fast: 0ms;
    --motion-duration-base: 0ms;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* ============================================================================
   Tailwind v4 @theme inline — maps :root vars to utility namespaces.
   `inline` makes utilities reference the var(), so a future light-mode block
   overriding :root vars retargets every utility automatically.
   Generates: bg-*, text-*, border-*, rounded-*, p-*/gap-*, shadow-*, etc.
   ========================================================================== */
@theme inline {
  /* Surface -> bg-surface-* */
  --color-surface-canvas:       var(--surface-canvas);
  --color-surface-canvas-grid:  var(--surface-canvas-grid);
  --color-surface-sidebar:      var(--surface-sidebar);
  --color-surface-panel:        var(--surface-panel);
  --color-surface-elevated:     var(--surface-elevated);
  --color-surface-hover:        var(--surface-hover);
  --color-surface-input:        var(--surface-input);
  --color-surface-overlay:      var(--surface-overlay);

  /* Border -> border-border-* */
  --color-border-default:       var(--border-default);
  --color-border-subtle:        var(--border-subtle);
  --color-border-focus:         var(--border-focus);
  --color-border-status:        var(--border-status);

  /* Text -> text-text-* */
  --color-text-primary:         var(--text-primary);
  --color-text-secondary:       var(--text-secondary);
  --color-text-muted:           var(--text-muted);
  --color-text-disabled:        var(--text-disabled);
  --color-text-error:           var(--text-error);
  --color-text-accent:          var(--text-accent);
  --color-text-on-accent:       var(--text-on-accent);
  --color-text-on-status:       var(--text-on-status);

  /* Status -> bg-status-*, text-status-* */
  --color-status-idle:          var(--status-idle);
  --color-status-queued:        var(--status-queued);
  --color-status-running:       var(--status-running);
  --color-status-success:       var(--status-success);
  --color-status-warning:       var(--status-warning);
  --color-status-error:         var(--status-error);
  --color-status-cancelled:     var(--status-cancelled);
  --color-status-skipped:       var(--status-skipped);

  /* Accent -> bg-accent, text-accent, border-accent */
  --color-accent:               var(--accent);
  --color-accent-hover:         var(--accent-hover);
  --color-accent-subtle:        var(--accent-subtle);

  /* Ports -> bg-port-*, text-port-*, border-port-* */
  --color-port-text:            var(--port-text);
  --color-port-number:          var(--port-number);
  --color-port-boolean:         var(--port-boolean);
  --color-port-json:            var(--port-json);
  --color-port-file:            var(--port-file);
  --color-port-media:           var(--port-media);
  --color-port-audio:           var(--port-audio);
  --color-port-video:           var(--port-video);
  --color-port-artifact:        var(--port-artifact);
  --color-port-any:             var(--port-any);

  /* Radius -> rounded-control, rounded-panel, rounded-full */
  --radius-control:             var(--radius-control);
  --radius-panel:               var(--radius-panel);
  --radius-full:                var(--radius-full);

  /* Spacing -> p-1..p-6, gap-1..gap-6, m-1..m-6 */
  --spacing-1: var(--space-1);
  --spacing-2: var(--space-2);
  --spacing-3: var(--space-3);
  --spacing-4: var(--space-4);
  --spacing-5: var(--space-5);
  --spacing-6: var(--space-6);

  /* Shadow -> shadow-popover, shadow-modal, shadow-node */
  --shadow-popover:             var(--shadow-popover);
  --shadow-modal:               var(--shadow-modal);
  --shadow-node:                var(--shadow-node);

  /* Motion -> duration-fast, duration-base, ease-standard */
  --duration-fast:              var(--motion-duration-fast);
  --duration-base:              var(--motion-duration-base);
  --ease-standard:              var(--motion-easing);

  /* Fonts -> font-sans, font-mono */
  --font-sans:                  var(--font-sans-stack);
  --font-mono:                  var(--font-mono-stack);

  /* Breakpoint (single desktop-first addition; Tailwind defaults preserved) */
  --breakpoint-xs: 480px;
}

/* --- Base layer (Phase 3 applies; documented here) ---------------------- */
@layer base {
  html {
    color-scheme: dark;
    background: var(--surface-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans-stack);
    font-size: 13px;          /* root → 13px so rem-based sizes map to density */
    line-height: 1.45;
  }
  body {
    background: var(--surface-canvas);
    color: var(--text-primary);
  }
}
```

**Usage examples (illustrative, for Phase 3 implementers):**
- Panel background: `className="bg-surface-panel border border-border-subtle rounded-panel"`
- Primary text: `className="text-text-primary"`
- Focus ring: automatic via the global `:focus-visible` rule; components do NOT need to add it manually.
- Run button: `className="bg-accent text-text-on-accent rounded-control hover:bg-accent-hover"`
- Status dot: `className="bg-status-running rounded-full"` + a visually-hidden label + icon.

---

## 4. Typography Scale

Root font-size is 13px (set in §3 base layer) so Tailwind rem-based utilities produce the compact density the spec requires. Two font stacks: sans for UI, **monospace for logs and numeric/identifier readouts** (spec §1 "logs monospace 11–12"). All sizes are computed px.

| Role | Size | Weight | Line-height | Font stack | Where used (spec refs) |
|---|---|---|---|---|---|
| Workflow title | 15px | 600 (semibold) | 1.3 | sans | Top toolbar breadcrumb current segment (spec §5.1: 14–16). |
| Panel title | 13px | 600 | 1.3 | sans | Panel/section headers (spec §5.1, §8: 12–13); breadcrumb; run-state line (spec §5.4). |
| Node title | 12px | 600 | 1.3 | sans | Node card header title (plan §8: 12–13 semibold); library item name (spec §6). |
| Body | 13px | 400 | 1.45 | sans | Default body text; inspector form labels; menu items; toast body; problem messages (plan §8: 12–13). |
| Body-compact | 12px | 400 | 1.4 | sans | Dock summary; inspector field values; node summary; run-line (spec §5.4: 13px run line; 12px dock). |
| Metadata | 11px | 400 | 1.4 | sans | Timestamps (spec §9.3), node type/id (spec §8.2), counts, dock collapsed summary (spec §9.1), save chip label (spec §5.1), health label (spec §5.2), port labels (spec §7.3). |
| Metadata emphasis | 11px | 600 | 1.2 | sans | Category headers (INPUT/TEXT/AI/…); tab labels in collapsed dock. `text-transform: uppercase; letter-spacing: 0.04em`. |
| Log line | 12px | 400 | 1.5 | mono | Console log lines (plan §8, spec §9.3: monospace 11–12). `white-space: pre-wrap`. |
| Log timestamp | 11px | 400 | 1.5 | mono | Console timestamp + node name segment (spec §9.3). |
| Code/identifier | 12px | 500 | 1.4 | mono | Inline code, file paths in Artifacts (spec §9.6), node IDs, raw config values, port-type readout in tooltip. |
| Button-label | 12px | 500 | 1.2 | sans | Button labels (Save, Run, Stop, template buttons). 28px button height. |
| Empty-state-title | 14px | 600 | 1.3 | sans | Empty-state heading (spec §12: 12–14px). |
| Empty-state-body | 12px | 400 | 1.45 | sans | Empty-state sentence (spec §12). |

**Implementation note:** These map to Tailwind's built-in `text-xs`/`text-sm`/`text-base` + `font-medium`/`font-semibold` + `leading-*`. The table is the SPEC contract for which combination to use per role. For determinism, the `@theme` block SHOULD add explicit text-size keys (recommended for Phase 3):

```css
@theme {
  --text-meta: 11px;           --text-meta--line-height: 1.4;
  --text-body-compact: 12px;   --text-body-compact--line-height: 1.4;
  --text-body: 13px;           --text-body--line-height: 1.45;
  --text-workflow-title: 15px; --text-workflow-title--line-height: 1.3;
}
```

> **Port label exception:** spec §7.3 specifies port labels at "10px `text.muted`". 10px is below the 11px metadata floor and risks legibility/contrast. **Spec deviation (documented):** port labels use 11px `text-text-muted` to meet the density floor and contrast targets. This is a Phase 2 value decision over a Phase 1 size hint; recorded here per spec authority (§0 — "Phase 2 owns the values").

> **Letter-spacing:** only category labels use tracking (`0.04em`). Titles and body use normal tracking. No negative tracking. Weights used: 400 (regular), 500 (medium, inline code/buttons), 600 (semibold, titles/labels). No 700+ — keeps the tool feel restrained.

---

## 5. Spacing Scale (4/8/12/16/20/24 — plan §8)

Maps 1:1 to Tailwind v4 `p-1…p-6` / `gap-1…gap-6` / `m-1…m-6`.

| Token | Value | Utility | Usage map (spec refs) |
|---|---|---|---|
| `space.1` | 4px | `p-1` / `gap-1` | Icon-to-text gap inside a row; port label-to-handle gap; badge internal padding; dot-to-label gap. |
| `space.2` | 8px | `p-2` / `gap-2` | Toolbar horizontal padding (spec §1, §5); dock 8px padding (spec §1, §9); library item 8px horizontal padding (spec §6); gap between toolbar items (§5.1 "8px gap"); button internal px; chevron-to-label gap. |
| `space.3` | 12px | `p-3` / `gap-3` | Panel internal padding (spec §1 "panels 12px"); Inspector section padding; node-card internal padding; popover padding. |
| `space.4` | 16px | `p-4` / `gap-4` | Empty-state block spacing between heading and paragraph; section-to-section spacing in Inspector; modal body padding. |
| `space.5` | 20px | `p-5` / `gap-5` | Large vertical rhythm in empty states; settings group spacing. |
| `space.6` | 24px | `p-6` / `gap-6` | Max gap; modal viewport margin; major region separation. |

**Zone internal padding (spec §1, binding):**
- Panels (Library, Inspector, Dock body): `space.3` (12px).
- Toolbar: `space.2` (8px) horizontal at edges, `space.2` gap between items.
- Dock: `space.2` (8px) padding.
- Gap between zones: `0` — the `1px` `border.subtle` IS the separator (spec §3). Spacing tokens apply inside zones only.

**Interactive target floor:** 24×24px (spec §1). `space.2` (8px) padding around a 16px icon = 24×24. PropertyRow = 28px (spec §8.2) — see §11.7.

---

## 6. Radius, Border, Shadow Scales

### 6.1 Radius

| Token | Value | Utility | Used on |
|---|---|---|---|
| `radius.control` | 4px | `rounded-control` | Buttons, inputs, selects, search field, square port handles, pills, status badges. Spec §1. |
| `radius.panel` | 6px | `rounded-panel` | Panels, popovers, menus, toasts, node cards, Inspector sections, modals, health popover. Spec §1, §5.2. |
| `radius.full` | 9999px | `rounded-full` | Status dots (6px), circular port handles, save-chip dot, count badges. |

No other radii. Mixing radii is forbidden — controls always 4px, containers always 6px.

### 6.2 Border

| Property | Token / value | Utility | Usage |
|---|---|---|---|
| width (default) | `border.width` = 1px | `border` (Tailwind default) | All 1px borders: zone separators, input outlines, dividers, popover edges. |
| width (strong) | `border.width.strong` = 2px | `border-2` | Focus/selection ring, selected edge stroke. |
| width (edge) | `border.width.edge` = 1.5px | (inline style) | Canvas edges (spec §7.3). |
| color (default) | `border.default` `#2e333d` | `border-border-default` | Popover/menu/toast/node-card outer borders; input outlines; strong dividers. |
| color (subtle) | `border.subtle` `#21252d` | `border-border-subtle` | Zone separators, tablist underline base, thin dividers, danger-zone separator. |
| color (focus) | `border.focus` `#1d6fd0` | `border-border-focus` | Focus/selection ring (via `:focus-visible`). |
| color (status) | `border.status` `#3a4049` | `border-border-status` | Badge outlines, run-progress track. |
| style | `solid` (default) | `border-solid` | All borders are solid. Dashed reserved for: the `Any` port handle outline (§10) and the active-run edge animation (spec §7.3). |

### 6.3 Shadow

| Token | Value | Utility | Used on |
|---|---|---|---|
| `shadow.popover` | `0 8px 24px rgba(0, 0, 0, 0.45)` | `shadow-popover` | Popovers, menus, toasts (spec §5.2, §10.1). |
| `shadow.modal` | `0 12px 40px rgba(0, 0, 0, 0.5)` | `shadow-modal` | Modal dialogs (spec §10.3). |
| `shadow.node` | `0 2px 8px rgba(0, 0, 0, 0.35)` | `shadow-node` | Node cards. Selected nodes add a 2px `--border-focus` ring, not a heavier shadow (restrained, spec §7.3 "no scale transform"). |

Shadows are intentionally minimal (restrained, plan §7). No shadow on default panels/cards — borders define edges. The workspace reads as flat layers separated by 1px borders, not by depth.

---

## 7. Icon Rules (lucide-react)

**Library:** `lucide-react@1.31.0` (installed). All icons come from this single library — no mixed icon sets, no custom SVGs except the port shape primitives (§10) and status dots (CSS). Icons are imported per-icon (`import { Check } from "lucide-react"`) to keep the bundle lean. The `cn()` util at `src/lib/utils.ts` is the class-merge helper for icon + text composition.

### 7.1 Sizes

| Size | Utility | Usage |
|---|---|---|
| 12px | `size-3` | Inline status icons next to 11px text; port handle icons (inside 10px handles); save-chip dot icon; dock collapsed status icons; count-badge icon. |
| 14px | `size-3.5` | Node-card footer status icon; inspector row trailing icon; dock tab icon; menu-item leading icon; console level icons; small toolbar icons. |
| 16px | `size-4` | Library item icons (spec §6 "16px icon"); App Rail icons (§4); node card header icons; toolbar primary-action icons (Save, Run ▶, Stop ■). |
| 20px | `size-5` | Empty-state action icons; large dialog icons; health-popover header icon. Reserved; use sparingly. |

Stroke width: lucide default (2px) for 16/20px; 2.25 for 12/14px to maintain legibility at small sizes. Do not override to 1px (harms legibility).

### 7.2 Color

Icons inherit `currentColor` by default. For status icons, set color via the status token utility: `text-status-running`, `text-status-error`, etc. Never hardcode icon stroke colors.

### 7.3 Accessibility rules (binding)

1. **Decorative icons** (paired with visible text): `aria-hidden="true"` `focusable="false"`. The visible text is the accessible name; the icon must NOT be announced. Example: the disk icon next to a "Save" button label.
2. **Icon-only buttons** (Run/Stop, close, clear-search, zoom controls, rail items, dock chevrons, port handles): the icon is `aria-hidden="true"` AND the `<button>` MUST carry an `aria-label` (and `title` for the native tooltip). Spec §4, §5.3, §7.2 mandate this.
3. **Interactive icons** (e.g. a port handle, `role="button"`): gets its accessible name from `aria-label`; the icon is `aria-hidden`. Never rely on the icon's visual alone for the name.
4. **Status icons** (status dot + label): the icon is `aria-hidden="true"`; the status WORD is both visible and in a `visually-hidden` span when the visible cue is a dot only (spec §5.2 "dot has a visually-hidden status word AND the visible text is the status word"). Never dot-only (audit §6 App.tsx:83).
5. **`prefers-contrast: more`:** status icons gain always-on visible text labels (spec §1) — components render the label visibly, not just visually-hidden.

### 7.4 Icon inventory (binding per context — Phase 3 implements)

| Context | lucide name | Size | Notes |
|---|---|---|---|
| App Rail: Workflow | `Workflow` | 16 | Active item. |
| App Rail: Projects | `FolderKanban` | 16 | Disabled in MVP1 (spec §4). |
| App Rail: History | `History` | 16 | Disabled in MVP1. |
| App Rail: Settings | `Settings` | 16 | Disabled in MVP1. |
| Toolbar: Back to Projects | `ArrowLeft` | 16 | With text (spec §5.1). |
| Toolbar: Save | `Save` / `LoaderCircle` (saving, animated) | 16 | `LoaderCircle` is the spinner; reduced-motion: static `CircleDashed` (spec §1). |
| Toolbar: Run | `Play` | 16 | With "Run" label (spec §5.3). |
| Toolbar: Stop | `Square` | 16 | With "Stop" label, `status.error` fill (spec §5.3). |
| Toolbar: overflow menu | `MoreHorizontal` | 16 | Icon-only, `aria-label="More actions"`. |
| Library: search | `Search` | 14 | Decorative in input. |
| Library: clear search | `X` | 14 | Icon-only button, `aria-label="Clear search"`. |
| Library: category chevron | `ChevronRight` / `ChevronDown` | 12 | Decorative; `aria-hidden`. |
| Library: drag affordance | `GripVertical` | 12 | Hover-only, `aria-hidden`, with visually-hidden "drag or press Enter to add" (spec §6). |
| Canvas: zoom in/out/fit/lock | `ZoomIn` `ZoomOut` `Maximize` `Lock` | 16 | Each `aria-label` (spec §7.2). |
| Canvas: empty-state template | `Sparkles` | 20 | Decorative next to title. |
| Inspector: section chevron | `ChevronRight`/`ChevronDown` | 12 | Decorative. |
| Inspector: delete (danger) | `Trash2` | 14 | With "Delete Node" text (spec §8.2). |
| Dock: expand/collapse | `ChevronUp`/`ChevronDown` | 14 | Icon-only, `aria-label`. |
| Dock: Console clear | `Eraser` | 14 | `aria-label="Clear console"`. |
| Dock: Artifacts actions | `Eye` `ExternalLink` `FolderOpen` `Copy` | 14 | Each `aria-label="Open <filename>"` etc. (spec §9.6). |
| Status: running | `LoaderCircle` (animated) / `CircleDashed` (reduced-motion) | 12/14 | With label. |
| Status: success | `Check` | 12/14 | With label. |
| Status: warning | `TriangleAlert` | 12/14 | With label. |
| Status: error | `XCircle` | 12/14 | With label. |
| Status: cancelled | `Ban` | 12/14 | With label. |
| Status: skipped | `Minus` | 12/14 | With label. |
| Status: queued | `Clock` | 12/14 | With label. |
| Status: idle | `Circle` (hollow) | 12/14 | With label. |
| Health: Ready | `CheckCircle2` | 12 | + "Ready" label. |
| Health: Configured | `Settings2` | 12 | + "Configured" label (amber). |
| Health: Degraded | `TriangleAlert` | 12 | + "Degraded" label. |
| Health: Down | `XCircle` | 12 | + "Down" label. |
| Console: INFO | `Info` | 12 | `aria-hidden` + visually-hidden "info". |
| Console: WARNING | `TriangleAlert` | 12 | + visually-hidden "warning". |
| Console: ERROR | `XCircle` | 12 | + visually-hidden "error". |
| Console: SYSTEM | `Terminal` | 12 | + visually-hidden "system". |
| Port icons (10 families) | see §10 table | 12 | Inside the handle, `aria-hidden`. |
| Toast: close | `X` | 14 | `aria-label="Dismiss"`. |

---

## 8. Status Styles

**Master invariant (spec §0.5, §6, §8, §11):** status is NEVER color-only. Every status surface = text label + icon + color (secondary). This section binds each state to a token, icon, and treatment.

### 8.1 Run states (spec §11.1, `runSlice.runStatus`)

Driven by `runSlice.runStatus` (`idle` | `starting` | `running` | `succeeded` | `failed` | `cancelled`). Note: spec uses `starting` (between Run click and `runId`); plan §12 lists `Queued`/`Skipped` as per-node states.

| State | Token | Icon (lucide) | Dot treatment | Label text | a11y note |
|---|---|---|---|---|---|
| `idle` | `status.idle` | `Circle` (hollow, 12px) | 6px hollow circle, `border-status` stroke, transparent fill | "idle" (dock summary only) | Dock collapsed "Run · idle". Toolbar shows no run line. No announcement on idle. |
| `starting` | `status.queued` | `LoaderCircle` (spinner, 12px; reduced-motion: `CircleDashed` static) | 6px `bg-status-queued` | "Starting…" | Toolbar right button (spinner + disabled + `aria-busy="true"`), run line. Spec §5.3, §11.1. Spinner `aria-hidden`; `aria-busy` conveys it. |
| `running` | `status.running` | `LoaderCircle` (spinner, 12px; reduced-motion: `CircleDashed` static) | 6px `bg-status-running` | "Running · 42%" (or "Running" when `runProgress===null`) | Toolbar run line, dock summary, node footer, run tab, animated edge. `aria-live="polite"` throttled ≤1/sec (spec §11.2). |
| `succeeded` | `status.success` | `Check` (12px) | 6px `bg-status-success` | "Completed" (fades to idle after 3s — controller timer, not CSS animation) | Toolbar run line, node footer `✓`, run tab. `aria-live="polite"` announces "Run completed" once. |
| `failed` | `status.error` | `XCircle` (12px) | 6px `bg-status-error` | "Failed · see Problems" (STICKY — no fade until user dismisses/new run) | Toolbar run line, node footer `✕` on failed + `○` skipped downstream, run tab. Auto-opens Problems. `aria-live="assertive"` on first occurrence (spec §9.3, §11.3). |
| `cancelled` | `status.cancelled` | `Ban` (⊘, 12px) | 6px `bg-status-cancelled` | "Cancelled" (fades to idle after 3s) | Toolbar run line, node footer `⊘`. `aria-live="polite"` announces "Run cancelled". |

**Per-node status (plan §12, spec §11.2):** Idle, Queued, Running, Success, Warning, Failed, Cancelled, Skipped. Icons: `○` idle (`Circle`), queued (`CircleDashed` to distinguish), `●` running (`LoaderCircle`), `✓` success (`Check`), `△` warning (`TriangleAlert`), `✕` failed (`XCircle`), `⊘` cancelled (`Ban`), `–` skipped (`Minus`). **Restraint invariant:** status is a footer strip + small badge + thin 2px left-edge accent — NEVER a full-card background wash (plan §12, spec §11.2). Running progress shows a number ONLY when `progress !== null`; otherwise spinner-without-number (plan §12).

**Visual treatment (node card footer):**
- 2px left-edge accent in the status color (full card height).
- Footer strip: icon (14px) + label (12px `text-secondary`) + optional progress % (12px `text-muted`). Background: `surface.panel` (NOT status-colored).
- Progress bar (only when `progress !== null`): 2px tall, full card width, `border-status` track, `status.running` fill, `rounded-full`. Reduced-motion: static fill, no animated stripe.

### 8.2 Health states (spec §6, §5.2, `uiSlice.health`)

| State | Token | Icon | Dot | Label | a11y note |
|---|---|---|---|---|---|
| Ready | `status.success` | `CheckCircle2` | 6px `bg-status-success` | "Ready" | Dot has visually-hidden "Ready"; visible text IS "Ready". `aria-live="polite"` on the pill. |
| Configured | `status.warning` | `Settings2` | 6px `bg-status-warning` | "Configured" | Means: present but not fully verified (e.g., Gemini key set, not pinged). Same dot+label contract. |
| Degraded | `status.warning` | `TriangleAlert` | 6px `bg-status-warning` | "Degraded" | Partial failure; announce on transition to degraded. |
| Down | `status.error` | `XCircle` | 6px `bg-status-error` | "Down" | `aria-live="assertive"` when transitioning to Down. |

**Treatment:** 6px dot + 11px label `text-muted` in the compact pill; in the popover, 11px name left + icon+label right. Never dot-only (spec §5.2).

### 8.3 Save states (spec §5.1, `saveSlice.saveStatus` + `dirty`)

| State | Trigger | Token | Icon | Dot | Label | a11y note |
|---|---|---|---|---|---|---|
| clean (Saved) | `saveStatus==='saved'` (or `dirty===false` after load) → fades to idle after 2.5s | `status.success` | `Check` (decorative) | 6px `bg-status-success` | "Saved" `text-muted` | `aria-live="polite"` announces "Saved". The chip is the persistent surface (spec §5.1, R6). |
| dirty (Unsaved) | `saveSlice.dirty===true` | `status.warning` | `Circle` (decorative) | 6px `bg-status-warning` | "Unsaved" `text-secondary` | Announce on first dirtying edit (not every keystroke). |
| saving | `saveStatus==='saving'` | `status.queued` | `LoaderCircle` (reduced-motion: static) | 6px `bg-status-queued` (or spinner) | "Saving…" `text-muted` | `aria-live="polite"` announces "Saving". Save button also shows spinner + `aria-busy`. |
| error | `saveStatus==='error'` | `status.error` | `XCircle` (decorative) | 6px `bg-status-error` | "Save failed" `text-error` | STICKY — does not fade. Dual-channel: persistent chip + ephemeral error toast (spec R6). `aria-live="assertive"`. |

**Save button:** primary (`accent`) when `dirty`, secondary (`surface.hover`) when clean, disabled + spinner when saving, disabled-with-tooltip when a run is active (spec §5.3).

### 8.4 A11y notes (all status)

- Every status dot has an adjacent text label (visible or visually-hidden). Never dot-only (spec §5.2).
- `aria-live` regions: toolbar run line (polite, throttled ≤1/sec), save chip (polite), health pill (polite), problems tab (polite), dock summary (polite, atomic=false, throttled ≤1/2s) (spec §5, §9).
- ERROR-level announcements use `aria-live="assertive"` for the first occurrence (spec §9.3, §11.3).
- `prefers-contrast: more`: status icons gain always-on visible text labels (spec §1).
- Fade timers are controller-managed on `runSlice`/`saveSlice` (spec §11.3), NOT CSS animations — so reduced-motion users still see the state text disappear on the same schedule; only the visual transition is instant.

---

## 9. Focus & Motion States

### 9.1 Focus-visible ring (binding — spec §1, §4, §6, §7.3, §9, §13)

- **Style:** `outline: 2px solid var(--border-focus); outline-offset: 2px;` (`prefers-contrast: more` → `3px`).
- **Scope:** Applied globally to all interactive elements via the `:where(...):focus-visible` rule in §3. Components do NOT need to add it manually; they MAY override `outline-offset` (e.g. `1px` for dense rows like library items, spec §6) but MUST NOT remove it.
- **Selection ring:** Canvas node/edge selection uses the SAME `--border-focus` accent (spec §13) so selection and keyboard focus are visually consistent. Selected node: 2px `--border-focus` ring + `surface.elevated` lift + `shadow-node`; NO scale transform (restrained, spec §7.3).
- **Never remove via `outline: none`** without an equivalent visible focus indicator. The global rule is the floor.
- **Focus order:** F6 cycles the 6 zone landmarks; within a zone, roving tabindex (spec §3). Focus is always visible; `:focus` is also styled for elements that receive keyboard focus via roving tabindex where the browser may not fire `:focus-visible` (e.g. arrow-key navigation in a `role="menu"`).
- **Focus is always visible on:** app rail items, node library items, search input, toolbar buttons, menu items, inspector tabs/controls, port handles, dock tabs, resizable separators, node cards (when keyboard-focused), edges (when keyboard-focused).

### 9.2 Motion contract (binding — spec §1)

| Context | Default | `prefers-reduced-motion: reduce` |
|---|---|---|
| Hover transitions (color, bg) | `80ms` (`--motion-duration-fast`), opacity/color only | 0ms (instant) |
| Collapse/expand zones | `120ms` (`--motion-duration-base`), opacity + translateX only | 0ms (instant, no slide — appears in place) |
| Toast appear | `120ms`, opacity + translateY(4px) only | 0ms (appears in place, no slide) |
| Modal scrim fade | `120ms`, opacity only | 0ms (instant, no fade) |
| Popover/menu open | `80ms`, opacity only (no scale/translate — avoid "popover bounce") | 0ms |
| Run-progress bar | static fill (no moving gradient) | static striped fill (no animation) |
| Animated edge (active run) | `1s` linear dash, `status.running` color (spec §7.3) | no dash animation; running conveyed by color + static icon + text only |
| Spinner (`LoaderCircle`) | CSS `rotate` 1s linear infinite | replaced by static `CircleDashed` glyph (component swaps); token `--motion-duration-*` = 0ms backstop |
| Canvas zoom/pan | React Flow default (respects reduced-motion) | no animated pan (spec §7.2) |
| Auto-scroll (console) | instant jump | instant jump (no animation) |

**Hard rules:**
- Default motion ≤ 120ms (spec §1). No motion > 120ms except the edge dash (1s, functional, reduced-motion-disabled).
- Only `opacity` and `translate` (small, ≤4px) are animated. No `scale`, no `rotate` (except the spinner, replaced under reduced-motion), no `skew`, no layout-shifting animations. No animating `width`/`height`/`top`/`left` (causes layout thrash).
- `prefers-reduced-motion: reduce` ⇒ ALL motion instant (0ms). Implemented globally in §3 via the media query zeroing `--motion-duration-*` and a blanket `transition-duration: 0.01ms !important`.
- No parallax, no auto-playing carousels, no decorative looping animation except the run edge dash (which is functional, not decorative).

---

## 10. Typed Port Visual System (plan §13, spec §7.3 — 10 families)

Ports communicate type via **SHAPE (primary) + small ICON (primary) + LABEL (on hover/focus) + TOOLTIP + COLOR (secondary)**. Color is reinforcement, never the sole cue. The backend remains authoritative for validation (plan §13).

### 10.1 Shape mapping (spec §7.3, binding)

- **Circle** (Text, Number, Boolean, Json, Any): `rounded-full` handle, 10px diameter.
- **Square** (File, Media, Audio, Video, Artifact): `rounded-control` handle, 10×10px.
- Input ports on the left edge of a node; output ports on the right edge (spec §7.3).

Shape is the primary type signal; it survives completely under all color-vision deficiencies. Icon survives completely. Color is reinforcement only.

### 10.2 Family table

| Family | Shape | lucide icon | Port color token | Hex | Default label | Color-blind safety |
|---|---|---|---|---|---|---|
| **Text** | circle | `Type` | `--port-text` | `#94a3b8` | "text" | Neutral; the baseline string type. Distinguished from Any by icon + solid outline. |
| **Number** | circle | `Hash` | `--port-number` | `#38bdf8` | "number" | Sky blue; distinct from Text's neutral; `Hash` icon unique. |
| **Boolean** | circle | `ToggleLeft` | `--port-boolean` | `#fbbf24` | "bool" | Amber; shape (circle) + `ToggleLeft` icon disambiguate from Number (sky). |
| **Json** | circle | `Braces` | `--port-json` | `#a78bfa` | "json" | Violet; `Braces` icon is the strong cue; distinct hue from all circles. |
| **Any** | circle | `Asterisk` | `--port-any` | `#94a3b8` | "any" | Neutral (same as Text); distinguished by `Asterisk` icon + **dashed** handle outline. "Accepts anything" = lowest visual weight. |
| **File** | square | `File` | `--port-file` | `#a8a29e` | "file" | Warm neutral; SQUARE shape distinguishes from Text (neutral circle) even in monochrome. |
| **Media** | square | `Film` | `--port-media` | `#fb923c` | "media" | Orange; square; `Film` icon. |
| **Audio** | square | `AudioLines` | `--port-audio` | `#2dd4bf` | "audio" | Teal — media-tool audio convention; square; `AudioLines` icon. |
| **Video** | square | `Video` | `--port-video` | `#e879f9` | "video" | Fuchsia — opposed to teal on both CVD axes, so Audio vs Video survive all deficiency types; `Video` icon. |
| **Artifact** | square | `Package` | `--port-artifact` | `#22c55e` | "artifact" | Green — produced output; square; `Package` icon. Hue chosen to stay distinct from `status.success` `#36c98a`. |

### 10.3 Color-blind safety

The port palette is **Okabe-Ito-informed**: blue, orange, yellow, bluish-green, sky, reddish-purple, cyan, vermillion, amber, plus neutral gray. Okabe-Ito is the standard color-blind-safe palette for deuteranopia, protanopia, and tritanopia.

**Primary cues are shape + icon, NOT color:**
- **Shape** splits the 10 families into circle (5) and square (5) — a binary cue visible in monochrome and across all color-vision deficiencies.
- **Icon** is unique per family (10 distinct lucide icons) — the primary disambiguator within a shape group.
- **Color** spans 9 hues + 1 neutral. Within the circle group, the five colors (neutral, sky, amber, violet, neutral-dashed) are maximally distinguishable. Within the square group, warm-neutral / orange / teal / fuchsia / emerald avoid relying on red-green distinction (the most common deficiency). Media (orange) vs Video (fuchsia) could collide for some deuteranopes; the `Film` vs `Video` icons disambiguate, and labels reinforce. Audio (teal) vs Video (fuchsia) are opposed on both CVD axes.
- `Text` (neutral, solid outline, `Type`) vs `Any` (neutral, **dashed** outline, `Asterisk`) is distinguished by outline style + icon, not color — by design, since they share a hue.
- A user operating in total color blindness (monochrome) can identify every port via shape + icon + label alone.

### 10.4 Port rendering contract (spec §7.3)

- **Handle size:** 10px diameter (circle) / 10px square; 1.5px `border-default` ring; fill = port color at 100% when connected, 40% opacity when empty. `Any` handle uses a dashed outline (1.5px dashed `port-any`).
- **Label:** 11px `text-muted` (see §4 port-label exception), appears inline **only when the node is selected or hovered** (spec §7.3); otherwise hidden to preserve canvas density. Label text = default label from §10.2.
- **Tooltip:** on handle hover/focus (300ms delay), a 6px-radius `surface-elevated` tooltip shows "<Input|Output> port: <Family> · <default label>". Dismiss on blur/Escape; reduced-motion skips the fade.
- **Port type** is declared in the node source of truth (`src/nodes/registry.ts` `ports[]`, spec §13/§14), NOT inferred from edges.
- **Connected handle:** solid fill in port color (vs. outlined when unconnected) — a secondary connected-state cue, not type cue.

### 10.5 Keyboard-connect a11y (spec §7.3 — frozen, carried here)

- Each port Handle is `tabindex=0` within the node's roving tab order, `role="button"`, `aria-label="Input port: <type>"` / `"Output port: <type>"`.
- **Keyboard connect:** focus an output port → press Enter or `c` ("connect") → focus moves to canvas → focus a target input port → Enter to confirm → Escape cancels.
- `isValidConnection` (audit §8, preserved) is the UI cycle guard; on rejection, the global status announcer speaks "Invalid connection: would create a cycle" via `aria-live` (NOT a modal).
- Backend type validation is authoritative (plan §13); type-incompatible connections reported via Problems tab.

---

## 11. Reusable Primitives (10)

Each primitive is specified as: **Purpose · Props · Anatomy · Token usage · A11y requirements · Sample JSX (spec illustration, not source)**. These are SPEC contracts — Phase 3 implements them as React components in `src/components/ui/` (or shadcn primitives where compatible), consuming the `@theme` utilities from §3. All primitives use `cn()` (`src/lib/utils.ts`) for class merging.

### 11.1 `Panel`

**Purpose:** The base surface container for every zone/section (Node Library body, Inspector body, Dock body, popovers, empty-state action groups). The structural atom of the layout. Plan §4 zones; spec §3.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `as` | `'div' \| 'aside' \| 'section' \| 'main' \| 'nav' \| 'header' \| 'footer'` | `'div'` | Semantic element / landmark. |
| `surface` | `'canvas' \| 'sidebar' \| 'panel' \| 'elevated' \| 'hover' \| 'input'` | `'panel'` | Which surface token. |
| `border` | `'none' \| 'subtle' \| 'default'` | `'subtle'` | Border token. |
| `radius` | `'none' \| 'control' \| 'panel'` | `'panel'` | Radius token. |
| `padding` | `0..6` | `3` (12px) | Spacing scale index. |
| `shadow` | `'none' \| 'popover' \| 'modal'` | `'none'` | Shadow token (popovers use `'popover'`). |
| `className` | `string` | — | `cn()`-merged overrides. |
| `ariaLabel` | `string` | — | Optional; for landmark panels. |
| `children` | `ReactNode` | — | |

**Anatomy:** `<surface element class="bg-surface-{surface} border-{border} rounded-{radius} p-{padding}">…</surface>`. No internal structure; composed with `PanelHeader` etc.

**Token usage:** `surface.*`, `border.subtle`/`border.default`, `radius.panel`, `space.3`, `shadow.popover` (when `surface='elevated'`).

**A11y:** The semantic `as` prop sets the correct element/landmark. When used as a zone, it MUST carry the ARIA landmark role from spec §1 (`<header role="banner">`, `<nav>`, `<aside>`, `<main role="application">`, `<footer role="contentinfo">`). If `as='aside'`/`'nav'`, set `aria-label`. No focus styling on the Panel itself (it is not interactive).

**Sample:**
```tsx
<Panel as="aside" surface="sidebar" border="subtle" radius="none" padding={0}
       ariaLabel="Node library">
  <PanelHeader title="Nodes" … />
  {/* search, categories, items */}
</Panel>
```

### 11.2 `PanelHeader`

**Purpose:** Consistent header bar for a Panel — title + optional action area (collapse chevron, count badge, menu button). 32px tall (spec §8 "Header 32px"), or 28px dense for dock tab bar.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | (required) | 13px semibold `text.primary`. |
| `level` | `2 \| 3` | `2` | Heading level (renders `<h2>`/`<h3>`). |
| `icon` | `LucideIcon` | — | Optional leading 16px icon, `aria-hidden`. |
| `actions` | `ReactNode` | — | Right-aligned action area (buttons, count badge, menu). |
| `collapsible` | `boolean` | `false` | If true, renders a chevron toggle wired to `onToggle`. |
| `collapsed` | `boolean` | `false` | Controlled collapsed state. |
| `onToggle` | `() => void` | — | Toggle handler. |
| `dense` | `boolean` | `false` | 28px height (dock tab bar) vs default 32px. |
| `id` | `string` | — | For `aria-controls`. |

**Anatomy:** `<div class="flex items-center gap-2 h-8 px-2 border-b border-border-subtle">{icon?}{<h2/3 class="text-[13px] font-semibold text-text-primary">{title}</h2/3>}{spacer}{actions?}{collapsible ? <ToolbarButton icon={chevron} aria-expanded={!collapsed} aria-controls={id} ariaLabel="Toggle {title} panel" onClick={onToggle}/> : null}</div>`

**Token usage:** `text.primary` (title), `text.muted` (icon), `border.subtle` (bottom), `space.2`, `surface.sidebar` (inherits).

**A11y:** Title in `<h2>`/`<h3>` (provides accessible name). Collapse button: `aria-expanded`, `aria-controls` pointing to the collapsible content id, `aria-label="Toggle <title> panel"`. Chevron icon `aria-hidden`. When collapsed, content gets `inert` (spec §3).

**Sample:**
```tsx
<PanelHeader title="Inspector" level={2} collapsible collapsed={c}
             onToggle={() => setC(!c)} icon={Settings}
             actions={<ToolbarButton variant="ghost" size="icon" icon={MoreHorizontal}
                      ariaLabel="Inspector options" />} />
```

### 11.3 `ToolbarButton`

**Purpose:** A compact button for toolbar/menu/inline actions. Variants cover the Run/Stop primary action, secondary actions, ghost (rail items), and danger (Stop). Replaces ad-hoc buttons.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'secondary'` | `primary` = accent fill (Run, dirty Save); `danger` = `status.error` fill (Stop); `secondary` = default button; `ghost` = rail item / no border. |
| `size` | `'default' \| 'icon' \| 'sm'` | `'default'` | `default` = 28px; `icon` = 24×24 square for icon-only; `sm` = 24px. |
| `icon` | `LucideIcon` | — | Leading icon (16px default, 14px sm). |
| `iconRight` | `LucideIcon` | — | Trailing icon (chevron). |
| `loading` | `boolean` | `false` | Swaps icon for `LoaderCircle` (reduced-motion: static), sets `aria-busy="true"`, disables. |
| `disabled` | `boolean` | `false` | + `aria-disabled="true"`, `cursor-not-allowed`, `text.disabled`. |
| `active` | `boolean` | `false` | Depressed/toggle state (minimap). Maps to `aria-pressed` when the button is a toggle. |
| `ariaLabel` | `string` | — | Required when `children` is empty (icon-only). |
| `title` | `string` | — | Native tooltip; mirrors `ariaLabel` for icon-only. |
| `onClick` | `() => void` | — | |
| `children` | `ReactNode` | — | Text label. |

**Anatomy:** `<button class="inline-flex items-center gap-2 h-7 px-2 rounded-control text-[12px] font-medium {variant classes} {size classes}" aria-busy={loading} aria-pressed={active?} disabled={disabled||loading}>{icon?}{children}{iconRight?}</button>`

**Variant classes:**
- primary: `bg-accent text-text-on-accent hover:bg-accent-hover`
- secondary: `bg-surface-panel border border-border-subtle text-text-primary hover:bg-surface-hover`
- ghost: `bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary`
- danger: `bg-status-error text-text-on-status hover:opacity-90` (used for Stop; for destructive text-only actions like Delete Node, use `text-text-error` ghost variant, not filled — spec §8.2 "NOT a saturated background")

**Token usage:** `accent`/`accent.hover`, `surface.panel`/`surface.hover`, `text.*`, `status.error`, `border.subtle`, `radius.control`, `space.2`.

**A11y:** `<button>` (native). `:focus-visible` ring from global rule. Icon-only (`size="icon"` with no `children`) REQUIRES `ariaLabel` + `title` (spec §4, §5.3, §7.2). `loading` → `aria-busy="true"` + disabled + spinner (`LoaderCircle`, reduced-motion: static `CircleDashed`). `active` toggle → `aria-pressed`. `disabled` → `aria-disabled="true"` + `tabindex=-1`. Minimum target 24×24 (`size="icon"`) or 28×20 (default).

**Sample:**
```tsx
<ToolbarButton variant="primary" icon={Play} onClick={run}
               ariaLabel="Run workflow">Run</ToolbarButton>
<ToolbarButton variant="danger" icon={Square} onClick={stop}
               ariaLabel="Stop workflow">Stop</ToolbarButton>
<ToolbarButton variant="ghost" size="icon" icon={MoreHorizontal}
               ariaLabel="More actions" title="More actions" />
```

### 11.4 `StatusBadge`

**Purpose:** A compact inline status indicator (dot + optional icon + label). Used in toolbar run line, save chip, health pill, dock collapsed summary, problems rows, run-tab rows. Enforces the "never color-only" invariant (spec §5.1, §5.2, §9.1, §9.4). NOT for node footers (that's `NodeStatus`).

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `status` | `StatusValue` | (required) | One of the run/health/save status enum values. |
| `label` | `string` | (required) | Visible label (never empty — spec §0.5). |
| `icon` | `LucideIcon` | — | Optional icon (replaces dot if provided). |
| `dot` | `boolean` | `true` | Show the colored dot. |
| `size` | `'sm' \| 'md'` | `'sm'` | sm = 11px text + 6px dot; md = 12px text + 8px dot. |
| `tone` | `'neutral' \| 'filled'` | `'neutral'` | `filled` = status-colored background pill (rare; dock active tab pill); `neutral` = dot+text only (default). |
| `live` | `'off' \| 'polite' \| 'assertive'` | `'off'` | Wraps in `aria-live` region for announcement. |

`StatusValue` maps each enum to a token + default icon:
```ts
type StatusValue =
  | 'idle' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  | 'queued' | 'success' | 'warning' | 'error' | 'skipped'
  | 'ready' | 'configured' | 'degraded' | 'down'
  | 'clean' | 'dirty' | 'saving' | 'save-error';
```

**Anatomy:** `<span class="inline-flex items-center gap-1 text-[11px]" aria-live={live}>{dot ? <span class="size-1.5 rounded-full bg-status-{token}"/> : null}{icon ? <Icon class="size-3 text-status-{token}" aria-hidden/> : null}<span class="text-{toneClass}">{label}</span><span class="sr-only">{statusWord}</span></span>`

**Token usage:** `status.*`, `text.muted`/`text.secondary`/`text.error`, `radius.full` (dot).

**A11y:** `label` is ALWAYS present and visible. When the visible cue is a dot, a visually-hidden status word is also present (spec §5.2). Icon `aria-hidden`. `live` wraps the badge in `aria-live` when `live !== 'off'`. Under `prefers-contrast: more`, the label is always visible (not visually-hidden).

**Sample:**
```tsx
<StatusBadge status="running" label="Running · 42%" dot live="polite" />
<StatusBadge status="save-error" label="Save failed" icon={XCircle} live="assertive" />
<StatusBadge status="ready" label="Ready" dot size="sm" live="polite" />
```

### 11.5 `NodeStatus`

**Purpose:** The per-node run-status footer strip inside a node card (spec §11.2). Enforces the restraint invariant: NEVER a full-card color wash — only a footer strip + 2px left-edge accent + small badge.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `status` | `'idle' \| 'queued' \| 'running' \| 'success' \| 'warning' \| 'failed' \| 'cancelled' \| 'skipped'` | `'idle'` | Per-node status (spec §11.2). |
| `progress` | `number \| null` | `null` | 0–100, or null (no real progress — plan §12). |
| `message` | `string` | — | Optional short message (e.g. "Encoding…", "1.2s remaining"). |
| `compact` | `boolean` | `false` | Compact mode for narrow cards. |

**Anatomy:**
```
┌─ 2px left-edge accent in status color ─┐
│ [icon 14px] [label 12px] [progress% 12px muted] │  ← footer strip, surface.panel bg
│ [optional 2px progress bar, full width]          │
└──────────────────────────────────────────────────┘
```
`<div class="relative flex items-center gap-2 h-7 px-3 bg-surface-panel border-t border-border-subtle" role="status" aria-live="polite"><span class="absolute left-0 inset-y-0 w-0.5 bg-status-{token}"/><Icon class="size-3.5 text-status-{token}" aria-hidden/><span class="text-[12px] text-text-secondary">{label}</span>{progress !== null ? <span class="text-[11px] text-text-muted">{progress}%</span> : null}{progress !== null ? <ProgressBar value={progress} class="absolute bottom-0 inset-x-0 h-0.5 rounded-full"/> : null}</div>`

**Token usage:** `status.*`, `surface.panel`, `border.subtle`, `text.secondary`, `text.muted`, `border.status` (progress track), `radius.full` (progress bar).

**A11y:** `role="status"` + `aria-live="polite"` (throttled ≤1/sec per spec §11.2). The status word is in the accessible name (visually-hidden if only the icon is visible in compact mode). Progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="<node> progress"`. Reduced-motion: progress bar is static fill, no animated stripe. Progress announced as "Running, 63 percent" not on every tick.

**Sample:**
```tsx
<NodeStatus status="running" progress={63} message="Encoding…" />
<NodeStatus status="failed" message="Missing audio input" />
<NodeStatus status="success" progress={100} />
```

### 11.6 `InspectorSection`

**Purpose:** A titled, collapsible group of `PropertyRow`s inside the Inspector (Basic / Advanced / Danger, spec §8.2). Drives the generic inspector from `configSchema`.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | (required) | 12px semibold. |
| `level` | `2 \| 3` | `3` | Heading level (renders `<h3>` by default). |
| `icon` | `LucideIcon` | — | Optional leading icon. |
| `variant` | `'default' \| 'danger'` | `'default'` | `danger` styles the heading `text-error` and adds a top `border.subtle` divider (spec §8.2). |
| `defaultCollapsed` | `boolean` | `false` | Default expand state (Advanced defaults collapsed — spec §8.2). |
| `collapsed` | `boolean` | — | Controlled. |
| `onToggle` | `() => void` | — | |
| `id` | `string` | — | For `aria-controls`. |
| `children` | `ReactNode` | — | Section body (PropertyRows). |

**Anatomy:** `<section class="border-b border-border-subtle last:border-0">{variant==='danger' ? <div class="border-t border-border-subtle"/> : null}<PanelHeader title={title} icon={icon} level={level} collapsible collapsed={collapsed} onToggle={onToggle} dense/>{!collapsed ? <div class="p-3 space-y-2" id={id} role="region" aria-labelledby={headingId}>{children}</div> : null}</section>`

**Token usage:** `border.subtle`, `space.3`, `space.2`, `text.primary` (title), `text.error` (danger variant).

**A11y:** Heading `aria-level`. Collapse button `aria-expanded` + `aria-controls={id}`. Collapsed body is NOT rendered (or rendered with `inert` + `hidden`). `role="region" aria-labelledby` on the body when collapsible. Danger variant heading has a visually-hidden "Danger zone:" prefix. Danger action label is `text-error` but background NOT saturated (restraint, spec §8.2).

**Sample:**
```tsx
<InspectorSection title="Basic" icon={Settings}>{/* PropertyRows */}</InspectorSection>
<InspectorSection title="Advanced" defaultCollapsed>{/* … */}</InspectorSection>
<InspectorSection title="Delete Node" variant="danger">
  <ToolbarButton variant="ghost" icon={Trash2} onClick={confirmDelete}
                 ariaLabel="Delete AI Script">Delete Node</ToolbarButton>
</InspectorSection>
```

### 11.7 `PropertyRow`

**Purpose:** The generic Inspector form primitive (spec §8.2 — "28px tall, 11-12px text, border.subtle, focus border.focus ring"). Renders from `configSchema` field types. Plan §8 form density.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | (required) | 11–12px field label. |
| `type` | `'text' \| 'textarea' \| 'number' \| 'select' \| 'toggle' \| 'slider' \| 'file'` | `'text'` | Control type. |
| `value` | `string \| number \| boolean` | — | Current value. |
| `onChange` | `(v) => void` | — | Calls `graphSlice.updateNodeData` → sets `dirty` (spec §8.2). |
| `options` | `{label, value}[]` | — | For `select`. |
| `min` / `max` / `step` | `number` | — | For `number` / `slider`. |
| `helperText` | `string` | — | 11px `text.muted` below control; `aria-describedby`. |
| `error` | `string` | — | 11px `text.error` with `role="alert"`; replaces helperText. |
| `disabled` | `boolean` | `false` | + `aria-disabled` + tooltip explaining why (e.g. "Editing disabled while running"). |
| `disabledReason` | `string` | — | Tooltip text when disabled. |
| `unit` | `string` | — | Trailing unit (e.g. "seconds", "px"). |
| `id` | `string` | auto | For label association. |
| `ariaLabel` | `string` | — | Override accessible name (defaults to `label`). |

**Anatomy:** `<div class="flex flex-col gap-1 py-1"><div class="flex items-center gap-2 h-7"><label class="text-[11px] text-text-secondary w-24 shrink-0" htmlFor={id}>{label}</label><div class="flex-1">{control}</div>{unit ? <span class="text-[11px] text-text-muted">{unit}</span> : null}</div>{error ? <p role="alert" class="text-[11px] text-text-error">{error}</p> : helperText ? <p class="text-[11px] text-text-muted">{helperText}</p> : null}</div>`

The control (`text`/`number`): `<input id={id} class="h-7 w-full bg-surface-input border border-border-subtle rounded-control px-2 text-[12px] text-text-primary focus-visible:ring" aria-describedby={helperId + ' ' + errorId} …/>`

The `select`: a styled `<select>` (or a shadcn-compatible Select when added). The `toggle`: a switch (`role="switch" aria-checked`). The `slider`: `<input type="range">` styled with `accent-color: var(--accent)`. The `file`: a button + path display. `textarea` breaks the 28px height (min 64px) but keeps the same border/focus tokens.

**Token usage:** `surface.input`, `border.subtle`, `border.focus` (via `:focus-visible`), `text.primary`, `text.secondary`, `text.muted`, `text.error`, `radius.control`, `space.2`, `accent` (toggle on, slider fill).

**A11y:** Every control has a `<label>` (wrapping or `htmlFor`/`aria-labelledby`). `aria-describedby` points to helper + error. Error is `role="alert"` (assertive on submit, polite on blur — spec §8.2). `disabled` → `aria-disabled="true"` + tooltip explaining why. Slider exposes `aria-valuenow/min/max`. Toggle exposes `aria-checked`. Focus ring via global `:focus-visible`.

**Sample:**
```tsx
<PropertyRow label="Model" type="select" value="gemini-2.5-pro"
             options={[…]} onChange={v => update({model: v})}
             helperText="Select the Gemini model variant." />
<PropertyRow label="Duration" type="number" value={2} unit="seconds" min={0} step={0.1}
             onChange={v => update({duration: v})} />
<PropertyRow label="Trim whitespace" type="toggle" value={true}
             onChange={v => update({trim: v})} />
<PropertyRow label="Prompt" type="textarea" value={prompt}
             onChange={v => update({prompt: v})} error={promptError} />
```

### 11.8 `EmptyState`

**Purpose:** The single primitive for every enumerated empty state (spec §12). A real panel with a sentence + optional primary action. No illustration (restrained, plan §7). Never a dead-end.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | (required) | 14px semibold (canvas empty heading) or 12–13px (others). |
| `body` | `string` | (required) | 12px `text.secondary` / `text.muted`. |
| `action` | `{ label: string; onClick: () => void; icon?: LucideIcon }` | — | Optional primary action. |
| `secondaryActions` | `ReactNode` | — | For canvas templates (two buttons). |
| `tone` | `'default' \| 'positive'` | `'default'` | `positive` for Problems ("No problems. Workflow is valid.") — reassuring, not error-like (spec §9.4). |
| `centered` | `boolean` | `true` | |
| `live` | `'polite' \| 'off'` | `'polite'` | `aria-live` on first appearance (spec §12). |

**Anatomy:** `<div class="flex flex-col items-center justify-center gap-3 p-6 text-center" role="status" aria-live={live}>{icon ? <Icon class="size-5 text-text-muted" aria-hidden/> : null}<h2 class="text-[14px] font-semibold text-text-primary">{title}</h2><p class="text-[12px] text-text-secondary max-w-xs">{body}</p>{action ? <ToolbarButton variant="secondary" onClick={action.onClick} icon={action.icon}>{action.label}</ToolbarButton> : null}{secondaryActions}</div>`

**Token usage:** `text.primary`, `text.secondary`, `text.muted`, `space.4`/`space.5`/`space.6`, `space.3`, `surface.panel` + `border.subtle` + `radius.control` (action buttons).

**A11y:** `role="status"` + `aria-live="polite"` on first appearance (spec §12), then static. Action button is the first focusable element in its zone when entered via F6 (spec §12). Canvas empty state is REMOVED from DOM at first node (spec §7.1) — not just hidden, so it never interferes with AT.

**Sample:**
```tsx
<EmptyState title="Build your workflow"
  body="Drag a node from the library, or press Tab to focus the library and press Enter to add."
  secondaryActions={<>
    <ToolbarButton variant="secondary" onClick={addTextAiPreview}>Text → AI → Preview</ToolbarButton>
    <ToolbarButton variant="secondary" onClick={addMediaInfo}>Local Media → Info</ToolbarButton>
  </>} />
<EmptyState tone="positive" title="No problems. Workflow is valid." />
```

### 11.9 `DockTab`

**Purpose:** A single tab in the bottom dock tab bar (Console / Problems / Run / Artifacts, spec §9.2) and the collapsed-summary pill (spec §9.1).

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string` | (required) | Tab id; pairs with `aria-controls`. |
| `label` | `string` | (required) | "Console", "Problems", "Run", "Artifacts". |
| `icon` | `LucideIcon` | — | Optional 14px leading icon. |
| `count` | `number` | — | Optional count badge (e.g. error count, problem count). |
| `countTone` | `'default' \| 'error' \| 'warning'` | `'default'` | Badge color. |
| `state` | `string` | — | For Run tab: "idle"/"Running 42%"/"Failed" (spec §9.1). |
| `selected` | `boolean` | `false` | Active tab. |
| `collapsed` | `boolean` | `false` | Render as a collapsed-summary pill (spec §9.1). |
| `onSelect` | `() => void` | — | |
| `controls` | `string` | — | `aria-controls` → tabpanel id. |

**Anatomy (expanded):** `<button role="tab" id={tabId} aria-selected={selected} aria-controls={controls} tabindex={selected ? 0 : -1} class="inline-flex items-center gap-2 h-7 px-3 text-[12px] {selected ? 'text-text-primary border-b-2 border-border-focus' : 'text-text-secondary border-b-2 border-transparent'} hover:text-text-primary">{icon?}<span>{label}</span>{count != null ? <span class="text-[11px] {countToneClass}">{count}</span> : null}</button>`

**Anatomy (collapsed pill):** `<button role="button" aria-pressed={selected} class="inline-flex items-center gap-1 h-6 px-2 rounded-control text-[11px] {selected ? 'bg-surface-hover text-text-primary' : 'text-text-muted'} hover:bg-surface-hover">{icon?}<span>{label}</span>{count != null ? <span class="text-status-{countTone}">{count}</span> : null}</button>`

**Token usage:** `text.primary`, `text.secondary`, `text.muted`, `border.focus` (active underline), `surface.hover`, `status.error`/`status.warning` (count), `radius.control`, `space.2`.

**A11y:** `role="tab"` (expanded) with `aria-selected`, `aria-controls`, roving `tabindex` (spec §9.2). ArrowLeft/Right to switch; Home/End to ends. `role="button"` + `aria-pressed` for the collapsed pill. Count badge is `aria-hidden` if the count is also in the tab's accessible name; otherwise included. `aria-live="polite"` on the Problems tab so new problems announce (spec §9.4). Icon `aria-hidden`.

**Sample:**
```tsx
<DockTab id="tab-problems" label="Problems" icon={TriangleAlert}
  count={2} countTone="warning" selected={tab==='problems'}
  controls="tabpanel-problems" onSelect={() => setTab('problems')} />
```

### 11.10 `NodeLibraryItem`

**Purpose:** A single draggable/keyboard-addable node row in the Node Library (spec §6). 28px row. Supports drag AND keyboard-add (spec §6 — the library is NEVER drag-only).

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `nodeType` | `string` | (required) | The node type string (from `registry.ts`). |
| `label` | `string` | (required) | Display name. |
| `description` | `string` | (required) | Short description (shown in tooltip; in `aria-label`). |
| `icon` | `LucideIcon` | (required) | 16px category icon. |
| `category` | `string` | — | Category (for grouping/search). |
| `keywords` | `string[]` | — | For search match. |
| `badge` | `'none' \| 'mvp2' \| 'note' \| 'not-executable'` | `'none'` | Right-edge badge (spec §6, §14.1). |
| `registryState` | `'canonical' \| 'frontend-only'` | `'canonical'` | Frontend-only → "Not executable yet" badge (spec §14.1). |
| `disabled` | `boolean` | `false` | Non-draggable stub (MVP2 scale test — spec §6). |
| `onAdd` | `(type) => void` | (required) | Called on drag-drop OR keyboard Enter/Space add. |
| `selected` | `boolean` | `false` | Roving-tabindex focus state. |

**Anatomy:** `<div role="button" tabindex={selected ? 0 : -1} draggable={!disabled} aria-label="{label}: {description}" aria-grabbed="false" class="group flex items-center gap-2 h-7 px-2 rounded-control cursor-grab hover:bg-surface-hover focus-visible:ring"><Icon class="size-4 text-text-secondary" aria-hidden/><span class="flex-1 text-[12px] text-text-primary truncate">{label}</span>{badge !== 'none' ? <span class="text-[11px] {badgeClass}">{badgeLabel}</span> : null}<GripVertical class="size-3 text-text-muted opacity-0 group-hover:opacity-100" aria-hidden/><span class="sr-only">drag or press Enter to add</span></div>`

**Badge classes:**
- `mvp2`: `text-text-muted` border `border-border-subtle` 1px, label "MVP2".
- `note`: `text-status-warning` label "Note" (markdownNote — spec §14.1).
- `not-executable`: `text-status-warning` icon `TriangleAlert` label "Not executable yet" (saveArtifact/preview — spec §14.1).

**Token usage:** `surface.hover`, `text.primary`, `text.secondary`, `text.muted`, `status.warning`, `border.subtle`, `radius.control`, `space.2`, `border.focus` (`:focus-visible` ring offset 1px).

**A11y (binding — spec §6, the frozen keyboard invariant):**
- `role="button"`, `tabindex={selected ? 0 : -1}` (roving), `draggable="true"`, `aria-label="{label}: {description}"`.
- `aria-grabbed` toggles `false`→`true` during drag.
- Enter or Space → enters add-mode: global status announcer speaks "Selected {label}. Click on canvas to place, Escape to cancel"; focus moves to canvas `role="application"`; next click/Enter at canvas center places via `onAdd`; Escape cancels and focus returns to the item.
- Visually-hidden hint "drag or press Enter to add" (spec §6, R10).
- `:focus-visible`: 2px `--border-focus` outline, offset 1px (spec §6 — closes audit §6 NodeLibrary.tsx:31 gap).
- Drag contract preserved (audit §8): pointer drag sets `application/reactflow` + `application/reactflow-label` MIME; drop uses `screenToFlowPosition`.
- Disabled (MVP2 stub): `aria-disabled="true"`, `tabindex=-1`, not draggable, skipped by Arrow keys.
- **The library is ALWAYS keyboard-usable, never drag-only** (spec §6 frozen invariant).

**Sample:**
```tsx
<NodeLibraryItem nodeType="aiScript" label="AI Script" description="Run a Gemini prompt"
                 icon={Sparkles} category="AI" keywords={['llm','gemini']}
                 registryState="canonical" onAdd={addNode} selected={focusedIdx===i} />
<NodeLibraryItem nodeType="markdownNote" label="Markdown Note" description="Non-executable note"
                 icon={StickyNote} category="UTILITY" badge="note"
                 registryState="frontend-only" onAdd={addNode} />
```

---

## 12. Contrast & Accessibility Verification

WCAG AA: 4.5:1 for normal text, 3:1 for large text (≥18.66px bold or ≥24px) and UI components (borders, focus rings, status dots against their adjacent surface). AAA: 7:1. Ratios computed via WCAG relative luminance `(L1+0.05)/(L2+0.05)`.

### 12.1 Text tokens vs surfaces

| Text token | Surface | Ratio | AA (4.5:1) | AAA (7:1) | Verdict |
|---|---|---|---|---|---|
| `text.primary` `#e7e9ec` | `surface.canvas` `#0d0f13` | 15.77:1 | PASS | PASS | AAA |
| `text.primary` | `surface.sidebar` `#14161b` | 14.88:1 | PASS | PASS | AAA |
| `text.primary` | `surface.panel` `#1a1d23` | 13.88:1 | PASS | PASS | AAA |
| `text.primary` | `surface.elevated` `#22262e` | 12.47:1 | PASS | PASS | AAA |
| `text.primary` | `surface.hover` `#2a2f38` | 11.05:1 | PASS | PASS | AAA |
| `text.on-accent` `#ffffff` | `accent` `#1d6fd0` | 4.96:1 | PASS | (4.96 < 7) | AA — **white Run label on accent fill; 12px semibold is normal text (WCAG large = ≥18.66px bold), so the 4.5:1 normal-text threshold applies and is met.** |
| `text.secondary` `#aeb4be` | `surface.sidebar` | 8.68:1 | PASS | PASS | AAA |
| `text.secondary` | `surface.panel` | 8.10:1 | PASS | PASS | AAA |
| `text.secondary` | `surface.elevated` | 7.27:1 | PASS | PASS | AAA |
| `text.secondary` | `surface.hover` | 6.45:1 | PASS | (6.45 < 7) | AA (AAA for large) |
| `text.muted` `#949aa6` | `surface.sidebar` | 6.41:1 | PASS | (6.41 < 7) | AA (AAA for large) |
| `text.muted` | `surface.panel` | 5.97:1 | PASS | (5.97 < 7) | AA |
| `text.muted` | `surface.elevated` | 5.37:1 | PASS | (5.37 < 7) | AA |
| `text.muted` | `surface.canvas` | 6.79:1 | PASS | (6.79 < 7) | AA (port labels on canvas) |
| `text.muted` | `surface.hover` | 4.76:1 | PASS | (4.76 < 7) | AA (borderline — avoid for essential info on hover) |
| `text.disabled` `#6b7280` | `surface.sidebar` | 3.74:1 | n/a (UI 3:1) | — | PASS 3:1 UI; **decorative-only / non-essential** |
| `text.disabled` | `surface.panel` | 3.49:1 | n/a | — | PASS 3:1 UI; decorative-only |
| `text.disabled` | `surface.elevated` | 3.14:1 | n/a | — | PASS 3:1 UI (marginal); decorative-only |
| `text.disabled` | `surface.hover` | 2.78:1 | FAIL 3:1 | — | **Decorative-only on hover surfaces; never essential info** |
| `text.error` `#f0656a` | `surface.sidebar` | 5.84:1 | PASS | (5.84 < 7) | AA |
| `text.error` | `surface.panel` | 5.45:1 | PASS | (5.45 < 7) | AA |
| `text.accent` `#4a9eff` | `surface.sidebar` | 6.57:1 | PASS | (6.57 < 7) | AA |

### 12.2 Status tokens as text/dot on surfaces

| Status token | Hex | Against surface | Ratio | Target | Verdict |
|---|---|---|---|---|---|
| `status.running` | `#1d6fd0` | `surface.elevated` `#22262e` | 3.06:1 | 3:1 UI | PASS (marginal — pair with icon + label; on `surface.panel` it is 3.41:1) |
| `status.queued` | `#b08ad3` | `surface.panel` | 5.97:1 | 4.5:1 text / 3:1 UI | PASS |
| `status.success` | `#36c98a` | `surface.elevated` | 7.13:1 | 3:1 UI | PASS |
| `status.warning` | `#e8a317` | `surface.elevated` | 6.99:1 | 3:1 UI | PASS |
| `status.error` | `#f0656a` | `surface.elevated` | 4.89:1 | 3:1 UI | PASS (pair with icon + label) |
| `status.cancelled` | `#787e8a` | `surface.panel` | 4.14:1 | 3:1 UI | PASS (pair with `Ban` icon + "Cancelled" label; lighter than `status.idle` so the dot itself is distinct) |
| `status.skipped` | `#5a6271` | `surface.panel` | 2.75:1 | 3:1 UI | Below 3:1 — decorative color only; "Skipped" label in `text.muted` carries readability |

### 12.3 Focus & border tokens

| Token | Hex | Context | Ratio | Target | Verdict |
|---|---|---|---|---|---|
| `border.focus` | `#1d6fd0` | vs `surface.panel` | 3.41:1 | 3:1 UI | PASS |
| `border.focus` | `#1d6fd0` | vs `surface.sidebar` | 3.65:1 | 3:1 UI | PASS |
| `border.focus` | `#1d6fd0` | vs `surface.elevated` | 3.06:1 | 3:1 UI | PASS (marginal on elevated surfaces; `prefers-contrast: more` widens the ring to 3px — §9) |
| `border.default` | `#2e333d` | vs `surface.panel` | 1.33:1 | — | Low-contrast by design for the dark-tool aesthetic; functional/state boundaries use `border.focus` |
| `border.subtle` | `#21252d` | vs `surface.sidebar` | 1.18:1 | — | Intentional decorative seam, not a UI boundary (§12.4) |

### 12.4 Disabled-text & subtle-border policy

**`text.disabled` (`#6b7280`):** Meets 3:1 on `surface.sidebar`/`panel`/`elevated` but **fails 3:1 on `surface.hover` (2.78:1)**. Policy:
- `text.disabled` is for **disabled control labels and decorative "(unavailable)" markers** — never for essential information.
- On `surface.hover` backgrounds, disabled text MUST be `aria-hidden` (decorative) or replaced by a tooltip; the accessible name is conveyed via `aria-label`, not the disabled visible text.
- WCAG 1.4.3 exempts disabled components ("disabled form controls and UI components that are not user-active") from the 3:1 minimum. We meet it on the primary surfaces anyway.

**`border.subtle` (`#21252d`, ~1.18:1):** Intentionally does NOT meet 3:1 — it is a decorative structural separator (the seam between zones), not a UI-state boundary. Where a border conveys state (focus, selection, status), use `border.focus` (`#1d6fd0`, 3.41:1 vs panel / 3.65:1 vs sidebar / 3.06:1 vs elevated — meets 3:1 UI) or `border.status`, which meet 3:1. This matches the spec's "subtle borders" direction (plan §7) and WCAG 1.4.11 (the subtle separator is not the sole means of distinguishing a control).

### 12.5 Status-not-color verification

Every status surface in §8 pairs its color with a lucide icon AND a text label. A user with total color blindness (monochrome) can identify every run state, health state, save state, console level, and port type via icon + label alone. Color is reinforcement only. This is the structural defense against color-blindness and the spec §0.5/§6/§8 invariant.

### 12.6 Other a11y invariants encoded in tokens

- Focus ring is global and unmuted (§9.1) — no component can ship without it.
- `prefers-reduced-motion` zeroes all motion globally (§3, §9.2).
- `prefers-contrast: more` widens focus rings to 3px (§3).
- Status is never color-only (§8) — every status has icon + label + token.
- Ports use shape + icon as primary cues, color as reinforcement (§10).

---

## 13. Migration Notes for Phase 3

### 13.1 Token wiring

1. Replace `src/App.css` (`@import "tailwindcss";` only) with the §3 listing (`@import "tailwindcss";` + `:root` vars + `@theme inline` block + base layer). No `tailwind.config.*` file is created (Tailwind v4 is CSS-config-based via `@tailwindcss/vite`).
2. The `cn()` util at `src/lib/utils.ts` (clsx + tailwind-merge) is already present and unused — Phase 3 starts consuming it in primitives.
3. `<html>` gets `color-scheme: dark` + `class="dark"` at boot (spec §1, R9 — closes audit §6 App.tsx:76 gap). The base layer in §3 sets `color-scheme: dark`; the `class="dark"` is a forward-compat hook for a future light theme.

### 13.2 Replacing the 23 hardcoded colors (audit §5.4)

The Phase 0 audit recorded ~23 hardcoded color literals across `App.tsx`, `WorkflowCanvas.tsx`, `BaseNode.tsx`, `ConsolePanel.tsx`, `NodeLibrary.tsx`. Phase 3 replaces each with a token. Known mappings:

| Hardcoded (audit §5.4) | Location | Replacement token |
|---|---|---|
| `#334155` | React Flow `Background` | `--surface-canvas-grid` |
| `bg-gray-800` / `bg-slate-800` | React Flow `<Controls>` buttons | `bg-surface-panel` / `bg-surface-elevated` / `text-text-muted` |
| `border-blue-500` | Selected node ring | `--border-focus` (2px, via `:focus-visible`/selection) |
| `bg-blue-500` / `bg-blue-600` | Run button | `bg-accent` / `bg-accent-hover` |
| `bg-red-500` / `bg-red-600` | Stop button | `bg-status-error` |
| `bg-green-500` | Success indicators | `bg-status-success` |
| `bg-yellow-500` / `amber` | Warning / unsaved | `bg-status-warning` |
| `text-red-*` | Errors | `text-text-error` / `text-status-error` |
| `text-gray-*` / `text-slate-*` | Labels | `text-text-primary` / `text-text-secondary` / `text-text-muted` per role |
| `text-white` | Button labels | `text-text-on-accent` (on accent fill) |
| `bg-white` / `bg-zinc-900` etc. | Panel surfaces | `bg-surface-panel` / `bg-surface-sidebar` |
| `border-gray-*` | Dividers | `border-border-subtle` / `border-border-default` |
| Port handle colors (`BaseNode.tsx:21` color-only) | `BaseNode.tsx` | `--port-*` family tokens + shape + icon (§10, closes audit §6) |
| App.tsx connection/`Connected` styling | `App.tsx` | `StatusBadge` with `status="ready"` (spec §5.2, §6) |

**Rule (spec §1, R9):** Phase 3 must not ship with raw color literals. A lint check (e.g. `stylelint-no-hex-color` or a custom ESLint rule on `className` strings) is recommended. Phase 3 DoD: `grep -rE "#[0-9a-fA-F]{3,8}" src/` returns only the `@theme` block in `App.css` (zero literals in components).

### 13.3 shadcn compatibility path

shadcn is NOT initialized (no `components.json`). When Phase 3+ runs `npx shadcn@latest init`, the CLI reads CSS vars named `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--card`, `--popover`, `--border`, `--input`, `--ring`, `--radius`. This spec defines ALL of them as aliases in the `:root` block (§3) pointing at the semantic tokens:

| shadcn var | Points to | Semantic token |
|---|---|---|
| `--background` | `--surface-sidebar` | `surface.sidebar` |
| `--foreground` | `--text-primary` | `text.primary` |
| `--card` | `--surface-panel` | `surface.panel` |
| `--card-foreground` | `--text-primary` | `text.primary` |
| `--popover` | `--surface-elevated` | `surface.elevated` |
| `--popover-foreground` | `--text-primary` | `text.primary` |
| `--primary` | `--accent` | `accent` |
| `--primary-foreground` | `--text-on-accent` | `text.on-accent` |
| `--secondary` | `--surface-hover` | `surface.hover` |
| `--secondary-foreground` | `--text-primary` | `text.primary` |
| `--muted` | `--surface-panel` | `surface.panel` |
| `--muted-foreground` | `--text-secondary` | `text.secondary` |
| `--accent` | `--accent-subtle` | `accent.subtle` |
| `--accent-foreground` | `--text-primary` | `text.primary` |
| `--destructive` | `--status-error` | `status.error` |
| `--destructive-foreground` | `--text-on-status` | `text.on-status` |
| `--border` | `--border-default` | `border.default` |
| `--input` | `--surface-input` | `surface.input` |
| `--ring` | `--border-focus` | `border.focus` |
| `--radius` | `--radius-panel` | `radius.panel` |

Result: `npx shadcn add button dialog select` lands on the exact same vars the custom primitives (§11) use. No token friction, no second palette. shadcn's `Button` variant classes (`bg-primary`, `text-primary-foreground`, `border-border`, `ring-ring`) resolve to the semantic tokens automatically. The `@theme inline` block already generates Tailwind utilities; shadcn primitives consume those or the aliased shadcn vars — both resolve to the same `:root` values.

**Phase 3 setup steps (implementer):**
1. Place the §3 CSS in `src/App.css` (or a `src/styles/tokens.css` imported first).
2. Ensure `<html>` gets `color-scheme: dark` + `class="dark"` at boot.
3. Optionally `npx shadcn@latest init` with CSS-var mode; the aliases already exist.
4. Add primitives from §11 as hand-written components OR via shadcn where the primitive maps (Button → ToolbarButton, Dialog → modal, Select → PropertyRow select, Tabs → DockTab/InspectorSection tabs). Custom primitives (NodeStatus, NodeLibraryItem, StatusBadge, PropertyRow, EmptyState) are hand-written.

### 13.4 React Flow integration

- `colorMode="dark"` (preserved, audit §8).
- `Background` color → `var(--surface-canvas-grid)`.
- `<Controls>` buttons → restyled via CSS targeting React Flow classes, using `bg-surface-panel`/`text-text-muted`/`rounded-control`; each gets `aria-label` (spec §7.2).
- Node/edge selection → `outline: 2px solid var(--border-focus)` (via the global `:focus-visible`/selection rule).
- Port Handles → inline `style` using `var(--port-<family>)` for stroke/fill; shape via CSS (`border-radius: 0` square vs `50%` circle).
- Edges → `var(--edge-stroke)` / `var(--edge-stroke-selected)`; animated dashed when carrying active run payload (reduced-motion: solid).

### 13.5 Light mode (stretch goal — noted, not specified)

Light mode is a stretch goal (plan §7: dark-first). The inversion is clean for surfaces/text (swap lightness poles) but requires care for:
- `surface.canvas` (must stay distinct from `surface.sidebar`).
- Status hues (chroma may need reduction on light backgrounds to avoid neon).
- Port colors (lightness inversion; shape + icon carry through unchanged).

If/when light mode is added, implement as `:root[data-theme="light"] { /* override only the tokens that change */ }` or a `@media (prefers-color-scheme: light)` block on `:root:not([data-theme="dark"])`. The `@theme inline` block uses `var()`, so overriding `:root` vars retargets every utility automatically — no utility duplication needed. **Not specified further in this document; a full contrast pass (§12) must be re-run for the inverted palette before light mode ships.**

---

## 14. Regression Check (plan §27 contracts)

Plan §27 requires every major UI refactor to preserve: drag node, connect nodes, save workflow, load workflow, run workflow, stop workflow, existing logs, existing node configuration, and existing backend IPC contracts. This design system is **spec-only** (no code), but the token system is shaped to preserve every §27 contract:

| §27 contract | Preserved by this design system? | Evidence |
|---|---|---|
| Drag node | YES | `NodeLibraryItem` (§11.10) preserves the drag contract: `application/reactflow` + `application/reactflow-label` MIME, `screenToFlowPosition` on drop, `aria-grabbed` toggle (audit §8, spec §6). Tokens only change colors. |
| Connect nodes | YES | Port Handle shape/icon/color tokens are visual; `isValidConnection` cycle guard preserved (audit §8, spec §7.3). Keyboard-connect (§10.5) is ADDITIVE — does not replace pointer connect. Port tokens are visual-only; backend validation authoritative (plan §13). |
| Save workflow | YES | `saveSlice` (spec §2.1) + `ToolbarButton` Save (§11.3) are visual; `invoke('save_workflow')` (audit §8) untouched. Save chip + toast (spec §5.1, §10.1) are visual feedback layers. |
| Load workflow | YES | `replaceGraph` hydration path (spec §2.1) unaffected by tokens. |
| Run workflow | YES | `runSlice` + controller `invoke('start_run')` untouched. `ToolbarButton` Run→Stop swap (§11.3) is the same DOM button (spec §5.3 — no focus loss). Animated edge (§9.2) is decorative; reduced-motion solid. |
| Stop workflow | YES | `invoke('cancel_run')` untouched. Stop is a deliberate button click (spec §15 — Esc does NOT cancel). `ToolbarButton` danger variant (§11.3). No modal (spec §10.2). |
| Existing logs | YES | Console typography (§4: `text-log` mono 12px) + status icons (§7, §8) preserve log rendering. `consoleSlice` (spec §9.3) unaffected. Level = icon + label + color (not color-only — closes audit §6). Log format "12:04:11 AI Script INFO Calling Gemini" unchanged. |
| Existing node configuration | YES | `PropertyRow` (§11.7) calls `graphSlice.updateNodeData` → sets `dirty` (spec §8.2). Generic Inspector from `configSchema` (spec §13) — no per-node-type layout assumed. Node-type reconciliation (spec §14) is frontend-only. |
| Backend IPC contracts (6) | YES | Zero Rust edits. Tokens are frontend CSS only. The 6 IPC calls (audit §8) are untouched; `useWorkflowController` (spec §2.2) owns all `invoke()`; tokens do not touch it. Node-type drift reconciled frontend-only (spec §14.3). |

**Additional preserved invariants (spec §0.2, audit §8):**
- **React Flow** (`@xyflow/react` v12): tokens restyle `Background` (`--surface-canvas-grid`), `Controls` (`--surface-elevated`), selection (`--border-focus`); `colorMode="dark"`, `fitView`, `isValidConnection` preserved (spec §7). The token system does not assume React Flow removal.
- **Zustand store shape** (audit §8): tokens have no relationship to store shape; `runSlice`/`saveSlice`/`selectionSlice` field names (spec §2.1) are consumed read-only by visual primitives.
- **`cn()` util** (`src/lib/utils.ts`): adopted (§11), not replaced.
- **Semantic HTML / ARIA landmarks** (audit §8): preserved and extended — primitives emit correct elements (`<aside>`, `<nav>`, `<main>`, `<header>`, `<footer>`, `<button>`, `<h2>`/`<h3>`) and ARIA attributes.
- **Tauri event pattern**: `workflow-log`, `run-state`, `save-result` events preserved (spec §2.2); tokens are presentation only.

**Risks carried forward (from spec §18, relevant to Phase 2):**
- **R9 — Dark-first token system is a prerequisite for the visual contract.** RESOLVED by this document: every token named in spec §1/§5/§6/§7/§8/§9 now has a concrete value (§2, §3). Phase 3 must not ship raw literals.
- **R7 — Spec drift.** Mitigation: this document is the binding input to Phase 3; any deviation requires editing it first. The `@theme inline` block (§3) is copy-paste-ready so there is no ambiguity in implementation.

**Visual acceptance (plan §28):** the 10 acceptance screenshots (empty canvas, 3–5 nodes, selected node + Inspector, running, failed, console expanded, problems, artifacts, history, settings) will validate hierarchy, alignment, density, spacing, contrast, and status clarity against this token system. The contrast table (§12) pre-verifies the contrast axis; the remaining axes are verified visually in Phase 9 (Accessibility & Interaction Audit).

**The token system does NOT assume removal of:** React Flow, drag-drop keys, IPC, Zustand, Tauri events, `cn()`, semantic HTML, or any §27 contract. It is a presentation-only layer — it cannot regress any functional behavior because it touches no behavior, only how that behavior looks and is announced to assistive tech.

---

### End of Phase 2 Design System spec.

Phase 3 (Workspace Shell) implements against this document. Phase 5 (Canvas) implements ports against §10 and edges against §9.2. Phase 6 (Inspector) implements `PropertyRow` primitives against §11.7. Any deviation from this spec in a later phase requires editing this document first (spec §0.6 authority).