# Void Workflow — Workspace UX Specification (Phase 1)

**Status:** Frozen (UI Phase 1 — UX Architecture)
**Scope:** Workspace UX only. SPEC ONLY — no code, no Rust engine changes implied.
**Inputs:** `VOID_WORKFLOW_UI_REDESIGN_AND_NODE_DESIGN_PLAN.md` (plan), `docs/ui/UI_AUDIT.md` (Phase 0 audit).
**Authority:** This document is the binding input to Phase 2 (Design System) and Phase 3 (Workspace Shell). Any deviation from it in a later phase requires editing this document first. The slice inventory (§2) and the zone layout (§3) are the contract.

---

## 0. Guiding Principles

1. **Canvas is primary.** Canvas always receives the largest area and never collapses (plan §3).
2. **Additive, never replace.** Audit §9: the new shell is built around existing components; the 6 IPC contracts (audit §8), Zustand graph shape, React Flow cycle guard, drag-drop keys, `screenToFlowPosition`, Tauri event pattern, `cn()` util, and semantic HTML are all preserved and extended.
3. **No Rust engine changes.** This phase implies zero Rust edits. Node-type drift (audit §5.1) is reconciled frontend-only (§13).
4. **Dark-first, compact desktop density.** Developer-tool + creative-workflow + media-production feel (plan §7). Restrained accent, neutral surfaces, subtle borders, small radius, strong semantic execution states, functional typography.
5. **Status is never color-only.** Every status surface carries a text label + an icon; color is a secondary cue (audit §6).
6. **No `alert()` / `confirm()` / `prompt()`.** Replaced by toast + modal + inline-confirm tiers (§10).
7. **Every state is explicit.** No dead panels, no blank zones, no ambiguous transitions. Empty states (§8), selection states (§9), run states (§7) are all specified.
8. **Keyboard reachability is a first-class invariant.** F6 cycles the six zone landmarks; every interaction has a keyboard path (audit §6).

---

## 1. Workspace Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ TopToolbar  (region=banner, h-12 fixed)                                │
├──────┬───────────────┬──────────────────────────────┬──────────────────┤
│AppRai│ NodeLibrary   │ Canvas                       │ Inspector        │
│l nav │ (complementary│ (main, role=application,     │ (complementary   │
│56px  │  200-360px)   │  flex-1 — always largest)    │  240-440px)      │
│      │ collapsible   │                              │ collapsible      │
├──────┴───────────────┴──────────────────────────────┴──────────────────┤
│ BottomDock  (region=contentinfo, 120-480px expanded / 28px collapsed)  │
└────────────────────────────────────────────────────────────────────────┘
```

Zones A–E map to plan §4. ARIA landmarks (audit §8 semantic HTML, extended): TopToolbar = `<header role="banner">`; AppRail = `<nav aria-label="App navigation">`; NodeLibrary = `<aside aria-label="Node library">`; Canvas = `<main aria-label="Workflow canvas" role="application">`; Inspector = `<aside aria-label="Inspector">`; BottomDock = `<footer role="contentinfo" aria-label="Observability dock">`.

Density and motion contract (applies to all zones):
- Typography: workflow title 14–16 semibold, panel title 12–13 semibold, node title 12–13 semibold, body 12–13, metadata 11–12, logs monospace 11–12 (plan §8).
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 (plan §8). Zone internal padding: panels 12px, toolbar 8px horizontal, dock 8px. Gap between zones: 0 (1px `border.subtle` is the separator). Panel radius 6px, control radius 4px.
- Interactive target floor: 24×24px (compact desktop; Phase 9 hit-target audit confirms — audit §9).
- `prefers-reduced-motion: reduce` ⇒ all zone slide/collapse animations instant (0ms); progress bars use static striped fills, not moving gradients; button spinners use a non-animated indeterminate indicator (static dots/striped bar). Default motion is subtle (≤120ms, opacity/translate only).
- `prefers-contrast: more` ⇒ focus rings widen to 3px, status icons gain always-on text labels.
- `<html>` gets `color-scheme: dark` + `class="dark"` at boot (closes audit §6 App.tsx:76 gap at the spec level; Phase 2 tokens + Phase 3 boot script implement).
- **No horizontal page scroll, ever.** Each overflowable zone scrolls inside itself via `overflow-x:auto` (closes audit §7.1). Console lines wrap (`white-space:pre-wrap`).
- Token references in this spec are NAMES only (plan §8 semantic tokens — `surface.canvas`, `border.subtle`, `text.muted`, `status.running`, etc.); Phase 2 owns the values. Phase 3 must not ship raw color literals.

---

## 2. State Model (the spine)

**Decision: HYBRID.** One Zustand store (`workflowStore`) owns all declarative, serializable, cross-zone state (the *what*). A single `useWorkflowController` hook owns all imperative Tauri side effects (the *how*). The store is side-effect free; the controller is the only module that imports `@tauri-apps/api` and the only writer of the run/console slices.

Rationale: a pure-Zustand store would put `invoke()`/`listen()` inside actions, coupling the store to Tauri and making it untestable; a pure controller hook recreates the prop-drilling the audit flagged (audit §2.4). This split resolves audit §11 Q1 cleanly along the serializable/imperative seam and matches audit §9 step 3 ("move App.tsx IPC handlers into a controller hook").

**One store, many scoped selectors — not separate `create()` calls.** A single store avoids cross-store subscription ordering and keeps audit §8's Zustand graph shape intact. Every consumer uses a scoped selector (`useRun(s => s.runStatus)`, never `useRun()`) to prevent re-render storms. Slices are logical groupings within the one store, not physical stores.

### 2.1 Slice inventory (binding)

| Slice | Status | Fields & actions | Notes |
|---|---|---|---|
| `graphSlice` | EXISTING (audit §8, preserved shape) | `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `onConnect`, `setNodes`, `setEdges`, `addNode`, `updateNodeData`; NEW `replaceGraph(nodes, edges)` for load hydration | `updateNodeData` finally gets a caller (Inspector, Phase 6 — fixes audit §5.3 dead code). `replaceGraph` is the only hydration path. |
| `selectionSlice` | NEW | `selectedNodeId`, `selectedEdgeId`, `multiSelectIds`, `selectionMode` (`'none'\|'node'\|'edge'\|'multi'`), `selectNode`/`selectEdge`/`setMultiSelect`/`clearSelection` | React Flow `onSelectionChange` is the only multi-select writer. Drives Inspector mode. Single-select click routes through `selectNode`/`selectEdge` so Inspector + Problems stay in sync. |
| `runSlice` | NEW | `runId`, `runStatus` (`'idle'\|'starting'\|'running'\|'succeeded'\|'failed'\|'cancelled'`), `runProgress` (`number\|null` — null when no real progress, plan §12), `perNodeStatus` (`Record<nodeId, {status, progress, message, startedAt, endedAt}>`), `runStartedAt`, `runError`, `lastCompletedRunId` (replaces App.tsx:67 `currentRunId\|\|1` hack) | SINGLE WRITER: `useWorkflowController`. `lastCompletedRunId` is the canonical reference for `open_run_folder` (audit §4 Open-Output fix). `starting` is an explicit transient between Run click and `runId` return (closes audit §6 App.tsx:103 gap). |
| `saveSlice` | NEW | `dirty`, `saveStatus` (`'idle'\|'saving'\|'saved'\|'error'`), `saveError`, `lastSavedAt` | `dirty` set true by any graph mutation (nodes/edges/updateNodeData/addNode); false on save/load. `saveStatus==='saved'` reverts to `idle` after a 2.5s controller timer. Toolbar reads this. |
| `consoleSlice` | NEW | `logs[]` (capped 2000 FIFO), `logFilters` (`{level, nodeScope:'all'\|'selected'}`), `logsOverflowed`, `appendLog`/`clearLogs`/`setLogFilter` | Replaces ConsolePanel `useState` (audit §2.4). High-frequency appends are batched by the controller before flushing to the slice to avoid per-line re-renders. |
| `problemsSlice` | NEW (DERIVED) | `problems[]` (`{id, severity, nodeId, message}`), `selectedProblemId` | DERIVED from `runSlice.perNodeStatus` + graph config validation — single source of truth is the run slice, not a separate event stream. Recomputed on terminal run status and on graph mutation. |
| `uiSlice` | NEW | `activeScreen`, `appRailCollapsed`, `libraryCollapsed`, `libraryWidth`, `inspectorCollapsed`, `inspectorWidth`, `dockTab`, `dockCollapsed`, `dockHeight`, `minimapOn`, `health` (`{backend, sqlite, ffmpeg, gemini}`), `dialog` (single open modal), `toasts[]` | Persisted widths/collapse via `persist` partializer scoped to LAYOUT ONLY (`libraryWidth`, `libraryCollapsed`, `inspectorWidth`, `inspectorCollapsed`, `dockHeight`, `dockCollapsed`, `dockTab`, `minimapOn`) — never graph/run/selection/save. Each zone container reads only its own fields; each zone writes only its own. |
| `projectSlice` | NEW | `projectId` (default `1` — audit §11 Q3, audit §8 IPC preserved), `projectName`, `workflowName`, `history[]` (Phase 8 placeholder) | Forward-compatible for Phase 8 multi-project; no IPC signature changes when it lands. |

