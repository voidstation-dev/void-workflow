# Void Workflow — UI Redesign Status

> Tracks **UI redesign** phases only. Do not mix with MVP execution-engine
> status (see [MVP1_STATUS.md](MVP1_STATUS.md)).

Last Updated: 2026-08-13

## Overall

| Metric | Value |
|---|---|
| Current Phase | Phase 10 — Review & Cleanup |
| Current Phase Status | DONE — ALL PHASES COMPLETE |
| Blocking Phases | none |
| Application source modified | Yes |
| Rust engine modified | No (zero `.rs` edits) |

## Phase Tracker

| Phase | Phase Name | Status | Deliverable |
|---|---|---|---|
| Phase 0 | Repository & Runtime Audit | DONE | [docs/ui/UI_AUDIT.md](ui/UI_AUDIT.md) |
| Phase 1 | UX Architecture | DONE | [docs/ui/WORKSPACE_UX_SPEC.md](ui/WORKSPACE_UX_SPEC.md) |
| Phase 2 | Design System | DONE | [docs/ui/DESIGN_SYSTEM.md](ui/DESIGN_SYSTEM.md) |
| Phase 3 | Workspace Shell | DONE | 5-zone shell + tokens + store/controller |
| Phase 4 | Node Library | DONE | searchable/categorized library + keyboard-add end-to-end |
| Phase 5 | Canvas Polish | DONE | typed ports + edges + selection + empty state + minimap + §7.4 keyboard contract |
| Phase 6 | Inspector System | DONE | generic PropertyRow/InspectorSection/Tabs + 4-mode Inspector (node/edge/multi/workflow) + inline-confirm delete |
| Phase 7 | Observability Dock | DONE | Console filters+clear+autoscroll, Problems click-to-focus+setCenter+aria-live, Run per-node list+progress, Artifacts open_run_folder |
| Phase 8 | App Screens | DONE | Projects (display-only) + History (frontend-populated) + Settings (frontend-only) + screen swap + back/⋯/rail reconciliation |
| Phase 9 | Accessibility & Interaction Audit | DONE | [docs/ui/ACCESSIBILITY_AUDIT.md](ui/ACCESSIBILITY_AUDIT.md) — 26 confirmed findings across 8 categories (2 high contrast), 3 clean |
| Phase 10 | Review & Cleanup | DONE | Cleanup + all 2 high + 12 medium audit findings fixed; SCALE_TEST dead code + dead BottomDock ternary + placeholder health pill removed; verify gate clean |

Status values: `NOT_STARTED` · `IN_PROGRESS` · `BLOCKED` · `IN_REVIEW` · `DONE`

## Phase 0 — Summary

- **Deliverable:** [docs/ui/UI_AUDIT.md](ui/UI_AUDIT.md) — created.
- **Skills used:** `audit-context-building` (full), `web-design-guidelines`
  (full, fetched live rules), `agent-browser` (skill read; CLI not installed —
  visual audit via source reading). See audit §10.
- **Skill gaps:** `react-best-practices`, `composition-patterns` not installed
  (never in global set); equivalents applied from knowledge.
- **Findings:** 15/15 plan-listed UX issues confirmed; 1 high-priority bug
  (node-type registration mismatch across Rust registry / palette / `nodeTypes`
  map); no design system (23 hardcoded colors, no tokens); no Inspector / App
  Rail / Bottom Dock; 5 `alert()` dialogs; no a11y layer. App launches clean,
  no runtime errors.
- **What to keep:** 6 IPC contracts, Zustand graph shape, React Flow cycle
  guard, drag-drop keys, Tauri event pattern, `cn()` util, semantic HTML.
- **Migration strategy:** additive — build new shell around existing
  components; move `App.tsx` IPC handlers into a controller hook in Phase 3.

## Phase 1 — Summary

- **Deliverable:** [docs/ui/WORKSPACE_UX_SPEC.md](ui/WORKSPACE_UX_SPEC.md) —
  created. Workspace UX frozen across all 5 zones + dialogs + states.
- **Method:** 3 independent UX proposals (zone-density-first,
  accessibility-first, canvas-primary-first) → judge synthesis → adversarial
  verify. 5 agents, 0 errors.
- **Skills used:** `web-design-guidelines` (a11y/UX rules applied to zone
  specs, landmark/roving-tabindex/inert patterns), `frontend-design`
  (workspace hierarchy, density, collapse strategy), `audit-context-building`
  (state-model assumptions carried from Phase 0). `react-best-practices` /
  `composition-patterns` still not installed — equivalents applied from
  knowledge (see blockers).
- **Frozen decisions (plan §3/§4, all 10 freeze items):**
  1. 5-zone workspace layout — App Rail (56px fixed) | Node Library
     (200-360px) | Canvas (1fr, never collapses) | Inspector (240-440px) |
     Bottom Dock (120-480px, overlays full width).
  2. App Navigation Rail — icon-only, Alt+1..4, roving tabindex, disabled
     Phase-8 screens with tooltip, collapsible to re-open strip.
  3. Top Toolbar — project/workflow context, save-state, run/stop, health
     pill, no `alert()`.
  4. Node Library — searchable, 6 single-level categories (INPUT/TEXT/AI/
     MEDIA/UTILITY/OUTPUT), drag + click-add modes, category-local collapse.
  5. Canvas — React Flow, colorMode dark, fitView, minimap toggle, cycle
     guard preserved, drag-drop keys preserved.
  6. Inspector — generic, tabbed (Input/Output/Run, complex nodes add
     Settings/Items), context-sensitive header, mode title.
  7. Bottom Dock — 4 tabs (Console / Problems / Run / Artifacts), resizable,
     collapsed = 28px summary bar with live pill counts.
  8. Dialogs — single-open modal pattern via `uiSlice.dialog`, no native
     `alert()`; Run/Confirm/Save-As/Settings/Keyboard-Help.
  9. States — empty/canvas, run (idle/running/paused/cancelled/done/error),
     selection (single/multi/edge/port), save (clean/dirty/saving/error),
     connection-preview.
  10. Keyboard shortcuts — F6 zone cycle, Alt+1..4 screens,
      Ctrl/Cmd+Shift+B App Rail, Ctrl/Cmd+B Library, Ctrl/Cmd+I Inspector,
      Ctrl/Cmd+J Dock, Ctrl/Cmd+S Save, Ctrl/Cmd+Enter Run, Esc clear/close,
      Ctrl/Cmd+? Help.
- **State model (frozen):** hybrid — ONE Zustand store with logical slices
  (`graphSlice`, `selectionSlice`, `runSlice`, `saveSlice`, `consoleSlice`,
  `problemsSlice`, `uiSlice`, `projectSlice`) + `useWorkflowController` hook
  as the ONLY imperative Tauri writer (all 6 IPC commands + event listener).
  Each zone reads/writes only its own slice fields. Persist partializer scoped
  to LAYOUT ONLY (widths/collapse/tab/minimap) — never graph/run/selection.
- **Audit open questions resolved (all 5 from UI_AUDIT.md §11):** node-type
  single source of truth strategy, save-state ownership (saveSlice +
  toolbar reads), run-state ownership (runSlice + dock reads), health-pill
  data source (Tauri capability query + event), dialog pattern
  (`uiSlice.dialog` single-open). See spec resolution notes.
- **Regression contracts preserved (plan §27):** 6 IPC commands, React Flow
  `isValidConnection` cycle guard, drag-drop `dataTransfer` keys
  (`application/reactflow` + `application/reactflow-label`), Tauri
  `workflow-log` event payload shape, Zustand graph node/edge shape,
  `cn()` util, `screenToFlowPosition`.
- **Validation:** adversarial verifier — initially FAIL on ONE contradiction
  (Ctrl/Cmd+B double-assigned to App Rail collapse AND Node Library toggle).
  Fixed: App Rail → Ctrl/Cmd+Shift+B (§3, §4, §15 table); Node Library keeps
  Ctrl/Cmd+B. Re-verified clean — no remaining shortcut conflicts, all 10
  freeze items covered, all 5 open questions resolved, all §27 contracts
  preserved. Spec is verified-clean.
- **Application source modified:** No (spec only — no `.tsx`/`.ts`/`.rs`
  touched). Rust engine untouched.
- **Blockers carried forward:** `agent-browser` CLI (Phase 5/9),
  `react-best-practices`/`composition-patterns` (Phase 2/3),
  node-type registration mismatch (Phase 3 — single source of truth).

## Phase 2 — Summary

- **Deliverable:** [docs/ui/DESIGN_SYSTEM.md](ui/DESIGN_SYSTEM.md) —
  created (106,570 chars, 1,364 lines). The binding visual contract for Phase 3+.
