# Void Workflow — UI Audit (Phase 0)

**Phase:** UI Phase 0 — Repository & Runtime Audit
**Status:** DONE
**Date:** 2026-08-10
**Scope:** Frontend only. No Rust workflow engine / backend architecture changes.
**Method:** Source inspection + runtime launch. Skills: `audit-context-building`, `web-design-guidelines`, `agent-browser` (partial — see Skill Gaps).

> This audit **builds understanding, not verdicts** (per `audit-context-building`).
> It maps what exists, what the code counts on, and where the risks are — it does
> not redesign anything. Redesign starts in Phase 1.

---

## 1. Executive Summary

The app is a **valid functional prototype**: Tauri launches, a React Flow canvas
exists, a flat Node Library exists, a Console exists, and Save/Run/Stop/Open
Output controls exist. MVP1 backend is complete ([MVP1_STATUS.md](../MVP1_STATUS.md)).

The frontend is **very small** — 6 TSX components, one Zustand store, one
`BaseNode` used for every node type. There is **no design system** (no tokens,
no theme, ~23 hardcoded raw Tailwind color classes), **no Inspector**, **no App
Rail**, **no Bottom Dock tabs**, and **no accessibility layer**. Native app
identity still says `tauri-app` / "Tauri + React + Typescript".

There are also **two concrete bugs** (node-type registration mismatches between
frontend and Rust registry) that any redesign must preserve-or-fix without
blaming the backend.

The codebase is small enough that the Phase 3 Workspace Shell can be built
**additively** with low migration risk, as long as the existing IPC contracts
and drag/connect/save/run behavior stay wired.

---

## 2. Current Implementation Map

### 2.1 Component Tree (actual)

```
main.tsx
└── <React.StrictMode>
    └── App.tsx                          ← all top-level state + IPC lives here
        ├── <header>                     ← Top Bar (title, "Connected" dot, Open Output/Save/Run|Stop)
        └── <main>                       ← flex row
            ├── NodeLibrary.tsx          ← <aside> flat list, drag source
            └── <div>                    ← flex col
                ├── WorkflowCanvas.tsx   ← ReactFlowProvider > CanvasInner
                │   └── ReactFlow
                │       ├── Background
                │       └── Controls
                └── ConsolePanel.tsx     ← <div> h-48, listens to workflow-log events
```

There is **no Inspector**, **no App Rail**, **no Bottom Dock tab system**. The
Console is a fixed-height panel, not a collapsible/resizable dock.

### 2.2 Files (frontend)

| File | Role | LOC |
|---|---|---|
| `src/main.tsx` | React root, StrictMode | 9 |
| `src/App.tsx` | Top bar + layout + **all IPC handlers + all run state** | 122 |
| `src/components/canvas/NodeLibrary.tsx` | Flat palette, drag source | 42 |
| `src/components/canvas/WorkflowCanvas.tsx` | React Flow, drag-drop, cycle validation | 129 |
| `src/components/canvas/ConsolePanel.tsx` | Log listener, fixed panel | 49 |
| `src/components/nodes/BaseNode.tsx` | Single node renderer for all types | 36 |
| `src/store/workflowStore.ts` | Zustand: nodes/edges + change handlers | 72 |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) — **defined but unused** | 6 |
| `src/App.css` | `@import "tailwindcss";` only | 1 |

### 2.3 React Flow Setup

- `@xyflow/react` v12, `colorMode="dark"`, `fitView`.
- `nodeTypes` maps **10** type strings → a single `BaseNode` (see §5 bug).
- `Background color="#334155" gap={24}` (hardcoded slate-700 hex).
- `Controls` styled with `bg-gray-800 border-gray-700 fill-gray-300`.
- `isValidConnection` prevents self-loops and cycles via recursive
  `getOutgoers` walk. **Recurses with no depth guard** — open question for very
  large graphs, but out of scope for UI phase.
- Drag-drop reads `application/reactflow` + `application/reactflow-label` data
  transfer keys; drop position via `screenToFlowPosition`.
- `@xyflow/react/dist/style.css` imported once in WorkflowCanvas.

### 2.4 State (Zustand)

`workflowStore.ts` holds `nodes`, `edges`, and React Flow change handlers
(`onNodesChange`, `onEdgesChange`, `onConnect`), plus `setNodes`, `setEdges`,
`addNode`, `updateNodeData`.

**Observations (per audit-context-building — what the code counts on):**
- `updateNodeData` exists but **is never called by any component**. There is no
  Inspector, so node `data` is never edited after drop. The store assumes
  something will mutate node config; nothing does.