### 2.2 Controller hook (`useWorkflowController`) — the only imperative writer

The controller owns:
- All 6 IPC calls (`init_project`, `load_workflow`, `save_workflow`, `start_run`, `cancel_run`, `open_run_folder`) — moved verbatim out of `App.tsx`, preserving audit §8 IPC contracts and the `getState()` stringify pattern (avoids stale closure, audit §2.6).
- The `workflow-log` Tauri event subscription — moved out of `ConsolePanel` into the controller; re-broadcasts to `consoleSlice` and infers `runSlice.perNodeStatus` (MVP1 fallback, see §7.4).
- `currentRunId` (moved from App.tsx local state) — mirrored to `runSlice.runId` for UI reads.
- Transient timers only (no `useState`/`useRef` except ephemeral timers): the `saved→idle` 2.5s fade timer, the `succeeded/cancelled→idle` 3s toolbar fade timer.

**Hard rule (enforced in Phase 3 code review):** only the controller calls `invoke()`. Zustand never imports `@tauri-apps/api`. The controller exposes only `run()`, `stop()`, `save()`, `openFolder()`, `init()` plus internal event setup; all writes go through slice actions. The controller is not a god-object — it holds no view state (risk R1, §14).

### 2.3 Cross-slice wiring

All cross-slice effects are single `set()` calls within the store; no inter-slice action imports.
- `updateNodeData` / `addNode` / edge changes ⇒ also set `saveSlice.dirty = true`.
- `replaceGraph` ⇒ resets graph + `dirty=false` + `saveStatus idle` + run reset + `clearSelection` + `clearLogs`.
- Run terminal status ⇒ sets `lastCompletedRunId` and recomputes `problemsSlice`.

### 2.4 State migration from App.tsx (audit §2.4)

| App.tsx local state today | New home |
|---|---|
| `currentRunId` | `runSlice.runId` (writer: controller) |
| `dbPath` | `uiSlice.health` / project config (not a top-level concern) |
| `error` | `runSlice.runError` / `saveSlice.saveError` / `uiSlice.health` |
| `listen('workflow-log')` in ConsolePanel | controller subscription → `consoleSlice` + `runSlice` |

---

## 3. Zone Layout (CSS grid)

**Grid:** 4 columns × 2 rows (plus the dock as a third row spanning all columns).

- **Row 1 — Top Toolbar:** `h-12` (48px) fixed, full width, `border-bottom border.subtle`, `surface.sidebar`.
- **Row 2 — Workspace body:** CSS grid, columns: `[App Rail 56px fixed] [Node Library 200-360px, default 240px] [Canvas 1fr, min 480px] [Inspector 240-440px, default 300px]`. Height = remaining vertical space.
- **Row 3 — Bottom Dock:** default collapsed to a 28px summary bar; expanded default 240px, resizable 120-480px. Spans full width below the body. The dock overlays the bottom of all four columns (canvas does not lose width to the dock).

**Resize rules (only these three are user-resizable):**
- Node Library: right-edge drag, 200-360px, default 240px, persisted.
- Inspector: left-edge drag, 240-440px, default 300px, persisted.
- Bottom Dock: top-edge drag (when expanded), 120-480px, default 240px, persisted.

**Collapse rules:**
- App Rail: fixed 56px, NOT resizable. Collapsible to 0 via Ctrl/Cmd+Shift+B and a hover re-open strip; persisted. (See §4 for the narrow-mode decision.)
- Node Library: collapsible to a re-open strip (header chevron, Ctrl/Cmd+B). Persisted.
- Canvas: NEVER collapses; flex-grows to fill remaining width — always the largest zone.
- Inspector: collapsible to 0 (header chevron, Ctrl/Cmd+I). Persisted.
- Bottom Dock: collapsible to a 28px summary bar (chevron, Ctrl/Cmd+J, or clicking the active collapsed pill). Persisted.

**Persisted widths clamped to min/max on load.** Graceful fallback (risk R5): if window narrower than sum of min widths, Library and Inspector auto-collapse before canvas is starved; dock collapses first if vertical space < 600px. No crash, no horizontal scroll.

**Active-screen behavior:** when `uiSlice.activeScreen !== 'workflow'` (App Rail selection other than Workflow), Node Library + Inspector hide and the canvas area is replaced by the active screen (Projects / History / Settings). The Bottom Dock stays. Phase 8 builds those screens; until then they render as disabled-with-tooltip in the rail (see §4).

