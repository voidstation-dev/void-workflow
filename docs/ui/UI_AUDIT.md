# Void Workflow — UI Audit (Light UI Phase 0)

**Phase:** UI Phase 0 — Repository & Runtime Audit (Light UI track)
**Status:** DONE
**Date:** 2026-08-13
**Spec:** [VOID_WORKFLOW_LIGHT_UI_SPEC.md](../../VOID_WORKFLOW_LIGHT_UI_SPEC.md) (all 40 sections)
**Scope:** Frontend only. No Rust workflow-engine / backend-architecture changes. No `.rs` edits except `tauri.conf.json` identity/window strings.
**Method:** Full source inspection (every shell/canvas/node/screen/primitive + store + controller) + runtime launch + 10-subsystem parallel gap-audit vs the Light spec, synthesized. Skills in effect: `audit-context-building` (build understanding, not verdicts), `web-design-guidelines`.

> This audit **builds understanding, not verdicts**. It maps what the merged dark UI
> is, what the light UI wants, where the gaps and contract conflicts are, and which
> phase owns each fix. No application source was modified in Phase 0. The redesign
> starts in Phase 1.

---

## 1. Executive Summary

The app on `main` is a **mature dark-first** Tauri v2 + React Flow desktop
workflow-builder. A prior dark UI redesign (Phases 0–10, commit `9d937ed`, merged via
PR #1) already landed: a 5-zone CSS-grid shell (header / AppRail + left NodeLibrary +
canvas + right Inspector / bottom observability dock), a single `BaseNode` renderer
driven by a 12-node registry, a `configSchema`-driven Inspector, and a controller that
owns all 6 IPC commands. It is a **valid, functional, a11y-aware** application — not a
prototype. The app launches clean via `npm run tauri:dev`; the prior Zustand
infinite-loop bug is fixed and gone.

The Light UI target ([spec](../../VOID_WORKFLOW_LIGHT_UI_SPEC.md)) **inverts the shell
structure** rather than restyle it:

- A header row + a **secondary tab row** (Workflow / Settings / Runs / Environment)
  **replacing the left AppRail**.
- A **SINGLE right column** that swaps **Build ↔ Inspector** on node selection
  (replacing the current separate left-NodeLibrary + right-Inspector columns).
- **White compact node cards** with description + metadata chips (replacing the bare
  identity-row `BaseNode`).
- A **horizontal bottom CANVAS toolbar** (Outline/Detail, Undo/Redo, Fit, −100%+,
  Minimap) — distinct from the existing bottom observability dock.
- A visual **Start marker** ("▶ Start here", not a node).
- A **light neutral token palette** (canvas `#F7F7F5`, panels `#FFFFFF`, accent
  `#5267E9`).

The migration is **essentially presentation-only**: the `@theme inline` token system
in [App.css](../../src/App.css) is `var()`-based, so a light `:root` override
retargets every utility automatically, and **no Rust/IPC contract is touched**.