- **Run/execution state lives in `App.tsx` local `useState`** (`currentRunId`,
  `dbPath`, `error`), **not** in the store. The Console subscribes to Tauri
  events directly (`listen('workflow-log')`), not via the store. So execution
  state is split across three places: App local state, Tauri events, store
  graph. This is the central architecture tension Phase 1 must resolve.
- Node identity is `uuidv4()` generated client-side at drop time. Backend
  re-deserializes from `graphJson` on each `start_run` — backend is
  authoritative for execution, frontend for graph shape.

### 2.5 Styling System

- **Tailwind v4** via `@tailwindcss/vite` (no `tailwind.config.*` — v4 is
  CSS-configured).
- `src/App.css` contains **only** `@import "tailwindcss";`. No `@theme`, no
  `@custom-variant`, no CSS custom properties, no `color-scheme`.
- **~23 hardcoded raw Tailwind color classes** across 5 files
  (`bg-gray-950`, `bg-blue-600`, `text-gray-400`, `border-gray-800`, …).
  Matches the plan's "no reusable product-level design system" finding.
- `cn()` (clsx + tailwind-merge) is defined in `src/lib/utils.ts` but **never
  imported/used** anywhere — dead utility, available for Phase 2.
- `lucide-react` is a dependency but **never imported** — no icons anywhere
  (Node Library rows, buttons, and nodes are all icon-less).
- shadcn is **not initialized** (no `components.json`). `clsx`, `tailwind-merge`
  are present as devDeps (shadcn prerequisites) but no shadcn components exist.

### 2.6 Tauri IPC Surface (UI → Rust)

6 commands consumed, all from `App.tsx`:

| Command | Args | Returns | Used for |
|---|---|---|---|
| `init_project` | — | `String` (db path) | boot, sets `dbPath` |
| `load_workflow` | `projectId: 1` | `String` (graphJson) | boot, hydrates store |
| `save_workflow` | `projectId: 1, graphJson` | `()` | Save button |
| `start_run` | `projectId: 1, graphJson` | `i64` (runId) | Run button |
| `cancel_run` | `runId` | `()` | Stop button |
| `open_run_folder` | `runId` | `()` | Open Output button |

**Assumptions the UI makes (audit-context-building style):**
- `projectId` is **hardcoded to `1`** in every call. Nothing establishes that
  project 1 exists; `init_project` creates the DB but the project row is
  assumed. Works today because the backend tolerates it; breaks the moment
  multi-project is introduced.
- `open_run_folder` uses `currentRunId || 1` — falls back to run id `1` when no
  run is active. Comment in code acknowledges this is a placeholder.
- UI stringifies `{nodes, edges}` to `graphJson` on save **and** run, reading
  from `useWorkflowStore.getState()` directly (not from React state) — correct,
  avoids stale closure.
- Tauri event `workflow-log` payload shape (`run_id`, `node_id`, `message`,
  `level`) is assumed by `ConsolePanel`; nothing validates it.

---

## 3. Native App Identity

| Location | Current value | Issue |
|---|---|---|
| `index.html` `<title>` | `Tauri + React + Typescript` | Starter identity |
| `src-tauri/tauri.conf.json` `productName` | `tauri-app` | Starter identity |
| `src-tauri/tauri.conf.json` window `title` | `tauri-app` | Native window title |
| `src-tauri/tauri.conf.json` `identifier` | `com.phongvudzz.tauri-app` | Starter bundle id |
| `<link rel="icon">` | `/vite.svg` | Vite default icon |

Matches plan §2: "Generic Tauri starter identity still appears in native chrome."
Fixing `productName`/`title`/`identifier`/icon is part of Phase 3 (Workspace
Shell) or a dedicated identity pass. **Identifier change has bundling
implications** (new install path) — flag, don't do casually.

---

## 4. Current Visual / UX Problems (vs. plan §2)

| Plan issue | Confirmed? | Evidence |
|---|---|---|
| Weak product/workflow hierarchy in top bar | ✓ | `App.tsx:78` — title + dot + 3 buttons, no breadcrumb/save-state/run-state |
| Generic Tauri starter identity | ✓ | see §3 |
| Node Library is a flat list, won't scale | ✓ | `NodeLibrary.tsx` — single `NODE_TYPES` array, no search/categories |
| No search or categories in Node Library | ✓ | none |
| Canvas has no useful empty state | ✓ | `WorkflowCanvas.tsx` — no empty-state element; relies on `fitView` |
| No right-side Inspector | ✓ | no component exists |
| Console permanently consumes vertical space | ✓ | `ConsolePanel.tsx:30` — fixed `h-48`, not collapsible/resizable |
| No Problems / Run / Artifacts dock model | ✓ | only Console exists |
| Global execution state not visually strong | ✓ | run state = one button label swap (Run↔Stop), no progress/% |
| `Connected` looks like debug state | ✓ | `App.tsx:82-87` — colored dot + "Connected"/"Error"/"Initializing..." |
| `Open Output` globally prominent w/o artifact context | ✓ | always-visible button |
| No project/workflow breadcrumb | ✓ | none |
| No visible save state (Saved/Unsaved) | ✓ | save is a fire-and-forget `alert()` |
| No History / Settings entry point | ✓ | none |
| No reusable design system | ✓ | see §2.5 |