**Accessibility contracts on the layout:**
- **F6** cycles focus forward across the 6 landmarks (Toolbar → AppRail → NodeLibrary → Canvas → Inspector → Dock → Toolbar); Shift+F6 backward. This is the master reachability contract.
- Each zone uses an internal roving-tabindex pattern so Tab advances within a zone only when it is the active zone; otherwise a single tabstop lands on the zone container and F6 enters. Avoids 100+ Tab stops on a flat canvas.
- Resizable dividers are keyboard-operable: focus the `role="separator"`, Arrow keys adjust size by 8px (ArrowLeft/Right for zones, ArrowUp/Down for dock), Enter toggles collapse, Shift+Arrow maximizes/restores. `aria-orientation`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-controls` on the separator.
- Collapsed zones get `inert` on the collapsed content + `aria-expanded` on the toggle button; a focusable "expand" button remains. When a zone collapses while holding focus, focus moves to the toggle that collapsed it.

---

## 4. Zone A — App Navigation Rail

**Purpose:** app-level navigation (plan §4 Zone A). Width 56px fixed, not resizable, icon-led. `surface.sidebar`, `border-right border.subtle`.

**Items (top to bottom):** Workflow (default active), Projects, History, Settings. Icon-led (lucide — audit §2.5 notes it's depended on but unused; Phase 2 adopts).

**MVP1 scope:** Workflow is the only functional destination (`projectId=1`, audit §11 Q3). Projects/History/Settings render as disabled-with-tooltip ("Available in Phase 8") to preserve information hierarchy without faking functionality — an explicit empty-state for app-level screens (plan §16 "keep simple / secondary").

**Active state (NOT color-only):** left 2px accent bar + filled icon + `aria-current="page"` + `surface.hover` background. Inactive: icon `text.muted` (still ≥4.5:1 contrast). `:focus-visible`: 2px `--border-focus` outline, offset 2px, on every item (closes audit §6 NodeLibrary focus-visible gap pattern — does not repeat here).

**Accessibility contract:**
- `<nav aria-label="App navigation" aria-orientation="vertical">`.
- Each item is a `<button>` with `aria-label="<name>"` (icon-only buttons require an accessible name), `title="<name>"` for native tooltip, and a hover/focus popover label (300ms delay, dismiss on blur/Escape; reduced-motion skips the fade).
- Roving tabindex: exactly one item (the active view) has `tabindex=0`; others `tabindex=-1`. ArrowUp/ArrowDown move between items, Enter/Space activates, Home/End jump to first/last.
- Disabled items: `disabled` + `aria-disabled="true"`, tooltip "No runs yet" / "Available in Phase 8", `tabindex=-1`, skipped by Arrow keys (standard roving), 50% opacity + `cursor:not-allowed` + a visually-hidden "(unavailable)" text.

**Keyboard shortcuts (global):** Alt+1 Workflow, Alt+2 Projects, Alt+3 History, Alt+4 Settings. Listed in the Keyboard Help dialog (Ctrl+? / Cmd+?, §10).

**Collapse:** collapsible to 0 via Ctrl/Cmd+Shift+B and a hover re-open strip; persisted. Rationale for allowing collapse (reconciling the two proposals): the plan calls it "icon-led / narrow" and the accessibility proposal argues it must always be present for wayfinding. **Resolution:** a thin re-open strip always remains when collapsed so navigation is always reachable (muscle-memory shortcut Alt+1 + the strip), but the full 56px can collapse on narrow windows when canvas needs the space. Default expanded.

**Reads/writes:** writes only `uiSlice.appRailCollapsed` + `uiSlice.activeScreen`; reads nothing from other slices. No other zone reads rail state directly — they read `activeScreen`.

---

## 5. Top Toolbar

**Structure:** single `h-12` (48px) row, three regions, `surface.sidebar`, `border-bottom border.subtle`. Density: 8px horizontal padding at row edges, 8px gap between items within a region.

**Reconciliation note:** the plan §5 shows a run variant where the toolbar simplifies (breadcrumb + progress on left, Stop on right, other controls hidden). The accessibility proposal argues against hiding controls mid-run (discoverability). **Resolution: stable layout.** The toolbar does NOT restructure during a run — only the run-state line text + the Run→Stop swap change. Undo/Redo/Save/overflow remain visible but Save is disabled with a tooltip "Save disabled while running" (prevents mid-run edits without hiding controls). This keeps layout stable and avoids the disappearing-control focus problem (audit §6 App.tsx:99).

### 5.1 LEFT region — back + breadcrumb + save chip

- **Back affordance:** "← Projects" button (icon+text, `aria-label="Back to Projects"`), disabled when no parent context, tooltip when disabled. Phase 8 wires it; in MVP1 it returns to a (disabled) Projects screen.
- **Breadcrumb:** `<nav aria-label="Breadcrumb"><ol>` — `projectName / workflowName` (`projectSlice`). 13px, `text.primary` for current segment, `text.secondary` for parent, 8px chevron-right (`text.muted`). Single line, truncate with ellipsis at 280px max (`title` carries full path). Last crumb has `aria-current="page"`.
- **Save-state chip** immediately right of breadcrumb (gap 8px): 6px dot + 11px label, no badge chrome. States:
  - `Saved` — `status.success` dot + "Saved" `text.muted`.
  - `Unsaved` — `status.warning` dot + "Unsaved" `text.secondary`.
  - `Saving…` — `status.queued` spinner dot + "Saving…" `text.muted`.
  - `Save failed` — `status.error` dot + "Save failed" `text.error`.
  - `aria-live="polite"` so screen readers announce transitions. The chip is the high-visibility, persistent save surface (risk R6); toasts are secondary.

### 5.2 CENTER region — health

- **Compact health pill**, centered: "● Ready" — 12px dot + 11px label `text.muted`. The dot has a `visually-hidden` status word AND the visible text is the status word (never dot-only — closes audit §6 App.tsx:83). `aria-live="polite"` so status changes announce.
- Clicking opens the **System Health popover** (plan §6): a non-blocking panel (220px, `surface.elevated`, `border.default`, 6px radius, shadow) titled "System Health" with 4 rows (Tauri Backend / SQLite / FFmpeg / Gemini), each `11px` name left + status right (Ready / Configured / Degraded / Down with matching status dot). Close on Esc or click-away.
- On narrow widths (<1100px) the center health hides; the rail's bottom health dot (see §4 — a 16px dot pinned to the bottom of the App Rail with the same semantics) remains the fallback. **Resolution:** keep the rail health dot as a permanent secondary indicator (zone-density proposal) AND the center pill as the primary (accessibility proposal requires the text label always visible at default widths).

### 5.3 RIGHT region — primary actions

Each is a `<button>` with `aria-label` and visible text or icon+tooltip (icon-only buttons REQUIRE `aria-label` + `title`).

- **Undo / Redo:** DECISION — omitted in MVP1 (no dead controls — audit's dead-control anti-pattern). Reintroduced in Phase 3 when a history slice exists. The slots are reserved in the layout but render nothing until then.
- **Save:** 28px button, "Save" label + disk icon. Primary surface when `dirty`, secondary when saved. Disabled + spinner + `aria-busy="true"` + `aria-label="Saving"` while `saveStatus==='saving'`. Disabled (with tooltip "Save disabled while running") while a run is active. Replaces the `alert()` on save (audit §5.2) — success/failure goes to the save chip + a toast.
- **Run / Stop** — the single prominent action:
  - Idle/finished: accent-filled "▶ Run" button, `aria-label="Run workflow"`. Disabled when canvas empty (tooltip "Add nodes to run") or when `saveStatus==='saving'`.
  - `starting` (between click and `runId` return): spinner + disabled + `aria-busy="true"`, label "Starting…".
  - `running`: the SAME DOM button toggles to "■ Stop", `status.error`-filled, `aria-label="Stop workflow"`. Focus is preserved on the element (closes audit §6 App.tsx:99 — Stop appears without focus loss because it is the same button with swapped label/role).
  - Stop acts immediately — NO modal confirmation (see §10 tier 2: undo/informational toast). In MVP1 runs are not resumable, so the toast is informational ("Run cancelled").
- **Secondary menu (⋯):** `<button aria-haspopup="menu" aria-expanded>`, keyboard-navigable menu (Arrow keys, Escape closes, focus returns to trigger), `role="menu"` with `role="menuitem"` entries:
  - **Open Output** — enabled only when `runSlice.lastCompletedRunId !== null` (closes audit §4 Open-Output-globally-prominent: it lives in context here AND in the Artifacts dock tab, not always-visible). Primary home is the Artifacts tab (§9.4); this menu entry is the muscle-memory shortcut.
  - **Export Workflow** (Phase 8, disabled).
  - **Clear Console** (disabled when `consoleSlice.logs` empty).
  - **Fit View**, **Toggle Minimap** (reads `uiSlice.minimapOn`).
  - **Toggle Library** (Ctrl+B), **Toggle Inspector** (Ctrl+I), **Toggle Dock** (Ctrl+J).
  - **Keyboard Help** (Ctrl+?), link to **Settings**.

### 5.4 Run-state line (center-left, inline with breadcrumb)

Replaces/appends to the save chip area while a run is active. Reads `runSlice`:
- `running` → "Running · 42%" (or "Running" when `runProgress===null`), `status.running` dot, 13px. `aria-live="polite"` throttled to ≤1 announcement/sec.
- `succeeded` → "Completed" (`status.success` dot), fades to idle after 3s (controller timer).
- `failed` → "Failed · see Problems" (`status.error` dot), STICKY — does not fade until user dismisses or starts a new run.
- `cancelled` → "Cancelled" (`text.muted`), fades to idle after 3s.

### 5.5 Focus management

On app mount, initial focus goes to the workflow title region (not Run — avoids a footgun). Tab order within toolbar is semantic: back → breadcrumb → (save/run chip is read-only) → Save → Run/Stop → secondary menu → health. F6 exits to AppRail.

---

## 6. Zone B — Node Library

**Structure (plan §9):** header ("Nodes" 12px semibold + collapse chevron) → search input → flat category groups → node items. `surface.sidebar`, `border-right border.subtle`. Default 240px, resizable 200-360px, collapsible.

**Search input:** 32px tall, `surface.panel`, `border.subtle`, 4px radius, placeholder "Search nodes…" (11px `text.muted`, search icon left). Matches name, category, description, keywords (plan §9). Clear button (`aria-label="Clear search"`) appears when query non-empty. A live-updating count `aria-live="polite"` ("12 results", "3 results", "No results"). **Search filter is LOCAL component state** (ephemeral, no cross-zone consumer) — NOT in `uiSlice`. Clears on Esc.

**Categories (single-level, plan §9 "do not introduce complicated nested categories yet"):** INPUT, TEXT, AI, MEDIA, UTILITY, OUTPUT. Each category: 11px uppercase semibold `text.muted` label, collapsible via `<button aria-expanded aria-controls="cat-<id>">` (chevron). Default expanded for INPUT/AI/OUTPUT, collapsed for UTILITY. **Category collapse state is LOCAL, persisted to localStorage separately** (view preference, no other consumer) — NOT in `uiSlice`. Collapsed groups get `inert`.

**Item anatomy (28px row, 8px horizontal padding, 4px gap):** `[16px icon aria-hidden] [name 12px text.primary, single-line in MVP1 — description shown in tooltip to preserve density] [drag affordance: 12px grip-dots icon on hover, aria-hidden, with a visually-hidden "drag or press Enter to add" hint]`. Hover: `surface.hover` full row, 4px radius inset. `:focus-visible`: 2px `--border-focus` outline offset 1px (closes audit §6 NodeLibrary.tsx:31 no-focus-visible).

**Drag contract (preserved, audit §8):** pointer drag sets `application/reactflow` + `application/reactflow-label`; drop uses `screenToFlowPosition`. `aria-grabbed="false"→"true"` during drag. No contract change.

**Keyboard add (NEW — the accessibility unlock, closes audit §6 drag-only gap):** each item is `<div role="button" tabindex="0" aria-label="<name>: <description>" draggable>`. Enter or Space enters add-mode: the global status announcer (§10) speaks "Selected <node>. Click on canvas to place, Escape to cancel"; focus moves to the canvas `role="application"` region; the next click or Enter at canvas center places the node via the same `addNode` path; Escape cancels and focus returns to the library item. This is the canonical keyboard-drag contract for the whole app. **The library is ALWAYS keyboard-usable, never drag-only — this is a frozen invariant.**

**Empty-search state:** `aria-live="polite"` region: 'No nodes match "<query>"' (12px `text.muted`) + "Clear search" button. (The library itself is never empty of items — always ≥11.)

**MVP2 scale test (plan §4 acceptance):** the library must render 50+ items without jank; virtualization (e.g. `@tanstack/react-virtual`) is RECOMMENDED if item count >40 and noted as a Phase 4 implementation detail, not a Phase 1 decision. Stub items for scale testing are non-draggable, marked with an 8px "MVP2" tag.

**Data source:** the library renders from the single source of truth (§13) so it is designed once.

---

## 7. Zone C — Canvas

**Primary workspace, largest zone, `1fr`, min 480×320.** `surface.canvas` background. React Flow preserved (audit §8): `@xyflow/react` v12, `colorMode="dark"`, `fitView`, `Background`, `Controls`, `isValidConnection` cycle guard. Background hardcoded `#334155` (audit §5.4) and Controls `bg-gray-800` etc. migrate to tokens in Phase 2 — spec records the token name `--surface-canvas-grid`, Phase 1 does not implement.

