# Phase 9 — Accessibility & Interaction Audit

Scope: Phase 9 audit over 11 categories — Keyboard, Focus, Contrast, Tooltips, Hit targets, Disabled state, Loading state, Error state, Resize, Overflow, Scroll behavior. Method: 4 grouped auditors (Keyboard & Focus; Visual Accessibility; State Patterns; Layout & Motion) applied the live [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) rules, then adversarially verified each finding against source. **`agent-browser` CLI is NOT installed — automated screenshot/visual regression could not be run; all findings are source-level only.** 26 confirmed findings across 8 categories; 3 categories passed clean. 8 findings were refuted during verification and are excluded.

## Summary

| Category | Confirmed | Highest severity |
|---|---|---|
| Contrast | 4 | high |
| Hit targets | 8 | medium |
| Keyboard | 3 | medium |
| Focus | 2 | medium |
| Loading state | 2 | medium |
| Error state | 2 | medium |
| Overflow | 4 | medium |
| Resize | 1 | medium |
| Tooltips | 0 | — (clean) |
| Disabled state | 0 | — (clean) |
| Scroll behavior | 0 | — (clean) |

---

## Contrast

### src/components/shell/TopToolbar.tsx
- `:145` — Stop button uses `text-text-on-status` (#fff) on `bg-status-error` (#f0656a) at 12px font-medium ≈ 3.1:1, below 4.5:1. Phase 2 token verification checked #f0656a as text-on-panel (5.45:1), NOT white-on-error-fill, so this pairing was uncovered. **[high]** Fix: darken the error fill for text-bearing buttons (e.g. `--status-error-strong` ~#d23b41), or render the Stop label in `text-text-primary` and keep the icon in `text-text-on-status`.
- `:145` — Stop hover applies `hover:opacity-90`, dropping the already-borderline 3.1:1 to ~2.8:1; hover must increase contrast, not reduce it. **[medium]** Fix: replace with a darker hover fill (`--status-error-hover`).
- `:207` — SaveStateChip 'Unsaved' label uses `text-text-warning`, but no `--color-text-warning` token exists in App.css `@theme inline` (only `--color-status-warning` at line 266); the utility never resolves and text falls back to inherited `--text-primary` (#e7e9ec). Both icon (`:221`) and label (`:224`) affected. **[medium]** Fix: change `text-text-warning` → `text-status-warning` (#e8a317, ~8:1 on panel).

### src/components/shell/BottomDock.tsx
- `:257` — Console/Problems count badges use `text-text-on-status` (#fff) on `bg-status-error` (#f0656a) at `text-[10px]` ≈ 3.1:1, below 4.5:1. Same unverified white-on-error-fill pairing as the Stop button. **[high]** Fix: darker error badge fill, or switch count text to `text-text-primary` with a darker badge bg.

---

## Hit targets

### src/components/shell/AppRail.tsx
- `:40` — Collapsed rail re-open strip is `w-1` (4px) — far below the 24px WCAG 2.5.5 minimum for a `role=button`/`tabIndex=0` element with `onKeyDown`. **[medium]** Fix: widen visible strip to `w-2` and wrap in an invisible ≥24px hit area (outer `w-6` button + inner 4px bar).

### src/components/shell/ToastRegion.tsx
- `:72` — Dismiss button has no padding around the 14px X icon → ~14px target, below 24px. **[medium]** Fix: add `p-1` (or `min-w-6 min-h-6` with flex centering).

### src/components/shell/NodeLibrary.tsx
- `:229` — Search clear button uses `p-0.5` (2px) around a 14px icon → ~18px target. **[low]** Fix: `p-1` (4px) for ~22px, or `min-w-6 min-h-6` centered.

### src/components/shell/BottomDock.tsx
- `:430` — Console level-radio filter pills `px-1.5 py-0.5` on `text-[11px]` → ~20px tall. **[low]** Fix: `py-1` or `min-h-6`.
- `:476` — Console Clear button `px-1.5 py-0.5` on 12px icon+text → ~20px tall. **[low]** Fix: `py-1` or `min-h-6`.
- `:510` — 'Down N new' jump-to-bottom pill `px-2 py-0.5` on `text-[11px]` → ~20px tall. **[low]** Fix: `py-1` or `min-h-6`.
- `:166` — CollapsedPill dock-summary buttons `px-1.5 py-0.5` on `text-[11px]` → ~20px tall. **[low]** Fix: `py-1` or `min-h-6` on the pill buttons.

### src/components/nodes/PortHandle.tsx
- `:70` — Port handle visual/hit area is `!h-2.5 !w-2.5` (10px) for a `role=button`/`tabIndex=0` element; a keyboard-connect alternative exists but mouse acquisition is sub-minimum. The adjacent comment claims a "comfortable hit target" but no larger wrapper is implemented. **[low]** Fix: keep the 10px visual dot but wrap in a 24px transparent hit container (`absolute inset -7px` or outer `w-6 h-6`).

---

## Keyboard

### src/components/shell/BottomDock.tsx
- `:430` — Console level-filter `role="radio"` buttons have no explicit `tabIndex` (all default to 0 → every radio is a separate Tab stop) and no Arrow-key handler, violating the radiogroup contract (roving tabindex + Arrow keys to switch). The TabBar in the same file correctly implements roving tabindex + arrow nav — pattern is known but not applied here. **[medium]** Fix: `tabIndex={isActive ? 0 : -1}` per radio + `onKeyDown` moving focus with ArrowLeft/Right across `LEVEL_PILLS`, calling `setLogFilter` on the new pill.
- `:540` — Each ConsoleLine is `div role="row"` but its container is `role="log"`, not `table`/`grid` — a row outside a table/grid/treegrid is invalid ARIA and breaks how AT conveys log lines. **[low]** Fix: drop `role="row"` to a plain div (the container's `role="log"` already conveys the region) and convey level via the existing sr-only label.

### src/components/shell/TopToolbar.tsx
- `:318` — OverflowMenu arrow-key navigation does not skip disabled menuitems. A natively disabled `<button>` cannot receive focus (`.focus()` is a no-op), so focus does NOT land on the disabled item — instead navigation **stalls** at it because `focusItem` targets it and the no-op focus leaves the user unable to arrow past (e.g. cannot reach Keyboard Help / Settings when 'Export Workflow' or a disabled 'Open Output' is in the path). (Refuted sub-claim: "the first item always gets `tabIndex=0` even when disabled" — the first item 'Toggle App Rail' is never disabled.) **[low]** Fix: when computing the next index in `focusItem`/Arrow handlers, loop until a non-disabled button is found; set initial `tabIndex=0` on the first *enabled* item.

---

## Focus

### src/components/shell/UnsavedGuardDialog.tsx
- `:23` — Modal sets `aria-modal="true"` and moves focus in on open but has no Tab key trap, so Tab can leave the dialog to background controls behind the scrim. The sibling KeyboardHelpDialog implements a Tab trap (lines 42–57), establishing this as the intended pattern. **[medium]** Fix: add a keydown listener while open that wraps Tab/Shift+Tab among the dialog's focusable elements (mirror KeyboardHelpDialog's trap); on close, restore the trigger.

### src/hooks/useWorkspaceShortcuts.ts
- `:120` — Alt+1..4 screen switching changes `activeScreen` but moves no focus — focus stays where it was. When focus was in a region that unmounts on screen change (canvas/library/inspector), the user is left on an unmounted element with no indication of the new screen context until they press F6. **[low]** Fix: after `setActiveScreen`, move focus into the new screen's main landmark (`document.querySelector('main[data-screen]')?.focus()` with `tabindex=-1`) or to the toolbar back button.

---

## Loading state

### src/components/shell/UnsavedGuardDialog.tsx
- `:75` — Save button fires async `controller.save()` (line 78) with no spinner, `aria-busy`, or 'Saving…' label, and the button is not disabled during the save — it stays clickable with no feedback. Violates "Submit button stays enabled until request starts; spinner during request" (no spinner, and button remains clickable mid-request). **[medium]** Fix: track local `saving` state; while pending disable the button, render `LoaderCircle` spinner, set `aria-busy`, and label 'Saving…'.

### src/components/shell/TopToolbar.tsx
- `:133` — Save button label stays static 'Save' while saving (spinner swaps in at lines 128–132); the adjacent SaveStateChip correctly shows 'Saving…' but the button text itself never changes. Violates "Loading states end with … — Saving…". **[low]** Fix: render `{saveStatus === 'saving' ? 'Saving…' : 'Save'}` as the label.

---

## Error state

### src/hooks/useWorkflowController.ts
- `:122` — 'Run blocked' error toast description lists the non-executable node types but gives no fix/next step. Violates "Error messages include fix/next step, not just problem". **[medium]** Fix: append a next step, e.g. `… Remove or replace them before running.`
- `:106` — IPC error toasts (save at `:106`, plus run/stop/openFolder/init failures at `:84`, `:139`, `:174`, `:189`) pass raw `String(err)` as the description with no fix/next step. **[low]** Fix: prefix/suffix a generic next step, e.g. `${String(err)} — check the backend connection and retry.`

---

## Resize

### src/components/shell/WorkspaceShell.tsx
- `:46` — Auto-collapse thresholds are one step too low: library collapses at `<776` and inspector at `<536`, but the min-width sum is 976 (rail 56 + library 200 + canvas 480 + inspector 240). Between 776–976px no zone collapses (`tooNarrow` is true but both inner conditions fail), so the fixed-width columns plus `canvas minmax(480px,1fr)` exceed the viewport and `root overflow-hidden` clips the inspector off-screen with its splitter unreachable. **[medium]** Fix: collapse library when `innerWidth < 976` and inspector when `< 776`, matching the documented min-width sum on line 42.

---

## Overflow

### src/components/shell/TopToolbar.tsx
- `:85` — Breadcrumb project name span is `shrink-0` with no `truncate`/`max-w`; a long project name overflows the breadcrumb. The workflow name crumb has `max-w-[280px] truncate` but the project name does not. **[medium]** Fix: add `max-w-[140px] truncate` to the project name span (it already carries `title={projectName}`).

### src/components/shell/Inspector.tsx
- `:483` — ConnectionInspector source/target label spans use `truncate` but lack `min-w-0`; as flex children their min-width defaults to auto (content size), so truncation is inert and long node labels overflow the row. Target label span at `:491` has the same defect. **[medium]** Fix: add `min-w-0 flex-1` to both label spans.

### src/components/shell/KeyboardHelpDialog.tsx
- `:75` — Dialog is `w-[480px] max-w-[90vw]` but has no max-height or overflow on its body; the 17-row shortcut table (~540px plus header/footer) exceeds short viewports and the bottom rows become inaccessible with no scroll. **[medium]** Fix: add `max-h-[85vh] overflow-y-auto` to the dialog container, or wrap the table in a `max-h overflow-y-auto` scroll wrapper.

### src/components/shell/ToastRegion.tsx
- `:60` — Toast title div has no `truncate`/`line-clamp`/`break-words`; a very long unbroken title (e.g. a URL) overflows the fixed 280px toast. **[low]** Fix: add `break-words` (or `line-clamp-2 break-words`).

---

## Strengths (categories that passed clean)

- **Tooltips** — No confirmed findings. Icon-only buttons across the shell (AppRail, TopToolbar run/stop, BottomDock tabs, NodeLibrary clear, ToastRegion dismiss, PortHandle) carry `aria-label` and/or `title` attributes; the tooltip rule set was applied and no unresolved-label or missing-tooltip finding survived verification.
- **Disabled state** — No confirmed findings. The only disabled-state candidate (TopToolbar OverflowMenu disabled-item arrow traversal, `:318`) was reclassified under Keyboard, since the defect is arrow-nav stalling, not the disabled state itself. Disabled buttons elsewhere use `disabled:cursor-not-allowed disabled:opacity-50` consistently; no `aria-disabled` mis-use or disabled-but-still-focusable `tabIndex=0` survived.
- **Scroll behavior** — No confirmed findings. `overscroll-behavior` containment on modals/docks and `scroll-margin-top` on heading anchors were checked; no confirmed scroll-chaining or anchor-scroll defect. (KeyboardHelpDialog `:75` is an overflow/height issue, logged under Overflow, not a scroll-behavior defect.)

---

## Intentional patterns (not issues — do not re-flag)

- **Status is not color-only** — Run/Stop and problem indicators pair color with icon + text label (Stop button has 'Stop workflow' aria-label + icon; SaveStateChip pairs icon with text). Color is reinforcement, not the sole signal.
- **Inline-confirm, not `confirm()`** — Unsaved-changes navigation uses the UnsavedGuardDialog modal (a real dialog with focus management), never `window.confirm()`.
- **Disabled-with-tooltip for no-backend actions** — OverflowMenu items that require a backend/connection are disabled with a `title`/tooltip explaining why, rather than removed or silently no-op.
- **Name edits do not mark dirty** — Editing a node/workflow name in the inspector is treated as non-dirtying metadata (no `*` unsaved marker, no guard), by design.
- **Canvas unmount on screen swap** — The workflow canvas unmounts when switching to a secondary screen (library/inspector/run), so its DOM/canvas context is released; the `main[data-screen]` landmark swaps accordingly.
- **`main[data-screen]` landmark** — Each screen renders a single `main[data-screen="…"]` landmark providing a programmatic screen identity for F6/skip navigation and the Alt+1..4 focus target.

---

## Blockers / deferred

- **`agent-browser` CLI is NOT installed.** Automated screenshot/visual regression could not be run; all findings are source-level. Recommend installing (`npm i -g agent-browser && agent-browser install`) before Phase 10+ to confirm contrast ratios and hit-target geometry in the rendered app — the two `high` contrast findings in particular should be measured against the actual rendered fills, not just token hex values.
- **Two `high`-severity contrast findings — RESOLVED in Phase 10:** TopToolbar Stop button (`:145`) and BottomDock count badges (`:257`) — both white-on-`bg-status-error` (#f0656a) at ~3.1:1. Fixed via a darker `--status-error-strong` (#d23b41) / `--status-error-hover` (#b82f35) token pair; the `:145` hover-opacity medium is resolved by the same hover token. Rendered-contrast confirmation via `agent-browser` remains a recommended non-blocking follow-up.

---

## Recommendations

Ordered high-severity first, then medium. Low findings are documented in their category sections above.

1. **`src/components/shell/TopToolbar.tsx:145`** — Stop button white-on-error-red ≈ 3.1:1 **[high]**. Introduce `--status-error-strong` (~#d23b41) for text-bearing error buttons, or render the Stop label in `text-text-primary` and keep the icon in `text-text-on-status`.
2. **`src/components/shell/BottomDock.tsx:257`** — Count badges white-on-error-red ≈ 3.1:1 **[high]**. Use the same darker error fill as #1 for badge backgrounds, or switch count text to `text-text-primary`.
3. **`src/components/shell/TopToolbar.tsx:145`** — `hover:opacity-90` reduces contrast **[medium]**. Replace with a `--status-error-hover` darker fill token so hover increases contrast.
4. **`src/components/shell/TopToolbar.tsx:207`** — `text-text-warning` token never resolves; warning color silently lost **[medium]**. Change to `text-status-warning` (resolves to #e8a317, ~8:1 on panel). Apply to both icon (`:221`) and label (`:224`).
5. **`src/components/shell/AppRail.tsx:40`** — 4px re-open strip is sub-minimum hit target **[medium]**. Widen visible strip to `w-2` and wrap in an invisible ≥24px hit area (outer `w-6` button + inner 4px bar).
6. **`src/components/shell/ToastRegion.tsx:72`** — 14px dismiss target **[medium]**. Add `p-1` (or `min-w-6 min-h-6` with flex centering) for ≥24px.
7. **`src/components/shell/UnsavedGuardDialog.tsx:23`** — No Tab trap; Tab escapes to background controls **[medium]**. Mirror KeyboardHelpDialog's keydown trap (lines 42–57); restore trigger on close.
8. **`src/components/shell/UnsavedGuardDialog.tsx:75`** — No spinner/`aria-busy`/disable during async save; button stays clickable **[medium]**. Track `saving` state: disable button, render `LoaderCircle`, set `aria-busy`, label 'Saving…'.
9. **`src/components/shell/BottomDock.tsx:430`** — Radiogroup has no roving tabindex or Arrow nav **[medium]**. Set `tabIndex={isActive ? 0 : -1}` per radio; add `onKeyDown` moving focus with ArrowLeft/Right across `LEVEL_PILLS`, calling `setLogFilter` on the new pill.
10. **`src/hooks/useWorkflowController.ts:122`** — 'Run blocked' toast lists problem but no fix/next step **[medium]**. Append `… Remove or replace them before running.` to the description.
11. **`src/components/shell/WorkspaceShell.tsx:46`** — Auto-collapse thresholds too low; inspector clipped 776–976px **[medium]**. Collapse library at `<976` and inspector at `<776`, matching the min-width sum on line 42.
12. **`src/components/shell/TopToolbar.tsx:85`** — Breadcrumb project name never truncates **[medium]**. Add `max-w-[140px] truncate` (it already carries `title={projectName}`).
13. **`src/components/shell/Inspector.tsx:483`** — `truncate` without `min-w-0` is inert; long labels overflow **[medium]**. Add `min-w-0 flex-1` to both source (`:483`) and target (`:491`) label spans.
14. **`src/components/shell/KeyboardHelpDialog.tsx:75`** — No max-height/overflow; bottom rows inaccessible on short viewports **[medium]**. Add `max-h-[85vh] overflow-y-auto` to the dialog container (or wrap the table in a scroll wrapper).

---

*26 confirmed findings · 8 refuted · 3 clean categories · source-level audit (`agent-browser` not installed — screenshot regression not run).*

---

## Phase 10 resolution

All 2 high + 12 medium findings above were fixed in Phase 10 (Review & Cleanup),
plus the low findings (ConsoleLine `role="row"`, hit-target pill padding, toast
title `break-words`, OverflowMenu disabled-item arrow-nav). The two high
contrast pairings now use a darker `--status-error-strong` (#d23b41) fill with a
`--status-error-hover` (#b82f35) hover; the unresolved `text-text-warning` token
was corrected to `text-status-warning`; the placeholder health pill was wired to
real `uiSlice.health.backend` state; the dead BottomDock ternary and the
`SCALE_TEST` prototype stub generator were removed. See the Phase 10 summary in
[UI_REDESIGN_STATUS.md](../UI_REDESIGN_STATUS.md) for the full fix table. The
`agent-browser` rendered-contrast measurement remains a recommended
non-blocking follow-up (the source-level fix is in place).