All 15 plan-listed UX issues are **confirmed present** in source.

---

## 5. Concrete Bugs & Technical Debt (frontend)

### 5.1 BUG — Node-type registration mismatch (HIGH PRIORITY)

The frontend palette, the frontend `nodeTypes` map, and the Rust
`NodeRegistry` do not agree on which node types exist.

| type string | Rust `registry.register` | Frontend palette (`NODE_TYPES`) | Frontend `nodeTypes` map |
|---|---|---|---|
| `textInput` | ✓ | ✓ | ✓ |
| `textTransform` | ✓ | ✓ | ✓ |
| `delay` | ✓ | ✓ | ✓ |
| `aiScript` | ✓ | ✓ | ✓ |
| `fileInput` | ✓ | ✓ | ✓ |
| `mediaInfo` | ✓ | ✓ | ✓ |
| `saveText` | ✓ | ✓ | **✗ missing** |
| `saveJson` | ✓ | ✓ | **✗ missing** |
| `saveArtifact` | **✗ missing** | ✓ | ✓ |
| `mediaMerge` | ✓ | ✓ | ✓ |
| `preview` | **✗ missing** | ✓ | ✓ |
| `markdownNote` | **✗ missing** | ✓ | ✓ |

**Consequences:**
- `saveText` / `saveJson`: shown in palette, registered in Rust, but **absent
  from `nodeTypes`**. Dragging them onto the canvas makes React Flow fall back
  to its default node renderer (or render nothing usable) — and the node still
  gets saved/run because the store carries the `type` string through to the
  backend. So the user can create a node that looks broken but executes.
- `saveArtifact` / `preview` / `markdownNote`: shown in palette and in
  `nodeTypes`, but **not registered in Rust**. They render fine on canvas but
  the executor will not recognize them at run time.

**This is a contract drift between three lists.** Phase 0 records it; Phase 1/3
must reconcile (single source of truth for node types). Per the task rules, I
did **not** modify the Rust registry — but this bug spans frontend and backend,
so fixing it is a Phase 1+ decision, not a Phase 0 edit.

### 5.2 UX debt — `alert()` for all save/run/stop feedback

5 `alert()` calls (`App.tsx:37,39,50,60,71`) block the native webview with
synchronous dialogs. No toast/status bar. Save success is a blocking alert,
not a "Saved" state in the toolbar (plan §5 wants visible save state).

### 5.3 Dead code / unused deps

- `cn()` defined, never used.
- `lucide-react` depended on, never imported.
- `updateNodeData` in store, never called.
- `src/assets/react.svg` — Vite starter asset, unused.

### 5.4 Hardcoded colors (no tokens)

23 raw color classes (§2.5). No `--surface-*`, `--border-*`, `--text-*`,
`--status-*` tokens. Plan §8 requires centralized tokens before screen redesign.

### 5.5 Fixed console height, no dock

`ConsolePanel` is `h-48` always. Plan §4/§15 wants a collapsible/resizable
bottom dock with Console/Problems/Run/Artifacts tabs.

---

## 6. Accessibility & Interaction (web-design-guidelines pass)

Applied the fetched Web Interface Guidelines rules against the 4 interactive
components. Findings in the skill's terse `file:line` style:

```
src/App.tsx
src/App.tsx:92 - "Open Output" button: no aria-label, no tooltip, no disabled state when no run/artifact
src/App.tsx:95 - "Save" button: no disabled state while saving, no loading state, uses alert() for result
src/App.tsx:99 - "Stop" button: no aria-label, appears/disappears without focus management
src/App.tsx:103 - "Run" button: no aria-label, no loading state during start_run, no prefers-reduced-motion
src/App.tsx:83 - status dot: color-only status indicator (no text/aria-label on the dot; text is sibling but not associated)
src/App.tsx:76 - <html> has no color-scheme: dark set (only React Flow colorMode="dark")

src/components/canvas/NodeLibrary.tsx
src/components/canvas/NodeLibrary.tsx:31 - draggable node items: not keyboard accessible (no tabindex/onKeyDown), no role, no aria-label; drag-only
src/components/canvas/NodeLibrary.tsx:31 - no focus-visible style on palette items
src/components/canvas/NodeLibrary.tsx:26 - no search input (no filtering affordance)

src/components/canvas/WorkflowCanvas.tsx
src/components/canvas/WorkflowCanvas.tsx:103 - canvas: no empty state, no accessible label/role for the graph region
src/components/canvas/WorkflowCanvas.tsx:116 - Background color hardcoded "#334155" (token missing)

src/components/canvas/ConsolePanel.tsx
src/components/canvas/ConsolePanel.tsx:30 - console: no aria-live region for streaming logs
src/components/canvas/ConsolePanel.tsx:39 - log level "error" only color-coded (red-400), no icon/aria-label
src/components/canvas/ConsolePanel.tsx:38 - no filter controls (All/Info/Warning/Error/System/Selected)

src/components/nodes/BaseNode.tsx
src/components/nodes/BaseNode.tsx:14 - node card: no semantic role, no aria-label, no keyboard focus handling beyond React Flow default
src/components/nodes/BaseNode.tsx:21 - ports (Handle): color-only (bg-blue-500), no type icon/label/tooltip (plan §13 wants shape+icon+label)
```

**Positives:** semantic `<header>`, `<main>`, `<aside>`, `<button>` tags are
used (9 elements). That's the only a11y baseline present.

**Missing globally:** `aria-*` on controls, `:focus-visible` styles, disabled
states, loading states, `prefers-reduced-motion`, `color-scheme: dark` on
`<html>`, keyboard equivalents for drag, `aria-live` for the console stream.

---

## 7. Runtime / Visual Audit

- **App launched successfully** via `npm run tauri dev`. Rust build: 435 crates,
  ~3m28s (first build). Binary `target/debug/tauri-app.exe` running (PID 18660).
- **Vite** serving frontend at `http://localhost:1420` (strictPort). HMR ready.
- **No runtime errors / panics / uncaught exceptions** in the dev log after
  launch (build warnings filtered out).
- **Rendered DOM** = the JSX in `App.tsx` + 4 components (read in full). The
  plan's §2 "Current Screenshot Audit" matches the source exactly:
  Top Bar (Void Workflow / Connected / Open Output / Save / Run) → left Node
  Library (flat 12 items) → center React Flow canvas → bottom Console.
- **Visual audit method note:** the app is a Tauri **native webview**, not a
  public URL. `agent-browser` (CDP-based) and `WebFetch` cannot attach to the
  native window or to `localhost` from this environment. Visual audit was done
  by full source reading + the plan's screenshot description. See §9 Skill Gaps.

### 7.1 Resize behavior

Layout uses `flex flex-col h-screen w-screen` (App) → `flex-1 flex` (main) →
`flex-1 flex flex-col` (canvas column) → `flex-grow h-full` (canvas) + `h-48`
fixed console. **Console does not resize**; canvas flexes. No `overflow-x` guard
on the console log rows (long log lines will horizontal-scroll the container,
not wrap/truncate — web-design-guidelines content rule violation).

### 7.2 Save / Run / Console behavior (current)

- **Save:** `getState()` → stringify → `save_workflow` → `alert("saved")`. No
  dirty-state tracking, no "Saved" indicator.
- **Run:** `getState()` → stringify → `start_run` → `setCurrentRunId`. Button
  swaps Run↔Stop. No progress, no per-node status, no Problems panel.
- **Console:** subscribes to `workflow-log` Tauri events, appends to array,
  auto-scrolls via `scrollIntoView`. No filters, no level icons, no node
  filter, no clear button. Uses array index as `key` (fine for append-only).

---

## 8. What to Keep (do not throw away)

- **IPC contract** — the 6 commands and their arg/return shapes (§2.6). Backend
  is stable and out of scope.
- **Zustand store shape** — `nodes`/`edges` + React Flow change handlers. Phase
  3 keeps this; only adds execution/selection/save-state slices.
- **React Flow cycle guard** (`isValidConnection`) — correct, preserve.
- **Drag-drop data-transfer keys** (`application/reactflow[|-label]`) — preserve
  or migrate both sides together.
- **`screenToFlowPosition` drop positioning** — correct.
- **Tauri event subscription pattern** in ConsolePanel — preserve (move into a
  dock tab in Phase 7).