### 7.1 Empty state (plan §10)

When `graphSlice.nodes.length === 0`, a centered absolutely-positioned overlay (NOT a React Flow node) renders:
- `<h2>` "Build your workflow" (14px semibold `text.primary`)
- `<p>` "Drag a node from the library, or press Tab to focus the library and press Enter to add." (12px `text.secondary`)
- divider
- "or start with:" (11px `text.muted`)
- Two template buttons (`pointer-events-auto`, 28px tall, `surface.panel`, `border.subtle`, 4px radius): "Text → AI → Preview" and "Local Media → Info". Clicking inserts pre-wired nodes + edges via `addNode` sequence.

The overlay has `aria-live="polite"` for first-render announcement, then is **removed from the DOM** (not just hidden) the moment `nodes.length > 0` so it never interferes with AT. Template buttons disappear once any node exists.

### 7.2 Controls, minimap, context menu

- **React Flow `<Controls>`** bottom-right, restyled to tokens in Phase 2. Each control button gets `aria-label` ("Zoom in", "Zoom out", "Fit view", "Toggle lock"); the container gets `role="toolbar" aria-label="Canvas controls"`. Keyboard: +/- zoom, 0 fit, Esc clear selection (closes audit §6 WorkflowCanvas.tsx:103 no-accessible-label). A "Fit" button + current zoom % label (11px `text.muted`) also appear. Zoom respects `prefers-reduced-motion` (no animated pans).
- **Minimap DECISION: OFF by default, toggleable from the ⋯ menu, persisted in `uiSlice.minimapOn`.** Rationale: compact density + low visual noise (plan §7); available for large graphs. When on, it is `aria-hidden="true"` (visual orientation aid, non-operable for AT) and toggleable with `aria-pressed`. Adding it later is additive (bottom-right overlay) and low-risk.
- **Context menu DECISION: deferred — NOT in Phase 1 freeze.** Only added in Phase 5 if a concrete need is justified (plan §5). Right-click on canvas = deselect (same as empty-click) + no menu. If/when added, it is `role="menu"` with full keyboard nav (Arrow keys, Escape, Shift+F10/Menu key access), and right-click is NEVER the only way to reach an action — every menu item has a toolbar/inspector equivalent.

### 7.3 Selection, ports, edges

**Selection:** React Flow `onSelectionChange` mirrors into `selectionSlice` (the only multi-select writer). Selected node: 2px `--border-focus` ring (replaces hardcoded `border-blue-500`, audit §5.4 → token in Phase 2) + subtle `surface.elevated` lift, no scale transform (restrained). A visually-hidden "Selected" text is appended to the node's accessible name so AT announces "AI Script, selected". Edge selection: 2px accent stroke + endpoints emphasized. See §9 for the full selection contract.

