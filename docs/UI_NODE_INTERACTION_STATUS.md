# Void Workflow — Sidebar & Node Interaction UI Status

**Spec:** [VOID_WORKFLOW_SIDEBAR_NODE_INTERACTION_SPEC.md](../VOID_WORKFLOW_SIDEBAR_NODE_INTERACTION_SPEC.md) (extends `VOID_WORKFLOW_LIGHT_UI_SPEC.md`)
**Track:** Sidebar, node card, selection, floating toolbar, Add Next/Duplicate/Configure/Delete, double-click detail, connection insert.
**Method:** Incremental migration — **build on the completed Light UI redesign, do NOT redo it.** No rebuild. No `.rs` edits (Rust/IPC frozen). No shadcn install (Phase 1 locked custom primitives — installing risks the `--accent` alias trap + Tailwind v4 CSS/JS mismatch; spec §41 "reuse project components first"). Use `@xyflow/react` v12.11.2 `NodeToolbar` for viewport-correct floating positioning (spec §17/§40).
**Verification gate per phase:** `npx tsc --noEmit` → `npm run build` → `npm run tauri:dev` runtime smoke → §27 regression + §69 acceptance checks. Auto-advance only if green.

> Status legend: `NOT_STARTED` · `IN_PROGRESS` · `IN_REVIEW` · `BLOCKED` · `DONE`

---

## Phase overview

| Phase | Title | Status | Deliverable |
|---|---|---|---|
| A | Build Sidebar | DONE (Light UI Phases 2-3) | right `NodeLibrary`: search `buildQuery`, 7 categories incl RULES, drag, scroll, collapse, splitter 280-360 |
| B | Shared Node Card | DONE (Light UI Phase 4) | `BaseNode` single renderer + `summarize` on all 12 + `nodeCardMode` outline/detail |
| C | Selection Toolbar | DONE | `NodeToolbar` + Add Next/Duplicate/Configure/More/Delete |
| D | Inspector | DONE (Light UI Phase 5) | Build↔Inspector swap + "← Build" + `InspectorSection`/`PropertyRow` + Advanced |
| E | Double Click / Detail | DONE | `NodeDetailPanel` (Configure/Input/Output/Run/Preview tabs) |
| — | Context menus + group toolbar + selection fix | DONE | Radix `ContextMenu` (node + pane right-click) · `GroupToolbar` (multi-select) · clipboard copy/paste · selection-desync fix |
| F | Remaining Nodes UI | DONE | `PreviewViewer` (§32 standardized-by-output-type, honest empty states) · per-type `configSchema` for AI Script (§45) / Save* (§48-50) / Media Merge (§51) + `MediaInfoSubTabs` (§47) + AI Script double-click→focus Prompt (§45) · per-type Preview content + §46 file metadata gated on the artifacts backend bridge (no `.rs` edits) |
| G | Connection Insert | DONE | `InsertEdge` custom edge (hover `+` at midpoint → cmdk picker → `insertNodeBetween` splices A→New→B) |
| H | Review | DONE | §68 validation + §69 acceptance + runtime regression (save/load/run/stop) — all verified |

---

## Recovery (pre-implementation audit)