- **`cn()` util** — adopt in Phase 2 (it's already there, just unused).
- **Semantic HTML structure** (header/main/aside) — keep and extend.

---

## 9. Migration Strategy (safe, additive)

The frontend is small enough to **add the new workspace shell around the
existing components** rather than rewrite in place:

1. **Phase 1 (UX Architecture):** freeze the zone layout (plan §4) and the
   state-model split (graph vs. execution vs. selection vs. save-state). Decide
   whether execution state moves into Zustand or stays in a controller hook.
2. **Phase 2 (Design System):** add `@theme` tokens to `App.css` (Tailwind v4
   CSS-config), semantic surface/border/text/status tokens. Start using `cn()`.
   Do **not** remove raw colors yet — migrate per-component in later phases.
3. **Phase 3 (Workspace Shell):** introduce App Rail + Top Toolbar + Inspector
   placeholder + Bottom Dock container. **Move existing `App.tsx` IPC handlers
   into a controller hook** so the shell can host them without re-architecting.
   Keep `NodeLibrary`, `WorkflowCanvas`, `ConsolePanel` mounted inside the new
   shell zones.
4. **Phase 4–7:** replace/augment each existing component in its zone.
5. **Phase 10 (Cleanup):** remove dead code (`alert()`, unused `react.svg`,
  hardcoded colors, old fixed console) only after the new system is verified.

**Regression guardrails (plan §27):** every phase must preserve drag, connect,
save, load, run, stop, logs, node config, and the 6 IPC contracts.

### 9.1 Bug reconciliation plan (cross-cutting)

The §5.1 node-type mismatch should be resolved **before or during Phase 3** by
introducing a **single source of truth** for node types (one TS module
exporting palette entries + categories + registry keys, validated against the
Rust registry). This is a frontend-frontend consolidation; any Rust registry
additions (`saveArtifact`, `preview`, `markdownNote`) are a **separate, flagged
backend decision** — not done in a UI phase.

---

## 10. Skill Gaps (honest record)

| Required skill | Available? | Used how |
|---|---|---|
| `audit-context-building` | ✓ | Loaded. Followed its directive: build understanding, record assumptions (`nothing found`-style), follow the IPC calls, carry open questions forward. §2.4/§2.6 written in that style. |
| `web-design-guidelines` | ✓ | Loaded. Fetched the live guideline rules from the source URL. Ran a pass against the 4 interactive components; findings in §6 in the skill's `file:line` format. |
| `agent-browser` | ✓ (CLI ✗) | Skill read. **CLI not installed** (`npm i -g agent-browser` + native Chrome setup) — a heavyweight external install not appropriate for an audit phase. The app is a Tauri native webview, not a browser tab, so CDP attach is uncertain anyway. Visual audit done via full source reading + plan screenshot. **Blocker for screenshot automation in later phases.** |
| `react-best-practices` | ✗ | **Not installed** globally or locally (per AGENT_SKILLS_INVENTORY.md). Applied equivalent React heuristics from knowledge instead. |
| `composition-patterns` | ✗ | **Not installed** globally or locally. Applied equivalent composition heuristics from knowledge instead. |

**Recommended:** before Phase 2/3, install `react-best-practices` and
`composition-patterns` (they were never in the global set — a separate install
task), and decide whether to install `agent-browser` for screenshot regression
in Phase 5/9.

---

## 11. Open Questions (carried forward, per audit-context-building)

1. Where should execution state live? `App.tsx` local state today; Zustand
   slice vs. a dedicated controller hook is a Phase 1 decision.
2. Should `saveArtifact` / `preview` / `markdownNote` be registered in Rust, or
   removed from the frontend palette until the backend supports them? (Backend
   decision — flagged, not resolved here.)
3. Is the `projectId: 1` hardcode acceptable through the UI redesign, or does
   Phase 8 (App Screens / Projects) need to land first?
4. `identifier: com.phongvudzz.tauri-app` change — safe to rename, or does it
   break existing installs on the dev machine?
5. React Flow `isValidConnection` cycle recursion has no depth guard — does it
   matter for MVP2-scale graphs? (Out of scope for UI, noted.)

---

## 12. Definition of Done (plan §17, Phase 0)

> "The agent understands the current UI implementation and risks before editing it."

**Met.** This document maps: component tree, React Flow setup, state stores,
shadcn status (none), styling system (Tailwind v4, no tokens), hardcoded
colors (23), duplicated layout code (none yet — single layout in App.tsx),
Tauri commands consumed (6), runtime status (clean launch), current
save/run/console behavior, native identity issues, and concrete bugs (§5.1).
No application source was modified. No Rust engine changes.

**Phase 0 is complete. Awaiting approval before Phase 1.**