**Ports (typed, plan §13, closes audit §6 BaseNode.tsx:21 color-only gap):** each Handle communicates type via SHAPE + small ICON + LABEL-on-hover/focus + TOOLTIP + color as secondary cue. Families: Text, Number, Boolean, Json, File, Media, Audio, Video, Artifact, Any. Shape mapping: circle (Text/Number/Boolean/Json/Any), square (File/Media/Audio/Video/Artifact). Input ports left, output ports right. Port label appears inline (10px `text.muted`) only when the node is selected or hovered; otherwise hidden to reduce density. Port type is declared in the node source of truth (§13), NOT inferred from edges. Each port Handle is keyboard-focusable (`tabindex=0` within the node's roving order) with `aria-label="Input port: <type>"` / `"Output port: <type>"` and `role="button"`. **Keyboard connect:** focus an output port, press Enter or `c` ("connect"); focus moves to canvas; focus a target input port, Enter to confirm; Escape cancels. `isValidConnection` (audit §8, preserved) is the UI cycle guard; on rejection, the global status announcer speaks "Invalid connection: would create a cycle" via `aria-live` (NOT a modal). Backend type validation is authoritative (plan §13); type-incompatible connections reported via Problems.

**Edges:** default bezier, `border.default` 1.5px; selected = accent 2px. **Animated dashed** when carrying an active run payload (edge feeding a running node) — the only run-related canvas decoration besides node status. Animation is `status.running` color, subtle 1s dash, and respects `prefers-reduced-motion` (when reduced: no dash animation, just color). No edge labels in MVP1 (keeps canvas clean). On focus, an edge shows a focus ring and `aria-label` "Connection from <source> to <target>: <type>".

### 7.4 Canvas accessibility

Container: `<main aria-label="Workflow canvas" role="application">` (role=application because it hosts a spatial keyboard interaction model). A visually-hidden `<h2>` "Workflow canvas" provides an accessible name beyond the label. React Flow's built-in keyboard handling is preserved and augmented: Delete removes selected nodes/edges (with confirm — see §9/§10), Ctrl/Cmd+A selects all, Ctrl/Cmd+D duplicates, Arrow keys nudge selected node by 1px (Shift=10px). Esc clears selection (first Esc) then exits canvas focus to the toolbar (second Esc) — the explicit "Exit canvas" affordance for AT users (risk R1). Canvas keyboard contract is documented in the Keyboard Help dialog.

---

## 8. Zone D — Inspector

**Right-side context-sensitive panel (plan §4 Zone D, §14).** Default 300px, resizable 240-440px, collapsible to 0 (Ctrl/Cmd+I). `surface.sidebar`, `border-left border.subtle`. Header 32px: mode title (12px semibold) + collapse chevron.

### 8.1 Modes (driven by `selectionSlice.selectionMode`)

| Mode | Trigger | Content |
|---|---|---|
| **Workflow Inspector** | `selectionMode==='none'` | Workflow name (editable), run defaults, output base path, graph stats (node count, edge count, last saved, last run) + hint "Select a node or connection to edit it." NEVER empty — no dead panel (closes audit §4 "no Inspector"). |
| **Node Inspector** | `selectionMode==='node'` | See §8.2. |
| **Connection Inspector** | `selectionMode==='edge'` | source node name → target node name, port types, validation status, optional label, "Delete connection" danger button. Minimal — edges carry little config in MVP1. |
| **Multi-select Inspector** | `selectionMode==='multi'` | "N nodes selected" count + bulk actions (Align, Distribute, Delete). No per-node config (avoids ambiguous editing). Bulk Delete uses confirm (§10). |

**Running node selected:** the Node Inspector adds a **Run section IN ADDITION TO config** — it does not replace config (plan §4 "Running node → Config + Run information"). Config inputs are disabled with an "Editing disabled while running" note; the Run section shows `runSlice.perNodeStatus[selectedNodeId]` read-only (status badge, progress bar only when `progress!==null`, last message, timestamps). This is mode-merging, not a 5th mode.

### 8.2 Node Inspector structure (generic — plan §14)

```
Node Name (editable, 13px input, aria-label)
Node Type / ID (11px text.muted, read-only, visually-hidden id for reference)
[ Configuration | Input | Output | Run ]   ← tabs; simple nodes hide tabs they don't have
  Basic
  ...
  Advanced (collapsible, default collapsed)
  ─── border.subtle ───
  Danger: Delete Node
```

**Tabs:** `role="tablist" aria-label="Inspector sections"`, each tab `role="tab" aria-selected aria-controls` with roving tabindex=0 on active, ArrowLeft/Right to switch, content in `role="tabpanel" aria-labelledby`. Active tab tracked in a local state (or a selection-slice field). Simple nodes (Text Input, Delay) collapse Input/Output/Run into a single Configuration section (plan §14 "simple nodes may not need tabs"). Complex MVP2 nodes use Settings|Items|Output|Run (plan §14/§22) — same generic Inspector, different tab set from schema.

**Generic, not per-node-type:** the config form is rendered from the node's declared `configSchema` (§13). ONE inspector layout system, not per-node layouts (plan §14 rule). The shell renders `PropertyRow` primitives: text input, textarea, number, select, toggle, slider, file-picker (28px tall, 11-12px text, `border.subtle`, focus `border.focus` ring — plan §8 form density). Phase 6 validates this generic architecture against Text Input, Text Transform, Delay (plan §6); no per-node-type Inspector component until that passes.

**Every form control is labeled:** `<label>` wrapping or `aria-labelledby`, with `aria-describedby` pointing to helper text and validation errors. Validation errors are `role="alert"` (assertive) on submit, polite on blur. Disabled controls show `aria-disabled` + a tooltip explaining why.

**Editing:** every field change calls `graphSlice.updateNodeData` → sets `saveSlice.dirty=true` (closes audit §5.3 — `updateNodeData` becomes the live Inspector→graph contract in Phase 6).

**Danger zone:** always at the bottom, separated by `border.subtle`, uses `status.error` text for the action label but NOT a saturated background (restrained, plan §7). Delete Node = `<button aria-label="Delete <node name>">`, confirm via inline-confirm (button label changes to "Confirm delete" for 3s, `aria-live="assertive"` announces "Press again to confirm deletion") — NOT a modal (see §10). Removing a node removes connected edges + clears selection.

**Empty state:** none — when nothing selected, Workflow Inspector renders (no dead panel).

**Focus management:** when selection changes, focus moves to the Inspector header `<h2>` (AT announces new context) and tab order resets to the active tab. When collapsed, focus returns to the toggle button; collapsed panel is `inert`.

---

## 9. Zone E — Bottom Dock

**Tabs: Console | Problems | Run | Artifacts** (plan §15). Default collapsed (28px summary bar); expanded default 240px, resizable 120-480px. `surface.panel`, `border-top border.subtle`. Spans full width below the body.

`dockTab` in `uiSlice` tracks active. On app boot: collapsed, active tab = Console.

### 9.1 Collapsed summary bar (28px, plan §15)

Horizontal row, 8px padding, 11px text. Left: tab labels as flat status pills — "Console · {n} errors" (error count in `status.error` text if >0, else "Console · 0"), "Problems · {n}" (`status.warning` if >0), "Run · {state}" (idle / Running 42% / Failed — status-colored), "Artifacts · {n}". Active tab pill has `surface.hover` background. Clicking any pill expands the dock to that tab. Right: expand chevron (▴). The bar is `aria-live="polite"` and `aria-atomic="false"` so only the changed segment announces; throttled to ≤1 announcement per 2s to avoid chatter.

### 9.2 Expanded structure

28px tab bar at top: `role="tablist" aria-label="Observability"`, tabs `role="tab" aria-selected aria-controls`, ArrowLeft/Right to switch (roving tabindex), Home/End to ends. Each tab may show a 10px count badge. Tab content fills remaining height. Resize handle: 4px bar at the top edge, `cursor-ns-resize`, `role="separator" aria-orientation="horizontal"`. Collapse via chevron (▾), Ctrl/Cmd+J, or clicking the active tab again.

### 9.3 Console tab (closes audit §6 ConsolePanel.tsx:30/38/39)

- `role="tabpanel" aria-labelledby="tab-console"`. Log container: `role="log" aria-live="polite" aria-relevant="additions" aria-label="Workflow console"` — polite so it doesn't interrupt, additions-only so it doesn't re-announce the whole log.
- Monospace 11-12px, `surface.canvas` (slightly darker for legibility), 4px padding. Each line: `<div role="row">` timestamp (`text.muted`) + node name (`text.secondary`) + level + message (`text.primary`). Format: "12:04:11  AI Script  INFO  Calling Gemini" (plan §15).
- **Level is NOT color-only** (audit §6 ConsolePanel.tsx:39): each level has an ICON (info/warn/error/system) + `aria-label="level: <error>"` + color secondary. ERROR lines additionally have a nested visually-hidden "error: " prefix so screen readers flag them (assertive for the first occurrence of a given error).
- **Long lines WRAP** (`white-space:pre-wrap`, `overflow-x:auto` on the row container) — closes audit §7.1 horizontal-scroll violation.
- **Filters** (plan §15): a `<fieldset aria-label="Console filters">` at the top (24px): level pills All/Info/Warning/Error/System (radio buttons) + node filter combobox (All Nodes / Selected Node — bound to `selectionSlice`; do NOT override the user's filter when selection changes unless they have "Selected Node" enabled). Filter changes announced via a visually-hidden live region ("Filtering to errors, 3 lines").
- **Clear Console** button: `aria-label="Clear console"`, confirm via inline (not modal) → `consoleSlice.clearLogs()`.
- **Auto-scroll** to bottom on new line unless user has scrolled up (then show a "↓ N new" pill to jump). Reduced-motion: jump instantly, no animation.

### 9.4 Problems tab (plan §15)

- Reads `problemsSlice.problems`, grouped ERROR first. Each problem: `<button role="row" aria-label="<level> <node>: <message>. Jump to node">` — severity icon + text + color secondary (ERROR/WARNING) + node name (12px `text.primary`) + message (11px `text.secondary`). Count in tab label: "Problems (2)" with `aria-live="polite"` on the tab so new problems announce.
- **Clicking a problem:** `selectProblem` + `selectNode` + canvas `setCenter` (pans to the node). Keyboard: Enter on a problem selects the node and moves focus to the canvas node. This is the canonical "click-to-focus" contract.
- **Empty:** "No problems. Workflow is valid." (12px `text.muted` centered — a positive empty state, reassuring not error-like). Closes audit §6 "not actionable" + plan §15.

### 9.5 Run tab (plan §15)

- Reads `runSlice`. Header: "Workflow Run" + state+progress (13px). A 2px progress bar at top (accent fill, status-colored). Body: per-node status list (plan §15) — each row 24px with status icon + name 12px + progress text when real. Clicking a row selects the node. Updates from `runSlice.perNodeStatus`.
- Per-node icons: ✓ success / ● running + % / ○ queued / × failed / — cancelled / – skipped. Status is icon+text, never color-only.
- **Empty (idle, no run yet):** "No run yet. Press Run to execute the workflow." (11px `text.muted`) + hint of the Run shortcut.

### 9.6 Artifacts tab (plan §15) — the home of Open Output

- Reads `runSlice.lastCompletedRunId` (+ future artifacts-list IPC). Rows: file icon + name (12px) + type/size (11px `text.muted`), e.g. `script.txt` / `result.json` / `final.mp4`.
- **Row actions** (inline buttons or a menu button with `aria-haspopup="menu"`): Preview, Open, **Open Folder** (uses `open_run_folder` IPC, audit §8 preserved, with `lastCompletedRunId` — replaces App.tsx:67 `currentRunId||1` hack), Copy Path. Each action has `aria-label="Open <filename>"` etc. Copy Path announces "Path copied" via a status toast.
- **THIS is where Open Output lives** (plan §5) — removed from always-visible toolbar prominence. The toolbar ⋯ "Open Output" entry is a secondary shortcut (enabled only when `lastCompletedRunId !== null`).
- **Empty:** "No artifacts yet. Run the workflow to produce outputs." (11px `text.muted`).

---

## 10. Global Dialogs & Feedback Contract

**Core invariant: NO `alert()` / `confirm()` / `prompt()`** (audit §5.2 — 5 blocking alerts). Replaced by a 3-tier feedback model.

### 10.1 Tier 1 — Toast (ephemeral, non-blocking)

- A toast region `role="region" aria-label="Notifications"` fixed bottom-right (above the dock if expanded, else bottom-right of screen). 280px max, `surface.elevated`, `border.default`, 6px radius, shadow, 8px padding, 11-12px text. Stack vertically (8px gap, max 3 visible, older drop off).
- Kinds: success (`status.success` dot, `aria-live="polite"`, auto-dismiss 5s), info (`text.muted` dot, `aria-live="polite"`, auto-dismiss 5s), error (`status.error` dot + "Details" expander, `aria-live="assertive"`, require-dismiss OR 6s auto-dismiss). Each has a close button `aria-label="Dismiss"`.
- Maps the 5 alerts (audit §5.2): save success → "Saved" toast + save chip; save error → error toast; run start failure → error toast; cancel/stop failure → error toast; copy path → "Path copied" status toast.
- `prefers-reduced-motion`: no slide-in, appears in place.
- **Dual-channel for errors (risk R4):** error toasts are ephemeral, BUT save/run errors ALSO reflect in the persistent toolbar save-state/run-state chips so the state is visible after the toast fades.

### 10.2 Tier 2 — Undo toast / inline confirm (for destructive/disruptive actions)

- **Undo toast** for reversible destructive actions: delete node, delete edge, clear console, stop run. Perform immediately, then show an "Undo" toast for 5-10s with a `<button aria-label="Undo <action>">`. `aria-live="polite"` ("Deleted <node>. Undo available."). Keeps keyboard flow uninterrupted — modals for confirmation are the #1 keyboard-flow killer. Stop run's toast is informational only in MVP1 (runs not resumable).
- **Inline confirm** for high-stakes irreversible actions (Delete Workflow, Delete Project — Phase 8): the destructive button's label changes to "Confirm delete" for 3s; a second press confirms. `aria-live="assertive"` announces "Press again to confirm — this cannot be undone." No modal.
- **Delete Node** (Inspector danger zone): uses inline confirm (§8.2).

### 10.3 Tier 3 — Modal dialog (rare, truly blocking flows only)

Reserved for: (1) **Unsaved-changes guard** (Save/Discard/Cancel) triggered on close-project, delete-workflow, new-project, and window close (Tauri `onCloseRequested`) when `saveSlice.dirty===true` — controller-level guard reading `dirty`, not per-component; (2) Settings sub-dialogs (e.g., Gemini API key entry); (3) Keyboard Help dialog (Ctrl+? / Cmd+?). (4) Delete project/workflow ONLY if inline-confirm proves insufficient in Phase 9 testing — default is inline-confirm.

When used:
- `role="dialog" aria-modal="true" aria-labelledby` (title) `aria-describedby` (description).
- Focus trap: focus moves to first focusable control on open; Tab cycles within; Escape closes and returns focus to the triggering button.
- Scrim `aria-hidden="true"`; background content gets `inert` (modern focus-trap mechanism, over manual tabindex juggling).
- No more than one modal at a time; `uiSlice.dialog` holds the single open modal — single source of truth for modal state, no component holds its own open/close `useState` for a global modal. Toasts queue separately (not modal).
- `prefers-reduced-motion`: no scrim fade (instant).

### 10.4 Global status announcer (a11y live region hub)

A visually-hidden (or compact bottom-strip) region `aria-live="polite" aria-atomic="true"` is the single canonical aria-live channel for transient spatial feedback so the app speaks its state to AT users without modals: selection changes ("Selected: AI Script", "Selection cleared", "3 nodes selected"), connection results ("Connected AI Script to Preview" / "Invalid: cycle"), library add-mode ("Selected Text Input. Click canvas to place, Escape to cancel."), run milestones ("Run completed", "Run failed at Media Merge"). This is the single canonical aria-live channel for transient spatial feedback so the app speaks its state to AT users without modals.

---

## 11. Run States Contract

One `runSlice.runStatus` drives consistent visuals everywhere (toolbar run line + right action, node status footer, Run tab header, dock collapsed summary). **Status is NEVER color-only — every state has a TEXT LABEL + an ICON + (color secondary).**

### 11.1 States

| State | Toolbar run line | Toolbar right | Node footer | Run tab | Dock collapsed |
|---|---|---|---|---|---|
| `idle` | breadcrumb + save chip only | "▶ Run" enabled (disabled if canvas empty) | no footer | "No run yet. Press Run to execute the workflow." | "Run · idle" |
| `starting` | (brief) "Starting…" | spinner + disabled + `aria-busy` | no footer | "Starting…" | "Run · starting" |
| `running` | "Running · 42%" (or "Running" when `runProgress===null`) | "■ Stop" | per-node "Running 63%" / "Queued" / "✓" / "✕" | "Running · 42%" + per-node list | "Running 42%" |
| `succeeded` | "Completed" (fades to idle after 3s) | "▶ Run" | ✓ on each | "Completed" | "Run · completed" then idle |
| `failed` | "Failed · see Problems" (STICKY, no fade) | "▶ Run" | ✕ on failed node, ○ skipped on downstream | "Failed" + failed node highlighted | "Failed" |
| `cancelled` | "Cancelled" (fades to idle after 3s) | "▶ Run" | ⊘ on cancelled/in-progress | "Cancelled" | "Cancelled" then idle |

### 11.2 Per-node status system (plan §12)

Idle, Queued, Running, Success, Warning, Failed, Cancelled, Skipped. Icons: ○ idle/queued, ● running, ✓ success, △ warning, ✕ failed, ⊘ cancelled, – skipped. **Restraint invariant: NEVER saturate the node background** (plan §12). Status is a footer strip + small badge + thin 2px left-edge accent — never a full-card color wash. Running progress shows a number ONLY when `progress!==null` (plan §12); spinner-without-number when running but progress unknown. Per-node progress announcements throttled to ≤1/sec via `aria-live="polite"`.

### 11.3 Transitions

- `idle → starting` on Run click; `starting → running` when `runId` returns.
- `running → succeeded | failed | cancelled` on terminal event.
- Terminal → `idle` after fade: 3s for `succeeded`/`cancelled`; `failed` stays sticky until user dismisses or starts a new run. Fade is a controller-managed timer on `runSlice`, not a component animation.
- **On failure:** auto-open the Problems tab (dock expands if collapsed, switches to Problems) + a failed toast with "Details" expander + `aria-live="assertive"` announce ("Run failed at <node>: <reason>").

### 11.4 MVP1 per-node status fallback (audit §9 additive, audit §8 IPC preserved)

The backend may not emit dedicated per-node status events yet. The controller INFERS `perNodeStatus` from `workflow-log` events (a log from node X at INFO = running; run completion = success for all nodes that logged; an ERROR log = failed for that node). Overall progress: if no progress events, show indeterminate (no %). This is lossy (risk R2) — it may miss queued/skipped/cancelled. **The slice shape is forward-compatible:** when the backend adds status events, only the controller's derivation layer changes; no UI changes elsewhere. `AppNodeData` keeps an optional status mirror for rendering only; authoritative per-node status lives in `runSlice.perNodeStatus` to avoid stale React Flow `node.data` cache during runs.

---

## 12. Empty States Contract

Every empty state is a real panel with a sentence + a single primary action where applicable. No blank zones. All empty states are `aria-live="polite"` on first appearance, then static. Empty-state action buttons are the first focusable element in their zone when entered via F6, so keyboard users land on the action immediately.

| Surface | Empty state |
|---|---|
| Canvas (no nodes) | Plan §10 overlay (§7.1): "Build your workflow" + "Drag a node from the library, or press Tab to focus the library and press Enter to add." + templates. Removed from DOM at first node. |
| Node Library search (no match) | 'No nodes match "<query>"' + "Clear search" button. |
| Console (no logs) | "No logs yet. Run the workflow to see output." (preserved from current ConsolePanel:35). Filters present but disabled with `aria-disabled`. |
| Problems (none) | "No problems. Workflow is valid." (positive empty state). |
| Run (no run) | "No run yet. Press Run to execute the workflow." + Run shortcut hint. |
| Artifacts (none) | "No artifacts yet. Run the workflow to produce outputs." |
| Inspector (nothing selected) | Workflow Inspector renders — NOT empty (no dead panel, §8). |
| Projects (Phase 8) | "No projects yet. Create one to start." + "New Project" button. |
| History (Phase 8) | "No runs yet. Your run history will appear here." |
| Settings (Phase 8) | N/A — settings always has fields. |

All empty states: 12-14px text, `text.muted`/`text.secondary`, centered, no illustration (restrained, plan §7 "avoid overly decorative" — a single line of text is the density-first choice). Never a dead-end.

---

## 13. Selection States Contract

Selection is independent of run state (selecting a running node does not pause it; Inspector shows config + run info together). Selection is always mirrored to `selectionSlice`, and focus and selection are coupled but distinct (you can focus a node without selecting it; selecting always moves focus for AT). Selection is synchronous with Inspector — Inspector reads `selectionSlice` and re-renders immediately, no pending-selection state.

| Mode | Visual | Inspector | Keyboard | Esc |
|---|---|---|---|---|
| **None** | no ring; canvas background interactive | Workflow Inspector | n/a | no-op |
| **Single node** | 2px `--border-focus` ring + `surface.elevated` lift; visually-hidden "Selected" in accessible name | Node Inspector | Enter/Space on focused node selects + opens Inspector; Arrow keys nudge 1px (Shift=10px); Delete removes (inline confirm); Ctrl/Cmd+D duplicates | clears |
| **Single edge** | 2px accent stroke + endpoints emphasized + "from <source> → <target>" label | Connection Inspector | Tab reaches an edge; Enter/Space selects; Delete removes (undo toast) | clears |
| **Multi (2+)** | faint ring on each + count badge "N selected" in toolbar (text, `aria-live="polite"`) | Multi-select Inspector (count + bulk delete/align, no per-node config) | Ctrl/Cmd+click toggles membership; Shift+drag or Shift+Arrow extends marquee; Delete removes all (confirm) | clears |

- **Click-away** (canvas background) clears selection. **Esc** clears selection (first Esc); if a modal/dialog is open, Esc closes that first (focus trap). Second Esc from canvas exits canvas focus to the toolbar.
- `clearSelection()` bound to Esc + canvas background click.
- React Flow `onSelectionChange` is the canonical multi-select writer; single-select click routes through `selectNode`/`selectEdge`.
- Selection ring uses the SAME `--border-focus` accent as focus-visible rings, so selection and keyboard focus look consistent (a11y principle). Selected node is always above unselected in z-order.
- **Multi-select in MVP1:** the slice supports it (`multiSelectIds`, `selectionMode==='multi'`); the Multi-select Inspector is minimal (count + bulk delete/align). Full rubberband/Shift+click is Phase 5+ — spec records it; MVP1 graphs are small (≤20 nodes). The accessibility proposal's full multi-select a11y (count announcement, bulk actions) is frozen here so Phase 5 implements against it.

---

## 14. Node-Type Reconciliation (audit §5.1, frontend-only single source of truth)

**Problem (audit §5.1):** three lists disagree — Rust `NodeRegistry` (9 types), frontend palette `NODE_TYPES` (12), frontend `nodeTypes` map (10). Consequences: `saveText`/`saveJson` render broken-but-executable; `saveArtifact`/`preview`/`markdownNote` render fine but the executor won't recognize them. This is contract drift.

**Solution (spec-level, additive — audit §9.1, NO Rust edits in the UI phase):** a frontend single source of truth, `src/nodes/registry.ts` (to be created in Phase 3), exports a `NodeDefinition[]` array:

```ts
type NodeDefinition = {
  type: string;
  label: string;
  category: 'INPUT'|'TEXT'|'AI'|'MEDIA'|'UTILITY'|'OUTPUT';
  icon: IconName;
  description: string;
  keywords: string[];
  ports: { in: Port[]; out: Port[] };
  configSchema: ConfigField[];      // drives the generic Inspector
  inspectorTabs: string[];           // drives which tabs render
  executable: boolean;               // false for markdownNote (by design)
  registryState: 'canonical' | 'frontend-only';
};
```

The Node Library renders from this; the Canvas `nodeTypes` map is GENERATED from this; the Inspector config form is generated from `configSchema`. **Three lists become one** — you cannot add a node to the palette without also declaring its `nodeTypes` entry, ports, and config.

### 14.1 Reconciliation table

| type string | Rust | palette | nodeTypes | registryState | Action |
|---|---|---|---|---|---|
| `textInput`, `textTransform`, `delay`, `aiScript`, `fileInput`, `mediaInfo`, `mediaMerge` (7) | ✓ | ✓ | ✓ | `canonical` | No change. |
| `saveText`, `saveJson` (2) | ✓ | ✓ | ✗ | `canonical` (after Phase 3) | Phase 3 adds them to the GENERATED `nodeTypes` map (pointing at BaseNode) so they render. No Rust change. Pure frontend fix. |
| `saveArtifact`, `preview` (2) | ✗ | ✓ | ✓ | `frontend-only` | Keep in palette + `nodeTypes`; badge "Not executable yet" (`status.warning`, 10px, text+icon not color-only) in the library and on the node card; Run is BLOCKED — Problems tab reports "Node type <type> not registered in backend" before run starts, with a toast. |
| `markdownNote` (1) | ✗ | ✓ | ✓ | `frontend-only` (by design) | Keep; `executable: false` by design (a note card, plan §21 — non-executable, no run footer). Badged "Note" (not "Not executable yet") since it's intentionally non-executable. |

**Net:** 9 executable-in-Rust + `markdownNote` (non-executable by design) + `saveArtifact`/`preview` (2 flagged frontend-only) = 12 palette entries. The drift is made VISIBLE to the user instead of silently producing a broken-but-saved node (audit §5.1 consequence).

### 14.2 Run guard for frontend-only nodes

When a Run is attempted and the graph contains any `registryState==='frontend-only'` executable node (`saveArtifact`, `preview`), the controller blocks the run BEFORE `start_run` and surfaces a Problems entry: "Node type <type> not registered in backend. Remove or replace this node, or wait for backend support." + a toast. This is honest UX — the user learns the limitation before a confusing run (risk R3). `markdownNote` does NOT block (it's non-executable by design and skipped by the backend naturally).

### 14.3 Backend reconciliation — out of scope

Backend reconciliation (adding `saveArtifact`/`preview`/`markdownNote` to Rust, or removing them from frontend) is a SEPARATE backend decision (audit §11 Q2), explicitly out of scope for the UI phase. When the backend adds them, `registryState` flips to `canonical` with NO UI changes elsewhere — the flag is a property in the registry module, not scattered; one edit clears it.

### 14.4 Timing

This MUST be reconciled BEFORE or DURING Phase 3 (audit §9.1) so the Workspace Shell ships with one list. No Rust edits in this phase.

---

## 15. Keyboard Shortcuts (global, frozen)

| Shortcut | Action |
|---|---|
| F6 / Shift+F6 | Cycle zone landmarks forward / backward |
| Alt+1..4 | App Rail: Workflow / Projects / History / Settings |
| Ctrl/Cmd+Shift+B | Toggle App Navigation Rail |
| Ctrl/Cmd+B | Toggle Node Library |
| Ctrl/Cmd+I | Toggle Inspector |
| Ctrl/Cmd+J | Toggle Bottom Dock |
| Ctrl/Cmd+S | Save |
| Ctrl/Cmd+Enter | Run |
| Esc | Clear selection (then exit canvas); close modal/menu/popover |
| Ctrl+? / Cmd+? | Keyboard Help dialog |
| Enter / Space | Activate focused control; library item add-mode; canvas node select; port connect |
| Delete / Backspace | Delete selected node/edge (confirm) |
| Arrow keys | Rail nav; library item nav; canvas nudge (Shift=10px); splitter resize |
| `c` | Connect from a focused output port |

Stop is a deliberate button click only — Esc does NOT cancel a run (too easy to hit accidentally).

---

## 16. Open Questions Resolved (audit §11)

1. **Where should execution state live?** → RESOLVED. HYBRID: Zustand `runSlice` (single store, scoped selectors) owns declarative run state; `useWorkflowController` is the single writer and the only `invoke()`/`listen()` caller. `workflow-log` subscription moves from ConsolePanel into the controller, feeding `consoleSlice` + `runSlice`. App.tsx local state (`currentRunId`, `dbPath`, `error`) migrates into `runSlice` + `uiSlice.health`. See §2.

2. **Should `saveArtifact`/`preview`/`markdownNote` be registered in Rust or removed?** → RESOLVED FOR UI. Stay in frontend palette as `registryState:'frontend-only'`, badged "Not executable yet" (saveArtifact/preview) or "Note" (markdownNote, non-executable by design). Run is blocked when the graph contains frontend-only executable nodes, with a Problems entry. Backend registration is a flagged backend decision, not made here. See §14.

3. **Is `projectId:1` hardcode acceptable through the UI redesign?** → RESOLVED. Yes, through Phase 7. `projectSlice.projectId` defaults to `1` (preserves audit §8 IPC). Breadcrumb shows the single project name ("My Project" with a tooltip "Single-project mode" in MVP1). Phase 8 (Projects) introduces real selection; spec is forward-compatible (`projectSlice` already holds `projectId`/`projectName`/`workflowName`), no IPC signature changes.

4. **`identifier` rename safe?** → OUT OF SCOPE for Phase 1 (native identity pass). Flagged for Phase 3 or a dedicated identity pass. Spec uses "Void Workflow" as the display name in toolbar/breadcrumb/window title; bundle identifier change has bundling implications (audit §3) and must be confirmed before doing it. No recommendation either way; spec does not depend on it.

5. **`isValidConnection` cycle recursion depth guard?** → OUT OF SCOPE for UI (audit confirms). Cycle guard preserved as-is (audit §8); depth guard is a backend/large-graph concern, not workspace UX. For MVP1-scale graphs (≤20 nodes) it is fine. Revisit at MVP2 scale. Noted, not addressed.

**Additional plan-level ambiguities resolved by this spec:**
- Minimap: OFF by default, toggleable, `aria-hidden` (§7.2).
- Context menu: deferred — not in Phase 1 freeze (§7.2).
- Multi-select: slice supports it; full rubberband/Shift+click is Phase 5+ (§13).
- Undo/Redo: omitted in MVP1 toolbar (no dead controls); reintroduce Phase 3 (§5.3).
- Open Output home: Artifacts dock tab (primary) + toolbar ⋯ menu (secondary, context-gated) — not globally prominent (§5.3, §9.6).
- Health: center toolbar pill (primary, default widths) + rail bottom dot (fallback, narrow widths) + popover (§5.2, §4).
- Inspector when nothing selected: Workflow Inspector — never empty (§8.1).
- Dock default state: collapsed (28px summary bar) (§9).
- Node card saturation: never full-background; status via footer icon+text+thin progress bar + 2px left-edge accent only (§11.2).
- Template buttons on empty canvas: 2 templates, clickable, removed from DOM at first node (§7.1).
- Console line wrapping: wrap (`pre-wrap`) — no horizontal scroll (§9.3).
- Stop confirmation: no modal — immediate stop + informational toast (§10.2).
- Save state location: `dirty` in `saveSlice` (synchronous), `saveStatus` in controller-driven `saveSlice` (async result) (§2.1).
- Focus on app boot: workflow title region, not Run (footgun avoidance) (§5.5).
- Inspector for running node: same Node Inspector with a live Run section (mode-merge, not a 5th mode) (§8.1).
- Toolbar during run: stable layout — only run line + Run→Stop swap change; Save disabled-with-tooltip (not hidden) (§5).

---

## 17. Coverage Check (plan §17 Phase 1 freeze items)

- **App navigation** → §4 (App Rail: items, active state, collapse, keyboard, MVP1 disabled screens).
- **Top toolbar** → §5 (three regions, save chip, health, run line, Run/Stop, ⋯ menu, stable-layout run variant).
- **Node library** → §6 (search, categories, item anatomy, drag + keyboard-add, empty-search, MVP2 scale).
- **Canvas** → §7 (empty state, controls, minimap, context menu, selection, ports, edges, a11y).
- **Inspector** → §8 (4 modes + running-node mode-merge, generic tabbed structure, PropertyRow primitives, danger zone, empty state, focus management).
- **Bottom dock** → §9 (Console/Problems/Run/Artifacts, collapsed summary, expanded structure, a11y, Open Output home).
- **Global dialogs** → §10 (3-tier: toast / undo+inline-confirm / modal; status announcer; no alert/confirm/prompt).
- **Run states** → §11 (status table, per-node system, transitions, MVP1 fallback).
- **Empty states** → §12 (every surface enumerated).
- **Selection states** → §13 (none/node/edge/multi, keyboard, Esc, click-away, focus vs selection).

All 10 freeze items covered. Audit §8 keep-list respected (6 IPC contracts, Zustand graph shape, React Flow cycle guard, drag-drop keys, `screenToFlowPosition`, Tauri event pattern, `cn()` util, semantic HTML). Audit §9 additive migration respected (no Rust edits; shell built around existing components; controller hook moves IPC out of App.tsx). Node-type reconciliation (audit §5.1) specified frontend-only (§14). All 5 audit §11 open questions resolved (§16).

---

## 18. Risks (carried forward)

- **R1 — Controller hook becomes a god-object.** Mitigation: exposes only `run`/`stop`/`save`/`openFolder`/`init` + internal event setup; never holds `useState`/`useRef` except transient timers; all writes go through slice actions; Phase 10 reviews its size.
- **R2 — `perNodeStatus` inferred from `workflow-log` in MVP1 is lossy.** Mitigation: slice shape is forward-compatible; inference is MVP1-only and lives entirely in the controller; only the controller changes when the backend adds status events.
- **R3 — Frontend-only nodes blocking Run may confuse users.** Mitigation: "Not executable yet" badge visible in library before drag; Problems message is actionable ("Remove or replace this node, or wait for backend support"); honest UX beats silently-broken nodes (audit §5.1).
- **R4 — One Zustand store risks re-render storms.** Mitigation: every consumer uses scoped selectors; slices are logical not physical (one store, many selectors); Phase 10 uses React DevTools profiler on the 10 acceptance screenshots (plan §28).
- **R5 — Persisted zone widths may conflict across window sizes.** Mitigation: clamp to min/max on load; reset to defaults if window narrower than sum of min widths; auto-collapse Library/Inspector before starving canvas; dock collapses first if vertical < 600px. No crash, no horizontal scroll.
- **R6 — `alert()` removal changes feedback timing; users may miss the non-blocking Saved chip.** Mitigation: chip in center-left region (high visibility), 2.5s fade (long enough to read), save errors produce a persistent toast + `saveStatus:'error'` that does not fade; dual-channel (ephemeral toast + persistent chip) for errors; Phase 9 verifies chip is announced.
- **R7 — Phase 1 is spec-only; drift between spec and Phase 3 implementation.** Mitigation: this spec is the binding input to Phase 3; any deviation requires editing this document first; the slice inventory (§2) and zone layout (§3) are the contract. Each downstream phase's DoD should reference this spec's a11y invariants (keyboard-add, aria-live, status-not-color, focus-visible, no-alert).
- **R8 — `role="application"` on canvas traps screen-reader users.** Mitigation: explicit "Exit canvas" affordance (Esc → Esc exits to toolbar); Keyboard Help dialog documents canvas keys; Phase 9 must test with a real screen reader (audit §10 skill gap — agent-browser can't attach to the Tauri webview; a manual SR test is required).
- **R9 — Dark-first token system (Phase 2) is a prerequisite for the visual contract.** Mitigation: spec references token NAMES only; Phase 2 owns the values; Phase 3 must not ship with raw color literals (would reintroduce audit §5.4 debt).
- **R10 — Keyboard node-add (pick-up + click-to-place) is novel; may not be discovered.** Mitigation: empty-state guidance names the keyboard path; library items have a visually-hidden hint "drag or press Enter to add"; the status announcer speaks add-mode state. Phase 4 MUST NOT ship drag-only — the spec forbids it.

---

## 19. Definition of Done (Phase 1)

No major workspace-level UX ambiguity remains. This document covers every plan §17 Phase 1 freeze item, resolves every audit §11 open question, respects audit §8 and §9, specifies the node-type reconciliation approach frontend-only, and is concrete enough that Phase 2 (design system) and Phase 3 (workspace shell) can proceed without further UX ambiguity. Phase 2 owns token values; Phase 3 owns implementation against this contract.