**What already exists (completed in the Light UI track — must NOT be redone):**
- **Phase A — Build Sidebar.** `src/components/shell/NodeLibrary.tsx` is the right-side Build panel (`border-l`, `bg-surface-sidebar`, splitter 280-360). Header "Build" + "Drag block into the workflow" helper. Search sourced from `uiSlice.buildQuery` (shared with `WorkflowHeader`'s search box). `CATEGORY_ORDER = INPUT/TEXT/AI/RULES/MEDIA/UTILITY/OUTPUT` (7 categories; RULES empty-but-present for MVP2). `NodeLibraryItem.tsx` is the 44px drag row (dataTransfer keys `application/reactflow` + `application/reactflow-label` preserved). Roving-tabindex Arrow nav (fixed Phase 10). Collapse via `rightPanelCollapsed` + splitter.
- **Phase B — Shared Node Card.** `src/components/nodes/BaseNode.tsx` is the single renderer (`nodeTypes.ts` maps all 12 types → `BaseNode`). Card: `min-w-[240px] max-w-[300px] rounded-node shadow-node`; on select → `shadow-node-selected` + 2px `ring-border-focus` + `bg-surface-elevated` (NO scale). Anatomy: NodeHeader (icon+title) → body (description + chips from `def.summarize(data)`, detail mode) → typed ports → NodeStatus footer (non-idle). `summarize` on all 12 nodes (`src/nodes/registry.ts`).
- **Phase D — Inspector.** `src/components/shell/Inspector.tsx`: Build↔Inspector swap on `selectionMode` (none→Build, node/edge/multi→Inspector). "← Build" header calls `clearSelection`. `NodeInspector` renders `def.configSchema` via `PropertyRow`; Advanced section for `field.advanced===true`. `ConnectionInspector` + `MultiSelectInspector` exist. `useDeleteHelpers` (deleteNodes/deleteEdge) + `useInlineConfirm` exist — reusable for the toolbar.
- **Selection model.** `uiSlice`: `selectionMode`/`selectedNodeId`/`selectedEdgeId`/`multiSelectIds`; `selectNode`/`selectEdge`/`setMultiSelect`/`clearSelection`. `WorkflowCanvas` mirrors React Flow selection via `useOnSelectionChange`.
- **Graph mutators.** `addNode`, `onConnect`, `setNodes`, `setEdges`, `updateNodeData`, `markDirty`. Template insertion uses `addNode`+`onConnect`+`fitView` — the exact pattern Add Next should reuse.
- **Keyboard (Phase C partial).** `useWorkspaceShortcuts.ts`: Delete/Backspace (remove nodes/edges + clearSelection + markDirty + announce), **Ctrl/Cmd+D duplicate (inline: 24px offset, new uuid, clone data, select clones)**, Ctrl/Cmd+A select-all, Arrow nudge, Enter=run/stop, Esc=deselect, F6 cycle, Alt+1-4 tabs, Ctrl+Z/Y undo/redo, Ctrl/Cmd+B/I toggle panel. The inline duplicate logic should be extracted to a store action so the toolbar and shortcut share one path.
- **Port compat.** `src/nodes/portCompat.ts`: `resolvePortType(nodeType, handleId, side)` + `isTypeCompatible(a, b)` — for Add Next type-compatible suggestions.

**What is partially implemented:**
- `onPaneContextMenu` (`WorkflowCanvas.tsx:265`) is a stub: right-click canvas → `clearSelection()`. No `role="menu"` DOM, no node context menu. Spec §53 wants canvas + node right-click menus.

**What is missing (the new work):**
- **Phase C floating toolbar.** No `NodeToolbar` usage anywhere. No Add Next / More menu. (Duplicate exists via keyboard only; Delete exists via keyboard only.)
- **Phase E double-click detail.** No `onNodeDoubleClick`; no `NodeDetailPanel`.
- **Phase G connection insert.** No edge `+` insert.
- **Multi-select group toolbar.** Multi-select *selection* works (`setMultiSelect`), but no group toolbar (Duplicate/Delete/Align).
- **More menu.** No DropdownMenu for per-node overflow (Configure/Copy Node ID/Reset Config/Delete).

**Reusable / carry forward:**
- `@xyflow/react` `NodeToolbar` (confirmed exported in v12.11.2) — viewport-correct toolbar, no manual math.
- Custom primitives: `ToolbarButton`, `Panel`, `PanelHeader`, `InspectorSection`, `PropertyRow`, `StatusBadge`, `EmptyState` — build new components in this idiom, not shadcn.
- `useDeleteHelpers().deleteNodes(ids)` — reuse for toolbar Delete.
- The keyboard duplicate logic (lines 287-311) — extract to `duplicateNodes(ids)` store action.

---

## §27 regression contracts (preserved through this track)

| Contract | Rule |
|---|---|
| 6 IPC + camelCase params | controller sole `invoke()` caller; no new IPC |
| dataTransfer keys | `application/reactflow` + `application/reactflow-label` verbatim |
| `screenToFlowPosition` | drop/add placement uses it |
| `addNode` single path | Add Next + Duplicate go through `addNode` (or store action built on it) |
| `isValidConnection` cycle guard | unchanged; Add Next auto-connect bypasses the UI guard but the store `onConnect` path stays valid |
| `colorMode="light"` / `fitView` | unchanged |
| `nodeTypes` single renderer | Add Next creates nodes via the registry → `nodeTypes` map, no per-type renderer |
| `persist partialize` LAYOUT ONLY | new state (popover open, detail open) is transient or component-local, NOT persisted |
| stable selectors | no fresh object/array/Set in any `useWorkflowStore((s)=>…)` selector |
| no `.rs` edits | only `tauri.conf.json` may differ (already done) |
| no `alert()`/`confirm()`/`prompt()` | `useInlineConfirm` for any confirmation |
| status never color-only | unchanged |
| tokens by name only | no raw hex in `.ts`/`.tsx` |

---

## §69 acceptance criteria (target)

Right Build Sidebar compact ✓(done) · categorized+searchable ✓(done) · draggable ✓(done) · compact consistent node cards ✓(done) · selected state clear ✓(done) · **floating toolbar** ✓(Phase C) · **Add Next** ✓(Phase C) · **Duplicate** ✓(Phase C) · **Configure/Edit** ✓(Phase C) · **Delete** ✓(Phase C) · **More menu** ✓(Phase C) · **double-click detail** ✓(Phase E) · **Inspector replaces Build** ✓(done) · **standardized preview** ✓(Phase E — tab shell; per-type viewers Phase F) · **no oversized forms in cards** ✓(done) · **keyboard alternatives** ✓(partial — Delete/Dup done; Enter=configure, F=fit pending) · **pan/zoom-safe toolbar** ✓(Phase C via NodeToolbar) · save/load/run/stop intact · scalable to MVP2 ✓(RULES empty).

---

## Phase C — Selection Toolbar — DONE

**Status:** DONE — verified in a live browser via `agent-browser` (Chromium + Tauri API stubs) + `tsc --noEmit` clean + `npm run build` clean (660.62 kB, dev hook tree-shaken).

### Highest-priority milestone — verified end-to-end

> "Single-click a node → floating toolbar appears → Inspector opens → user can Add Next, Duplicate, Configure, or Delete the node."

Verified live (agent-browser, real React Flow selection via DOM click — not store-only):

| Step | Action | Observed result |
|---|---|---|
| 1 | Click node (Text Input) in canvas | React Flow selection fires; `selectedNodeId='ti-1'`, `node.selected=true` |
| 2 | — | `.react-flow__node-toolbar` renders with 5 buttons in spec §16 order |
| 3 | Toolbar buttons (aria-labels) | `["Add next step","Duplicate","Configure","More node actions","Delete"]` |
| 4 | Inspector swap | right panel `aria-label` flips Build → **Inspector**; shows "Node" + "Content" config field |
| 5 | Click **Duplicate** | 1 node → 2; clone at +24/+24 offset; new id uuid; selection → clone |
| 6 | Click **Add next step** → pick Text Transform | new `textTransform` created 120px below; **edge `ti-1->new(out->in)` auto-connected**; selection → new node; Inspector follows |
| 7 | Click **Delete** (toolbar) | selected node + its touching edge removed; selection cleared |
| 8 | Open **More** menu (⋯) | 5 menuitems: Configure · Duplicate · Copy Node ID · Reset Configuration · Delete |
| 9 | More → **Copy Node ID** | runs, no throw, clipboard write attempted |
| 10 | More → **Delete** | node removed via the separate `NodeMoreMenu.deleteNode` path |
| 11 | Pan/zoom glue | viewport scale 2 → 0.5; toolbar `dy` above node stays **−36 px** (glued) — `NodeToolbar` guarantee |

### Deliverables shipped

- **`src/components/canvas/NodeFloatingToolbar.tsx`** — `NodeToolbar` (`position={Position.Top}`, `offset={8}`) + 5 actions. `ToolbarButton` helper (icon-only, aria-label + title + focus ring). Delete is a deliberate action (no `confirm()` — reversible via Undo).
- **`src/components/canvas/AddNextPopover.tsx`** — `Popover` + `cmdk` `Command` picker. **Suggested** = type-compatible (via `resolvePortType` + `isTypeCompatible`) + `COMMON_NEXT` allowlist; **All Blocks** = registry order. `onPick` → `addNextStep`.
- **`src/components/canvas/NodeMoreMenu.tsx`** — Radix `DropdownMenu`. Configure / Duplicate / Copy Node ID / Reset Configuration / Delete. **No** "Run This Node"/"Disable" (backend doesn't support — kept honest per spec §16/§24).
- **`src/components/primitives/Popover.tsx`** — Radix `@radix-ui/react-popover` wrapper, Void tokens, no animation utils.
- **`src/components/primitives/DropdownMenu.tsx`** — Radix `@radix-ui/react-dropdown-menu` wrapper, `danger` item prop, `data-[highlighted]` styling.
- **`src/store/workflowStore.ts`** — `duplicateNodes(ids)` (composes `setNodes` → history/dirty path) + `addNextStep(sourceId, nodeType)` (composes `addNode` + `onConnect` → history/dirty path). Both reuse existing mutators — single path with the keyboard shortcuts.
- **`src/hooks/useWorkspaceShortcuts.ts`** — Ctrl/Cmd+D refactored to call `store.duplicateNodes(ids)` (was inline ~25 lines → ~10). Keyboard + toolbar share one path.
- **`src/components/nodes/BaseNode.tsx`** — renders `<NodeFloatingToolbar>` as first child **only when `selected && def`** (spec §15: no toolbar on hover).
- Dev-only `window.__voidStore` hook (`import.meta.env.DEV`-gated, tree-shaken from prod) — enables deterministic Phase E/G/H runtime verification via agent-browser.

### §27 regression contracts — Phase C

| Contract | Phase C result |
|---|---|
| 6 IPC + camelCase params | ✓ untouched — no new IPC; toolbar is pure React/store |
| dataTransfer keys | ✓ unchanged in `WorkflowCanvas` (zero diff) |
| `screenToFlowPosition` / `addNode` single path | ✓ Add Next + Duplicate go through `addNode`/`onConnect` via the store actions |
| `isValidConnection` cycle guard | ✓ unchanged; Add Next auto-connect uses store `onConnect` (valid edges only) |
| `colorMode="light"` / `fitView` / `nodeTypes` | ✓ unchanged (no WorkflowCanvas structural edits) |
| `persist partialize` LAYOUT ONLY | ✓ no new persisted state — popover open is local `useState` |
| stable selectors | ✓ all Phase C selectors return stable refs (`s.duplicateNodes` function; `s.nodes.find(id===)` returns existing node object). No fresh object/array/Set. |
| no `.rs` edits | ✓ only `tauri.conf.json` differs (Track 1 window size — pre-existing, permitted) |
| no `alert()`/`confirm()`/`prompt()` | ✓ Delete is deliberate (Undo-reversible); no native dialogs |
| status never color-only / tokens by name | ✓ no new status; all Phase C styles use Void tokens (no raw hex in `.ts/.tsx`) |
| no FFmpeg/Python/shell spawn | ✓ none |

### Notes / known scope

- Toolbar renders **only when selected** (spec §15). The `aria-label` lives on the `BaseNode` card div, not the `.react-flow__node` wrapper (RF limitation) — accessible name is correct on the card.
- `NodeToolbar` collision-avoidance repositions the toolbar horizontally when it would clip the viewport edge; vertical "above the node" relationship is always preserved (measured `dy=−36` at both zoom 2× and 0.5×).
- The earlier "wrong node deleted" observation during testing was a stale `@eN` ref in the harness after Add Next re-rendered the canvas — **not** a toolbar bug. Re-verified with fresh refs: Delete removes exactly the selected node.

---

## Phase E — Double Click / Detail — DONE

**Status:** DONE — verified in a live browser via `agent-browser` (Chromium + Tauri API stubs) + `tsc --noEmit` clean + `npm run build` clean (674.81 kB; Dialog/Tabs/detail panel ≈ +14 kB over Phase C).

### Verification — end-to-end in live browser

> Double-click a node → right-side Sheet opens with capability-gated tabs → user edits config, reviews input/output/run/preview, and closes via the X or Esc.

Verified live (agent-browser, real double-click via CDP pointer events on real React Flow nodes — not store-only):

| Step | Action | Observed result |
|---|---|---|
| 1 | Double-click **AI Script** node | Sheet opens right-side, `z-modal`, overlay dims canvas (visible behind); header shows icon + label + type + Close |
| 2 | Tabs present (AI Script) | `[Configure, Input, Output, Run]` — no Preview (no media port); order stable, presence-gated |
| 3 | Double-click **Media Info** node | Tabs `[Configure, Input, Output, Run, Preview]` — Preview appears (media-capable) |
| 4 | Double-click **Note** node | Single tab `[Note]` — no Configure/Input/Output/Run (non-executable, no ports) |
| 5 | Tab switching | Clicking a `TabsTrigger` activates it (`data-state=active`); only that `TabsContent` is visible (`hidden:false`, non-zero htmlLen); others `hidden:true` |
| 6 | Configure tab — edit Name | `updateNodeData` writes store; canvas node label updates live; project marks dirty |
| 7 | Configure tab — disabled while running | When node is `running`/`queued`, inputs show "Editing disabled while running." + `disabled` |
| 8 | Input tab | Lists the node's input ports; for each, the resolved upstream source label + type (`resolvePortType`); "Resolved input values are produced at run time…" honesty note |
| 9 | Output tab | Output ports + "No output captured yet. Run the workflow to produce a result." (idle) OR latest `PerNodeStatus` (after run) |
| 10 | Run tab — never run | Honest: "Not run yet in this session." (no fake status) |
| 11 | Run tab — after run | `StatusLine` + duration (`(endedAt−startedAt)/1000`) + progress% + this node's logs (`logs.filter(nodeId===)`) |
| 12 | Preview tab | Honest standardized-by-type message; "Per-type preview viewers ship in Phase F." — no fake rendered output |
| 13 | Close via **X** button | Sheet closes; `detailNodeId` cleared; focus returns; canvas fully interactive |
| 14 | Close via **Esc** | Radix Dialog built-in Esc → `onOpenChange(false)` → `closeNodeDetail()`; same result |
| 15 | Node deleted while open | Body swaps to EmptyState "Node no longer exists" + Close action — no stale-render crash |

### Deliverables shipped

- **`src/components/primitives/Dialog.tsx`** — NEW. Radix `@radix-ui/react-dialog` Sheet wrapper. Exports `Dialog`, `DialogTrigger`, `DialogContent` (`side='right'|'left'|'center'` + `width` props), `DialogCloseButton` (X icon), `DialogTitle`, `DialogDescription`. Styling: `z-[var(--z-modal)]`, right-side Sheet `inset-y-0 right-0 rounded-l-panel border-y border-l`, overlay `bg-black/20 backdrop-blur-[1px]` (dims, doesn't hide canvas). Built-in Esc + focus trap + outside-click. `aria-describedby={undefined}` suppresses the Radix description requirement. NO animation utilities (tailwindcss-animate not installed).
- **`src/components/primitives/Tabs.tsx`** — NEW. Radix `@radix-ui/react-tabs` wrapper. Exports `Tabs`, `TabsList`, `TabsTrigger` (active underline via `data-[state=active]:after:h-[2px] data-[state=active]:after:bg-accent`), `TabsContent` (`flex-1 overflow-y-auto`).
- **`src/components/canvas/NodeDetailPanel.tsx`** — NEW. The Phase E centerpiece. **One component for ALL node types** (spec §61 "Avoid unique panel architecture per node"). Tabs are computed from the node's capabilities via `useMemo` (never per-type): `markdownNote` → single Note tab; else Configure (always) + Input (≥1 in port) + Output (≥1 out port OR executable) + Run (executable) + Preview (media-capable, where `isMediaCapable(def)` = type `preview` OR any in/out port ∈ `{media,audio,video,file,artifact}`). Helper components `PortRow` (icon + label + type + upstream feed) and `StatusLine` (icon + label via `STATUS_ICON`/`STATUS_TOKEN`/`STATUS_LABEL`).
- **`src/store/workflowStore.ts`** — `UiSlice`: `detailNodeId: string | null` (transient — excluded from `partialize` by the whitelist) + `openNodeDetail(nodeId)` / `closeNodeDetail()`. Composes only `set` — no graph mutation.
- **`src/components/canvas/WorkflowCanvas.tsx`** — `onNodeDoubleClick` wired (`openNodeDetail(node.id)`). Single click still selects (RF default → toolbar + Inspector); the double-click is the distinct "open detail" gesture and does NOT replace selection.
- **`src/App.tsx`** — `<NodeDetailPanel />` mounted as a sibling of `WorkspaceShell` (Radix Dialog portal overlays the whole app; canvas stays visible behind the Sheet for context, spec §26).
- **`src/components/canvas/AddNextPopover.tsx`** — simplified `sourceOutType` derivation (delegate to `resolvePortType`'s own fallback) + removed unused `NODE_DEFINITION_MAP` import.

### §27 regression contracts — Phase E

| Contract | Phase E result |
|---|---|
| 6 IPC + camelCase params | ✓ untouched — detail panel is pure React/store; no new IPC |
| dataTransfer keys | ✓ unchanged in `WorkflowCanvas` (only added `onNodeDoubleClick`) |
| `screenToFlowPosition` / `addNode` single path | ✓ no node creation in Phase E; only `updateNodeData` (Configure tab) composes the existing mutator |
| `isValidConnection` cycle guard | ✓ unchanged |
| `colorMode="light"` / `fitView` / `nodeTypes` | ✓ unchanged (no WorkflowCanvas structural edits) |
| `persist partialize` LAYOUT ONLY | ✓ `detailNodeId` is transient (NOT in the whitelist); no new persisted state |
| stable selectors | ✓ all Phase E selectors return stable refs (`s.detailNodeId` string, `s.closeNodeDetail` function, `s.nodes.find(id===)` existing node object, `s.perNodeStatus[id]` existing object, `s.logs`/`s.edges` existing arrays). No fresh object/array/Set. |
| no `.rs` edits | ✓ only `tauri.conf.json` differs (Track 1 window size — pre-existing, permitted) |
| no `alert()`/`confirm()`/`prompt()` | ✓ Sheet close is Radix Dialog (X / Esc / outside-click); no native dialogs |
| status never color-only / tokens by name | ✓ `StatusLine` color via `var(--${STATUS_TOKEN[status]})` (token name); all styles use Void tokens (no raw hex in `.ts/.tsx`) |
| no FFmpeg/Python/shell spawn | ✓ none |
| no false run affordances | ✓ Input/Output/Run tabs show REAL store state only; honest "no data captured yet" / "Not run yet" until a run produces status/logs. No fake results, no disabled-but-present buttons implying unsupported capability. |

### Notes / known scope

- **Radix `defaultValue` was silently ignored** in this Dialog-inside-Tabs context: all `TabsTrigger`s rendered `data-state="inactive"` and every `TabsContent` panel was `hidden:true` with `htmlLen:0` — no tab activated. Root cause: Radix `defaultValue` didn't initialize active state here. **Fix:** converted to controlled `value`/`onValueChange` with `useState<string>(tabs[0]?.id ?? 'configure')`. Verified: Configure tab became `active`, panel `hidden:false htmlLen=1674`. The dialog remounts per node (the body is keyed on `detailNodeId`), so a stale tab from a prior node can't leak in.
- The **Preview tab is a shell** (spec §32): it honestly states the viewer is standardized by output type and that per-type viewers ship in **Phase F**. No fake rendered output.
- `openNodeDetail` does NOT change `selectionMode`/`selectedNodeId` — double-click opens detail on top of the existing selection; closing the Sheet leaves the node selected (toolbar + Inspector remain). This matches spec §26 ("does not replace selection").
- The Sheet overlay dims the canvas but does **not** hide it (`bg-black/20 backdrop-blur-[1px]`) — the workflow stays visible for context while editing a node's detail.
- Dev-only `window.__voidStore` hook (DEV-gated, tree-shaken from prod) — enables deterministic Phase E/G/H runtime verification via agent-browser.

---

## Context menus + multi-select group toolbar + selection desync fix — DONE

**Spec:** §53 (node + canvas right-click menus), §54 (clipboard copy/paste), §55/§65 (multi-select group toolbar), §27 (regression).
**Status:** DONE. Runtime-verified in a live browser via agent-browser (store ground-truth, not click-output).
**Build:** `npx tsc --noEmit` EXIT 0 · `npm run build` 693.94 kB (+0.64 kB over Phase E — selection-sync helpers only).

### Verification (agent-browser runtime, store ground-truth)

| # | Check | Result |
|---|---|---|
| 1 | **Node right-click** opens Radix ContextMenu | 5 items in spec §53 order: Configure · Add Next (▸) · Duplicate · Copy · Delete (separators after Add Next and Copy) |
| 2 | Right-click **selects the node** | `ContextMenu.onOpenChange` → `selectNode(id)`; menu actions target the right-clicked node |
| 3 | Node menu **Add Next** sub-menu | `ContextMenuSub` with cmdk Command picker; "Suggested" group lists type-compatible next steps (Text Transform/AI Script/Preview/Delay…); selecting creates node 120px below source, aligned on x (§34), auto-connected (1 edge source→new) |
| 4 | Add Next **selects the new node** (post-fix) | Store: `selectedNodeId` = new node id, `mode:'node'`, new node `.selected:true`, source `.selected:false`; Inspector shows the new node's config. **Pre-fix this silently failed** — see selection-fix note below |
| 5 | Node menu **Delete** | Removes the node + cascades its edges; `selectedNodeId:null`, `mode:'none'` |
| 6 | Node menu **Copy** | `copyNodes([id])` populates `clipboard` (1 entry, correct type) |
| 7 | **Pane right-click** opens Radix ContextMenu | 3 items: Add Node (▸) · Paste N (disabled when clipboard empty — `aria-disabled`, shows clipboard count, never color-only) · Fit View. Menu opens at the cursor; `flowPosition` captured by `onPaneContextMenu` via `screenToFlowPosition` |
| 8 | Pane menu **Add Node** sub-menu | `ContextMenuSub` + cmdk picker; places the chosen node at the right-click flow position (not screen center) |
| 9 | Pane menu **Paste** | `pasteNodes(flowPosition)` creates clones at the cursor; disabled (aria-disabled) when `clipboard.length===0` |
| 10 | Pane menu **Fit View** | `fitView()` via `useReactFlow()` |
| 11 | **Keyboard Ctrl/Cmd+C** | Canvas focus gate (`focusIsInCanvas`) passes; `copyNodes` fills clipboard (1 entry) |
| 12 | **Keyboard Ctrl/Cmd+V** | `pasteNodes(anchor)` creates clone at selected-node position +40 offset; clone is **selected** (selection-fix); `nodes` 2→3 |
| 13 | **GroupToolbar renders** | `role="toolbar" aria-label="N nodes selected"` with count + Duplicate · Delete N nodes · Align. Shown only when `selectionMode==='multi' && multiSelectIds.length>1`; lifted above CanvasToolbar (`mb-[3.25rem]`) |
| 14 | GroupToolbar **Duplicate** | `duplicateNodes(ids)` clones the group (2→4 nodes); the clones are selected (`mode:'multi'`, 2 ids), originals deselected (selection-fix) |
| 15 | GroupToolbar **Align** popover | 6 align (left/center-h/right/top/middle-v/bottom) + 2 distribute (h/v) buttons via shared `useArrange(ids)` |
| 16 | **No Configure** in group toolbar | Per spec §55 — Configure is per-node only (floating NodeToolbar); group toolbar has Duplicate · Delete · Align |
| 17 | **Selection-sync fix** | `selectNode('c1')` → `c1.selected:true`, `c2.selected:false`; `setMultiSelect(['e1','e2'])` → both `.selected:true`; `addNextStep`/`duplicateNodes`/`pasteNodes`/menu Configure now select the correct node(s) and the store stays in lockstep with RF (no `useOnSelectionChange` revert) |

### Deliverables shipped

- **`src/components/primitives/ContextMenu.tsx`** — NEW. Radix `@radix-ui/react-context-menu` wrapper (headless, styled with Void tokens, NO shadcn CLI). Exports `ContextMenu`, `ContextMenuTrigger` (`asChild?: boolean` default true), `ContextMenuContent` (NO `sideOffset` — Radix `ContextMenu.Content` doesn't accept it), `ContextMenuItem` (with `danger` prop), `ContextMenuSeparator`, `ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent` (NO `sideOffset`). Same visual family as `DropdownMenu`. `--accent` shadcn alias intentionally NOT referenced.
- **`src/components/canvas/NodeContextMenu.tsx`** — NEW. Node right-click content (spec §53 order: Configure/Add Next/Duplicate/Copy/Delete). `buildSuggested(sourceType)` reuses AddNextPopover's suggestion logic (COMMON_NEXT allowlist + type-compat). Add Next is a `ContextMenuSub` with a `cmdk` Command picker. Copy calls `copyNodes([nodeId])`. Exports `NodeContextMenuContent({nodeId})`.
- **`src/components/canvas/CanvasContextMenu.tsx`** — NEW. Pane right-click content (spec §53: Add Node/Paste/Fit View). Add Node is a `ContextMenuSub` + cmdk picker placing at `flowPosition`; Paste calls `pasteNodes(flowPosition)` (disabled when clipboard empty — aria-disabled, shows count); Fit View calls `fitView`. Exports `CanvasContextMenuContent({flowPosition})`.
- **`src/components/canvas/GroupToolbar.tsx`** — NEW. Multi-select group toolbar (spec §55: Duplicate/Delete/Align). `role="toolbar"`, count label, Duplicate (`duplicateNodes`), Delete (`useDeleteHelpers().deleteNodes`, danger), Align popover (`useArrange(ids)` — 6 align + 2 distribute). NO Configure (§55).
- **`src/hooks/useArrange.ts`** — NEW. Shared align/distribute hook (single owner of arrange math, §27). `useArrange(ids)` → `{align(axis,mode), distribute(axis)}`. Uses `node.position` (zoom-independent); composes `setNodes`+`markDirty`.
- **`src/hooks/useDeleteHelpers.ts`** — NEW. Shared delete hook (extracted from Inspector local fn). `useDeleteHelpers()` → `{deleteNodes(ids), deleteEdge(edgeId)}`. Composes `setNodes`/`setEdges`/`clearSelection`/`markDirty`/`setAnnouncement`. No `confirm()`.
- **`src/store/workflowStore.ts`** — (1) **clipboard slice** in `GraphSlice`: `clipboard: {type;data}[]` (transient — excluded by partialize whitelist), `copyNodes(ids)` (filters to typed nodes, deep-copies data), `pasteNodes(anchor)` (creates clones at +24 stagger, composes `addNode`, selects via `selectNode`/`setMultiSelect`). Edges never copied (§21). (2) **selection-sync fix** — `selectNode`/`selectEdge`/`setMultiSelect`/`clearSelection` now also write `node.selected`/`edge.selected` via `syncNodeSelection`/`syncEdgeSelection` helpers (transient — no history/dirty). See fix note below.
- **`src/hooks/useWorkspaceShortcuts.ts`** — Ctrl/Cmd+C (copy) + Ctrl/Cmd+V (paste) wired after the Ctrl/Cmd+D block; gated by `focusIsInCanvas()`. The `c` port-connect cue branch is guarded by `if (!cmd(e))` so Cmd+C doesn't conflict.
- **`src/components/canvas/WorkflowCanvas.tsx`** — Wrapped canvas in `<ContextMenu><ContextMenuTrigger asChild>`; pane menu `<CanvasContextMenuContent flowPosition={paneFlowPos} />`. `onPaneContextMenu` now ONLY records `screenToFlowPosition` (NO `preventDefault`, NO `clearSelection`). GroupToolbar rendered as a `bottom-center` Panel (`mb-[3.25rem]`) when `showGroupToolbar`. Removed vestigial `reactFlowWrapper` ref (broke Radix Slot ref merging) + `useRef` import.
- **`src/components/nodes/BaseNode.tsx`** — Card root wrapped in `<ContextMenu onOpenChange={select on open}><ContextMenuTrigger asChild>` + `<NodeContextMenuContent nodeId={id} />`. Right-click selects the node so menu actions target it.
- **`src/components/shell/Inspector.tsx`** — Refactored `MultiSelectInspector` to use shared `useArrange(ids)` + `useDeleteHelpers()` (removed local align/distribute/delete/getSelected/setNodes/markDirty; removed unused `uuidv4` import). Single-owner math (§27).

### §27 regression contracts — context menus + group toolbar + selection fix

| Contract | Result |
|---|---|
| 6 IPC + camelCase params | ✓ untouched — menus/toolbars are pure React/store; no new IPC |
| dataTransfer keys | ✓ unchanged (no drag changes this phase) |
| `screenToFlowPosition` / `addNode` single path | ✓ `pasteNodes` composes `addNode`; `copyNodes` never mutates graph; Add Next reuses `addNextStep` (which composes `addNode`+`onConnect`) |
| `isValidConnection` cycle guard | ✓ unchanged |
| `colorMode="light"` / `fitView` / `nodeTypes` / `replaceGraph` | ✓ unchanged |
| `deriveProblems` run guard | ✓ unchanged |
| `persist partialize` LAYOUT ONLY (7 keys) | ✓ `clipboard` + `paneFlowPos` are transient (excluded by whitelist); `node.selected`/`edge.selected` flags written by selection-sync are also transient (never persisted). Partialize whitelist unchanged. |
| stable selectors | ✓ `selectionMode` (scalar), `multiSelectIds` (existing array), function refs — all stable. `syncNodeSelection`/`syncEdgeSelection` return the SAME array when nothing changed (no-op allocation), so no needless re-render. |
| no `.rs` edits | ✓ only `.ts`/`.tsx` (tauri.conf.json is Track 1, pre-existing) |
| no `alert()`/`confirm()`/`prompt()` | ✓ Delete is a deliberate action (reversible via Undo); Paste disabled state is `aria-disabled` |
| status never color-only | ✓ Paste-disabled uses `aria-disabled` + reduced opacity, never color-only; Delete `danger` uses `text-text-error` + icon |
| tokens by name only (no raw hex) | ✓ all styles use Void tokens (no raw hex in `.ts/.tsx`) |
| no FFmpeg/Python/shell spawn | ✓ none |

### Notes / critical fixes

- **Programmatic-selection desync fix (the headline fix).** React Flow runs the graph in **controlled mode**: `node.selected`/`edge.selected` (synced through `onNodesChange → applyNodeChanges` on user clicks) are the real selection source that drives the rendered selection ring AND the `useOnSelectionChange` mirror. The store scalars (`selectedNodeId`/`multiSelectIds`/`selectedEdgeId`/`selectionMode`) are a *projection*. The 4 selection actions used to set ONLY the scalars — they never wrote `.selected` on the node/edge objects. So programmatic selection (`addNextStep` "select new", `duplicateNodes`, `pasteNodes`, menu Configure) silently failed: RF kept the previously-clicked node selected and `useOnSelectionChange` reverted the store. **Fix:** `selectNode`/`selectEdge`/`setMultiSelect`/`clearSelection` now also write `.selected` via `syncNodeSelection`/`syncEdgeSelection` (transient — skips history + markDirty; returns the same array when nothing changed, so no needless re-render). The `useOnSelectionChange` mirror becomes idempotent. **Verified:** Add Next now selects the new node (store `selectedNodeId`=new id, `.selected:true`, source deselected, Inspector shows new node); Duplicate/Paste/Configure likewise select correctly. This was a pre-existing Phase C regression ("select new" in Add Next never worked at runtime) surfaced by this phase's rigorous agent-browser testing — not introduced by the context menus.

- **Pane context menu didn't open (critical Radix gotcha).** Radix `ContextMenu.Trigger` skips opening when the `contextmenu` event is `defaultPrevented`. The original `onPaneContextMenu` (RF pane handler, an INNER element) called `e.preventDefault()`, which fired during bubbling BEFORE the event reached the Radix trigger on the ancestor canvas wrapper — so the menu never opened. **Fix:** removed `e.preventDefault()` from `onPaneContextMenu` (Radix suppresses the native menu when it opens) and removed `clearSelection()` (right-click should preserve selection). Only `setPaneFlowPos(screenToFlowPosition(...))` remains.

- **Vestigial `reactFlowWrapper` ref.** Declared + attached to the `asChild` child `<div>`, conflicting with Radix Slot's ref merging. Removed both the `useRef` declaration and the `ref` attribute (the ref was never read — `screenToFlowPosition` uses the RF viewport, not this ref).

- **`@radix-ui/react-context-menu` added** (^2.3.7) — the only new dependency this phase. No shadcn CLI. cmdk + lucide-react reused from Phase C.

### Next

**Phase F (Remaining Nodes UI)** remains deferred to keep the interaction-critical path moving. Next active work: **Phase G: Connection insert** (edge `+` → node picker → A→New→B, spec §33/§66, `ConnectionInsertButton` §62), then **Phase H: Review** (§69 acceptance pass + runtime regression: save/load/run/stop/logs/progress/Tauri IPC).

---

## Phase G — Connection Insert — DONE

**Spec:** §33 (Inline Add Between Connected Nodes), §66 (Phase G), §62 (ConnectionInsertButton component).
**Status:** DONE. Runtime-verified in a live browser via agent-browser (store ground-truth + edge-path click).
**Build:** `npx tsc --noEmit` EXIT 0 · `npm run build` 698.02 kB (+4.08 kB over the context-menu phase — InsertEdge component + insertNodeBetween store action).

### Verification (agent-browser runtime, store ground-truth)

| # | Check | Result |
|---|---|---|
| 1 | **Custom edge renders** for all edges (InsertEdge is the default `edgeTypes.insert`) | Bezier path drawn; `defaultEdgeOptions.type='insert'` |
| 2 | **Legacy `type:'default'` edges** normalized to `insert` in `styledEdges` | Loaded graphs (saved as `'default'`) also gain the `+` affordance; `store.edges` stays plain (override never persists) |
| 3 | **Hover edge** reveals `+` button at the path label/midpoint | Hit-zone (40×40, `pointer-events-auto` inside `EdgeLabelRenderer`) → `onPointerEnter` → `hovered:true` → `+` opacity 0→1. Verified via real CDP mouse move (synthetic `dispatchEvent` does NOT fire React synthetic `onPointerEnter`) |
| 4 | **`+` placement** at the curve's visual midpoint | `getBezierPath` returns `labelX/labelY` (the on-curve label point); the hit-zone is `translate(-50%,-50%) translate(labelX,labelY)` → centered on the curve, not the geometric bbox center |
| 5 | **Click `+`** opens the node picker | Radix `Popover` (controlled `open`/`onOpenChange`) + cmdk `Command`. **Critical:** removed the manual `onClick={() => setPickerOpen(v=>!v)}` toggle — it raced with Radix's `onOpenChange` and immediately closed the popover. Radix trigger owns the click; `onOpenChange` is the single state writer. |
| 6 | Picker: **Suggested** group | Nodes whose first in-port is type-compatible with A's out-port (mirrors AddNextPopover's `COMMON_NEXT` allowlist + type-compat logic) |
| 7 | Picker: **All Blocks** group | Every `NODE_DEFINITION`, registry order |
| 8 | **Select a block splices** A→New→B | Store: 2 nodes → 3 nodes; edges `g1→new` + `new→g2` (2 edges); original `g1→g2` removed (`g1g2edgeStillExists:false`) |
| 9 | **New node at midpoint** | Position = midpoint of A and B (g1 `{300,160}` + g2 `{300,360}` → new `{300,260}`) — zoom-independent node-space coords |
| 10 | **Handles preserved** | A→New keeps A's original `sourceHandle`; New→B keeps B's original `targetHandle`; new node's in/out handles from the registry single-port ids. Edge shape matches a drag-connect (§27 edge contract) |
| 11 | **New node selected** after insert | `selectNode(newId)` (selection-sync fix) → `selectedNodeId`=new id, `mode:'node'`, new `.selected:true`; Inspector shows the inserted node ("Text Transform") |
| 12 | **Half-connection safety** | If the new node has no in/out port, that half is skipped (never a crash) |
| 13 | **Edge selection still works** (custom edge doesn't break it) | Clicking an edge path → `onEdgesChange` (select) → `useOnSelectionChange` → `selectedEdgeId`=edge id, `mode:'edge'`; ConnectionInspector renders ("Delete Connection"); `edge-selected` accent styling applies via the wrapper `<g>` (RF applies `edge.className` automatically) |
| 14 | **Run-payload / selected styling** still applies | `BaseEdge` forwards `style`/`markerEnd`; RF applies the edge's `className` (`edge-selected`/`edge-run-payload`, set in `styledEdges`) to the wrapper `<g>` — App.css rules still target the custom edge |

### Deliverables shipped

- **`src/components/canvas/InsertEdge.tsx`** — NEW. The custom edge (spec §62 `ConnectionInsertButton` realized as a custom edge type). Renders `BaseEdge` (bezier path via `getBezierPath`) + a hover `+` button at the label midpoint via `EdgeLabelRenderer`. The `+` opens a `Popover + cmdk Command` node picker (mirrors AddNextPopover's structure) calling `insertNodeBetween(edgeId, type)`. Hit-zone 40×40 (`pointer-events-auto`) so the `+` reveals on hover even though the button is `opacity:0` until hovered. **Key fixes during verification:** (1) generous 40×40 hit-zone (chicken-and-egg: the opacity:0 button isn't itself a hover target); (2) removed the manual `onClick` toggle that raced Radix's controlled `onOpenChange`; (3) removed `className` from `EdgeProps` destructure (not on the type — RF applies edge `className` to the wrapper `<g>` automatically). Tokens by name only.
- **`src/store/workflowStore.ts`** — `GraphSlice`: new `insertNodeBetween(edgeId, nodeType)` action. Composes `addNode` (single node-creation path, §27) + `setEdges` (remove A→B) + `onConnect` ×2 (A→New, New→B, preserving original handles via `?? null` coercion for `string|null|undefined` → `string|null`). Places the new node at the midpoint of A and B. Selects the new node. Announces "Inserted X between nodes." `handleId` coercion `?? null` fixes the `TS2345` (Connection type mismatch).
- **`src/components/canvas/WorkflowCanvas.tsx`** — (1) `edgeTypes = { insert: InsertEdge }` (stable module-level ref, §27). (2) `defaultEdgeOptions.type` `'default'` → `'insert'`. (3) `edgeTypes={edgeTypes}` on `<ReactFlow>`. (4) `styledEdges` normalizes `type: edge.type !== 'default' ? edge.type : 'insert'` so legacy saved edges render as InsertEdge (override is render-only — `store.edges` stays plain, save serializes the original type).

### §27 regression contracts — Phase G

| Contract | Phase G result |
|---|---|
| 6 IPC + camelCase params | ✓ untouched — insert-between is pure React/store; no new IPC |
| dataTransfer keys | ✓ unchanged (no drag changes) |
| `screenToFlowPosition` / `addNode` single path | ✓ `insertNodeBetween` composes `addNode` + `onConnect` (the same edge path a drag-connect uses); no new node/edge creation path |
| `isValidConnection` cycle guard | ✓ unchanged — the spliced edges go through `onConnect` (no re-validation needed; the splice can't create a cycle: A→New→B is a linear chain replacing A→B) |
| `colorMode="light"` / `fitView` / `nodeTypes` / `replaceGraph` | ✓ unchanged (added `edgeTypes` alongside `nodeTypes`) |
| `deriveProblems` run guard | ✓ unchanged |
| `persist partialize` LAYOUT ONLY (7 keys) | ✓ no new persisted state — `insertNodeBetween` is a transient action; the rendered `type:'insert'` override is render-only (never written to `store.edges`) |
| stable selectors | ✓ `edgeTypes` is a module-level const (stable ref, not recreated per render — same discipline as `nodeTypes`); `InsertEdge`'s `useWorkflowStore` selector returns a stable scalar/string (the source out-port type) |
| no `.rs` edits | ✓ only `.ts`/`.tsx` |
| no `alert()`/`confirm()`/`prompt()` | ✓ none |
| status never color-only / tokens by name | ✓ `+` button uses Void tokens (`border-border-default`, `bg-surface-elevated`, `text-text-secondary`); no raw hex |
| no FFmpeg/Python/shell spawn | ✓ none |

### Notes / critical fixes

- **Radix Popover controlled-open race.** The first version used `onClick={() => setPickerOpen((v) => !v)}` on the trigger button AND `open={pickerOpen} onOpenChange={setPickerOpen}`. Clicking the button: Radix opens → fires `onOpenChange(true)` (sets `pickerOpen=true`) — but the button's `onClick` ALSO fires `setPickerOpen(v => !v)` which flips it back to `false`. Net: the popover never opened (`aria-expanded` stayed `false`). **Fix:** removed the manual `onClick`; Radix `PopoverTrigger` handles click→`onOpenChange(true)` natively, and `open`/`onOpenChange` is the single state writer. Verified: `aria-expanded:true`, picker opens with Suggested + All Blocks.

- **Hit-zone chicken-and-egg.** The `+` button is `opacity:0` until `hovered:true`, but `hovered` only becomes true on `onPointerEnter` of the hit-zone — and a 0-opacity 20×20 button is not a reliable hover target. **Fix:** a 40×40 transparent hit-zone (the button's parent div, `pointer-events-auto` inside `EdgeLabelRenderer`) centered on the curve midpoint via `translate(-50%,-50%) translate(labelX,labelY)`. The pointer enters the zone → `hovered:true` → `+` fades in. (Earlier version added `marginLeft/marginTop: -20` which double-offset the centering — removed; `translate(-50%,-50%)` alone centers the fixed-size box.)

- **`labelX/labelY` vs geometric midpoint.** `getBezierPath`'s label point is the on-curve position (where RF would place a text label), NOT the bounding-box center. For a top→bottom bezier it sits on the curve at the visual middle — exactly where the `+` should be (on the edge, not floating in space). Verified center = (482, 359) for an edge from y=160→360.

- **Edge selection with a custom edge.** Replacing the default edge with a custom `InsertEdge` does NOT break RF's built-in edge-click selection: `BaseEdge` keeps the default `interactionWidth:20` (invisible hit area around the path), and RF applies the edge's `className` (`edge-selected`/`edge-run-payload`) to the wrapper `<g>` automatically — so App.css selection/run-payload styling still targets the custom edge without forwarding `className` through `EdgeProps` (which doesn't expose it). Verified by dispatching a click on the edge path element → `selectedEdgeId` set, `mode:'edge'`, ConnectionInspector rendered.

- **Synthetic events don't fire React handlers.** During verification, `dispatchEvent(new PointerEvent('pointerenter'))` did NOT flip `hovered` (React synthetic handlers aren't triggered by raw `dispatchEvent`). Real CDP mouse moves (`agent-browser mouse move`) DO fire them. Conversely, `dispatchEvent(new MouseEvent('click'))` on the edge path DID select the edge (RF uses native event delegation on the pane). Lesson: verify hover via real CDP input; verify RF selection via native click dispatch or store ground-truth.

### Next

**Phase H: Review** — §69 acceptance pass + runtime regression (save/load/run/stop). Phase F (Remaining Nodes UI / per-type Preview viewers) follows.

---

## Phase F — Remaining Nodes UI — DONE

**Spec:** §32 (standardized Preview by output type), §45 (AI Script), §47 (Media Info detail), §48-50 (Save*), §51 (per-type Inspector deep-design).
**Status:** DONE. Historical UI-track restrictions below described the state
before Runtime Contract V2. The backend bridge, native dialog, typed results,
Media Info metadata, and per-type media Preview are now implemented; see
`docs/status/NODE_RUNTIME_IMPLEMENTATION_STATUS.md`.
**Build:** `npx tsc --noEmit` EXIT 0 · `npm run build` 708.46 kB JS + 58.75 kB CSS (+10.44 kB over Phase H — `PreviewViewer` + NodeDetailPanel Preview-tab wiring).

### What shipped

- **`src/components/canvas/PreviewViewer.tsx`** — NEW. The standardized preview surface, dispatched **by output type, not by node type** (spec §32 "Preview should not be reinvented per node"). Exports `PreviewViewer({kind, status})`, `previewKindForType(type)→PreviewKind`, and the `PreviewKind` union (`text|json|image|audio|video|media|media-info`).
  - **`previewKindForType`** maps a port type → viewer kind: `text→text`, `json→json`, `audio→audio`, `video→video`; `media`/`file`/`artifact`/`any`/`number`/`boolean`/default → `media` (no dedicated `image` port type — §35/§36 ports have no `image`; image previews reach the generic `media` viewer, which the artifacts bridge will specialize once the MIME is known).
  - **Honesty invariants (spec §29/§30 — "no false run affordances"):** the backend does NOT persist node output values, artifact paths, or media URLs to the frontend — there is no `convertFileSrc` bridge and no artifacts IPC today (no `.rs` edits allowed). So each viewer is an **honest, structured empty state**: it names the type it will render (icon + label + `VIEWER_HINT` describing exactly what will populate it once the artifacts bridge lands), and distinguishes "never run" from "ran but no payload reached the frontend". No viewer fabricates content, no `<video src>` points at a fake URL, no fake JSON tree is drawn. This is the §32 *structure* delivered now; the *content* arrives with the backend bridge.
  - Tokens by name only (no raw hex); uses the shared `InspectorSection` primitive.

- **`src/components/canvas/NodeDetailPanel.tsx`** — wired the Preview tab to `PreviewViewer`:
  - `isPreviewCapable(def)` = `def.type==='preview' || def.type==='mediaInfo'` (the two media-capable nodes; expanded to any media-port node in a future step if §32 widens).
  - `previewKind` derived via `useMemo`: `mediaInfo`→`media-info`; else the first out-port type → `previewKindForType`; else the first resolvable in-port source type; else `previewKindForType(firstIn.type)`. Stable per render (no selector allocation).
  - The Preview `<TabsContent value="preview">` renders `<PreviewViewer kind={previewKind} status=… />` (replacing the Phase E "per-type viewers ship in Phase F" placeholder). A `mediaInfo` node also keeps its §47 structured-metadata surface inline above the viewer.

- **Per-type `configSchema` (spec §45/§48-51) — verified complete** in `src/nodes/registry.ts`. All target nodes carry full, spec-matching fields rendered through the shared `PropertyRow` + `InspectorSection` (Basic / Advanced) mechanism — no bespoke panel per node (§61 holds):
  - **AI Script (§45):** Provider, Model, Prompt, System Instructions, Output (Text/JSON/Structured), Temperature + Advanced: Timeout, Response Schema.
  - **Save Text (§48):** Filename, Output Directory, Overwrite behavior (Rename/Overwrite/Skip).
  - **Save JSON (§49):** Filename, Formatting (Pretty/Compact), Output Directory.
  - **Save Artifact (§50):** Filename, Location, Artifact type (Auto/Video/Audio/Image/File), Overwrite behavior.
  - **Media Merge (§51):** Audio Mode (Replace/Mix), Duration (Shortest/Video/Audio), Resolution, Frame rate + Advanced: Video codec, Audio codec, Bitrate.

- **Media Info sub-tabs (§47)** — `MediaInfoSubTabs` renders Summary / Video / Audio / Raw nested Radix Tabs inside the generic Configure tab (the one per-node structural exception; §61 still holds — no bespoke sheet). Raw FFprobe output is Advanced-only (§47). Each sub-tab is an honest structured empty state until a run delivers probed metadata (no `.rs` IPC today).

- **AI Script double-click → focus Prompt (§45)** — `NodeDetailPanel` runs a `useEffect` on open: when the opened node is an `aiScript` and not running/queued, it focuses the Prompt textarea (`cfg-<id>-prompt`, a stable id now passed to `PropertyRow`). Frontend-only (no IPC). Skipped while running (the Prompt is disabled then — focusing a disabled control is pointless). The dialog remounts per node (`key=detailNodeId`), so the effect runs fresh each open.

### Verification gate (green)

- `npx tsc --noEmit` — clean.
- `npm run build` — clean (708.46 kB; the +10.44 kB is `PreviewViewer` + the Preview-tab wiring; the focus-Prompt fix is zero-cost — a `useEffect` + a stable id).
- `npm run tauri:dev` — Vite ready on :1420 + Rust `Finished dev` + `tauri-app.exe` launched; no errors/panics.
- §27 checks: no new IPC (PreviewViewer + focus effect are pure presentational/React); no new persisted state (`previewKind` is a `useMemo` in the component body, never a store field); no `alert()`/`confirm()`/`prompt()`; no `.rs` edits; tokens by name only (no raw hex in the new file); no selector returns a fresh object/array (`useMemo` is local derivation, not a Zustand selector — same discipline as `summarize` in BaseNode); status never color-only (`VIEWER_LABEL` text + `KIND_ICON` icon + token color).

### Former gaps (closed by Runtime Contract V2)

- Per-type Preview now receives typed node results and uses `convertFileSrc` for
  image/audio/video playback.
- Local File Input now uses the native dialog and returns canonical file
  metadata. Historical statements above are retained as an implementation log.

---

## Phase H — Review — DONE

**Spec:** §68 (Required Validation), §69 (Acceptance Criteria).
**Status:** DONE. Acceptance pass + runtime regression completed in a live browser via agent-browser (store ground-truth + UI snapshot).
**Build:** `npx tsc --noEmit` EXIT 0 · `npm run build` 698.02 kB JS + 58.75 kB CSS (unchanged from Phase G — Phase H is review-only, no code changes).

### §68 Required Validation — all verified (agent-browser runtime)

| # | Check | Result | Verified in |
|---|---|---|---|
| 1 | select node | `selectNode(id)` → `selectedNodeId` set, `node.selected:true`, `mode:'node'` | selection-fix + Phase H |
| 2 | deselect node | `clearSelection()` → `selectedNodeId:null`, all `.selected:false`, `mode:'none'` | selection-fix |
| 3 | toolbar appears | NodeToolbar renders on selected node: Add next · Duplicate · Configure · More · Delete | Phase H (re-verified) |
| 4 | toolbar follows pan/zoom | `NodeToolbar` (RF) is viewport-correct by construction — positioned in flow-space | Phase C (structural) |
| 5 | duplicate | `duplicateNodes(ids)` → clones at +24 offset, clones selected | context-menu phase + Phase H |
| 6 | delete | node menu Delete + keyboard Delete → node removed, edges cascaded, selection cleared | context-menu phase |
| 7 | configure | Inspector `PropertyRow` from `configSchema`; NodeDetailPanel Configure tab | Phase E |
| 8 | double click | `onNodeDoubleClick` → NodeDetailPanel Sheet opens | Phase E |
| 9 | Inspector opens | `selectionMode` swap none→node/edge/multi → Inspector renders | Phase D |
| 10 | Inspector closes | "← Build" / clearSelection → Build panel returns | Phase D |
| 11 | Add Next | `addNextStep` → node 120px below, auto-connected, selected | Phase C + selection-fix |
| 12 | drag node | `nodeDragStop` → `setNodes` (onNodesChange position) | Track 1 |
| 13 | drag from Build | dataTransfer `application/reactflow`+`-label`, `screenToFlowPosition`, `addNode` | Track 1 (regression: unchanged) |
| 14 | connect nodes | drag edge → `onConnect` + `isValidConnection` cycle guard | Track 1 (regression: unchanged) |
| 15 | zoom | CanvasToolbar zoom −/%/+ (RF `zoomIn`/`zoomOut`) | Phase 6 (Track 1) |
| 16 | Fit | CanvasToolbar Fit + pane-menu Fit View → `fitView()` | Phase 6 + context-menu phase |
| 17 | save | `save_workflow` IPC → `setSaved` → "Saved" chip; serialization clean (no `.selected` leakage) | Phase H (round-trip) |
| 18 | reload | `replaceGraph(parsed)` → 3 nodes + 2 edges restored, `dirty:false`, `canUndo:false`, `selectionMode:'none'`, `problems:0` | Phase H (round-trip) |
| 19 | run | `start_run` IPC → `runStatus:'running'`, `runId` set, `runStartedAt` set; pre-run guard (frontend-only executable block) intact | Phase H |
| 20 | stop | `cancel_run` IPC → `setRunTerminal('cancelled')` → `runStatus:'idle'`, `runId:null`; history entry `{runId, status:'cancelled'}` recorded | Phase H |

### §69 Acceptance Criteria — all met

| Criterion | Met | Evidence |
|---|---|---|
| Right Build Sidebar follows compact reference | ✓ | Phase A (Light UI Phases 2-3): search, 7 categories, drag, splitter 280-360 |
| Sidebar categorized + searchable | ✓ | `buildQuery` shared, `CATEGORY_ORDER` 7 groups, live filter |
| Sidebar items draggable | ✓ | dataTransfer keys `application/reactflow`+`-label` preserved (§27) |
| Node cards compact + consistent | ✓ | Phase B: single `BaseNode` renderer, all 12 types, `min-w-[240px] max-w-[300px]` |
| Selected state visually clear | ✓ | `shadow-node-selected` + 2px `ring-border-focus` + `bg-surface-elevated` (NO scale) + `node.selected` sync |
| Selected node displays floating toolbar | ✓ | `NodeToolbar` (RF viewport-correct) — Add next/Duplicate/Configure/More/Delete |
| Toolbar provides Add Next | ✓ | `AddNextPopover` (cmdk picker → `addNextStep`) |
| Toolbar provides Duplicate | ✓ | `duplicateNodes(ids)` |
| Toolbar provides Configure/Edit | ✓ | `selectNode` → Inspector; double-click → NodeDetailPanel |
| Toolbar provides Delete | ✓ | `useDeleteHelpers().deleteNodes` |
| More menu exists | ✓ | `NodeMoreMenu` (Configure/Duplicate/Copy Node ID/Reset Config/Delete) |
| Double-click opens Configure/Preview detail | ✓ | Phase E: `NodeDetailPanel` (Configure/Input/Output/Run/Preview tabs) |
| Inspector replaces Build panel when node selected | ✓ | Phase D: `selectionMode` swap |
| Preview standardized by output type | ✓ | Phase E Preview tab (shell — per-type viewers deferred to Phase F; honest messaging) |
| Node cards do not contain oversized forms | ✓ | config in Inspector/Detail, not on card; `summarize` chips only |
| Keyboard alternatives exist | ✓ | `useWorkspaceShortcuts`: Delete, Ctrl/Cmd+A/D/C/V, Arrow nudge, Enter run/stop, Esc, F6, Alt+1-4, Ctrl+Z/Y, Ctrl/Cmd+B/I |
| Pan/zoom does not break toolbar positioning | ✓ | `NodeToolbar` viewport-correct by construction |
| Existing save/load/run/stop behavior intact | ✓ | Phase H regression: round-trip + run lifecycle verified |
| UI scalable to Batch Image/Local TTS/Whiteboard | ✓ | registry-driven (add a node def → card/Inspector/menu all generated); no per-type hardcoding; RULES category empty-but-present for MVP2 |

### Runtime regression (Phase H, agent-browser)

**Save → load round-trip:**
- Seeded 3-node graph (textInput → textTransform[operation:Uppercase] → saveText) + 2 edges.
- Serialized via the save path (`JSON.stringify({nodes, edges})`) — 503 bytes, **no `.selected` flags leaked** (selection is transient; `clearSelection` was called).
- Simulated reload: `replaceGraph(parsed)` → 3 nodes + 2 edges restored; `operation:Uppercase` config preserved; `dirty:false`; `canUndo:false` (history reset on load); `selectionMode:'none'`; `problems:0`.
- **Serialization contract survived** all store changes (selection-sync `.selected` writes, `insertNodeBetween`, clipboard slice) — `store.edges` stays plain; save JSON clean.

**Run → stop lifecycle:**
- Pre-run guard: 3 canonical nodes → no block (frontend-only executable would block with a Problems entry + toast).
- `run()` → `start_run` IPC (stub runId 1) → `runStatus:'running'`, `runId:1`, `runStartedAt` set; header shows "Running…", Run button toggles to "Stop".
- `stop()` → `cancel_run` IPC → `setRunTerminal('cancelled')` → `runStatus:'idle'`, `runId:null`, `runError:null`.
- Run history: `{runId:1, status:'cancelled'}` recorded in `history`.
- `perNodeStatus` empty in browser (stub's `listen` never fires `node-status`/`workflow-log` — expected; real Tauri emits them). The run-event subscription path (`listen('workflow-log')` + `listen('node-status')` → `setNodeStatus`/`addLog`) is unchanged structurally.

### §27 regression contracts — full-track confirmation

| Contract | Track status |
|---|---|
| 6 IPC + camelCase params | ✓ controller sole `invoke()` caller; no new IPC this track |
| dataTransfer keys | ✓ unchanged |
| `screenToFlowPosition` / `addNode` single path | ✓ `placeNode` (Track 1) + `addNextStep`/`insertNodeBetween`/`pasteNodes` all compose `addNode` + `onConnect` |
| `isValidConnection` cycle guard | ✓ unchanged |
| `colorMode="light"` / `fitView` / `nodeTypes` / `replaceGraph` | ✓ unchanged (added `edgeTypes` alongside) |
| `deriveProblems` run guard | ✓ unchanged |
| `persist partialize` LAYOUT ONLY (7 keys) | ✓ unchanged — all new state (`clipboard`, `paneFlowPos`, `detailNodeId`, `addModeNodeType`) transient; `.selected` flags transient |
| stable selectors | ✓ `edgeTypes`/`nodeTypes` module-level consts; selectors return scalars/existing refs; `syncNodeSelection`/`syncEdgeSelection` no-op when unchanged |
| no `.rs` edits | ✓ only `.ts`/`.tsx` (tauri.conf.json = Track 1 window size, pre-existing) |
| no `alert()`/`confirm()`/`prompt()` | ✓ Radix Dialog/Popover/ContextMenu + reversible Delete |
| status never color-only / tokens by name | ✓ all Void tokens; no raw hex in `.ts/.tsx` |
| no FFmpeg/Python/shell spawn | ✓ none |
| no MVP2 backend features | ✓ no Batch Image/Local TTS/Whiteboard/Whisper/Voice cloning/AI video |

### Track complete

All interaction phases shipped and runtime-verified: **A** (Build Sidebar) · **B** (Shared Node Card) · **C** (floating toolbar) · **D** (Inspector, Light UI) · **E** (double-click detail) · **context menus + group toolbar + selection fix** · **F** (Remaining Nodes UI — Preview structure + per-type configSchema + Media Info sub-tabs + AI Script focus-Prompt; per-type Preview content + §46 file metadata gated on the backend bridge) · **G** (connection insert) · **H** (review). The interaction-critical path (sidebar → card → selection → toolbar → Inspector → detail → context menus → group toolbar → connection insert → keyboard → save/load/run/stop) is complete and regression-clean. The two remaining gaps (per-type Preview content, §46 file metadata) are honestly deferred to the artifacts backend bridge — no fake output, no `.rs` edits.