The **one hard-contract conflict** is `colorMode="dark"` on React Flow
([WorkflowCanvas.tsx:324](../../src/components/canvas/WorkflowCanvas.tsx#L324)) — a
recorded frozen §27 contract item — which the light redesign must flip to `"light"`.
This needs **explicit sign-off**, not a silent restyle.

**Biggest risks:**
1. **Build↔Inspector single-column restructure** — a blocker-sized change touching
   the `WorkspaceShell` grid, uiSlice layout keys, and the `persist partialize`
   shape. Must stay LAYOUT-ONLY and keep `selectionMode`/`selectedNodeId` as stable
   scalar selectors (the infinite-loop trap that bit us before).
2. **shadcn install decision** — zero shadcn today; the spec wants ~18 primitives but
   the [App.css:123-131](../../src/App.css#L123) alias block documents a prior
   `--accent`-shadow bug that broke Run/Save buttons.
3. **Undo/Redo** — no graph-history store exists; must stay client-side, never
   invoking the backend.
4. **Environment health honesty** — the frozen Rust backend means FFmpeg/FFprobe/
   Gemini/Storage rows can only be 'configured'/'unknown', never truly probed.
5. **RULES category** — new; renders empty until an MVP2 Condition node exists.

The audit maps cleanly onto Phases 1–10. See
[docs/UI_LIGHT_REDESIGN_STATUS.md](../UI_LIGHT_REDESIGN_STATUS.md) for the per-phase
plan.

---

## 2. Current Implementation Map (the dark UI on `main`)

### 2.1 Component tree (actual)

```
main.tsx → App.tsx (controller + WorkspaceShell)
WorkspaceShell.tsx            ← 5-zone CSS grid (rows 48px/1fr/auto)
├── TopToolbar.tsx            ← header: breadcrumb + SaveStateChip + RunStateLine
│                                + center HealthPill + Save + Run/Stop + OverflowMenu
├── AppRail.tsx               ← 56px LEFT icon-only nav (Workflow/Projects/History/Settings)
├── NodeLibrary.tsx           ← LEFT aside: search + 6 categories + drag/keyboard-add
│   └── NodeLibraryItem.tsx    ← 28px row primitive (§11.10)
├── CanvasContainer.tsx → WorkflowCanvas.tsx
│   └── ReactFlow (colorMode="dark", fitView, isValidConnection, addModeNodeType channel)
│       ├── Background (dots) + Controls (vertical) + MiniMap (off) + Panel(Fit/zoom%)
│       └── nodeTypes → BaseNode (single renderer for all 12 types)
├── Inspector.tsx             ← RIGHT aside: mode-switching (none/node/edge/multi)
│   └── NodeInspector (config from def.configSchema) / ConnectionInspector / MultiSelectInspector
├── BottomDock.tsx            ← footer: Console/Problems/Run/Artifacts tabs
├── ToastRegion / StatusAnnouncer / KeyboardHelpDialog / UnsavedGuardDialog
└── screens: ProjectsScreen / HistoryScreen / SettingsScreen (rendered on screen switch)
```

There is **no secondary tab row**, **no right Build panel**, **no Build↔Inspector
swap**, **no start marker**, **no bottom canvas toolbar**, **no node-card summary
body or metadata chips**, **no Undo/Redo**, and **no Environment screen**. These are
the structural gaps the light redesign closes.

### 2.2 React Flow setup

- `@xyflow/react` v12, **`colorMode="dark"`** ([WorkflowCanvas.tsx:324](../../src/components/canvas/WorkflowCanvas.tsx#L324) — frozen contract), `fitView`.
- `nodeTypes` generated from the registry ([nodeTypes.ts](../../src/nodes/nodeTypes.ts)) → all 12 types map to one `BaseNode` (no Phase-0 drift).
- `Background color="var(--surface-canvas-grid)" gap={24}` (dark dots).
- `Controls` (vertical, bottom-left) + a bottom-right `Panel` (Fit + zoom%).
- `isValidConnection` cycle guard (recursive `getOutgoers`, no depth guard — out of scope).
- Drag-drop reads `application/reactflow` + `application/reactflow-label`; `screenToFlowPosition`; single `placeNode` → `addNode` path (drag + keyboard-add identical).
- `styledEdges`: selected → accent 2px; run-payload → animated dashed `--status-running` (CSS in [App.css:208-228](../../src/App.css#L208)).
- Cross-zone channels: `addModeNodeType` (library→canvas keyboard-add), `pendingCenterNodeId` (dock Problems→canvas `setCenter`).

### 2.3 State (Zustand, 8 slices in one store)

[workflowStore.ts](../../src/store/workflowStore.ts): graphSlice / selectionSlice /
runSlice / saveSlice / consoleSlice / problemsSlice / uiSlice / projectSlice.

- **`persist.partialize` is LAYOUT ONLY** ([workflowStore.ts:535-545](../../src/store/workflowStore.ts#L535)): `appRailCollapsed/libraryCollapsed/libraryWidth/inspectorCollapsed/inspectorWidth/dockCollapsed/dockHeight/dockTab/minimapOn`. **Verified: `activeScreen` is NOT persisted** — the LAYOUT-ONLY contract is intact (an open question from the audit, resolved here).
- **Selectors must return stable refs** — a selector returning `new Set(...)`/new object/new array allocates on every snapshot check → `useSyncExternalStore` `Object.is` fails → infinite loop. The prior `BottomDock` ProblemsPanel bug (fixed: select the stable `nodes` array + `useMemo` the Set) is the canonical example. Every new selector in the light redesign must be reviewed against this.
- Execution state lives in the store (runSlice + perNodeStatus); the controller is the sole `invoke()` caller ([useWorkflowController.ts](../../src/hooks/useWorkflowController.ts)) and the sole writer of run terminal states via `inferRunCompletion`.
- `Health` model: `{backend, sqlite, ffmpeg, gemini}` all optimistically defaulted `'ready'` ([workflowStore.ts:475](../../src/store/workflowStore.ts#L475)); the controller only ever sets `backend`. Dishonest for sqlite/ffmpeg/gemini — Phase 9 fixes this honestly.

### 2.4 Styling system

- **Tailwind v4** via `@tailwindcss/vite` (CSS-config, no `tailwind.config.*`).
- [App.css](../../src/App.css) holds a full dark-first token system: `:root` vars (surface/border/text/accent/status/port/radius/shadow/motion/z-index) + `@theme inline` mapping to utility namespaces. `color-scheme: dark` in `:root` ([App.css:10](../../src/App.css#L10)) and `@layer base html` ([App.css:326](../../src/App.css#L326)); `<html class="dark">` in [index.html](../../index.html).
- A shadcn-alias block ([App.css:123-149](../../src/App.css#L123)) maps `--background/--foreground/--primary/--border/--radius` etc. to the semantic vars. The `--accent`/`--accent-foreground` slots are **intentionally omitted** with a documented warning that they previously shadowed the semantic `--accent` and broke Run/Save buttons.
- `cn()` (clsx + tailwind-merge) is used throughout. `lucide-react` icons throughout.
- **shadcn is NOT installed** (no `components.json`, no `@radix-ui` deps; `package.json` has only clsx + tailwind-merge as shadcn prereqs).

### 2.5 Tauri IPC surface (UI → Rust) — frozen, 6 commands

All from the controller; camelCase params: `init_project`, `load_workflow{projectId}`,
`save_workflow{projectId,graphJson}`, `start_run{projectId,graphJson}`,
`cancel_run{runId}`, `open_run_folder{runId}`. No new IPC may be added in the light
redesign.

---

## 3. Gap analysis (current dark UI vs Light spec)

### 3.1 Gap roster (severity → phase; full detail in §4 per subsystem)

| ID | Area | Sev | Phase | Summary |
|---|---|---|---|---|
| G-1 | shell | **blocker** | 3 | Build↔Inspector single-column swap: current grid has two columns (left Library + right always-present Inspector); spec §15 wants ONE right column = Build by default → Inspector on select → Build on deselect. `selectionMode`/`selectedNodeId` are the stable-scalar driver. `WorkflowInspector` 'none' mode becomes orphaned; its workflow-name edit must move to Settings/breadcrumb. |
| G-2 | tokens | major | 1 | `colorMode="dark"` frozen-contract item + `color-scheme:dark` in three places. Light needs `colorMode="light"` (sign-off) + light color-scheme. `@theme inline` is var()-based so a light `:root` override retargets everything. |
| G-3 | tokens | major | 1 | Full light palette missing (all surface/border/text/accent tokens are dark). Spec §24: canvas `#F7F7F5`, panels `#FFFFFF`, border `#E6E7E9`, text `#17181A`/`#64676D`/`#92969E`, accent `#5267E9` (current is blue `#1d6fd0` — whole hue family shifts across edges/selection/focus/Run). |
| G-4 | tokens | major | 1 | Radius below spec: control 4px / panel 6px vs §25 node 10-12px / panel 12px / button 7-9px / chip 5-6px. No `--radius-node`/`--radius-chip`. |
| G-5 | tokens | major | 1 | Shadow dark-tuned: `--shadow-node` alpha 0.35 vs §25 0.05 (7× too strong); popover/modal 0.45/0.5 too strong for white. Need light-tuned shadows + a selected-card variant (ring AND stronger shadow). |
| G-6 | nodes | major | 4 | No node-card summary body: `BaseNode` renders identity + ports + status footer only. Spec §6/§7/§13/§32 wants title + short description + metadata chips. `def.description` exists but unused; no per-def `summarize(data)→chips` helper. Width 200-220px < spec 240-300px. |
| G-7 | shell | major | 2 | No secondary tab row; nav is left AppRail. Spec §3.B wants horizontal Workflow/Settings/Runs/Environment tabs replacing the rail. `ActiveScreen` union must drop `projects`, rename `history`→`runs`, add `environment`. Alt+1..4 roving tabindex must re-home onto tabs. `ProjectsScreen` has no spec equivalent. |
| G-8 | shell | major | 2 | Header missing required search box (§3.A). Right side = Save+Run/Stop+Overflow (3 actions); spec wants search + ≤5 actions incl state-driven "Retry Failed" (failed) and prominent "Open Output" (completed). |
| G-9 | canvas | major | 6 | No horizontal bottom canvas toolbar. Current = vertical RF `Controls` + bottom-right Fit/zoom% Panel. Spec §17 wants CanvasToolbar: Outline/Detail, Undo/Redo, Fit, −100%+, Minimap. No Outline/Detail flag; no graph-history store. |
| G-10 | canvas | major | 6 | No StartMarker (§5/§31/§27). Empty state is a top-center "Build your workflow" Panel + two template buttons. Spec wants "▶ Start here" pill (NOT a node) + "Drag a block from Build / + Add first node". Must stay out of registry/nodeTypes (addNode single-path contract). |
| G-11 | screens | major | 9 | No Environment screen/tab (§20). Health model only `{backend,sqlite,ffmpeg,gemini}` all `'ready'`; controller only sets backend. Spec wants 6 rows (Tauri/SQLite/FFmpeg/FFprobe/Gemini/Storage); ffprobe/storage missing. Health is a center header pill, not a tab. Need honest 'unknown' state. |
| G-12 | screens | major | 9 | Settings is app-level, not workflow-level. Spec §21 wants Name/Description/Execution(api+media concurrency)/Output(default folder+resolution)/Behavior(auto-save). No backend IPC for these (frozen) — must stay frontend-local or disabled honestly; must NOT enter `partialize`. |
| G-13 | infra | major | 1 | shadcn not installed. Spec §26 wants ~18 primitives. Prereqs present. App.css has the alias block but the `--accent` trap is documented. Decision required before Phase 2/3: hybrid install vs restyle-only. |
| G-14 | infra | partial | 4 | 13 of §27's 18 reusable components missing (WorkflowHeader, WorkflowTabs, BuildPanel, BuildCategory, BuildNodeItem, WorkflowNode, NodeHeader, NodeMeta, StartMarker, NodeInspector-named, CanvasToolbar, ZoomControls, RunStatus, EnvironmentStatus). 5 exist (PropertyRow, InspectorSection, NodeStatus, EmptyState, ToolbarButton). NodeInspector is only a mode branch inside Inspector.tsx. |
| G-15 | nodes | partial | 4 | No Outline/Detail node-card mode (§18). `BaseNode` renders one anatomy; no uiSlice flag. Persist as LAYOUT ONLY (scalar). |
| G-16 | canvas | partial | 6 | No Undo/Redo; no graph-history stack (only run history). Must be client-side in-store (past/future of nodes+edges), never `invoke()`; excluded from `partialize`. |
| G-17 | buildpanel | partial | 3 | Missing RULES category (registry has 6; spec §8 wants 7 — adds RULES). No node maps to RULES yet (empty until MVP2 Condition). |
| G-18 | buildpanel | partial | 3 | Build item styling below spec: 28px / 4px radius / flat hover vs §10 42-48px / 8px radius / white bg / hover elevation. Badges only Note/Not-executable vs New/Beta/Experimental. |
| G-19 | inspector | partial | 5 | No "← Back to Build" header (§15/§16). Inspector header = mode title + collapse chevron. No "Advanced" collapsible section (§16) — `ConfigField` has no `advanced` flag. |
| G-20 | runlogs | major | 8 | Artifacts honest major gap: only "Open Output Folder". Spec §23 wants per-file list + Preview + Copy Path. No artifacts-list IPC and cannot add one. Keep honest; do NOT stub fake rows. |
| G-21 | runlogs | partial | 2 | Run history is a full-screen table via AppRail "History", session-only. Spec §3.B/§22 wants a "Runs" tab with Today grouping + ✓/× rows + workflow name + failed-at. `HistoryEntry` may lack `workflowName`. |
| G-22 | tokens | partial | 1 | Status tokens dark-tuned; `--status-running` tracks old accent. Spec §24 wants muted tones re-contrasted on white (fresh contrast pass, not copied). |
| G-23 | nodes | partial | 1 | Port color tokens dark-tuned; on white may read neon (§1 "avoid neon"). Shape+icon remain primary cue (compliant); connected-fill vs 0.4-opacity may need re-tuning. |
| G-24 | canvas | partial | 6 | No branch labels (§12). Edges support optional `data.label` but no Yes/No/Matched/Fallback and no Condition node. Stub via `data.label` in Phase 6; real labels depend on MVP2 Condition. |
| G-25 | shell | minor | 1 | Responsive collapse uses 0px column tracks; no drawer/sheet. Spec §9/§29 wants Build panel → drawer/sheet at small widths. tauri window 1280×800 → min 1200×760 / default 1440×900. |
| G-26 | canvas | minor | 6 | Edge type is 'default' bezier. Spec §11 prefers orthogonal/soft-elbow. Optional Phase 6 restyle (presentation only). |

### 3.2 Definition of Done (spec §39, current state)

| # | Criterion (spec §39) | Current | Closes in |
|---|---|---|---|
| 1 | Light neutral workspace shell (canvas #F7F7F5, panels #FFFFFF, border #E6E7E9, color-scheme:light, colorMode="light") | unmet | Phase 1 + 6 |
| 2 | Workflow context clear in header (breadcrumb + search) | partial | Phase 2 |
| 3 | Secondary tabs (Workflow/Settings/Runs/Environment) replacing AppRail | unmet | Phase 2 |
| 4 | Build panel on the right (categorized, searchable, draggable, drawer at small widths) | unmet | Phase 3 |
| 5 | Build panel categorized + searchable | partial | Phase 3 |
| 6 | Canvas clean, centered, light, dotted grid low opacity | partial | Phase 1 + 6 |
| 7 | Node cards compact (white, 240-300px, 10-12px radius, subtle shadow, icon+title+desc+chips+ports+state) | partial | Phase 4 + 7 |
| 8 | Node config in Inspector (Build↔Inspector swap, "← Back to Build", Advanced) | partial | Phase 5 |
| 9 | Start marker + empty-workflow state | unmet | Phase 6 |
| 10 | Bottom canvas toolbar (Outline/Detail, Undo/Redo, Fit, −100%+, Minimap) | unmet | Phase 6 |
| 11 | Edges subtle + readable (1-1.5px neutral, selected accent, optional running dash) | partial | Phase 1 + 6 |
| 12 | Execution state clear (NodeStatus icon+text+color, 8 states, muted tones) | **met** | Phase 1 + 4 |
| 13 | Drag/connect/save/run works (dataTransfer keys, screenToFlowPosition, single addNode, 6 IPC, controller sole-invoke) | **met** | Phase 8 |
| 14 | No major overflow / responsive (drawer, min 1200×760, default 1440×900) | partial | Phase 3 + 6 + 10 |
| 15 | Scales to MVP2 nodes (registry extensible, RULES, condition/branch ready) | partial | Phase 7 + 10 |

**2 of 15 already met** (execution-state clarity + the full drag/connect/save/run
contract). The rest are the light-redesign work.

---

## 4. Per-subsystem findings

### 4.1 Design tokens & theming (spec §1, §24, §25)

- `color-scheme: dark` hardcoded in three places: `:root` ([App.css:10](../../src/App.css#L10)), `@layer base html` ([App.css:326](../../src/App.css#L326)), `<html class="dark">` ([index.html](../../index.html)). No light block, no `data-theme` switching.
- All surface/border/text tokens are dark values ([App.css:13-36](../../src/App.css#L13)). Accent `#1d6fd0` (blue) vs spec `#5267E9` (indigo) — load-bearing across edges, selection, focus ring, Run button.
- `--border-focus` doubles as the accent/focus/selection ring ([App.css:25](../../src/App.css#L25)) — if accent moves, this moves too (or split into separate focus/accent tokens).
- Status tokens dark-tuned; `--status-running` is the old accent hue ([App.css:39-48](../../src/App.css#L39)).
- Radius: control 4px / panel 6px ([App.css:68-70](../../src/App.css#L68)). No node/chip radius.
- Shadow: `--shadow-node 0 2px 8px rgba(0,0,0,0.35)` ([App.css:88](../../src/App.css#L88)) — 7× the spec's 0.05.
- **Good news:** `@theme inline` is `var()`-based ([App.css:236-321](../../src/App.css#L236)), so a light `:root` override retargets every utility automatically. The shadcn-alias block references `var()`, so it retargets too. The edge CSS ([App.css:208-228](../../src/App.css#L208)) uses tokens, so it reads correctly under light once tokens flip — no edge CSS edit needed.
- `::selection` uses `--accent-subtle` ([App.css:161-164](../../src/App.css#L161)) — needs a light-tuned indigo low-alpha or it smears on white.

### 4.2 Workspace shell layout & zones (spec §2, §3, §9, §15, §29, §30)

- Current grid: `gridTemplateColumns: rail 56px / library / minmax(480px,1fr) / inspector` ([WorkspaceShell.tsx:88](../../src/components/shell/WorkspaceShell.tsx#L88)). Row1 toolbar spans all; Row2 = AppRail|NodeLibrary|Canvas|Inspector (workflow) or AppRail|Screen; Row3 BottomDock spans all.
- Target: header row + **secondary tab row** + body (canvas + **single right column**) + bottom canvas toolbar. The AppRail column goes; the library+inspector columns merge into one right column.
- **Build↔Inspector swap (§15):** current Inspector is a separate always-present right column; spec wants a single right column = Build default → Inspector on selection → Build on deselect. `selectionMode`/`selectedNodeId` (stable scalars) drive the swap.
- **BottomDock vs §17 bottom CANVAS toolbar are different things:** the dock is observability (Console/Problems/Run/Artifacts); §17 is a canvas control toolbar. The dock survives as the contextual execution surface (spec Phase 8: "replace fixed console with cleaner contextual execution UI — bottom drawer"); the canvas toolbar is new (Phase 6). Both live in the grid (dock = Row3; canvas toolbar overlays the canvas bottom).
- Responsive: current auto-collapse library<976/inspector<776 ([WorkspaceShell.tsx:39-64](../../src/components/shell/WorkspaceShell.tsx#L39)) with 0px tracks. Spec wants a drawer/sheet at small widths — needs shadcn Sheet.
- Start marker (§5): none; will be a React Flow `Panel` overlay (Phase 6).

### 4.3 Top header & secondary tabs (spec §3.A, §3.B, §19, §27)

- [TopToolbar.tsx](../../src/components/shell/TopToolbar.tsx): breadcrumb (projectName / workflowName) + SaveStateChip + RunStateLine + center HealthPill + Save + Run/Stop + OverflowMenu.
- **No search box** (§3.A wants "Search nodes, runs, settings...").
- Right side = 3 actions; spec §3.A wants ~5 (example: History/Save/Run).
- **Header states (§19):** current has SaveStateChip + RunStateLine (Running·X%, Completed, Failed·see Problems, Cancelled). Missing spec's "Retry Failed" (failed state) and "Open Output prominent only when output exists" (completed state) — these are buried/disabled in the overflow menu ([TopToolbar.tsx:324](../../src/components/shell/TopToolbar.tsx#L324)).
- **Secondary tabs (§3.B):** Workflow/Settings/Runs/Environment — no component exists. Replaces AppRail's Workflow/Projects/History/Settings. "Runs" = run history (§22); "Environment" = health (§20). The left rail likely goes; tabs take over the `activeScreen` routing.
- HealthPill (center, [TopToolbar.tsx:239-250](../../src/components/shell/TopToolbar.tsx#L239)) → moves into Environment tab per spec.
- `WorkflowHeader`/`WorkflowTabs` (§27): none exist as named components.

### 4.4 Right Build panel & node library (spec §8, §9, §10, §27, §30)

- [NodeLibrary.tsx](../../src/components/shell/NodeLibrary.tsx) + [NodeLibraryItem.tsx](../../src/components/shell/NodeLibraryItem.tsx): LEFT aside, `border-r`, 200-360px, search + 6 categories + collapse persisted to localStorage, drag + keyboard-add (`addModeNodeType` channel).
- Migration = move side (left→right) + restyle. Structural but contract-safe: the drag contract (`dataTransfer` keys, `screenToFlowPosition`, `addNode`) is source-agnostic, so the drop side is unaffected. `BuildNodeItem` must reuse `NodeLibraryItem`'s drag setup verbatim.
- **Categories:** 6 (INPUT/TEXT/AI/MEDIA/UTILITY/OUTPUT). Spec §8 wants 7 (adds RULES). No node maps to RULES yet — empty until an MVP2 Condition node.
- **Build item (§10):** 28px / 4px radius / flat hover vs spec 42-48px / 8px radius / white bg / hover elevation. Badges only Note/Not-executable vs New/Beta/Experimental.
- Search: exists (local state, live count) — reusable.
- Collapse: `toggleLibrary` + splitter + auto-collapse. Spec §9 wants collapsible + independently scrollable + **drawer/sheet at small widths** (shadcn Sheet not installed).
- Click-to-add (§30 optional "add near viewport center"): current has keyboard-add + drag; the click-in-Build-adds-to-center is a small addition.
- `BuildPanel`/`BuildCategory`/`BuildNodeItem` (§27): none as named components.

### 4.5 Node card visual system (spec §6, §7, §13, §14, §18, §32, §27)

- [BaseNode.tsx](../../src/components/nodes/BaseNode.tsx): 200-220px, `border-2`, `bg-surface-panel` (dark), identity row (icon+label) + typed ports ([PortHandle.tsx](../../src/components/nodes/PortHandle.tsx)) + NodeStatus footer (non-idle only).
- **No description, no metadata chips, no "summary" body.** Spec §13 wants e.g. Text Input showing "Static workflow text" + `'"Explain testing..."'`; Media Info showing `1920×1080 · 30 fps` chips. **Major gap** — the card body is absent.
- **Metadata chips (§7):** Gemini/Verified/JSON/1080p/30fps/2sec. None exist. Source = `node.data` config values via a per-def `summarize(data)→{description,chips[]}` helper (design decision; must be local derivation, NOT a selector returning a fresh object — infinite-loop trap).
- Width 200-220px < spec 240-300px. Radius `rounded-panel` (6px) < spec 10-12px.
- States (§14): NodeStatus footer already does running %/success/failed/etc. — reusable, restyle for light.
- **Outline/Detail modes (§18):** not implemented; needs a `nodeCardMode` uiSlice field (persist LAYOUT ONLY, scalar) + a Phase 6 toolbar toggle.
- Start marker (§5): canvas overlay, not a node — Phase 6.
- `WorkflowNode`/`NodeHeader`/`NodeMeta`/`NodeStatus` (§27): `BaseNode` is monolithic; spec wants composition. Refactor risk; `nodeTypes` map must stay type→single renderer (contract).
- PortHandle: typed port colors under light canvas may read neon — restyle (shape+icon remain primary cue, compliant).

### 4.6 Inspector & config (spec §15, §16, §32, §27)

- [Inspector.tsx](../../src/components/shell/Inspector.tsx): separate always-present right column (240-440px), mode-switching (none→WorkflowInspector, node→NodeInspector, edge→ConnectionInspector, multi→MultiSelectInspector). Rich already: config from `def.configSchema`, run section, danger zone, align/distribute.
- **Structural gap (§15):** spec wants ONE right column = Build default → Inspector on selection → Build on deselect. Inspector becomes a *mode* of the right column, not its own aside. The `WorkflowInspector` 'none' mode ([Inspector.tsx:223-265](../../src/components/shell/Inspector.tsx#L223)) becomes orphaned; its editable workflow-name + counts must move to Settings/breadcrumb.
- **"← Back to Build" header (§15/§16):** current header = mode title + collapse chevron. Needs a Back button calling `clearSelection`.
- **"Advanced" collapsible (§16):** `ConfigField` ([registry.ts:69-80](../../src/nodes/registry.ts#L69)) has no `advanced` flag; all 12 defs use a single tab. Add the flag + an `InspectorSection` collapsible.
- `PropertyRow`/`InspectorSection` (§27): exist as primitives — reusable.
- shadcn `Select`/`Textarea` (§16): current `PropertyRow` is custom; none installed. Decision: keep custom or install shadcn (Phase 1 prerequisite).

### 4.7 Canvas, edges, grid, start marker, bottom toolbar (spec §4, §5, §11, §12, §17, §18)

- Canvas bg `bg-surface-canvas` (#0d0f13). Spec §4: `#F7F7F5`/`#F8F9FB`.
- **`colorMode="dark"` ([WorkflowCanvas.tsx:324](../../src/components/canvas/WorkflowCanvas.tsx#L324)) — frozen contract.** Light UI implies `colorMode="light"`. **This is the one contract change requiring explicit sign-off.** Record as blocker-level contract conflict.
- Background: dark dots `var(--surface-canvas-grid)` gap=24. Spec §4: optional dotted grid very low opacity. Restyle, low risk.
- Controls: vertical RF `Controls` bottom-left. Spec §17: horizontal bottom toolbar (Outline/Detail/Undo/Redo/Fit/−100%+). New `CanvasToolbar` (§27).
- Edges: `defaultEdgeOptions` stroke `var(--edge-stroke)` 1.5px + selected accent + run-payload dashed. Spec §11: 1-1.5px subtle neutral, selected accent, running optional animated dash. **Compatible — token-only restyle.**
- **Branch labels (§12):** none. Edges have optional `data.label` (editable in ConnectionInspector). Spec wants Yes/No/Matched/Fallback on branching nodes. No Condition node in the 12-node registry — deferred with MVP2.
- **Start marker (§5):** none — Phase 6.
- **Undo/Redo (§17):** no graph history in store (only run history). Non-trivial store addition (past/future snapshots of nodes+edges). Must be transient (excluded from `partialize`), client-side, never `invoke()`. Phase 6+ design decision.
- Zoom: bottom-right Panel Fit + zoomPct%. Spec §17 wants −100%+ in a bottom toolbar. Restyle/relocate.
- Empty state (§31): top-center "Build your workflow" + two template buttons. Spec §31 wants "▶ Start here / Drag a block from Build / + Add first node". Restyle + Start marker.
- Edge type 'default' bezier ([WorkflowCanvas.tsx:28](../../src/components/canvas/WorkflowCanvas.tsx#L28)); spec §11 prefers orthogonal/soft-elbow — optional Phase 6.

### 4.8 Run/Logs UX & execution states (spec §8, §14, §19, §22, §23 — Phase 8)

- [BottomDock.tsx](../../src/components/shell/BottomDock.tsx): Console/Problems/Run/Artifacts tabs; collapsed summary bar; collapsed by default. **This IS the spec's "contextual execution UI / bottom drawer"** — keep + restyle for light (no rebuild).
- Controller ([useWorkflowController.ts](../../src/hooks/useWorkflowController.ts)) owns all run/log IPC + event subscriptions + run-completion inference ([lines 210-255](../../src/hooks/useWorkflowController.ts#L210)) — untouched (execution stays in Rust).
- **Run history (§22):** [HistoryScreen.tsx](../../src/components/screens/HistoryScreen.tsx) is a full table (Status/Run/Started/Duration/Failed node), session-only ([workflowStore.ts:206-231](../../src/store/workflowStore.ts#L206), cap 200). Spec §22 wants "Today / ✓ Video Script Workflow 12:02·21sec / × Merge Test Failed at Media Merge / keep full run history outside the canvas." Needs Today grouping + ✓/× rows + workflow name (may need `HistoryEntry.workflowName`). The secondary "Runs" tab (§3.B) is this route renamed.
- **Artifacts (§23):** ArtifactsPanel ([BottomDock.tsx:743-777](../../src/components/shell/BottomDock.tsx#L743)) is honest — "Open Output Folder" + a gap note. Spec §23 wants per-file list + Preview + Copy Path. No artifacts-list IPC and cannot add one (frozen). **Keep honest; do NOT stub fake rows.**
- Header states (§19): RunStateLine already in TopToolbar. Missing "Retry Failed" (failed state) — Phase 8.
- Node states (§14): NodeStatus footer — restyle light.
- Problems: ProblemsPanel — keep (Void-specific; spec doesn't call it out but it's correct).

### 4.9 Settings/Environment/Runs screens (spec §20, §21, §3.B — Phase 9)

- **Environment tab (§20):** rows Tauri/SQLite/FFmpeg/FFprobe/Gemini/Storage (+ MVP2 Python Worker/VieNeu/Pexels/Whiteboard). **No Environment screen exists.** `store.health` has only `{backend,sqlite,ffmpeg,gemini}` (no FFprobe/Storage), all defaulted `'ready'` (dishonest for the unprobed). Health is shown as a header HealthPill, not a tab. Need an `'unknown'` HealthState + honest rows.
- **Settings tab (§21):** [SettingsScreen.tsx](../../src/components/screens/SettingsScreen.tsx) is app-level (Appearance/Layout/Project/System Health/Backend Integration), not workflow-level. It even has a "Theme = Dark, disabled, Light mode is a stretch goal" row ([SettingsScreen.tsx:81-89](../../src/components/screens/SettingsScreen.tsx#L81)) — directly contradicted by this light redesign. Spec §21 wants workflow-level Name/Description/Execution(api+media concurrency)/Output(default folder+resolution)/Behavior(auto-save). No backend IPC for these (frozen) — frontend-local or disabled honestly; must NOT enter `partialize`, must NOT add a `set_settings` IPC.
- **Runs tab (§3.B/§22):** = run history. Current HistoryScreen. Rename the route; add Today grouping.
- Secondary tabs replace AppRail: `activeScreen` (workflow|projects|history|settings) → (workflow|runs|settings|environment). `projects` drops (no spec equivalent — [ProjectsScreen.tsx](../../src/components/screens/ProjectsScreen.tsx) is display-only with all actions disabled anyway).
- Health model: controller sets `backend` only; sqlite/ffmpeg/gemini never probed. Show backend+sqlite (known via init) honestly; ffmpeg/ffprobe/gemini/storage as 'configured'/'unknown' honestly.

### 4.10 shadcn, primitives, deps, regression contracts (spec §26, §27, §38, §39)

- **shadcn: NONE installed** (no `components.json`, no `@radix-ui`). clsx + tailwind-merge present (prereqs). Spec §26 lists 18 shadcn primitives. Decision: hybrid install (Tabs/Sheet/Select/ScrollArea/Tooltip/Dialog/Command/Collapsible/Resizable) OR keep custom primitives + restyle. The App.css alias block anticipates shadcn but the `--accent` trap is documented. Record as a Phase 1 prerequisite.
- **Existing primitives:** [Panel, PanelHeader, PropertyRow, InspectorSection, InspectorTabs, NodeStatus, StatusBadge, ToolbarButton, EmptyState](../../src/components/primitives/). Of §27's reusable components, 5 exist (PropertyRow, InspectorSection, NodeStatus, EmptyState, ToolbarButton family) and 13 are missing (see G-14).
- **§27 contract ledger:** 6 IPC (untouched), dataTransfer keys (untouched — source-agnostic), `screenToFlowPosition` (untouched), `colorMode` (**CONFLICT: dark→light**), `fitView` (untouched), `isValidConnection` (untouched), `replaceGraph` (untouched), `deriveProblems` (untouched), controller sole `invoke()` (untouched — no new IPC), `persist partialize` LAYOUT ONLY (watched — new layout widths/modes added deliberately; graph-history + workflow settings excluded), stable selectors (watched — the infinite-loop trap), no `.rs` edits (only `tauri.conf.json` identity/window strings), no alerts (already enforced), status never color-only (watched), tokens by name only (watched).
- **§38 architecture rules:** React Flow=presentation, Rust=execution, Tauri=native, SQLite=metadata, FS=artifacts. The light redesign is presentation-only — no violation. Undo/Redo must stay client-side graph history, NOT backend.
- **§39 acceptance criteria:** see §3.2 above (2 met, rest close across phases).

---

## 5. Contract conflicts & resolutions (the hard-constraint surface)

| Contract | Conflict | Resolution |
|---|---|---|
| `colorMode` (frozen §27) | `"dark"` hardcoded; light UI needs `"light"` | Phase 1 introduces light tokens; Phase 6 flips `colorMode` as an explicit sign-off-required step. `colorMode` stays a presentation prop — no code branches on its value. Confirm no code conditions on `colorMode` before flipping. |
| `persist partialize` = LAYOUT ONLY + stable selectors | New uiSlice fields (Build/Inspector swap mode, Outline/Detail, right-panel width, graph-history) risk breaching LAYOUT-ONLY or re-introducing the infinite-loop | New layout widths/modes (`buildWidth`/`buildCollapsed`/`nodeCardMode`/`rightPanelWidth`) added to the whitelist deliberately; graph-history past/future + workflow settings explicitly excluded. Every new selector reviewed for stable refs. Clamp new widths on rehydrate. |
| `dataTransfer` keys + `screenToFlowPosition` + `addNode` single path | Library moves left→right; AppRail removed | Keys are source-agnostic — contract holds. `BuildNodeItem` reuses `NodeLibraryItem` drag setup verbatim. `addModeNodeType` channel keeps working from the right. No second creation route. |
| React Flow = presentation, Rust = execution | Start marker, branch labels, Undo/Redo are canvas additions | StartMarker = a React Flow `Panel` (not a real node — preserves addNode single-path). Undo/Redo = in-store client-side graph-history stack wired to graphSlice setters; never `invoke()`. Branch labels stub via `edge.data.label`. |
| No `.rs` edits + controller sole invoke() | Environment health rows; workflow-level settings | No new IPC. Environment shows honest 'unknown'/'configured' for unprobed providers. Workflow-level settings stay frontend-local/session-only or disabled with honest tooltips. No `set_settings` IPC. |
| Controller sole-invoke + 6 IPC | Settings tab wants persistable workflow config | Frontend-local/session-only (projectSlice transient, excluded from `partialize`) or disabled. No new IPC. |
| Tokens by name only, no raw hex | shadcn install | Hybrid install; target CSS variables (Tailwind v4 CSS-config); re-verify the `--accent` alias trap after every `shadcn add`. All primitives styled with Void tokens by name. |
| Status never color-only | Light status re-contrast + 'unknown' state | Phase 1 re-contrasts status tokens on `#FFFFFF` (fresh pass, not copied). Phase 9 adds 'unknown' HealthState with icon+text. TS exhaustiveness over `Record<HealthState,...>` guards the switch. |

---

## 6. What to keep (do not throw away)

- The **8-slice Zustand store** + LAYOUT-ONLY `partialize` + stable-scalar selectors.
- The **controller** ([useWorkflowController.ts](../../src/hooks/useWorkflowController.ts)) — sole `invoke()` caller, 6 IPC, run-completion inference.
- The **12-node registry** ([registry.ts](../../src/nodes/registry.ts)) — single source of truth; `nodeTypes` generated from it; `configSchema` drives the Inspector.
- The **drag/connect/save/run contract** — `dataTransfer` keys, `screenToFlowPosition`, `placeNode`→`addNode` single path, `isValidConnection` cycle guard, `replaceGraph` handle normalization.
- The **cross-zone channels** — `addModeNodeType` (keyboard-add), `pendingCenterNodeId` (dock→canvas center).
- The **BottomDock** as the contextual execution surface (Console/Problems/Run/Artifacts) — restyled, not rebuilt.
- The **Inspector config engine** (`configSchema`→`PropertyRow`) — reused inside the Build↔Inspector swap.
- The **`@theme inline` token system** — var()-based, light-ready by construction.
- The **§11.10 NodeLibraryItem primitive** — drag setup + focus ring reused by `BuildNodeItem`.
- The **a11y layer** — roving tabindex, `aria-live`, status-never-color-only, tab traps, `prefers-reduced-motion`/`prefers-contrast`. Keep and extend.

---

## 7. Migration strategy (safe, additive, presentation-first)

The migration is **presentation-first**, ordered so each phase is independently
verifiable and never breaks the §27 contract:

1. **Phase 1 — Light Design System.** Flip tokens (light `:root`), `color-scheme`, and `colorMode`. Lock the shadcn decision. Correct radius/shadow. *App boots in light; no structure changes.*
2. **Phase 2 — Header & Tabs.** `WorkflowHeader` (search + state-driven actions) + `WorkflowTabs` (replace AppRail). `ActiveScreen` extended. *Grid loses the rail, gains a tab row.*
3. **Phase 3 — Build Panel.** Move NodeLibrary to the right as `BuildPanel`; add RULES; restyle `BuildNodeItem`; drawer at small widths. Begin the single-right-column grid.
4. **Phase 4 — Node Visual System.** `WorkflowNode`+`NodeHeader`+`NodeMeta`+`NodeStatus` with description + chips; convert 4 nodes first.
5. **Phase 5 — Inspector.** Complete Build↔Inspector single-column swap; "← Back to Build"; Advanced section; unify widths.
6. **Phase 6 — Canvas.** Light canvas + `CanvasToolbar` + `StartMarker` + Outline/Detail + Undo/Redo (client-side) + light edges/grid.
7. **Phase 7 — Remaining nodes.** Convert the other 8 MVP1 node types.
8. **Phase 8 — Execution UX.** Light restyled dock + Runs route + Retry/Open Output header actions + honest artifacts.
9. **Phase 9 — Settings/Environment/Runs.** `EnvironmentScreen` (honest health) + workflow-level `SettingsScreen` + polished Runs.
10. **Phase 10 — Review.** §39 acceptance pass + regression + a11y + polish.

**Regression guardrails per phase:** `npx tsc --noEmit` → `npm run build` →
`npm run tauri:dev` runtime smoke → §27 contract checks (drag, connect, save, load,
run, stop, logs, node config, 6 IPC, stable selectors, no `.rs`, no alerts, status
never color-only, tokens by name). Auto-advance only if green; stop and report if a
phase fails.

---

## 8. Skill gaps (honest record)

| Required skill | Available? | Used how |
|---|---|---|
| `audit-context-building` | ✓ | Followed its directive: build understanding, record assumptions, follow the IPC calls, carry open questions forward. §2.3/§4.10 written in that style. |
| `web-design-guidelines` | ✓ | Loaded earlier this session. Findings folded into the per-subsystem gaps (a11y, focus, overflow, color-only-status). |
| `agent-browser` | ✓ (CLI not installed) | Skill read. The app is a Tauri native webview, not a browser tab; CDP attach is uncertain. Visual audit done via full source reading. Potential blocker for screenshot regression in later phases. |
| `frontend-design` / `shadcn` / `react-best-practices` / `composition-patterns` | via Agent/SKILL.md | Not invoked in Phase 0 (audit builds understanding, not verdicts). Routed for Phase 1+ implementation. |
| `improve` / `differential-review` | via Agent | Routed for Phase 10 review. |

---

## 9. Open questions (carried forward — decide before the named phase)

1. **shadcn install strategy** (Phase 1 prerequisite): full install vs hybrid (Tabs/Sheet/Select/ScrollArea/Tooltip/Dialog/Command/Collapsible/Resizable only) vs restyle-only? `WorkflowTabs` (Phase 2) and the Build drawer `Sheet` (Phase 3) depend on this. Must honor the [App.css:123-131](../../src/App.css#L123) `--accent` alias trap after any `shadcn add`.
2. **`colorMode` contract change** (blocking): is flipping `colorMode="dark"`→`"light"` explicitly approved as part of the light redesign, or must `colorMode` stay `"dark"` while only tokens flip (leaving React Flow's internal dark chrome on a light canvas)? The single blocking contract decision.
3. **AppRail removal:** remove the 56px left rail entirely, or retain a thin collapsed strip for Alt+1..4 / roving tabindex? Spec §2 shows no left rail; the constraint allows "removed or repurposed". Affects the grid shape and where keyboard-shortcut consumers re-home.
4. **Build↔Inspector single-column restructure:** does `WorkflowInspector` 'none' mode get removed entirely, or does `BuildPanel` absorb its fields? Where does workflow-name editing relocate — Settings tab, header breadcrumb, or dropped? A blocker-sized Phase 5 decision that must be decided before Phase 3 begins the column restructure.
5. **Undo/Redo scope:** graph history in Phase 6 or deferred? Non-trivial store addition (past/future snapshots); must be transient session-only (excluded from `partialize`) and must not bypass `addNode` single-path or `isValidConnection`. Confirm client-side only (no `.rs`, no `invoke()`).
6. **Environment health honesty:** for unprobed providers, default to 'configured' (if a key/path is known) or 'unknown'? uiSlice.health currently optimistically defaults sqlite/ffmpeg/gemini to 'ready' (dishonest). Adding 'unknown' ripples across all `Record<HealthState,...>` maps (TS guards it).
7. ~~**`activeScreen` persistence:** verify it's NOT in `partialize`.~~ **RESOLVED:** verified at [workflowStore.ts:535-545](../../src/store/workflowStore.ts#L535) — `activeScreen` is NOT in the whitelist; the LAYOUT-ONLY contract is intact.
8. **RULES category:** render empty (count 0) in `BuildPanel` until an MVP2 Condition node exists, or stay hidden (current `NodeLibrary.tsx:235` filters out empty categories)? Spec §9 example groups RULES/UTILITY.
9. **`HistoryEntry.workflowName`:** spec §22 run rows show the workflow name; current `HistoryScreen` only renders runId/startedAt/duration/failedNode. If the controller doesn't record it, Phase 9 adds it (frontend-only, no IPC).
10. **Node radius:** 10 (keeps nodes distinct from 12px panels) or 12 (uniform with panels)? Affects the new `--radius-node` token.
11. **Default workflow direction:** adopt spec §4 top→bottom (Top/Bottom handle positions, re-laid `BaseNode` ports, `PortHandle.tsx:41` change) or keep current left→right runtime per §40 "keep Void's own runtime"? Affects `PortHandle` + `BaseNode` port-row layout.

---

## 10. Definition of Done (spec §36, Phase 0)

> "The agent understands the current UI implementation and risks before editing it."

**Met.** This document maps: the current dark component tree, React Flow setup, the
8-slice Zustand store + LAYOUT-ONLY persist + stable-selector constraint, the token
system (var()-based, light-ready), the 6 frozen IPC commands, the controller, the
12-node registry, every shell/canvas/node/screen/primitive, runtime status (clean
launch), the 26-row gap roster (severity → phase), the 15 §39 acceptance criteria
(2 met), the 8 contract conflicts + resolutions, the migration strategy, and 11 open
questions (1 resolved). No application source was modified. No Rust engine changes.

**Phase 0 is complete.** The blocking decisions (§9 Q1 shadcn, Q2 `colorMode`, Q4
Build↔Inspector restructure) are surfaced for sign-off before Phase 1. Per the standing
auto-advance directive, Phase 1 begins once Phase 0 is validated.