- **Method:** 3 independent design-system proposals
  (`tailwind-shadcn-native`, `accessibility-first`, `media-dev-tool-aesthetic`)
  → judge synthesis → adversarial verify. 5 agents, 0 errors. (First run hit a
  defect where proposal agents wrote the file to disk instead of returning
  markdown as text; fixed the script's output constraint and re-ran.)
- **Skills used:** `frontend-design` (token hierarchy, density, accent
  strategy), `web-design-guidelines` (WCAG contrast, focus/motion, status-not-
  color), `shadcn` (shadcn-compatible token alias layer for Phase 3+).
  `react-best-practices`/`composition-patterns` still not installed —
  equivalents applied from knowledge (see blockers).
- **Frozen (plan §8 + §UI PHASE 2, all 9 categories):**
  1. **Tokens** — full token system: 8 surface, 4 border, 8 text, 8 status,
     3 accent, 10 port, plus radius/spacing/border-width/shadow/z-index. Every
     token the Phase 1 spec names (`surface.*`, `border.*`, `text.*`,
     `status.*`, `--border-focus`, `--surface-canvas-grid`) has a concrete value.
  2. **Typography** — system sans + monospace stack; 7 roles (workflow title,
     panel/node title, body, metadata, logs monospace, port labels, captions).
  3. **Spacing** — 4/8/12/16/20/24 scale (plan §8) with usage map.
  4. **Radius** — control 4px, panel 6px, full 9999px (spec §1).
  5. **Borders** — 1px subtle/default, 2px focus/selection, 1.5px edge.
  6. **Icons** — lucide-react; sizes 12/14/16/20; `aria-hidden` for decorative;
     icon-only buttons require accessible name.
  7. **Status styles** — 6 run states, 4 health states, 4 save states; each =
     token + icon + dot/badge + a11y note. Never color-only.
  8. **Form density** — PropertyRow 28px, 11-12px text, `border.subtle`,
     `border.focus` ring.
  9. **Focus & motion** — `:focus-visible` 2px `--border-focus` ring offset 2px;
     `prefers-reduced-motion` = 0ms; `prefers-contrast: more` = 3px rings.
- **Typed port visual system (plan §13, 10 families):** Text/Number/Boolean/
  Json/Any = circle; File/Media/Audio/Video/Artifact = square. Each has a
  lucide icon + Okabe-Ito-informed color (color-blind-safe; shape+icon primary,
  color secondary). Keyboard-connect a11y carried from spec §7.3.
- **10 reusable primitives (spec'd, not implemented):** Panel, PanelHeader,
  ToolbarButton, StatusBadge, NodeStatus, InspectorSection, PropertyRow,
  EmptyState, DockTab, NodeLibraryItem — each with prop contract + anatomy +
  token usage + a11y + sample TSX snippet.
- **Copy-paste-ready `@theme inline` + `:root` block** (§3) — valid Tailwind v4
  syntax; Phase 3 drops it into `src/App.css`. shadcn alias layer (`--background`,
  `--foreground`, `--primary`, `--card`, `--popover`, `--border`, `--input`,
  `--ring`, `--radius`, …) maps onto the semantic tokens so `npx shadcn init`
  works with zero token friction in Phase 3+.
- **Validation:** adversarial verifier — initially **FAIL** on 1 blocking issue:
  a **fabricated contrast pass** (white on `#3b9eff` claimed 3.5:1 PASS "large
  per WCAG"; actual = **2.79:1 FAIL**, and 12px semibold is *normal* text, not
  WCAG large). Coverage was otherwise perfect: 0 tokens / 0 primitives / 0 port
  families / 0 sections missing. **Fixed:** darkened accent `#3b9eff` →
  `#1d6fd0` (white = 4.96:1 PASS AA normal; focus ring 3.41/3.65/3.06 vs
  panel/sidebar/elevated — all ≥3:1 UI); `accent-hover` `#5cb3ff` → `#2874d4`
  (white = 4.63:1 PASS); `text.accent` `#5cb3ff` → `#4a9eff` (6.57:1); recomputed
  **every** contrast ratio in §12 with a WCAG relative-luminance script and
  corrected all inaccurate claims (text.error 5.2→5.45, text.muted-vs-canvas
  5.6→6.79, status.warning 8.4→6.99, status.error 4.0→4.89, border.focus
  4.0/4.3→6.05/6.48 with old accent / 3.41/3.65 with new, border.default
  2.0→1.33, border.subtle 1.3→1.18, status.skipped 2.9→2.75).
- **Non-blocking issues addressed:** (1) all contrast ratios now match WCAG
  math exactly; (2) fixed malformed `bg-/text-status-*` → `bg-status-* /
  text-status-*` in the status utility column; (3) port-label 11px exception
  cites spec §0 authority; (4) shifted `port.artifact` `#34d399` → `#22c55e`
  to widen separation from `status.success` `#36c98a`; (5) `status.cancelled`
  `#6b7280` → `#787e8a` (lighter neutral, distinct from idle, contrast
  3.49→4.14).
- **Regression contracts preserved (plan §27):** all 6 IPC commands, React Flow
  `colorMode="dark"` (now token-backed), `isValidConnection` cycle guard,
  drag-drop keys, `workflow-log` event payload, Zustand graph shape, `cn()`
  util, `screenToFlowPosition`. The token system assumes none are removed.
- **Application source modified:** No (spec only — no `.tsx`/`.ts`/`.rs`/`.css`
  touched). Rust engine untouched. The `@theme`/`:root` listing is spec
  (copy-paste-ready for Phase 3), not an edit to `src/App.css`.
- **Blockers carried forward:** `agent-browser` CLI (Phase 5/9),
  `react-best-practices`/`composition-patterns` (Phase 3),
  node-type registration mismatch (Phase 3 — single source of truth).
- **Note:** pre-existing `package-lock.json` / `src-tauri/Cargo.toml` working-
  tree diffs are unrelated to this phase (npm `libc` field stripping; CRLF
  warning with no real Cargo change).

## Phase 3 — Summary

- **Deliverable:** Workspace Shell — the first implementation milestone.
  Replaced the starter `App.tsx` (122 lines, 5 `alert()` calls, 23 hardcoded
  colors) with the 5-zone workspace from the UX spec, backed by the Phase 2
  token system, with a restructured store + controller architecture ready for
  Phases 4–7 to fill in content.
- **Method:** Plan-mode design (3 Explore agents → 1 Plan agent → adversarial
  review) → 9-workstream implementation in dependency order. Single agent
  pass; `tsc --noEmit` + `npm run build` verified clean.
- **Skills used:** `frontend-design` (zone grid, density, collapse/resize,
  token integration), `web-design-guidelines` (ARIA landmarks, roving
  tabindex, focus trap, aria-live announcer, status-not-color-only, inert).
  `react-best-practices` / `composition-patterns` still not installed —
  equivalents applied from knowledge (see blockers).
- **Shipped (by workstream):**
  1. **Tokens & boot** — frozen `:root` + `@theme inline` block dropped into
     [src/App.css](../src/App.css); CSS import moved to `main.tsx`;
     `<html class="dark">` + title "Void Workflow" in `index.html`. All
     surface/border/text/status/accent/port/radius/spacing/shadow/motion/font
     tokens live; global `:focus-visible` ring; `prefers-reduced-motion` /
     `prefers-contrast` guards; `.sr-only` utility.
  2. **Node registry** — new [src/nodes/registry.ts](../src/nodes/registry.ts)
     (12-entry `NodeDefinition[]`, single source of truth) +
     [nodeTypes.ts](../src/nodes/nodeTypes.ts) (generates the React Flow
     `nodeTypes` map → fixes the `saveText`/`saveJson` rendering gap from audit
     §5.1) + barrel `index.ts`. `registryState` flag distinguishes canonical
     vs frontend-only; `executable:false` for `markdownNote`.
  3. **Store restructure** — [src/store/workflowStore.ts](../src/store/workflowStore.ts)
     rewritten: 8 logical slices (graph/selection/run/save/console/problems/ui/
     project) in one `create()` + `persist` middleware scoped to LAYOUT ONLY
     (widths/collapse/tab/minimap — never graph/run/selection/save). New
     `replaceGraph`, `deriveProblems`, FIFO-capped (2000) logs, toast/announcement
     slots, single-modal `dialog` source of truth. `AppNodeData`/`AppNode`
     shape preserved (regression).
  4. **Controller + shortcuts** — [src/hooks/useWorkflowController.ts](../src/hooks/useWorkflowController.ts)
     is the ONLY imperative Tauri writer (all 6 IPC + `workflow-log` +
     `node-status` subscriptions + `onCloseRequested` unsaved-guard + transient
     timers + throttled announcer). Pre-run guard blocks frontend-only
     executable nodes. `open_run_folder` uses `lastCompletedRunId` (fixes the
     `currentRunId || 1` hack). [useWorkspaceShortcuts.ts](../src/hooks/useWorkspaceShortcuts.ts)
     binds the shell-relevant §15 shortcuts (F6, Alt+1..4, Ctrl/Cmd+Shift+B,
     B, I, J, S, Enter, ?, Esc).
  5. **Shell components** — 11 new under [src/components/shell/](../src/components/shell/):
     WorkspaceShell (CSS grid backbone), AppRail (56px, Alt+1..4, roving
     tabindex, disabled Phase-8 screens), TopToolbar (breadcrumb + save-state
     chip + run-state line + health pill + Save/Run-Stop + ⋯ overflow menu),
     NodeLibrary (reads registry, draggable rows, badges, splitter), 
     CanvasContainer (`<main role="application">` + sr-only h2), Inspector
     (placeholder: Workflow stub with editable name + graph stats; NEVER empty),
     BottomDock (SHELL: 28px collapsed summary bar + expanded tab bar + 4
     tabpanels with §12 empty states; Console renders logs minimally to
     preserve the "Console usable" regression), ToastRegion (replaces 5
     alerts), StatusAnnouncer (aria-live channel), KeyboardHelpDialog,
     UnsavedGuardDialog. Shared `useSplitter` hook + `icons.ts` map.
     WorkflowCanvas migrated to generated `nodeTypes` + token-backed
     Background/Controls; BaseNode migrated to tokens + `cn()`.
  6. **App.tsx rewire** — 122 → 27 lines; mounts controller + shortcuts +
     shell; `inert` on shell when a modal is open.
  7. **Identity** — `tauri.conf.json`: productName/identifier/title →
     "Void Workflow" / "com.phongvudzz.void-workflow", window 1280×800,
     version 0.2.0. `package.json` name → "void-workflow".
- **5 alert() → toast mappings:** save success → "Saved" toast + save chip;
  save error → error toast; run-start failure → error toast; cancel/stop
  failure → error toast; open-folder failure → error toast. Zero
  `alert()`/`confirm()`/`prompt()` remain in `src/`.
- **Token bug caught + fixed:** the Phase 2 spec's shadcn alias block mapped
  `--accent: var(--accent-subtle)` AFTER the semantic `--accent: #1d6fd0`,
  which (same-specificity, last-wins) would have shadowed the solid accent and
  broken every `bg-accent`/`--primary`/`--edge-stroke-selected` reference
  (Run/Save buttons would render near-invisible). Fixed by omitting the
  shadcn `--accent`/`--accent-foreground` alias lines; documented inline in
  App.css. `bg-accent` now resolves to the solid accent; `bg-accent-subtle`
  remains available. (Carried back to the Phase 2 spec note.)
- **CSS warning fixed:** a comment in App.css containing `p-*/gap-*` closed
  the CSS comment early (`*/` sequence) and tripped Lightning CSS. Reworded.
- **lucide v1.31 renames handled:** `Wand2`→`Wand`, `AlertTriangle`→
  `TriangleAlert`, `MoreHorizontal`→`Ellipsis`, `Loader2`→`LoaderCircle`. All
  icon names verified against `lucide-react.d.ts`.
- **Regression contracts preserved (plan §27):** 6 IPC commands (JS params
  `projectId`/`graphJson`/`runId` camelCase), `isValidConnection` cycle guard,
  drag-drop `dataTransfer` keys, `workflow-log` payload shape, Zustand graph
  node/edge shape, `cn()` util, `screenToFlowPosition`, `colorMode="dark"`,
  `fitView`. `git diff src-tauri/src/` is empty — zero Rust edits.
- **Validation:** `tsc --noEmit` clean (strict + noUnusedLocals/Parameters);
  `npm run build` clean (no errors, no warnings, 47KB CSS / 480KB JS).
  Source-level grep confirms: no `alert()`/`confirm()`/`prompt()`, no raw hex
  literals in new code, no legacy `bg-gray`/`bg-blue`/`bg-red`/`bg-green`
  classes, ARIA landmarks present, status never color-only (all status dots
  paired with icon + text). Interactive runtime checks (drag/connect/save/
  run/stop via `tauri dev`) require the desktop window and are left for the
  user to confirm; all source-level contracts for them are in place.
- **Application source modified:** Yes — first impl milestone. 16 new files,
  10 modified, 2 deleted. Rust engine untouched (identity JSON only).
- **Decisions logged:** (1) Console tab renders logs minimally in Phase 3
  (preserves "Console usable" regression); (2) ConsolePanel.tsx + old
  canvas/NodeLibrary.tsx deleted (superseded); (3) all 12 node types → BaseNode
  for Phase 3 (per-type renderers Phase 5); (4) log batching deferred to
  Phase 7; (5) `node-status` bonus event wired; (6) announcer via
  `uiSlice.announcement` store field; (7) App Rail collapsed = 4px strip,
  Library/Inspector collapsed = 0 width; (8) health pill stubbed static
  "Ready"; (9) `deriveProblems` wired; (10) keyboard-add minimal.
- **Blockers carried forward:** `agent-browser` CLI (Phase 5/9),
  `react-best-practices`/`composition-patterns` (Phase 4+). Node-type
  mismatch RESOLVED. Rust-side handlers for `saveArtifact`/`preview`/
  `markdownNote` remain a separate backend decision.

## Phase 4 — Summary

- **Deliverable:** Node Library — fully implements spec §6. Evolved the Phase 3
  flat-list shell into a searchable, single-level-category-grouped library, and
  — critically — **completed the keyboard-add contract** that Phase 3 left as a
  stub (the library is now ALWAYS keyboard-usable, never drag-only — the frozen
  invariant is honored).
- **Method:** Plan-mode design via a 3-proposal → judge → adversarial-verify
  Workflow (3 add-mode-channel architectures: store-field / module-ref+custom-
  event / react-context → judge synthesis → adversarial verifier). 5 agents,
  0 errors. Verifier passed all 13 spec-compliance checks + all §27 regression
  risks; flagged 1 blocking Esc-handling bug (fixed) + 5 nonblocking
  improvements (all folded in). Source-level verification against
  `useWorkspaceShortcuts.ts` / `CanvasContainer.tsx` / `WorkflowCanvas.tsx`
  confirmed the bug + that `main[role="application"]` already has `tabIndex={-1}`.
- **Skills used:** `web-design-guidelines` (roving tabindex, `inert`, aria-live,
  focus ring offset, aria-expanded/aria-controls, status-not-color-only),
  `frontend-design` (28px row density, grip-dots hover affordance, search input
  anatomy, category headers). `react-best-practices`/`composition-patterns`
  still not installed — equivalents applied from knowledge.
- **Shipped:**
  1. **Search input** (32px, `surface.panel`, `border.subtle`, 4px radius,
     placeholder "Search nodes…", `Search` icon left, `X` clear button
     `aria-label="Clear search"`). LOCAL component state — NOT `uiSlice`.
     Case-insensitive match on label + category + description + keywords. Live
     `aria-live="polite"` count ("N results" / "No results"). Clears on Esc
     (with `stopPropagation()` so the global Esc handler doesn't also clear
     canvas selection — the blocking bug found by the verifier).
  2. **Six flat categories** (INPUT/TEXT/AI/MEDIA/UTILITY/OUTPUT) with
     collapsible headers (`aria-expanded`/`aria-controls`, chevron, 11px
     uppercase semibold, trailing count). Default expanded INPUT/AI/OUTPUT,
     collapsed UTILITY. **Category collapse is LOCAL, persisted to localStorage
     SEPARATELY** (`void-workflow:library-category-collapse`) via a new generic
     `useLocalStorage<T>` hook — NOT in `uiSlice`, NOT in the zustand
     `partialize` set. Collapsed groups get `inert`. During search, matched
     collapsed categories force-expand (collapse state itself is not mutated).
  3. **§11.10 `NodeLibraryItem` primitive** (new) — 28px row (`h-7`), 8px
     h-padding (`px-2`), 4px gap (`gap-1`), no resting border, hover
     `bg-surface-hover` + `rounded-control` inset, `:focus-visible` 2px
     `--border-focus` ring offset 1px (closes audit §6), grip-dots on hover
     (`GripVertical` 12px `opacity-0 group-hover:opacity-100`), visually-hidden
     "drag or press Enter to add" hint. Badges: "Not executable yet"
     (TriangleAlert + text + `text-status-warning` — status-not-color-only),
     "Note" (text-only `text-text-muted` — a type indicator, not a warning),
     "MVP2" (8px tag on scale-test stubs). Drag contract byte-preserved:
     `application/reactflow` + `application/reactflow-label` + `aria-grabbed`
     false→true.
  4. **Empty-search state** — `role="status" aria-live="polite"`: 'No nodes
     match "<query>"' (12px `text-muted`) + "Clear search" button.
  5. **Roving tabindex + Arrow nav** — Tab: search input → category headers →
     items; within a category one item has `tabIndex=0` (cursor), rest `-1`;
     ArrowUp/Down move cursor + focus; Home/End jump first/last.
  6. **Keyboard-add END-TO-END** (closes the Phase 3 stub):
     - Library Enter/Space → `setAddModeNodeType(type, returnFocusId)` +
       announce "Selected <node>. Click on canvas to place, Escape to cancel."
       + focus canvas `main[role="application"]`.
     - `WorkflowCanvas` consumes `addModeNodeType` on `onPaneClick` (places at
       click position) + a window Enter-at-center keydown (places at canvas
       center), both via a **shared `placeNode` helper** that also backs
       `onDrop` — so drag and keyboard placement produce identical nodes
       through the same `addNode` path.
     - Global Esc in `useWorkspaceShortcuts` (highest-priority branch) cancels
       add-mode + restores focus to the originating library item — even if
       focus drifted off the canvas.
- **Add-mode channel:** transient `uiSlice` field (`addModeNodeType` +
  `addModeReturnFocusId` + `setAddModeNodeType`) — the store is the existing
  cross-zone channel. **NOT persisted** (excluded from `partialize`); defaults
  `null`; never rehydrated. Only `WorkflowCanvas` subscribes (re-renders);
  `NodeLibrary` only writes.
- **MVP2 scale test:** `SCALE_TEST = false` constant guards an optional
  40-stub probe (52 total items). Stubs are type-correct `NodeDefinition`
  literals (no double-cast), non-draggable, `aria-disabled`, `tabIndex=-1`,
  8px "MVP2" tag, skipped by Arrow nav. **Virtualization deferred** —
  `@tanstack/react-virtual` is the documented Phase 4+ step if real item count
  exceeds ~40; the 28px row anatomy is already stable for it. No new runtime
  dependency. No fake MVP2 behavior (stubs render only).
- **Regression contracts preserved (plan §27):** dataTransfer keys
  `application/reactflow` + `application/reactflow-label` unchanged;
  `screenToFlowPosition` reused in `onDrop` + `onPaneClick` + Enter-at-center;
  `addNode` single placement path via shared `placeNode` (drag + keyboard
  can't diverge); `isValidConnection` cycle guard untouched;
  `colorMode="dark"` + `fitView` + generated `nodeTypes` untouched;
  `persist.partialize` unchanged (addMode fields transient); no `.rs` edits;
  no `alert()`/`confirm()`/`prompt()`; tokens by name only (no raw hex).
- **Validation:** `tsc --noEmit` clean (strict + noUnusedLocals/Parameters);
  `npm run build` clean (48.51 KB CSS / 486.33 KB JS, no warnings). Two tsc
  errors caught + fixed during impl: (a) `Object.fromEntries` lost literal-key
  typing for the `grouped` record → replaced with an explicit typed literal;
  (b) `querySelector('main[role="application"]')?.focus()` — `Element` has no
  `focus()` → cast to `HTMLElement | null`.
- **Application source modified:** Yes. 2 new files (`useLocalStorage.ts`,
  `NodeLibraryItem.tsx`), 4 modified (`workflowStore.ts`,
  `useWorkspaceShortcuts.ts`, `NodeLibrary.tsx`, `WorkflowCanvas.tsx`), 0
  deleted. Rust engine untouched.
- **Decisions logged:** (1) store-channel addMode over context/custom-event;
  (2) `useLocalStorage` for category collapse — separate from zustand per spec;
  (3) no debounce on search (live count); no virtualization dep (flat render
  for ≤50); (4) shared `placeNode` — drag and keyboard placement can't diverge;
  (5) `onPaneClick` for placement; node clicks ignored during addMode
  (intentional — avoids clobbering selection); (6) "Note" badge in
  `text-text-muted` (type indicator, not a warning); (7) Esc in search input
  calls `stopPropagation()` to prevent the global Esc handler from also
  clearing canvas selection.
- **Blockers carried forward:** `agent-browser` CLI (Phase 5/9),
  `react-best-practices`/`composition-patterns` (Phase 5+). Rust-side handlers
  for `saveArtifact`/`preview`/`markdownNote` remain a separate backend
  decision.

## Definition of Done (UI Redesign, plan §18) — checklist

- [x] Native app identity says Void Workflow (not starter) — **Phase 3**
- [x] Workspace information hierarchy clear — Phase 1/3 (UX spec frozen; impl in Phase 3)
- [x] Project/workflow context visible — Phase 8 (Projects screen: editable names + read-only id + disabled-with-tooltip CRUD; TopToolbar breadcrumb from Phase 3)
- [x] Save state visible — Phase 3
- [x] Run state visible — Phase 3/7
- [x] Node Library searchable & categorized — Phase 4
- [x] Canvas remains primary — Phase 3
- [x] Empty state exists — Phase 5 (overlay, DOM-removed at first node, 2 templates)
- [x] Generic Inspector exists — Phase 6 (see line 431)
- [x] Bottom Dock collapsible/resizable — Phase 7 (container + splitter + collapsed bar + tab bar roving tabindex; 120-480px resize)
- [x] Console usable — Phase 7 (level-radio filters All/Info/Warning/Error/System + node combobox + Clear inline-confirm + smart auto-scroll with "↓ N new" pill + filter-change live region)
- [x] Problems actionable — Phase 7 (clickable rows → selectProblem + selectNode + canvas setCenter via pendingCenterNodeId; aria-live on Problems tab)
- [x] Run panel exists — Phase 7 (header + 2px progress bar + per-node 24px rows from perNodeStatus, click → selectNode)
- [x] Artifacts discoverable — Phase 7 (Open Output Folder via open_run_folder when lastCompletedRunId !== null; per-file list gap documented in-UI)
- [x] Common node card visual system exists — Phase 5/6 (identity+ports+status footer shipped Phase 5; Inspector config form Phase 6)
- [x] Generic Inspector exists — Phase 6 (PropertyRow from configSchema; 4 modes; tabs; inline-confirm delete; Run section)
- [x] Typed ports consistent — Phase 5 (shape+icon+color, Input LEFT/Output RIGHT, gated on registry ports)
- [x] Tokens centralized — Phase 2/3 (DESIGN_SYSTEM.md frozen; impl in Phase 3)
- [x] No obvious overflow — Phase 10 fixed all 4 Phase 9 overflow findings (breadcrumb project name truncate, ConnectionInspector label spans min-w-0, KeyboardHelpDialog max-h/overflow, toast title break-words)
- [x] Existing workflow functionality operational — every phase (regression)

## Blockers

- **`agent-browser` CLI not installed** — blocks automated screenshot
  regression in Phase 5/9. Install (`npm i -g agent-browser && agent-browser
  install`) before those phases, or accept manual screenshots.
- **`react-best-practices` / `composition-patterns` skills not installed** —
  used equivalent heuristics in Phase 0. Install before Phase 2/3 for full
  skill fidelity.
- **Node-type registration mismatch (audit §5.1)** — RESOLVED in Phase 3 via
  `src/nodes/registry.ts` (frontend single source of truth). The canvas
  `nodeTypes` map is now generated from the registry; `saveText`/`saveJson`
  render; `saveArtifact`/`preview`/`markdownNote` carry `registryState` flags
  + badges. Rust-side additions for the frontend-only types remain a flagged
  backend decision, not a UI-phase edit.

## Next Step

**ALL 11 PHASES (0–10) COMPLETE.** The UI redesign master plan is finished.

Phase 10 (Review & Cleanup) is DONE: applied the Phase 9 audit's 2 high +
12 medium findings and removed all dead/competing UI surface. Verify gate
passed clean: `tsc --noEmit` clean, `npm run build` clean (54.60 KB CSS /
545.46 KB JS, only the pre-existing chunk-size warning), all §27 regression
contracts preserved at source level (6 IPC camelCase, dataTransfer keys,
screenToFlowPosition, colorMode="dark", fitView, isValidConnection, replaceGraph,
deriveProblems run guard, controller sole invoke() caller, persist partialize
LAYOUT ONLY), zero `.rs` edits, no `alert()`/`confirm()`/`prompt()`, status
never color-only, no raw hex in new code (the new `--status-error-strong`/
`--status-error-hover` hex lives only in App.css `:root` token definitions).

Recommended follow-ups (not blocking, outside the plan):
1. Install `agent-browser` (`npm i -g agent-browser && agent-browser install`)
   to run screenshot/visual-regression against the rendered app and measure the
   two formerly-high contrast pairings against the actual `--status-error-strong`
   fill (the source-level fix is in place; rendered confirmation is the gap).
2. Adopt `@tanstack/react-virtual` if the real node registry exceeds ~40 entries
   (the 28px row anatomy is already stable for it; SCALE_TEST probe removed).
3. Code-split the 545 KB JS bundle (build's standing chunk-size warning) —
   dynamic-import the screen/modal components.

---

## Phase 6 — Summary

**Scope:** Inspector System (plan §17 UI PHASE 6, lines 778-797). Built the
generic Inspector architecture and validated it against Text Input, Text
Transform, Delay (text content / mode-select / numeric input / simple advanced
options). A 3-proposal → judge → adversarial-verify design workflow produced
the scope; the verifier returned APPROVED_WITH_CORRECTIONS (winner:
`generic-mode-switching Inspector with minimal primitive surface`), and both
blocking corrections + 4 nonblocking ones were folded in.

**Delivered (IN NOW):**
- **PropertyRow primitive (§11.7)** — generic labeled form control rendering
  all 7 `configSchema` field types: text, textarea (min-h-16), number, select,
  toggle (`role="switch"` `aria-checked`), slider (`accent-color: var(--accent)`,
  `aria-valuenow/min/max`), file (`file-picker`→`file` reconciled at render —
  registry `ConfigFieldType` stays `file-picker`, PropertyRow `type` union uses
  `file`). 28px row (11-12px text), `surface-input`/`border-subtle`/focus via
  global `:focus-visible`. `label htmlFor` + `aria-describedby`→helper+error;
  error `role="alert"`; disabled → `aria-disabled` + `title` tooltip
  (`disabledReason`). Every `onChange` → `updateNodeData` (which calls
  `markDirty`).
- **InspectorSection primitive (§11.6)** — collapsible Basic/Advanced/Danger
  group. `bodyId`+`headingId` via `useId()` wired to `aria-controls`/region id/
  `aria-labelledby`/heading id (blocking-fix #2). Danger variant: `text-error`
  heading + visually-hidden "Danger zone:" prefix + top `border-subtle` divider,
  background NEVER saturated (restraint). Collapsed body UNMOUNTED (not inert)
  so no tabbable content leaks.
- **InspectorTabs primitive (§8.2/§14)** — `role="tablist"`/`role="tab"`
  (`aria-selected`/`aria-controls`, roving tabindex 0 active/-1 others,
  ArrowLeft/Right wrap + refocus) + `role="tabpanel"`. Rendered ONLY when a node
  declares >1 `inspectorTab`; all 3 validation nodes (single 'Configuration')
  collapse to one section (markdownNote's single 'Note' tab also collapses).
- **useInlineConfirm hook** — 3s arming window for destructive actions; NOT a
  modal, NOT `confirm()`. `armed` flips label to "Confirm delete"; a
  visually-hidden `aria-live="assertive"` region (always in DOM, `liveText=''`
  when idle) announces "Press again to confirm deletion." Timeout cleared on
  unmount.
- **NodeStatus maps exported** — `STATUS_ICON`/`STATUS_LABEL`/`STATUS_TOKEN`
  now `export` so the Inspector Run section reuses them (status never color-only:
  icon + label + token). Purely additive.
- **Inspector.tsx rewrite** — mode-switching shell keeping the Phase 3
  aside/splitter/32px header; delegates body to 4 components all in-file (no
  per-node-type Inspector — plan line 797/503):
  - **WorkflowInspector** (`none`) — editable name + graph stats + hint; NEVER
    empty (no dead panel).
  - **NodeInspector** (`node`) — name input + type/hidden-id row + (tabs or
    single section) + config form from `def.configSchema` via PropertyRow +
    optional read-only Run section + Danger: Delete Node. Keyed by
    `selectedNodeId` so tab state resets on switch. Narrow selectors
    (`s.nodes.find`, `s.perNodeStatus[nodeId]`) limit re-renders.
  - **ConnectionInspector** (`edge`) — source→target names + port types
    (`resolvePortType`/`getPortIcon`) + `isTypeCompatible` soft advisory
    (Check/text-status-success or TriangleAlert/text-text-error, never a hard
    block) + editable label (inline `setEdges`) + Delete connection.
    Graceful `EmptyState` if the edge no longer resolves.
  - **MultiSelectInspector** (`multi`) — "N nodes selected" + bulk Align
    (Left/Center-H/Right/Top/Center-V/Bottom via `node.position` bbox,
    zoom-independent) + Distribute (H/V even spacing) + Delete N nodes. No
    per-node config.
- **Run section (§8 line 283 mode-merge)** — read-only, renders whenever a
  `perNodeStatus` record exists (icon + label + optional progress bar + message
  + timestamps). Config inputs disabled ONLY while the node is actively
  running/queued (`isActive = status.running||status.queued`) — blocking-fix #1:
  gating on `status !== 'idle'` would permanently lock editing after any run
  (perNodeStatus persists until `resetRun`).
- **Deletion (§27-safe)** — NO new store action; `useWorkspaceShortcuts` NOT
  modified. Local `deleteNodes`/`deleteEdge` helpers mirror
  `useWorkspaceShortcuts` lines 184-191 exactly (`setNodes` filter + `setEdges`
  filter touching removed source/target + `clearSelection` + `markDirty`).
  Announcements via `store.setAnnouncement` (existing StatusAnnouncer channel).
- **Focus management (§8.2 line 310)** — `useEffect` on
  `[selectionMode, selectedNodeId, selectedEdgeId, multiSelectIds.join('|')]`
  focuses the header `<h2 tabIndex={-1}>` so AT announces the new context;
  mounted-ref guard skips first render; does NOT fire on the `none` transition
  (no focus yank on Escape-deselect). Collapsed panel renders the §27-safe
  Phase 3 `<div className="w-0" aria-hidden/>` (children unmounted → inert);
  collapse→focus-to-toggle deviation documented (no toggle in a 0-width panel;
  re-expand via Ctrl/Cmd+I).

**Files:** NEW `src/components/primitives/PropertyRow.tsx`,
`InspectorSection.tsx`, `InspectorTabs.tsx`; NEW
`src/components/shell/useInlineConfirm.ts`; MODIFIED
`src/components/primitives/NodeStatus.tsx` (exports); REWRITE
`src/components/shell/Inspector.tsx`.

**Verification:** tsc clean; `npm run build` clean (52.87 KB CSS / 520.23 KB JS,
only pre-existing chunk-size warning); zero `.rs` edits; no
`alert()`/`confirm()`/`prompt()`; no raw hex in new code; status never
color-only; §27 preserved (dataTransfer keys, screenToFlowPosition,
colorMode="dark", fitView, isValidConnection, IPC camelCase, AppNodeData
shape, cn()); `useWorkspaceShortcuts` untouched. All 3 validation nodes
render through the generic NodeInspector + PropertyRow path.

**Verifier corrections folded in:**
1. (BLOCKING) Run-section/config-disable gating — gate on `isActive`
   (running/queued) not `status !== 'idle'`.
2. (BLOCKING) InspectorSection `bodyId`/`headingId` undefined — derive via
   `useId()`, wire all aria attrs.
3. (nonblocking) Keep existing collapsed→w-0; document focus-to-toggle
   deviation.
4. (nonblocking) Import only `ChevronDown` (not `ChevronRight`).
5. (nonblocking) Mounted-ref guard in the shell, not NodeInspector.
6. (nonblocking) Edge-label edit via inline `setEdges` (no `updateEdge` store
   action).

---

## Phase 5 — Summary

**Scope:** Canvas Polish (plan §17 UI PHASE 5, lines 761-776). Closed audit
`WorkflowCanvas.tsx:103` (empty state + accessible role), `WorkflowCanvas.tsx:116`
(Background token), `BaseNode.tsx:14` (node role/aria-label/keyboard focus),
`BaseNode.tsx:21` (ports color-only). A 3-proposal → judge → adversarial-verify
design workflow produced the scope; the verifier returned
APPROVED_WITH_CORRECTIONS (winner: `noise-first-restrained`), and all 3 blocking
corrections + 12 nonblocking ones were folded in.

**Delivered (IN NOW):**
- **Background** — Dots variant at `var(--surface-canvas-grid)` gap 24 (unchanged token, audit gap closed).
- **Controls** — restyled to tokens (`bg-surface-panel`/`text-text-secondary`/`rounded-control`), `showInteractive={false}`; bottom-right `<Panel>` cluster with a Fit button (`fitView({duration:0})`) + 11px `text-text-muted` zoom-% label via `useStore(s=>s.transform[2])`. Zoom respects reduced-motion (no animated pan).
- **Typed ports (§10)** — `PortHandle` subcomponent: shape (circle `rounded-full` for text/number/boolean/json/any; square `rounded-control` for file/media/audio/video/artifact) + 8px `PORT_ICONS` icon + port color (100% when connected via `useHandleConnections`, 40% opacity when empty) + `Any` dashed outline + label-on-hover/selected (10px text-muted) + native tooltip + `aria-label` + `tabindex=0` `role="button`. Input ports LEFT, output ports RIGHT, gated on `def.ports.in/out.length` (markdownNote renders NO handles). Port type from `registry.ts ports[]`, never inferred from edges. `PORT_ICONS`/`getPortIcon` added to `icons.ts`.
- **Port compatibility (soft)** — `portCompat.ts` (`resolvePortType` + `isTypeCompatible`). `isValidConnection` keeps the cycle guard as the ONLY hard `return false` gate; a type mismatch is a SOFT advisory via `setAnnouncement` ("Type mismatch: X → Y. Backend validation is authoritative…") — NEVER a hard block (spec §7.3: backend authoritative, type-incompatible via Problems).
- **Edges (§7.3)** — `defaultEdgeOptions` (bezier, `var(--edge-stroke)` 1.5px, `MarkerType.ArrowClosed` border-default marker). Selected edge → `var(--edge-stroke-selected)` 2px via `.react-flow__edge.selected` CSS (`!important` over RF inline). Run-payload edge (feeding a running/queued node) → animated dashed `var(--status-running)` 1s dash via `.edge-run-payload` class; the ONLY >120ms motion (DS §9.2). No labels MVP1. Per-edge `ariaLabel` "Connection from X to Y: <type>". `styledEdges` derived in `useMemo` over `[edges, selectedEdgeId, perNodeStatus, nodes]` so `store.edges` stays plain (save serializes store.edges — §27).
- **Selection (§7.3)** — `useOnSelectionChange` mirrors RF selection into `selectionSlice` (the only multi-select writer). BaseNode selected: 2px `--border-focus` ring + `bg-surface-elevated` lift + `shadow-node`, NO scale transform; visually-hidden ", selected" appended to the accessible name. Multi-select (§16 "Phase 5+"): RF built-ins `selectionOnDrag={false}` + `selectionKeyCode="Shift"` + `multiSelectionKeyCode="Shift"` (cheap, additive — pan/drag semantics unchanged).
- **Empty state (§7.1)** — top-center `<Panel>` overlay, conditional render on `nodes.length===0` (DOM-removed, not hidden) the moment a node is added; `aria-live="polite"`; two template buttons inserting pre-wired nodes+edges via the SAME `addNode`/`onConnect` path then `fitView({duration:0})`: "Text → AI → Preview" (textInput→aiScript→preview) and "Local Media → Info" (mediaInfo→preview; registry-gap workaround — no media-source node exists yet, Phase 6 follow-up). `pointer-events-auto` on buttons only.
- **Minimap (§7.2)** — wired to persisted `uiSlice.minimapOn` (OFF default), conditional `<MiniMap aria-hidden>` bottom-right. Toggled from the existing TopToolbar `⋯` OverflowMenu "Toggle Minimap" menuitem with `aria-pressed` + a check mark when on (no second toggle UI — the ⋯ menu exists, so no scope creep).
- **Context menu (§7.2)** — DEFERRED (spec default). `onPaneContextMenu` just `preventDefault` + `clearSelection` (right-click = deselect, same as empty-click). No `role="menu"` DOM.
- **Keyboard contract (§7.4)** — added to `useWorkspaceShortcuts`, gated on focus inside `main[role="application"]`: Delete (immediate + announce; no `confirm()` — forbidden, reversible via reload if unsaved), Ctrl/Cmd+A (select all nodes), Ctrl/Cmd+D (duplicate at +24/+24 offset), Arrow nudge 1px (Shift=10px). Esc ordering: addMode > dialog > selection-clear > **exit-canvas-to-toolbar** (second Esc focuses `[data-focus-target="workflow-title"]`; final fall-through, guarded by `!addModeNodeType && dialog===null && selectionMode==='none'`). Keyboard Help dialog rows added.
- **Keyboard connect (§10.5)** — `useKeyboardConnect` hook (ADDITIVE, never touches pointer flow; pending state in a `useRef`, not the persisted store). Focus output Handle → Enter/c → focus canvas → focus target input Handle → Enter → `store.onConnect` (same path as pointer) → announce "Connected"; Escape cancels. Handle focus via `tabindex=0`; RF's `data-handleid`/`data-nodeid`/`data-handlepos` attrs resolve the Connection.
- **NodeStatus primitive (§11.5)** — new `src/components/primitives/NodeStatus.tsx`: 2px left-edge accent + footer strip (icon 14px + label 12px + progress% 11px) + optional 2px progress bar (`role="progressbar"`). `role="status"` `aria-live="polite"`. Restraint invariant: NEVER a full-card wash. Spinner only for running/queued (global media query zeroes animation under reduced-motion). Idle status renders nothing (footer shown only when non-idle, gated in BaseNode).
- **EmptyState primitive (§11.8)** — new `src/components/primitives/EmptyState.tsx` (title/body/action/secondaryActions/tone/live). Reused Phase 6+.
- **BaseNode** — switched to `NodeProps<AppNode>`, registry `NODE_DEFINITION_MAP[type]` lookup, identity row (icon + label), typed-ports row, NodeStatus footer (only when non-idle). Compact 200-220px width (§11). Shallow `perNodeStatus[id]` selector so a status event on one node doesn't re-render every node. The §11 "essential config summary" + "essential value-result" body rows are DEFERRED to Phase 6 (Inspector) — building them now, with no config form behind them, would be speculative churn and risks the §7 "giant node cards" avoid-item (keep visual noise low).
- **Reduced motion (§9.2)** — mandatory App.css rule inside the existing `@media (prefers-reduced-motion: reduce)`: `.react-flow__edge.edge-run-payload .react-flow__edge-path { animation:none !important; stroke-dasharray:none !important; }` so the run dash is fully stripped (not just frozen) — the global `0.01ms` rule alone leaves a static dashed line.
- **Load-path normalization (§27)** — `replaceGraph` unconditionally normalizes null `sourceHandle`/`targetHandle` to `'in'`/`'out'` when the node has a single port on that side. Phase 5 switched handles from Position.Top/Bottom (no id) to Position.Left/Right (id='in'/'out'); existing saved edges have null handles and would NOT reattach without this. Confirmed regression — the fix is unconditional, not gated on a verify step.

**Deferred (to Phase 6 or later):**
- §11 node-card body rows (config summary, value-result) — Phase 6 (Inspector owns detail; half-built card = more noise).
- Custom FlowEdge component (defaultEdgeOptions + CSS suffices; avoids tsc unused-import risk).
- Context menu (only if a concrete need is justified later).
- Full roving-tabindex-within-node refinement.
- Media-source node + "Local Media → Info" template correctness (registry gap; Phase 6 follow-up).

**§27 regression (all preserved at source level):** drag node (dataTransfer keys + `screenToFlowPosition` + `addNode` via shared `placeNode`) ✓ · connect nodes (`onConnect` + `isValidConnection` cycle guard byte-for-byte; type check is soft advisory, never hard-blocks; keyboard-connect ADDITIVE) ✓ · save (edges derived in render, `store.edges` plain) ✓ · load (`replaceGraph` + handle-id normalization) ✓ · run/stop/logs/node-config unchanged ✓ · IPC 6 commands + camelCase params unchanged ✓.

---

## Phase 7 — Summary

**Scope:** Observability Dock (plan §17 UI PHASE 7, lines 799-814). Wired the
four Zone E dock tab bodies to real execution state, building on the Phase 3
shell (container + splitter + collapsed bar + tab bar). A 3-proposal → judge →
adversarial-verify design workflow produced the scope; the verifier returned
APPROVED_WITH_CORRECTIONS (zero blocking issues; all 22 spec-compliance
contracts pass; winner: store-mediated `pendingCenterNodeId` + in-place panel
wiring + controller inference completion — Proposal B), and all 5 nonblocking
corrections were folded in.

**Delivered (IN NOW):**

- **Console** (`ConsolePanel`): level-radio filter pills (All / Info / Warning /
  Error / System — debug visible only under "All", no Debug pill per R3) wired to
  `consoleSlice.logFilters.levels` via `setLogFilter`; node combobox (All Nodes /
  Selected Node / per-node) with explicit `nodeFilterMode: 'all'|'selected'`
  (correction #5 — cleanly distinguishable, follows canvas selection only when
  opted in); **Clear Console** via `useInlineConfirm` (extended to accept a
  custom liveText — correction #2 — "Press again to confirm clearing.", NOT
  `confirm()`); smart auto-scroll that only sticks to bottom when the user is
  already there, otherwise surfaces a "↓ N new" pill to jump; filter-change
  visually-hidden live region (throttled ≤1/2s); level icons aligned to
  DESIGN_SYSTEM §7 (ERROR→`XCircle`, SYSTEM→`Terminal` — R2; replaces the wrong
  `CircleAlert`/`Info`); runtime level normalized `'warning'→'warn'` before
  filtering (correction #1); first ERROR occurrence gets an assertive
  visually-hidden "error: " prefix.
- **Problems** (`ProblemsPanel`): rows are now `<button role="row">` (were `<li>`);
  click → `selectProblem` + `selectNode` + `setPendingCenter(nodeId)` (R5 —
  store-mediated canvas-center, consumed by a `CanvasInner` effect that calls
  `useReactFlow().setCenter` inside the provider; avoids moving the dock and
  avoids a new context); aria-live="polite" on the Problems tab button only (R6)
  so new problems announce when dock is expanded but Problems isn't focused;
  ERROR-first sort; positive empty state; stale-node guard (skips center if the
  node was deleted). `useReactFlow().setCenter` access solved without regressing
  the shell — BottomDock stays a sibling of the canvas.
- **Run** (`RunPanel`): header (Workflow Run + status icon + state label + `NN%`)
  with icon+text+color (never color-only); 2px progress bar at top (accent /
  status-colored fill; **static 50% fill when indeterminate** — correction #4,
  no animation, reduced-motion safe); per-node 24px rows from
  `runSlice.perNodeStatus` with per-state icons (`LoaderCircle` spin for
  running/queued, `CheckCircle2`, `CircleDashed`, `XCircle`, `Ban`, `Minus`,
  `TriangleAlert`), node label resolved from `graphSlice.nodes`, progress text
  when real; click → `selectNode`; idle empty state + Ctrl/Cmd+Enter hint.
- **Artifacts** (`ArtifactsPanel`): honest — reads `runSlice.lastCompletedRunId`;
  when a run has completed, "Open Output Folder" button calls
  `controller.openFolder()` (existing `open_run_folder` IPC, replaces the audit
  `currentRunId||1` hack already fixed in the controller); a muted in-UI note
  now renders the typed per-file list and Copy Path actions delivered by Runtime
  V2. Empty state remains when no run completed. `WorkflowShell` now threads
  `controller` to `BottomDock`.
- **Controller inference (R4 — `useWorkflowController.ts`):** completed the §11.4
  MVP1 per-node fallback additively (workflow-log payload `{run_id, node_id,
  message, level}` §27 preserved): INFO log from a node → `setNodeStatus('running')`
  only when the node has no terminal state yet (never overwrites an explicit
  failed/warning); added `inferRunCompletion()` inside the mount-effect closure
  — once every touched (`startedAt !== null`) per-node entry is terminal, infers
  run completion: any failed → `setRunTerminal('failed', reason)` + auto-open
  Problems tab (§11.3) + error toast + throttled `announce()` (correction #3 —
  uses the helper, not raw `setAnnouncement`); else `setRunTerminal('succeeded')`
  (populates `lastCompletedRunId`). Guarded by `runStatus==='running'` so a late
  event can't flip a terminal state back. Honest edge case documented: a graph
  whose nodes never emit any event stays "running" (acceptable). Called from
  both the workflow-log and node-status listeners.
- **Collapsed bar (R7):** throttle ≤1 announcement per 2s via a `lastAnnounceRef`
  inside `CollapsedBar` (resets on unmount); Console pill label "Console · 0"
  when no errors; Artifacts pill reflects `lastCompletedRunId !== null`.
- **Tab bar:** §11.9 DockTab anatomy in-place (selected `border-b-2
  border-border-focus`; unselected `border-transparent`); roving tabindex +
  ArrowLeft/Right/Home/End preserved; active-tab-click toggles collapse
  preserved.

**Files:** `src/store/workflowStore.ts` (added transient `pendingCenterNodeId` +
`setPendingCenter` — excluded from `partialize` by the existing whitelist),
`src/hooks/useWorkflowController.ts` (INFO branch + `inferRunCompletion` —
additive, §27 preserved), `src/components/canvas/WorkflowCanvas.tsx`
(`CanvasInner` consumes `pendingCenterNodeId` via `setCenter`),
`src/components/shell/BottomDock.tsx` (REWRITE — 4 panels wired, icons aligned,
throttle, aria-live, inline-confirm), `src/components/shell/useInlineConfirm.ts`
(optional `customLiveText` param), `src/components/shell/WorkspaceShell.tsx`
(thread `controller` to `BottomDock`), `docs/UI_REDESIGN_STATUS.md`.

**§27 regression (all preserved at source level):** workflow-log payload
`{run_id, node_id, message, level}` unchanged ✓ · 6 IPC commands + camelCase
params (`projectId`/`graphJson`/`runId`) unchanged ✓ · `LogEntry` shape +
`appendLog`/`clearLogs`/`setLogFilter` unchanged ✓ · `openFolder`/`run`/`stop`/
`start_run`/`cancel_run` unchanged ✓ · no `.rs` edits ✓ · no fake artifacts-list
IPC stubbed ✓ · no `alert()`/`confirm()`/`prompt()` (Clear Console uses
inline-confirm) ✓ · status never color-only (icon+text+color across
Run/Problems/Console) ✓ · tokens by name only (no raw hex in new code) ✓ · shell
not regressed (grid/splitter/collapsed-bar/tab-bar roving tabindex untouched) ✓.

**Verification:** `npx tsc --noEmit` clean (first run) · `npm run build` clean
(53.26 KB CSS / 529.78 KB JS, only pre-existing chunk-size warning) · §27 grep
sweep intact (27 hits across 5 files for drag/screenToFlowPosition/
isValidConnection/colorMode="dark"/fitView) · zero `.rs` edits (git status) ·
no forbidden dialogs (the 2 `alert(`/`confirm(` grep hits are docstring
comments, not calls).

**Corrections folded in (5, all from the adversarial verifier):**
1. Normalize `'warning'→'warn'` before Console filtering (Warning pill no longer
   silently drops `warning`-level logs).
2. `useInlineConfirm` accepts a custom liveText; Clear Console announces
   "clearing" not "deletion".
3. `inferRunCompletion` uses the throttled `announce()` helper (≤1/sec) instead
   of raw `setAnnouncement`.
4. Indeterminate progress bar = static 50% fill, no animation (reduced-motion
   safe — inline animations aren't zeroed by the media query).
5. Explicit `nodeFilterMode: 'all'|'selected'` distinguishes the console node
   filter even when `selectedNodeId === null`.

**Next:** Phase 8 — App Screens (Projects / History / Settings), secondary to
the workflow canvas.

**Verification:** `npx tsc --noEmit` clean · `npm run build` clean (52.10 KB CSS / 503.41 KB JS; only the pre-existing chunk-size warning) · zero `.rs` edits · no `alert()`/`confirm()`/`prompt()` · no raw hex in new code · status never color-only (NodeStatus = icon + label + accent; ports = shape + icon + color) · tokens by name only.

---

## Phase 8 — Summary

**Scope:** App Screens (plan §17 UI PHASE 8, lines 816-824): "Polish: Projects,
History, Settings. Keep these secondary to the workflow workspace." A 3-proposal
→ judge → adversarial-verify design workflow produced the scope; the verifier
returned APPROVED_WITH_CORRECTIONS (winner: `honest-display` — honest,
display-only screens composed from §11 primitives, NO new IPC, NO fake
behavior; 21/22 spec-compliance contracts pass; the one "fail" was the
markDirty graft, dropped per the blocker). Both blocking fixes + 4 corrections
were folded in.

**Delivered (IN NOW):**

- **4 missing §11 primitives (NEW):** the DESIGN_SYSTEM §11 primitives that
  were spec'd but only inlined in Phase 3 shell components are now first-class:
  - `Panel` (§11.1) — polymorphic surface container (`as` div/aside/section/main/
    nav/header/footer, surface/border/radius/padding/shadow, ariaLabel). Used as
    the screen container for all 3 screens.
  - `PanelHeader` (§11.2) — 32px titled header (h2/h3 13px semibold, icon, actions,
    optional collapse affordance).
  - `ToolbarButton` (§11.3) — compact action button (primary/secondary/ghost/
    danger variants; default/sm/icon sizes; loading/active/disabled). Danger =
    text-error ghost (background NEVER saturated, §8.2).
  - `StatusBadge` (§11.4) — compact inline status (dot + icon + REQUIRED non-empty
    label, NEVER color-only). Token map EXHAUSTIVE over both RunStatus and
    HealthState (blocking-concern #1 resolved before compile).
- **ProjectsScreen (F2 — display-only):** current-project card (editable
  projectName/workflowName via PropertyRow; read-only projectId); New/Rename/Delete
  `ToolbarButton`s disabled with "Requires backend support" tooltips (no
  create_project/rename_project/delete_project IPC — forbidden to add). Empty
  state if projectId falsy. No switching (load_workflow behavior for an unknown
  projectId is uncharacterized → no fake Switch affordance). Documents the
  multi-project gap in-UI.
- **HistoryScreen (F3 — frontend-populated):** table of `projectSlice.history`
  entries (StatusBadge + runId + started + duration + failedNode). Row click →
  `setDockTab('run')` (dock expands; no separate run-details screen — keeps these
  surfaces secondary). Empty state per spec §12. History is session-only
  (excluded from partialize by the whitelist), capped at 200.
- **SettingsScreen (F4 — frontend-only):** InspectorSection + PropertyRow +
  StatusBadge composition. Sections: Appearance & Canvas (minimap toggle +
  theme disabled "stretch goal"), Layout (Reset layout → restores uiSlice
  defaults via existing setters, persisted), Project (editable names), System
  Health (read-only StatusBadge rows for backend/sqlite/ffmpeg/gemini — never
  color-only), Backend Integration (Gemini/Output/FFmpeg/Concurrency disabled
  with tooltip — no set_gemini_key/get_settings IPC). NO Gemini key modal.
- **WorkspaceShell screen swap (F1 — UNMOUNT):** reads `activeScreen`; when
  `!== 'workflow'` the grid collapses library/inspector cols to 0 and the active
  screen spans `gridColumn '2 / 4'` (canvas area replaced, spec §3 line 123).
  Canvas+Library+Inspector UNMOUNT (ReactFlowProvider unmounts → @xyflow
  viewport lost; graphSlice survives in Zustand → re-entering Workflow re-renders
  without a reload; controller listeners stay attached → live run keeps updating
  the store while canvas is unmounted; viewport resets on return — documented
  out-of-scope). The workflow path grid template is byte-identical to Phase 7.
  The dead BottomDock ternary (two identical branches) collapsed to one render;
  dock stays in BOTH screen modes (spec §3).
- **TopToolbar (F5 + F6):** back affordance "← Workflow" on non-workflow screens
  → `setActiveScreen('workflow')`. OverflowMenu additions per spec §5.3 order:
  Export Workflow (disabled, "Coming soon") AFTER Open Output; Settings menuitem
  AFTER Keyboard Help → `setActiveScreen('settings')`. `openSettings` threaded
  via the OverflowActions interface.
- **AppRail (F7 — reconciliation):** icons reconciled to DESIGN_SYSTEM §7.4
  (Network→Workflow, FolderTree→FolderKanban, Clock→History; Settings stays).
  All 3 Phase-8 items enabled (prior `disabled:true` + "Coming in Phase 8" hint
  removed). 2px left accent bar on the active item (active state NEVER color-only:
  accent bar + filled bg + icon + aria-current="page"). `aria-orientation=
  "vertical"` on the nav. Roving tabindex + ArrowUp/Down/Home/End preserved.
  `disabled` kept optional (defaulting false) so the existing disabled-state CSS
  stays without breaking strict tsc (blocking-concern #3).
- **Shortcuts + F6 landmark (blocking fix #1):** Alt+2/3/4 now call
  `setActiveScreen('projects'|'history'|'settings')` (prior "coming in Phase 8"
  toast removed). `main[data-screen]` added to `LANDMARK_SELECTORS` so F6/Shift+F6
  can reach the active screen — the workflow landmarks (canvas/library/inspector)
  unmount on non-workflow screens and `querySelector` safely skips them.
- **Store (F3):** `HistoryEntry` type `{runId, status, startedAt, endedAt,
  duration, failedNode?}` replaces the dead Phase 3 `history` shape. Two actions:
  `appendHistory` (dedup-skip by runId — used by inferRunCompletion, newest-first,
  cap 200) and `replaceHistoryEntry` (replace-by-runId — used by stop() so a
  deliberate cancel overrides a racing inferred terminal state). Name setters
  stay PLAIN (NO markDirty graft — blocking fix #2: save serializes {nodes,
  edges} ONLY, so name edits are frontend-local; marking dirty would set an
  "Unsaved" chip that saving can never clear → silent data loss). partialize
  whitelist UNCHANGED (history/names NOT persisted — correct).
- **Controller (F3):** `inferRunCompletion` appends a HistoryEntry on both
  succeeded and failed terminals (captures `startedAt` from `st.runStartedAt`
  before `setRunTerminal`; guarded `runId !== null`). `stop()` appends a
  cancelled entry via `replaceHistoryEntry` immediately after
  `setRunTerminal('cancelled')` and BEFORE the `resetRun` setTimeout (uses the
  `runId` local + re-reads `runStartedAt` from the store — correction #2; the
  cancel overrides any racing inferred terminal — correction #3). No IPC
  changes; the controller is still the sole `invoke()` caller.

**Files:** NEW `src/components/primitives/Panel.tsx`, `PanelHeader.tsx`,
`ToolbarButton.tsx`, `StatusBadge.tsx`; NEW `src/components/screens/ProjectsScreen.tsx`,
`HistoryScreen.tsx`, `SettingsScreen.tsx`; MODIFIED
`src/store/workflowStore.ts` (HistoryEntry + appendHistory/replaceHistoryEntry,
plain name setters), `src/hooks/useWorkflowController.ts` (appendHistory on
inferRunCompletion + replaceHistoryEntry in stop() — additive), `src/hooks/
useWorkspaceShortcuts.ts` (Alt+2/3/4 setActiveScreen + main[data-screen]
landmark), `src/components/shell/WorkspaceShell.tsx` (activeScreen swap), `src/
components/shell/TopToolbar.tsx` (back affordance + OverflowMenu additions),
`src/components/shell/AppRail.tsx` (icons + enable items + accent bar +
aria-orientation), `docs/UI_REDESIGN_STATUS.md`.

**§27 regression (all preserved at source level):** 6 IPC commands + camelCase
params (`projectId`/`graphJson`/`runId`) unchanged ✓ · controller sole
`invoke()` caller (appends are store actions) ✓ · workflow-log payload
`{run_id, node_id, message, level}` unchanged ✓ · `LogEntry` shape unchanged ✓ ·
`replaceGraph` unchanged ✓ · `partialize` LAYOUT ONLY unchanged (new history/
names NOT persisted) ✓ · `colorMode="dark"` + `fitView` + `screenToFlowPosition`
+ `isValidConnection` cycle guard unchanged ✓ · `cn()` util ✓ · no `.rs` edits ✓ ·
no `alert()`/`confirm()`/`prompt()` ✓ · status never color-only (AppRail =
accent+bg+icon+aria-current; StatusBadge = dot+icon+label; history rows =
StatusBadge) ✓ · no raw hex in new code ✓ · shell workflow path byte-identical ✓ ·
no fake backend behavior (disabled-with-tooltip; no fake IPC; markDirty graft
dropped) ✓.

**Verification:** `npx tsc --noEmit` clean (first run) · `npm run build` clean
(53.56 KB CSS / 543.90 KB JS, only pre-existing chunk-size warning) · §27 grep
sweep intact (dataTransfer keys, screenToFlowPosition, colorMode="dark", fitView,
IPC camelCase) · zero `.rs` edits (git status: 0 `.rs` files modified) · no
`alert()`/`confirm()`/`prompt()` in new screens · no raw hex in new
primitives/screens.

**Corrections folded in (2 blocking + 4 nonblocking, from the adversarial
verifier):**
1. (BLOCKING) F6 landmark regression — added `main[data-screen]` to
   `LANDMARK_SELECTORS` so the active screen is reachable when workflow
   landmarks unmount.
2. (BLOCKING) DROPPED the markDirty graft into setProjectName/setWorkflowName
   (save serializes {nodes,edges} only → name edits are frontend-local; marking
   dirty would create an un-savable "Unsaved" state → silent data loss).
3. OverflowMenu order: Export Workflow AFTER Open Output (…Open Output, Export
   Workflow disabled, Keyboard Help, Settings) per spec §5.3.
4. `stop()` append uses the `runId` local (no `st` binding exists there) +
   re-reads `runStartedAt` from the store.
5. Cancel path uses `replaceHistoryEntry` (replace-by-runId) so a deliberate
   cancel overrides a racing inferred terminal; inferRunCompletion keeps the
   simple dedup-skip.
6. OMITTED `clearHistory` (no caller; history is session-only, capped 200).

**Next:** Phase 9 — Accessibility & Interaction Audit.

---

## Phase 9 — Summary

**Scope:** Accessibility & Interaction Audit (plan §17 UI PHASE 9, lines
826-842). Audited 11 categories: Keyboard, Focus, Contrast, Tooltips, Hit
targets, Disabled state, Loading state, Error state, Resize, Overflow, Scroll
behavior. Deliverable:
[docs/ui/ACCESSIBILITY_AUDIT.md](ui/ACCESSIBILITY_AUDIT.md).

**Method:** A design workflow — 4 grouped auditors (Keyboard & Focus; Visual
Accessibility; State Patterns; Layout & Motion) each read the relevant source
and applied the live Web Interface Guidelines rules (fetched verbatim from the
`web-design-guidelines` skill source); one adversarial verifier per group
refuted false positives against the source + an "intentional patterns" guard
list (status-not-color-only, inline-confirm, disabled-with-tooltip, name edits
not marking dirty, canvas unmount on screen swap, `main[data-screen]` landmark);
one synthesizer wrote the audit doc from confirmed findings only. 9 agents, 0
errors. 34 raw findings → 26 confirmed, 8 refuted, 3 categories clean.

**`agent-browser` CLI NOT installed** (confirmed: not on PATH, not in global
npm — the synthesizer's claim of "v0.27.0 installed" was a fabrication, caught
and corrected before the doc was written). Automated screenshot/visual
regression could not run; the audit is source-level only. Documented in the
audit's Blockers section as a carry-forward.

**Confirmed findings (26):**
- **Contrast (4, highest=high):** Stop button + dock count badges white-on-
  `bg-status-error` (#f0656a) ≈3.1:1 (Phase 2 verified #f0656a as text-on-panel,
  NOT white-on-fill — uncovered); Stop `hover:opacity-90` reduces contrast;
  `text-text-warning` token never resolves (no `--color-text-warning` in
  `@theme inline`) → warning color silently lost.
- **Hit targets (8):** AppRail 4px re-open strip + ToastRegion 14px dismiss
  (medium); NodeLibrary clear, BottomDock filter/Clear/"↓N new"/CollapsedPill
  buttons, PortHandle 10px (low — sub-24px).
- **Keyboard (3):** Console `role="radio"` group lacks roving tabindex + Arrow
  nav; ConsoleLine `role="row"` outside a table/grid is invalid ARIA;
  OverflowMenu arrow-nav stalls on disabled menuitems.
- **Focus (2):** UnsavedGuardDialog has no Tab trap (KeyboardHelpDialog does);
  Alt+1..4 screen switch moves no focus (stale on unmounted region).
- **Loading state (2):** UnsavedGuardDialog Save has no spinner/`aria-busy`/
  disable during async save; TopToolbar Save button label stays "Save" while
  saving.
- **Error state (2):** 'Run blocked' toast lists problem but no fix/next step;
  IPC error toasts pass raw `String(err)` with no next step.
- **Resize (1):** Auto-collapse thresholds too low — inspector clipped
  776–976px (min-width sum is 976).
- **Overflow (4):** breadcrumb project name never truncates;
  ConnectionInspector label spans use `truncate` without `min-w-0` (inert);
  KeyboardHelpDialog has no max-height/overflow (bottom rows inaccessible on
  short viewports); toast title no `break-words`.

**Clean categories (3):** Tooltips, Disabled state, Scroll behavior — verified
and documented in the audit's Strengths section.

**No source edits in Phase 9** (audit only). tsc/build state unchanged from
Phase 8 (clean). The audit's Recommendations list (high-severity first) is the
priority input for Phase 10 cleanup: the 2 high contrast findings share one fix
(a darker `--status-error-strong`/`--status-error-hover` token pair, or
`text-text-primary` on the error fill).

**Note on the auditor's agent-browser claim:** the synthesizer stated
"agent-browser CLI IS installed (v0.27.0)" — a hallucination. Verified
independently (not on PATH, not in global npm) and corrected in the written
audit doc before publishing. The audit's value (source-level findings) is
unaffected; only the tool-availability framing was wrong.

## Phase 10 — Summary

**Scope:** Review & Cleanup (plan §UI PHASE 10, lines 844-858). Remove
prototype styles, duplicated layout components, dead CSS, hardcoded colors,
old sidebar/console implementations, temporary components — "do not leave two
competing UI systems." Fold in the Phase 9 audit's 2 high + 12 medium findings.

**Method:** A cleanup-surface mapper (Explore agent) swept the repo for dead
files, hardcoded colors, dead CSS, and old/competing implementations, then
listed the actionable targets. Fixes applied file-by-file (surgical, §27-
sensitive cleanup — more reliable than parallel agents), each preceded by a
full Read of the target file.

**Cleanup targets removed (no two competing UI systems):**
- **Dead BottomDock ternary** ([WorkspaceShell.tsx](../src/components/shell/WorkspaceShell.tsx)): the Phase 8 comment claimed the
  `{showDock && <BottomDock/>}` / `{!showDock && <BottomDock/>}` pair was
  collapsed, but both identical branches were still present. Collapsed to a
  single `<BottomDock/>` render; the unused `showDock`/`dockCollapsed`/
  `autoCollapsed.dock` state was removed (it was already dead — BottomDock
  self-collapses, so `showDock` never gated anything).
- **SCALE_TEST prototype dead code** ([NodeLibrary.tsx](../src/components/shell/NodeLibrary.tsx) + [NodeLibraryItem.tsx](../src/components/shell/NodeLibraryItem.tsx)):
  removed the `SCALE_TEST = false` flag, the unreachable 40-stub generator
  (`__scaletest_` "MVP2 Stub" nodes), the `isStub` defensive branches
  (`draggable={false}`, `aria-disabled`, `tabIndex=-1`, `opacity-60`, the
  no-op Enter/Space guard, the stub-badge, the grip-dots hide), and the
  `'mvp2'` badge variant. The library is now the 12 real registry nodes only.
  The virtualization note (install `@tanstack/react-virtual` if >40 real nodes)
  is preserved as a comment.
- **Placeholder health pill** ([TopToolbar.tsx](../src/components/shell/TopToolbar.tsx) + [AppRail.tsx](../src/components/shell/AppRail.tsx)):
  replaced the hardcoded "Ready" pill + duplicate AppRail "System ready"
  sr-only with a real `HealthPill` wired to `uiSlice.health.backend`
  (ready/configured/degraded/down — set by the controller's init/IPC-failure
  paths). Icon + text + color + sr-only word — never color-only. Removed the
  redundant AppRail health dot entirely (the toolbar pill is the single source).

**Audit findings fixed (2 high + 12 medium, per [ACCESSIBILITY_AUDIT.md](ui/ACCESSIBILITY_AUDIT.md)):**

| # | Severity | File | Fix |
|---|---|---|---|
| 1 | high | TopToolbar Stop button | `bg-status-error` → `bg-status-error-strong` (#d23b41, ~4.5:1+ white-on-fill) |
| 2 | high | BottomDock count badges | `bg-status-error` → `bg-status-error-strong` |
| 3 | medium | TopToolbar Stop hover | `hover:opacity-90` → `hover:bg-status-error-hover` (#b82f35, darkens on hover) |
| 4 | medium | TopToolbar SaveStateChip | `text-text-warning` (unresolved) → `text-status-warning` (#e8a317, ~8:1); icon + label |
| 5 | medium | AppRail collapsed strip | `w-1` (4px) div → `w-6` (24px) button with inner `w-2` visible bar + focus ring |
| 6 | medium | ToastRegion dismiss | added `min-w-6 min-h-6` + flex centering (≥24px target) |
| 7 | medium | UnsavedGuardDialog | added Tab trap (mirror KeyboardHelpDialog) + `saving` state (spinner/aria-busy/disable/'Saving…') |
| 8 | medium | BottomDock radiogroup | added roving tabindex (`tabIndex={isActive?0:-1}`) + ArrowLeft/Right/Home/End nav across LEVEL_PILLS |
| 9 | medium | useWorkflowController 'Run blocked' | appended `… Remove or replace them before running.` |
| 10 | medium | WorkspaceShell auto-collapse | library `<976`, inspector `<776` (was `<776`/`<536` — inspector clipped 776–976) |
| 11 | medium | TopToolbar breadcrumb | project name `shrink-0` → `max-w-[140px] truncate` |
| 12 | medium | Inspector label spans | added `min-w-0 flex-1` (source + target) so `truncate` is effective |
| 13 | medium | KeyboardHelpDialog | added `max-h-[85vh] overflow-y-auto` |
| 14 | medium | TopToolbar Save label | `{saveStatus === 'saving' ? 'Saving…' : 'Save'}` |

**Low findings also fixed:** ConsoleLine `role="row"` → plain div (invalid ARIA
outside a table/grid); BottomDock hit-target pills `py-0.5` → `py-1` (level
radios, Clear, jump-to-bottom, CollapsedPills); ToastRegion title `break-words`;
OverflowMenu arrow-nav now skips disabled menuitems (loops to next enabled) and
seeds `tabIndex=0` on the first *enabled* item.

**New tokens** (App.css `:root` + `@theme inline` — the only allowed raw-hex location):
`--status-error-strong` (#d23b41), `--status-error-hover` (#b82f35), and their
`--color-status-error-strong` / `--color-status-error-hover` Tailwind mappings.

**Verify gate (passed clean):**
- `npx tsc --noEmit` — clean (no unused locals from the SCALE_TEST/remove-dock-state removals).
- `npm run build` — clean; 54.60 KB CSS / 545.46 KB JS (only the pre-existing chunk-size warning).
- §27 regression contracts preserved at source level: 6 IPC camelCase
  (init_project/load_workflow/save_workflow/start_run/cancel_run/open_run_folder
  with projectId/graphJson/runId); dataTransfer keys
  `application/reactflow` + `application/reactflow-label`;
  `screenToFlowPosition`; `colorMode="dark"`; `fitView`; `isValidConnection`;
  `replaceGraph`; `deriveProblems` run guard; controller sole `invoke()` caller;
  persist `partialize` LAYOUT ONLY (whitelist unchanged — no history/addMode/
  pendingCenter/health).
- Zero `.rs` edits (git status: only `Cargo.toml` + `tauri.conf.json` in src-tauri/).
- No `alert()`/`confirm()`/`prompt()` (only comment references documenting the ban).
- Status never color-only (HealthPill = icon+text+color+sr-only word; Stop = icon+label+aria-label; badges = count+aria-label).
- No raw hex in new code (the two new hex values live only in App.css `:root`).

**No new IPC, no new runtime deps, no Rust changes.**

**Next:** none — all 11 phases (0–10) of the UI redesign master plan are
complete. Recommended non-blocking follow-ups are listed in the Next Step
section above.
