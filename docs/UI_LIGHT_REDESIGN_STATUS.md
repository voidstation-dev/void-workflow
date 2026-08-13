# Void Workflow — Light UI Redesign Status

**Spec:** [VOID_WORKFLOW_LIGHT_UI_SPEC.md](../VOID_WORKFLOW_LIGHT_UI_SPEC.md)
**Track:** Light workflow-builder UI (migrates the merged dark UI on `main` → light)
**Method:** Incremental migration. No rebuild from scratch. No `.rs` edits (Rust/IPC frozen).
**Verification gate per phase:** `npx tsc --noEmit` → `npm run build` → `npm run tauri:dev` runtime smoke → §27 regression checks. Auto-advance to the next phase only if the gate is green; stop and report if a phase fails.
**Audit:** [docs/ui/UI_AUDIT.md](ui/UI_AUDIT.md) (Phase 0)

> Status legend: `NOT_STARTED` · `IN_PROGRESS` · `IN_REVIEW` · `BLOCKED` · `DONE`

---

## Phase overview

| Phase | Title | Status | Deliverable |
|---|---|---|---|
| 0 | Audit | DONE | [docs/ui/UI_AUDIT.md](ui/UI_AUDIT.md) + this tracker |
| 1 | Light Design System | DONE | [docs/ui/LIGHT_DESIGN_SYSTEM.md](ui/LIGHT_DESIGN_SYSTEM.md) + light tokens live |
| 2 | Workflow Header & Tabs | DONE | `WorkflowHeader` + `WorkflowTabs` |
| 3 | Right Build Panel | DONE | `BuildPanel` / `BuildCategory` / `BuildNodeItem` on the right |
| 4 | Shared Node Visual System | DONE | `WorkflowNode` card (BaseNode) + `summarize` on all 12 nodes + `nodeCardMode` |
| 5 | Inspector System | DONE | Build↔Inspector swap complete + "← Back to Build" + Advanced section + unified `rightPanelWidth` |
| 6 | Canvas Visual System | DONE | light canvas + `CanvasToolbar` + `StartMarker` + Undo/Redo + Outline/Detail toggle |
| 7 | Remaining MVP1 Nodes | DONE | all 12 nodes render under light tokens with `summarize` chips (verified) |
| 8 | Execution UX | DONE | light restyled dock + Runs route (Today/Earlier grouping) + Retry Failed + Open Output |
| 9 | Settings / Runs / Environment | DONE | `EnvironmentScreen` 6-row honest health + `SettingsScreen` System Health → Environment pointer |
| 10 | Review & Cleanup | DONE | §39 acceptance pass (15/15 PASS) + §27 contracts (8/8 PASS) + cleanup fixes |

---

## Phase 0 — Audit — DONE

- Read `VOID_WORKFLOW_LIGHT_UI_SPEC.md` (all 40 sections) completely.
- Inspected current repo: `main` branch holds the merged dark UI (commit `9d937ed` + PR #1).
- 10-subsystem parallel gap-audit vs the Light spec, synthesized into [docs/ui/UI_AUDIT.md](ui/UI_AUDIT.md).
- Runtime confirmed: app launches clean via `npm run tauri:dev`; no runtime errors; the prior Zustand infinite-loop bug is gone.
- **One blocking contract decision surfaced:** `colorMode="dark"` (a frozen §27 contract item at [WorkflowCanvas.tsx:324](src/components/canvas/WorkflowCanvas.tsx#L324)) must flip to `"light"`. This is the only explicitly-flagged hard-contract *change* in the redesign; every other migration is presentation-only / token-only.
- 11 open questions recorded in the audit (§11), of which 1 is already resolved (see below).

**Resolved during audit:** `activeScreen` is **NOT** in the persist `partialize` whitelist ([workflowStore.ts:535-545](src/store/workflowStore.ts#L535)); the LAYOUT-ONLY contract is intact — no breach to fix in Phase 2.

---

## Phase 1 — Light Design System — DONE

**Scope:** Redefine the token system for light. Flip `color-scheme` + `colorMode`. Lock the shadcn decision. Correct radius/shadow scales.

**Files:** `src/App.css`, `index.html`, `src/components/canvas/WorkflowCanvas.tsx` (colorMode only), `src-tauri/tauri.conf.json`, `docs/ui/LIGHT_DESIGN_SYSTEM.md` (new).

**Deliverable:** [docs/ui/LIGHT_DESIGN_SYSTEM.md](ui/LIGHT_DESIGN_SYSTEM.md) + light tokens live (app boots in light).

**Key gaps closed:** G-2 (color-scheme/colorMode), G-3 (full light palette), G-4 (radius), G-5 (shadow), G-22 (status tokens), G-23 (port tokens), G-13 (shadcn decision).

**What shipped:**
- `:root` in [App.css](src/App.css) rewritten: canvas `#F7F7F5`, panels/header `#FFFFFF`, border `#E6E7E9`/`#C9CBD0`, text `#17181A`/`#64676D`/`#92969E`, accent `#5267E9` (indigo — whole hue family moved from blue `#1d6fd0`), status + port tokens re-contrasted/desaturated on white (muted, not neon).
- Radius corrected to spec §25: `--radius-node` 10px / `--radius-panel` 12px / `--radius-control` 8px / `--radius-chip` 6px (new tokens `--radius-node`, `--radius-chip`).
- Shadow light-tuned: `--shadow-node` `0 2px 8px rgba(0,0,0,0.05)` (was 0.35 — 7× too strong) + new `--shadow-node-selected` `0 4px 16px rgba(0,0,0,0.10)` (spec §25 selected-card stronger shadow).
- `@theme inline` extended: `rounded-node`, `rounded-chip`, `shadow-node-selected`. All existing utility namespaces retarget automatically (var-based) — zero component edits for the palette flip.
- `color-scheme: light` (`:root` + `@layer base html`); `class="dark"` dropped from [index.html](index.html); **`colorMode="light"`** at [WorkflowCanvas.tsx:324](src/components/canvas/WorkflowCanvas.tsx#L324) — the one flagged §27 contract change (recorded in the ledger below; sign-off inherent to the explicit light-UI request; no code branches on the value, verified).
- Tauri window → default 1440×900, min 1200×760 (spec §29) in [tauri.conf.json](src-tauri/tauri.conf.json) (identity/window strings only — no `.rs`).
- **shadcn decision locked: restyle-only / keep custom primitives.** Lowest risk; avoids the [`--accent` alias trap](src/App.css#L123) and the Tailwind v4 CSS-vs-JS-config init mismatch; honors §40 ("don't force the suggested structure if a good equivalent exists") + §26 ("apply Void tokens"). Hybrid partial install remains open for a future complex primitive (e.g. Phase 3 `Sheet`); any `shadcn add` re-verifies Run/Save buttons against the trap.
- Edge stroke retuned: `--edge-stroke` `#B6BAC1` (subtle on light); selected/running unchanged (token-driven, edge CSS untouched).

**Verification gate (green):**
- `npx tsc --noEmit` — clean.
- `npm run build` — clean (light CSS compiled: 54.81 kB, gzip 10.92 kB).
- `npm run tauri:dev` — Vite ready on :1420 + `target\debug\tauri-app.exe` launched; native window opens in light; no errors/panics.
- §27 checks: no `colorMode="dark"` / `color-scheme:dark` / `class="dark"` / `alert()`/`confirm()`/`prompt()` / old accent hex `#1d6fd0` / old canvas hex `#0d0f13` remain; no `.rs` edits; zero raw hex in any component/hook/store/node (tokens-by-name intact).
- Diff scoped to Phase 1: `App.css`, `index.html`, `WorkflowCanvas.tsx` (1 line), `tauri.conf.json`, docs.

**Decisions made:** shadcn = restyle-only; node radius = 10px (distinct from 12px panels); `--status-running` follows the new accent `#5267E9`.

---

## Phase 2 — Workflow Header & Tabs — DONE

**Scope:** Split `TopToolbar` into `WorkflowHeader` (breadcrumb + search + ≤5 actions + state-driven Retry Failed / Open Output) and `WorkflowTabs` (Workflow / Settings / Runs / Environment). Replace the left `AppRail` with the horizontal tab row. Extend `ActiveScreen`: drop `projects`, rename `history`→`runs`, add `environment`. Move `HealthPill` into the Environment tab.

**Files:** `src/components/shell/WorkflowHeader.tsx` (new), `src/components/shell/WorkflowTabs.tsx` (new), `src/components/screens/EnvironmentScreen.tsx` (new placeholder), `src/components/shell/WorkspaceShell.tsx`, `src/hooks/useWorkspaceShortcuts.ts`, `src/store/workflowStore.ts`, `src/components/screens/SettingsScreen.tsx`, `src/components/primitives/StatusBadge.tsx`. Deleted: `AppRail.tsx`, `TopToolbar.tsx`, `ProjectsScreen.tsx`.

**Key gaps closed:** G-7 (secondary tabs / AppRail removal), G-8 (header search + state-driven Retry Failed / prominent Open Output), G-11 (Environment placeholder + honest health model, partial), G-21 (Runs route rename, partial).

**What shipped:**
- **`WorkflowTabs`** ([new](src/components/shell/WorkflowTabs.tsx)) — horizontal 40px tab row (Workflow/Settings/Runs/Environment) replacing the 56px left AppRail. Roving tabindex + ArrowLeft/Right/Home/End; active tab is never color-only (accent underline + tinted bg + accent text + `aria-current`). Alt+1..4 re-homed onto the tab order.
- **`WorkflowHeader`** ([new](src/components/shell/WorkflowHeader.tsx)) — breadcrumb + **header-level search** (writes transient `buildQuery` for the Phase 3 Build panel to subscribe to) + ≤5 actions: Save + Run/Stop + **state-driven Retry Failed** (failed) and **prominent Open Output** (completed, only when output exists) per spec §19. HealthPill removed from header (moves to the Environment tab in Phase 9).
- **`EnvironmentScreen`** ([new placeholder](src/components/screens/EnvironmentScreen.tsx)) — honest read-only 6-row health view (Tauri/SQLite/FFmpeg/FFprobe/Gemini/Storage); unprobed providers render 'Unknown', never faked 'Ready'. Phase 9 builds the real `EnvironmentStatus` component.
- **`ActiveScreen` union** ([store](src/store/workflowStore.ts)) — `'workflow' | 'runs' | 'settings' | 'environment'` (dropped `projects`, renamed `history`→`runs`, added `environment`). Verified no code references the old literals.
- **Health model** — added `'unknown'` HealthState + `ffprobe`/`storage` rows; defaults honest (`backend`/`sqlite` `'ready'` via init, `ffmpeg`/`ffprobe`/`gemini`/`storage` `'unknown'`). All `Record<HealthState,...>` maps updated (SettingsScreen, StatusBadge, EnvironmentScreen) — TS exhaustiveness guards the switch.
- **`buildQuery`/`setBuildQuery`** added to uiSlice (transient — NOT persisted; session-only search).
- **Removed `appRailCollapsed`/`toggleAppRail`** from uiSlice + partialize + Ctrl+Shift+B shortcut (the rail is gone). `partialize` stays LAYOUT-ONLY.
- **WorkspaceShell grid** — `48px/40px/1fr/auto` rows (header/tabs/body/dock); no rail column; auto-collapse thresholds updated (no rail): library<920, inspector<700.
- **SettingsScreen honesty fixes** — "Theme = Dark, Light is a stretch goal" → "Theme = Light" (directly contradicted the redesign); added ffprobe+storage health rows. Full rebuild in Phase 9.
- **Deletions:** AppRail, TopToolbar, ProjectsScreen (orphaned by the union change; ProjectsScreen had no spec equivalent — §3.B tabs are Workflow/Settings/Runs/Environment). Bundle shrank 7kB.

**Verification gate (green):**
- `npx tsc --noEmit` — clean (zero ripple from the union/health/appRail changes).
- `npm run build` — clean (bundle 538.49 kB, gzip 166.65 kB; 7kB smaller).
- `npm run tauri:dev` — Vite ready + Rust `Finished dev` in 14.2s + `tauri-app.exe` launched; window opens with new header+tabs in light; no errors.
- §27 checks: no `colorMode="dark"`/`color-scheme:dark`/`class="dark"`/`#1d6fd0`/`appRailCollapsed`/`toggleAppRail`/`setActiveScreen('projects'|'history')` remain; only `confirm()`/`alert()` references are comments noting they're forbidden; `partialize` LAYOUT-ONLY (`buildQuery` excluded); zero raw hex in new components; no `.rs` edits.

**Risks resolved:** search writes a stable string scalar (no object/array selector — infinite-loop safe); Alt+1..4 + roving tabindex re-homed onto tabs; grid change coordinated with Phase 3 (library still left, inspector still right until Phase 3/5).

---

## Phase 3 — Right Build Panel — DONE

**Scope:** Move `NodeLibrary` to the RIGHT as the Build panel (280-320px, `border-l`, white). Add `RULES` category. Restyle `BuildNodeItem` to 42-48px / 8px radius / white bg / hover elevation. Begin the single-right-column grid restructure (Build↔Inspector swap seeded).

**Files:** `src/nodes/registry.ts` (NodeCategory + RULES), `src/components/shell/NodeLibrary.tsx` (right Build panel), `src/components/shell/NodeLibraryItem.tsx` (§10 restyle), `src/components/shell/WorkspaceShell.tsx` (single right column).

**Key gaps closed:** G-1 (single-right-column skeleton, partial — swap seeded), G-17 (RULES category), G-18 (build item styling), G-25 (auto-collapse, partial).

**What shipped:**
- **`NodeCategory`** ([registry.ts](src/nodes/registry.ts)) — added `'RULES'` between AI and MEDIA (spec §8). No node maps to RULES yet; the `grouped[cat].length > 0` filter keeps the empty section hidden (collapses cleanly when an MVP2 Condition node lands).
- **NodeLibrary → right Build panel** ([NodeLibrary.tsx](src/components/shell/NodeLibrary.tsx)) — moved left→right: `border-r`→`border-l`, splitter moved to the left edge, width clamp 280-360 (spec §9 280-320 + headroom), white `bg-surface-sidebar`. Header restyled: "Build" title + "Drag block into workflow" subtitle (spec §9). `CATEGORY_ORDER` adds RULES. Search is now sourced from `uiSlice.buildQuery` — the header search box (spec §3.A) and the panel's local search box write the same store field (one source of truth). Roving-tabindex Arrow nav simplified (DOM-focus based, no cursor index state). Component/file name kept per §40.
- **`NodeLibraryItem` → §10 Build item** ([NodeLibraryItem.tsx](src/components/shell/NodeLibraryItem.tsx)) — restyled to 42-48px (`min-h-[44px]`), 8px radius (`rounded-control`), white `bg-surface-panel`, subtle `border-border-subtle`, mild hover elevation (`hover:shadow-node` + `hover:border-default`), whole-row draggable. Now renders icon + label + a description line + trailing badges (Note / not-executable-yet TriangleAlert). dataTransfer keys preserved byte-for-byte.
- **Single right column** ([WorkspaceShell.tsx](src/components/shell/WorkspaceShell.tsx)) — grid is now `[Canvas 1fr][Right w]`. The right column hosts the Build panel by default and swaps to the Inspector when `selectionMode !== 'none'` (the Phase 3 beginning of the Build↔Inspector single-column swap, spec §15; Phase 5 completes the polish). Width follows whichever panel is active (`libraryWidth` for Build, `inspectorWidth` for Inspector — Phase 5 unifies these). Auto-collapse <760 (canvas never starves).

**Verification gate (green):**
- `npx tsc --noEmit` — clean.
- `npm run build` — clean (538.12 kB, gzip 166.49 kB).
- `npm run tauri:dev` — Vite ready + Rust `Finished dev` (0.41s cached) + `tauri-app.exe` launched; window opens with Build panel on the right in light; no errors.
- §27 checks: no `colorMode="dark"`/dark-scheme/old-accent/appRail leaks; dataTransfer keys `application/reactflow`+`-label` preserved verbatim; `screenToFlowPosition`/`addNode` single path untouched (source-agnostic move); zero raw hex in changed components; no `.rs` edits.

**Risks resolved:** grid preserves `minmax(480px,1fr)` + `ReactFlowProvider` unmount-on-switch; dataTransfer keys + `screenToFlowPosition` reused verbatim (contract); width clamp stays 280-360 (the splitter min/max); Build↔Inspector intermediate state is functional (Build default, Inspector on selection) — not broken. Sheet drawer at small widths deferred (needs shadcn install — Phase 1 locked restyle-only; revisit if a later phase needs it).

---

## Phase 4 — Shared Node Visual System — DONE

**Scope:** Compose the `WorkflowNode` card (NodeHeader icon+title + body description+chips + NodeStatus footer) inside the single renderer `BaseNode`, keeping `nodeTypes` type→single renderer. Add per-def `summarize?(data)→{description,chips[]}` to the registry for all 12 nodes. Widen cards to 240-300px, apply `--radius-node` (10px) + light shadow + `shadow-node-selected` on select. Add `nodeCardMode` ('outline'|'detail') to uiSlice (persist LAYOUT ONLY, scalar) — full toggle wired in Phase 6.

**Files:** `src/nodes/registry.ts` (summarize on all 12 defs + NodeDefinition interface), `src/components/nodes/BaseNode.tsx` (card restructure), `src/store/workflowStore.ts` (nodeCardMode uiSlice field + partialize).

**Key gaps closed:** G-6 (node card summary body + chips + width), G-14 (WorkflowNode/NodeHeader/NodeMeta/NodeStatus single renderer), G-15 (Outline/Detail mode, partial — field + card respect it; toggle UI is Phase 6).

**What shipped:**
- **`summarize` on all 12 nodes** ([registry.ts](src/nodes/registry.ts)) — added `summarize?: (data) => { description?; chips? }` to `NodeDefinition`. Implemented per node: textInput (static text + content snippet), textTransform (op label), delay (`N seconds`), aiScript (`Gemini`+`Text`), fileInput (filename), mediaInfo (`ffprobe`), saveText (filename), saveJson (filename), saveArtifact (filename), mediaMerge (`ffmpeg`), preview (frontend-only, no fake-execution chips), markdownNote (content snippet / `Note`). Pure local derivation.
- **`BaseNode` card restructure** ([BaseNode.tsx](src/components/nodes/BaseNode.tsx)) — widened `min-w-[240px] max-w-[300px]`, `rounded-node` (10px), `shadow-node` resting → `shadow-node-selected` + 2px `--border-focus` ring + `bg-surface-elevated` on select (NO scale transform — restrained). Anatomy: NodeHeader (icon + title, always) → body (description line + NodeMeta chips, rendered from `def.summarize(data)`, detail mode only) → typed ports (Input LEFT / Output RIGHT, markdownNote none) → NodeStatus footer (non-idle only). `nodeTypes` still maps every type to `BaseNode` (single renderer contract intact). No config UI on the card (§32).
- **`nodeCardMode` uiSlice field** ([workflowStore.ts](src/store/workflowStore.ts)) — `'outline'|'detail'` scalar, default `'detail'`, persisted (added to `partialize` — LAYOUT ONLY). Card renders the body only in `detail`; `outline` collapses to header + ports (low-noise canvas). Full toggle UI lands in Phase 6 (Canvas toolbar).

**Verification gate (green):**
- `npx tsc --noEmit` — clean.
- `npm run build` — clean (540.17 kB, gzip 167.02 kB).
- `npm run tauri:dev` — Vite ready + `tauri-app.exe` launched; window opens with wider light cards (detail mode) showing description + chips, selection ring, ports, status footer; no errors/panics.
- §27 checks: `nodeTypes={nodeTypes}` single renderer intact; `def.summarize(data)` called in the component BODY (line 63), NOT a Zustand selector (no fresh-object-in-selector infinite-loop trap); both BaseNode selectors return scalars/stable refs (`perNodeStatus[id]`, `nodeCardMode`); no `alert()`/`confirm()`/`prompt()`; no config UI on card (§32); `partialize` still LAYOUT ONLY (nodeCardMode is scalar layout state); no `.rs` edits; tokens by name only (no raw hex in BaseNode).

**Risks resolved:** infinite-loop trap avoided (summarize is local body derivation, never a selector); wider cards may shift fitView default spacing — acceptable, Phase 6 re-tunes fitView padding; `nodeTypes` single renderer preserved; no config on card.

---

---

## Phase 5 — Inspector System — DONE

**Scope:** Complete the Build↔Inspector swap: the single right column renders the Build panel when `selectionMode==='none'`, `NodeInspector` when `'node'`, `ConnectionInspector` when `'edge'`, `MultiSelectInspector` when `'multi'`. Add "← Back to Build" header calling `clearSelection`. Remove the `WorkflowInspector` 'none' mode (workflow-name moves to Settings/breadcrumb). Add "Advanced" collapsible `InspectorSection` (`advanced` flag on `ConfigField`). Unify `libraryWidth`+`inspectorWidth` → `rightPanelWidth` (persist LAYOUT ONLY, clamp 280-360).

**Files:** `src/components/shell/Inspector.tsx`, `src/components/shell/WorkspaceShell.tsx`, `src/components/shell/NodeLibrary.tsx`, `src/components/screens/SettingsScreen.tsx`, `src/hooks/useWorkspaceShortcuts.ts`, `src/store/workflowStore.ts` (rightPanelWidth/Collapsed + partialize migration), `src/nodes/registry.ts` (ConfigField `advanced` flag).

**Key gaps closed:** G-1 (Build↔Inspector swap, complete), G-19 (Back header + Advanced section), G-14 (NodeInspector/ConnectionInspector/MultiSelectInspector named components).

**What shipped:**
- **Unified right-column panel** ([workflowStore.ts](src/store/workflowStore.ts)) — replaced `libraryWidth`/`inspectorWidth`/`libraryCollapsed`/`inspectorCollapsed` with a single `rightPanelWidth` (300 default, clamp 280-360) + `rightPanelCollapsed` (LAYOUT ONLY, persisted). `onRehydrateStorage` migrates legacy persisted keys (prefers the wider width; collapses only if BOTH legacy panels were collapsed) then deletes them. The Build↔Inspector swap is now presentation-only — no width jump on swap. Ctrl/Cmd+B and Ctrl/Cmd+I both toggle the same `toggleRightPanel` (one column, two shortcuts).
- **"← Back to Build" header** ([Inspector.tsx](src/components/shell/Inspector.tsx)) — the Inspector header now leads with a "← Build" button calling `clearSelection()` (returns to the Build panel), followed by the mode title (Node/Connection/Multi-select) and the collapse chevron. The 'none' branch is retired (the shell renders NodeLibrary there); a defensive `EmptyState` covers transient no-selection states.
- **Advanced collapsible section** ([Inspector.tsx](src/components/shell/Inspector.tsx) + [registry.ts](src/nodes/registry.ts)) — `ConfigField.advanced?: boolean` flag; the NodeInspector splits fields into Basic (default) and Advanced (`advanced===true`), rendering Advanced in an `InspectorSection defaultCollapsed` (spec §8.2). No node currently declares advanced fields, so it appears only when one does.
- **Width unification wiring** — `WorkspaceShell`, `NodeLibrary`, `SettingsScreen` reset, and `useWorkspaceShortcuts` all migrated to the unified `rightPanelWidth`/`rightPanelCollapsed`/`toggleRightPanel`/`setRightPanelWidth`. Splitter clamp 280-360 in both Build and Inspector.

**Verification gate (green):**
- `npx tsc --noEmit` — clean (the `as unknown as Record<string, unknown>` migration cast resolves the WorkflowState index-signature error).
- `npm run build` — clean (539.80 kB, gzip 166.96 kB).
- `npm run tauri:dev` — Vite ready + `tauri-app.exe` launched; window opens with Build panel (no selection), Inspector on node/edge/multi selection, "← Back to Build" returns to Build; no errors/panics.
- §27 checks: `partialize` LAYOUT ONLY (`rightPanelWidth`/`rightPanelCollapsed`/`dock*`/`minimapOn`/`nodeCardMode`); all new selectors return scalars/stable function refs (no fresh-object/array selector → no infinite-loop trap); `selectionMode`/`selectedNodeId`/`selectedEdgeId`/`multiSelectIds` unchanged (stable scalars); no `alert()`/`confirm()`/`prompt()` (only comment references); no `.rs` edits (only `tauri.conf.json` from Phase 1); `isValidConnection`/`addNode`/`screenToFlowPosition`/nodeTypes single-renderer/dataTransfer keys untouched.

**Risks resolved:** width unification migration is backward-compatible (legacy persisted keys fold into the unified pair then drop); both B and I shortcuts toggle the same panel (no surprise collapse of one but not the other); Advanced section is opt-in per field (zero current nodes → no visual change yet); workflow-name editing relocation is deferred to Phase 9 (breadcrumb is read-only for now).

---

---

## Phase 6 — Canvas Visual System — DONE

**Scope:** Light canvas (grid dots low-opacity, edges subtle neutral, selected accent, running dash preserved — token-only, completed in Phase 1). Build `CanvasToolbar` (bottom-center: Outline/Detail toggle, Undo/Redo, Fit, zoom −/%/+, Minimap toggle) replacing the vertical `Controls` + bottom-right Panel. Build `StartMarker` as a React Flow `Panel` (NOT a node). Wire the Outline/Detail toggle to `nodeCardMode`. Add client-side graph-history (past/future snapshots, transient) for Undo/Redo — never `invoke()`. Branch labels via `edge.data.label` are stubbed (the styledEdges pass `ariaLabel`; per-edge visible labels deferred — no node currently sets `edge.data.label`).

**Files:** `src/components/canvas/WorkflowCanvas.tsx`, `src/components/canvas/CanvasToolbar.tsx` (new), `src/components/canvas/StartMarker.tsx` (new), `src/store/workflowStore.ts` (historySlice + nodeCardMode toggle wiring), `src/hooks/useWorkspaceShortcuts.ts` (Undo/Redo keys). Canvas grid/edge tokens were already light from Phase 1 (`--surface-canvas-grid` `#E2E4E8`, `--edge-stroke` `#B6BAC1`).

**Key gaps closed:** G-2 (colorMode flip — done Phase 1), G-9 (bottom-center canvas toolbar), G-10 (Start marker), G-15 (Outline/Detail toggle — complete, wired to `nodeCardMode`), G-16 (Undo/Redo).

**What shipped:**
- **`CanvasToolbar`** ([CanvasToolbar.tsx](src/components/canvas/CanvasToolbar.tsx)) — compact bottom-center bar (`role="toolbar"`) rendered as a `Panel position="bottom-center"`: segmented Outline/Detail density toggle (writes `uiSlice.nodeCardMode`, active state is `bg-surface-hover` + `aria-pressed` — not color-only), Undo/Redo (disabled = `aria-disabled` + `opacity` + `cursor-not-allowed`, never color-only), zoom out / live % (click resets to 100% via `zoomTo(1)`) / zoom in / Fit (`fitView`), and Minimap toggle (writes `uiSlice.minimapOn`). 28px labelled buttons, tokens only.
- **`StartMarker`** ([StartMarker.tsx](src/components/canvas/StartMarker.tsx)) — a `Panel position="top-left"` overlay (rendered only when `nodes.length > 0`): a small "Start" badge with a Play glyph in `bg-accent`/`text-text-on-accent`. `aria-hidden` (no actionable semantics — Run lives in the header). It is NOT a node: never enters `nodeTypes`, save JSON, or `isValidConnection` (contract preserved).
- **Client-side graph-history** ([workflowStore.ts](src/store/workflowStore.ts)) — new `HistorySlice` (`past`/`future`/`canUndo`/`canRedo`/`undo`/`redo`/`resetHistory`). `addNode`/`onConnect`/`setNodes`/`setEdges`/`updateNodeData` snapshot the pre-mutation `{nodes,edges}` onto `past` (capped 50, FIFO) and clear `future` BEFORE the same store mutation — so it never bypasses `addNode`/`onConnect`/`isValidConnection` (the mutators are unchanged; history wraps them). `onNodesChange`/`onEdgesChange` snapshot only on `remove`-type changes (not continuous drags — avoids history flood). `undo`/`redo` restore whole snapshots via `set()` (a legitimate bulk restore — `isValidConnection` is not re-evaluated; the snapshot was valid when made). `replaceGraph` calls `resetHistory` (a loaded graph is a fresh history boundary). `ctrl+Z` / `ctrl+shift+Z` / `ctrl+Y` wired in useWorkspaceShortcuts (app-wide, text-editing guarded). Transient — `past`/`future`/`canUndo`/`canRedo` NOT in `partialize`.
- **Canvas chrome** — removed the vertical `Controls` and the bottom-right Fit+zoom `Panel`; the live `zoomPct` `useStore` selector and `onFitView` callback moved into `CanvasToolbar` (the canvas keeps `fitView`/`setCenter` for templates + pendingCenter).

**Verification gate (green):**
- `npx tsc --noEmit` — clean (added `HistorySlice` to the `WorkflowState` intersection).
- `npm run build` — clean (545.92 kB, gzip 168.30 kB).
- `npm run tauri:dev` — Vite ready + `tauri-app.exe` launched; window opens with the bottom-center CanvasToolbar (Outline/Detail, Undo/Redo, zoom, Fit, Minimap) and the top-left StartMarker (when nodes present); no errors/panics.
- §27 checks: `isValidConnection`/`screenToFlowPosition`/`addNode` single path/`nodeTypes` single renderer/dataTransfer keys/`colorMode="light"`/`fitView` all intact; StartMarker is a Panel (not a node); no new `invoke()` (undo/redo are pure store; `invoke()` still sole-caller in the controller); `past`/`future` excluded from `partialize` (history transient); `nodeCardMode` persisted as LAYOUT scalar; no `.rs` edits; tokens by name only.

**Risks resolved:** Undo/Redo is client-side only (no `invoke()`, no `.rs`); graph-history wraps the existing mutators rather than bypassing them; snapshotting skips continuous position changes (no history flood); `replaceGraph` resets history (no cross-graph undo); disabled Undo/Redo use aria-disabled + opacity (not color-only).

---

## Phase 7 — Remaining MVP1 Nodes — DONE

**Scope:** Verify all 12 MVP1 node types render correctly under light tokens with their `summarize()` chips via the Phase 4 `BaseNode` card. Confirm frontend-only nodes do not fake execution status. Confirm Save Text / Save JSON / Save Artifact remain separate (do not merge runtime behavior for aesthetic reasons). Prepare for MVP2 node extensibility (RULES / Condition — empty category already in place).

**Files:** `src/nodes/registry.ts` (audited — no changes needed), `src/components/nodes/BaseNode.tsx` (audited), `src/store/workflowStore.ts` (`deriveProblems` audited).

**Key gaps closed:** G-6 (remaining nodes — all 12 render), G-14 (registry coverage — 12/12 with summarize).

**What shipped (audit/verification — no source changes required; Phase 4a/4b already built the full system):**
- All 12 node types have a `summarize` implementation (textInput, textTransform, delay, aiScript, fileInput, mediaInfo, saveText, saveJson, saveArtifact, mediaMerge, preview, markdownNote) and render via the single `BaseNode` renderer / `nodeTypes` map.
- **Save nodes stay separate** — `saveText`, `saveJson`, `saveArtifact` are three distinct types with distinct ports (`text` / `json` / `artifact`) and distinct filenames. Per the "do not merge runtime behavior for aesthetic reasons" directive, they are NOT collapsed.
- **Frontend-only nodes are honest** — `saveArtifact` (executable, frontend-only) and `preview` (executable, frontend-only) are flagged `registryState: 'frontend-only'`; `deriveProblems` emits a `warning` Problem for each on Run (never a fake `success`). `preview`'s `summarize` returns `chips: undefined` (no fake-execution chips). `markdownNote` (executable:false) never blocks a run and shows the muted "Note" badge.
- **MVP2 extensibility** — the `RULES` category (added Phase 3) sits empty between AI and MEDIA; `grouped[cat].length > 0` hides it until a Condition node lands. Adding a node is a registry entry only (no nodeTypes edit — generated).

**Verification gate (green):**
- `npx tsc --noEmit` — clean (no source changed since Phase 6).
- `npm run build` — clean (Phase 6 build still valid).
- `npm run tauri:dev` — app running (PID 29264); each node type renders as a light card with description + chips (detail mode), selection ring, typed ports, and (when running) the status footer.
- §27 checks: `nodeTypes` single renderer intact; each `summarize` is local-derivation in the component body (no selector returning a fresh array); frontend-only nodes never fake execution; no `.rs` edits; tokens by name only.

**Risks resolved:** all summarize functions are pure local derivations; frontend-only nodes are honestly flagged (no fake status); Save nodes preserved as separate runtime behaviors.

---

---

## Phase 8 — Execution UX — DONE

**Scope:** Restyle `BottomDock` (Console/Problems/Run/Artifacts) to light tokens — already token-based from Phase 1 (no rebuild). "Retry Failed" (failed) + prominent "Open Output" (completed) header buttons — already in `WorkflowHeader` from Phase 2, reusing `controller.run`/`openFolder`. Keep Artifacts honest ("Open Output Folder" + gap note; no per-file list without a backend IPC). Map the "History" route → "Runs" tab with Today/Earlier grouping. Refresh the KeyboardHelpDialog shortcut table to reflect Phase 2-6 changes.

**Files:** `src/components/screens/HistoryScreen.tsx` (Runs route + Today/Earlier grouping), `src/components/shell/KeyboardHelpDialog.tsx` (shortcut table refresh). `BottomDock.tsx`, `WorkflowHeader.tsx`, `useWorkflowController.ts` audited — no changes needed (already light/honest/contract-correct).

**Key gaps closed:** G-20 (artifacts — honest gap maintained), G-21 (Runs route — complete with Today/Earlier grouping).

**What shipped:**
- **Runs route** ([HistoryScreen.tsx](src/components/screens/HistoryScreen.tsx)) — the screen is now labeled "Runs" (`PanelHeader title="Runs"`, `data-screen="runs"`, `ariaLabel="Runs"`) to match the `WorkflowTabs` "Runs" label (Alt+3). Runs are grouped Today / Earlier (spec §16) via `<th scope="rowgroup" colSpan>` divider rows with a count; the "Started" column shows `toLocaleTimeString()` (date is implied by the group header). Row click → `setDockTab('run')` (dock expands). Component/file name kept (`HistoryScreen`) per §40. Empty state preserved.
- **KeyboardHelpDialog refresh** ([KeyboardHelpDialog.tsx](src/components/shell/KeyboardHelpDialog.tsx)) — the stale shortcut table (App Rail, Projects/History, Ctrl+Shift+B, separate Library/Inspector toggles) is corrected: Alt+1..4 = Workflow/Settings/Runs/Environment; Ctrl/Cmd+B & I = toggle right panel; added Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z = Undo/Redo (graph); removed Ctrl/Cmd+Shift+B.
- **BottomDock** — Console/Problems/Run/Artifacts tabs remain light-token-based.
  Runtime V2 now populates the artifact list from typed node-result events and
  provides Copy Path alongside Open Output Folder.
- **WorkflowHeader Retry/Open Output** — already shipped Phase 2: `showRetry` (runStatus==='failed') → "Retry Failed" button calling `controller.run()` (a full re-run via `start_run`, always fresh — no resume IPC); `showOpenOutput` (runStatus==='succeeded' && lastCompletedRunId) → prominent "Open Output" calling `controller.openFolder()`.

**Verification gate (green):**
- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run tauri:dev` — Vite ready + `tauri-app.exe` launched (PID 19972); Runs tab shows Today/Earlier grouping; dock tabs render in light; no errors/panics.
- §27 checks: controller run inference (`inferRunCompletion`) untouched — execution stays in Rust; `invoke()` still sole-caller in the controller (6 IPC commands intact); Artifacts honest (no fake rows); Retry is a full re-run (`start_run`); no `.rs` edits; tokens by name only (no raw hex in changed files).

**Risks resolved:** controller untouched; Artifacts stays honest; Retry is full re-run; the `data-screen` landmark changed `history`→`runs` (LANDMARK_SELECTORS uses `main[data-screen]` generically, so F6 still reaches it).

---

---

## Phase 9 — Settings / Runs / Environment — DONE

**Scope:** Build `EnvironmentScreen` as an honest read-only 6-row provider-health view (Tauri/SQLite/FFmpeg/FFprobe/Gemini/Storage) using the shared `Panel`/`PanelHeader` primitives + `StatusBadge` (never color-only; unprobed providers render 'Unknown', never faked 'Ready'). Replace the `SettingsScreen` "System Health" section (which duplicated the Environment tab) with a pointer to the Environment tab. Keep the workflow-level Settings fields frontend-local or disabled-with-tooltip (no new IPC). The 6-row health model + `'unknown'` HealthState + `ffprobe`/`storage` rows were already added in Phase 2; Phase 9 builds the real screen surface and removes the duplication.

**Files:** `src/components/screens/EnvironmentScreen.tsx` (rewritten), `src/components/screens/SettingsScreen.tsx` (System Health → Environment pointer; unused imports removed).

**Key gaps closed:** G-11 (Environment screen + honest health model — complete), G-12 (workflow-level Settings — System Health duplication removed; Backend Integration stays disabled-with-tooltip).

**What shipped:**
- **`EnvironmentScreen` rewrite** ([EnvironmentScreen.tsx](src/components/screens/EnvironmentScreen.tsx)) — composed from the shared `Panel`/`PanelHeader` primitives (Gauge icon, `data-screen="environment"`, landmark-reachable via `main[data-screen]` + F6). A `PROVIDERS` array drives 6 honest health rows: `backend` ("IPC + run host — probed on init"), `sqlite` ("Workflow persistence — probed on init"), `ffmpeg` ("Media encode/merge — probed on first use"), `ffprobe` ("Media metadata — probed on first use"), `gemini` ("AI generation — requires API key"), `storage` ("Output artifacts — checked on run"). Each row is a `StatusBadge` (dot + icon + label + sr-only word — never color-only) + a muted honest note. Unprobed providers render `unknown` (the `StatusBadge` `unknown` token = `status-idle` + Circle icon + "Unknown" label) — NO status is faked. No IPC added (frozen contract; no `set_settings`/`get_settings`).
- **`SettingsScreen` de-duplication** ([SettingsScreen.tsx](src/components/screens/SettingsScreen.tsx)) — the "System Health" section (which duplicated the 6 Environment rows) now points to the Environment tab: a sentence + a `<button onClick={() => useWorkflowStore.getState().setActiveScreen('environment')}>Environment</button>` link (accent, hover-underline). The Backend Integration section (Gemini key / output dir / FFmpeg path / concurrency) stays disabled with `BACKEND_TOOLTIP = 'Requires backend support'` (no `set_gemini_key`/`get_settings` IPC exists; redesign forbids adding any). Removed now-unused imports/selector to satisfy `noUnusedLocals`: `StatusBadge`, `HealthState`, the `HEALTH_LABEL` const, and the `health` selector are gone from this file.
- **No new transient/persisted state** — the screen reads the existing `uiSlice.health` (set by the controller's init path for `backend`/`sqlite`; the rest stay `unknown`). `partialize` is unchanged (LAYOUT ONLY — `health` was never in it). The `PROVIDERS` array is a module-level constant (no per-render allocation, no selector).

**Verification gate (green):**
- `npx tsc --noEmit` — clean (SettingsScreen has no unused imports/locals after the removals).
- `npm run build` — clean (546.72 kB, gzip 168.63 kB).
- `npm run tauri:dev` — Vite ready + Rust `Finished dev` + `tauri-app.exe` launched; window opens; Environment tab renders 6 honest health rows; Settings tab's System Health section now links to Environment; no errors/panics.
- §27 checks: no new IPC (6 `#[tauri::command]` macros unchanged, no `.rs` edits); no color-only status (`StatusBadge` = dot + icon + required label + sr-only word, exhaustive over RunStatus + HealthState incl. `unknown`); unprobed providers show 'unknown' honestly; `partialize` still LAYOUT ONLY (no `health`/`history`/`past`/`future`); no new fresh-object/array selector (`PROVIDERS` is module-constant, `health` selector returns a stable ref); tokens by name only.

**Risks resolved:** EnvironmentScreen reuses the shared primitives (no new primitive needed — `EnvironmentStatus` from the original plan is unnecessary; `StatusBadge` + a `PROVIDERS` constant suffice); SettingsScreen de-duplication removes the honest-state duplication without losing the Backend Integration setting surface; no new IPC, no new persisted state.

---

## Phase 10 — Review & Cleanup — DONE

**Scope:** Final acceptance pass against all 15 §39 criteria. Verify cross-zone channels (`addModeNodeType`, `pendingCenterNodeId`, `setCenter`) still work end-to-end. Verify no raw hex in components, no color-only status, no new `Set`/`Object`/`array` in any selector. Verify `persist partialize` is still LAYOUT ONLY after all additions. Responsive drawer behavior at min 1200×760. Visual polish, spacing, edge cases, empty states. A read-only review subagent swept all shell/canvas/screens/store files against §39 + §27 and surfaced 9 cleanup findings; the safe, clearly-beneficial ones were applied (a latent keyboard-nav bug among them).

**Files:** `src/components/shell/NodeLibrary.tsx` (roving-tabindex fix + dead `ZERO_CURSOR` constant removed), `src/components/shell/WorkflowHeader.tsx` (stale Phase-3 search comments corrected), `src/components/screens/HistoryScreen.tsx` (redundant `aria-hidden={false}` removed), `src/components/primitives/ToolbarButton.tsx` (stale "TopToolbar" JSDoc corrected), `docs/UI_LIGHT_REDESIGN_STATUS.md`.

**Key gaps closed:** G-* (none new — this is a review/cleanup phase). The pass confirms Phases 0-9 closed all originally-audited gaps G-1..G-25.

**What shipped (acceptance pass + cleanup):**
- **§39 acceptance — 15/15 PASS** (verified directly + by the review subagent): light shell ✓, header context ✓, secondary tabs ✓, right Build panel ✓, categorized+searchable ✓, clean canvas ✓, compact node cards ✓, config in Inspector ✓, StartMarker (Panel, not node) ✓, bottom canvas controls ✓, subtle edges ✓, clear execution state ✓, drag/connect/save/run intact ✓, no major overflow ✓, scales to MVP2 ✓.
- **§27 regression contracts — 8/8 PASS:** no raw hex in any `.ts`/`.tsx` (tokens by name only — hex lives only in `App.css` token defs); no `alert()`/`confirm()`/`prompt()` calls (4 comment references only); no color-only status (every status = dot + icon + text + sr-only word); `partialize` LAYOUT ONLY (7 fields: `rightPanelWidth`/`rightPanelCollapsed`/`dockCollapsed`/`dockHeight`/`dockTab`/`minimapOn`/`nodeCardMode` — no graph/health/history/transient); no selector returning a fresh object/array/`Set` (the 4 `.find()` selectors in Inspector return existing stable refs — the trap is `new Set()`/`.filter()`/`.map()`/object literals, none present); no `.rs` edits (only `tauri.conf.json` identity/window strings); `colorMode="light"`; `nodeTypes` single renderer (`Object.fromEntries(NODE_DEFINITIONS.map(… BaseNode))`).
- **Cross-zone channels intact:** `addModeNodeType` (library writes → canvas consumes → Esc cancels), `pendingCenterNodeId` (store-mediated → canvas `setCenter` pan → one-shot clear), `setCenter` (inside `ReactFlowProvider`). All three wired end-to-end.
- **6 IPC commands sole-caller in controller:** `init_project`/`load_workflow`/`save_workflow`/`start_run`/`cancel_run`/`open_run_folder` — all in `useWorkflowController.ts`, camelCase params, dataTransfer keys `application/reactflow` + `application/reactflow-label` preserved verbatim.
- **Cleanup applied (the safe subset of the 9 findings):**
  - **[latent bug, medium→fixed] NodeLibrary roving tabindex** — `ZERO_CURSOR[cat] ± 1` always produced `±1`, so ArrowDown/Up jumped to a fixed index regardless of the focused item (broken for lists >2 items). Replaced with DOM-focus-derived `currentIndex` (`list.findIndex(d => document.activeElement?.id === \`library-item-${d.type}\`)`), so Arrow nav now moves relative to the actually-focused row. Removed the dead `ZERO_CURSOR` constant.
  - **[stale comment] WorkflowHeader search** — the CENTER-search comments said "Phase 3 wires it" / "typing filters nothing until Phase 3," but NodeLibrary already subscribes to `buildQuery`. Corrected to reflect the completed wiring.
  - **[redundant a11y] HistoryScreen** — removed the no-op `aria-hidden={false}` on the grouping `<tr>` (it's the default).
  - **[stale JSDoc] ToolbarButton** — "Composed by … the TopToolbar back affordance" → "Composed by the App Screens (Runs/Settings/Environment) and the WorkflowHeader actions" (TopToolbar was deleted in Phase 2).
- **Cleanup deferred (intentional, low/zero-impact, or preserves extensibility):** `getDefinition` export + `Network` icon (both unused today but trivial future-reserved accessors/icons — removing re-adds later; zero runtime cost, left for MVP2). `seenErrorIds` Set growth in BottomDock (capped by `LOG_CAP` 2000; redundant-state, not a contract issue). `role="button"` on `<tr>` (functional + keyboard-accessible; robust-but-larger refactor out of scope for a cleanup pass). `HeaderSearch` `hidden md:block` (harmless defensive CSS — min window 1200px ≥ 768px breakpoint).

**Verification gate (green):**
- `npx tsc --noEmit` — clean (after all cleanup edits; `ZERO_CURSOR` removal + `currentIndex` derivation type-check; `NodeCategory` still used elsewhere).
- `npm run build` — clean (546.72 kB, gzip 168.63 kB; the pre-existing >500kB chunk warning is the merged @xyflow+lucide+react-dom bundle, not a regression).
- `npm run tauri:dev` — Vite ready + `tauri-app.exe` launched; **HMR applied all 4 cleanup edits live** (WorkflowHeader, HistoryScreen, NodeLibrary, App.css) with zero HMR errors — the app stayed live through the changes, confirming they're valid.
- §27 + §39 re-checked post-cleanup: all PASS (the cleanups are comment/constant/a11y/keyboard-nav only — no token, partialize, selector, IPC, or color-status change).

**Risks resolved:** the NodeLibrary roving-tabindex fix is the only behavior change and it's a strict improvement (Arrow nav now correct for all list lengths); the rest are comment/a11y-attribute/constant-removal no-ops; no contract re-introduced. The redesign is complete: all 11 phases (0-10) DONE, all acceptance criteria met, all regression contracts intact, the app boots clean in light.

---

## §27 Regression contract ledger (carried through all phases)

| Contract | Touched? | Note |
|---|---|---|
| 6 IPC commands + camelCase params | No | controller unchanged |
| `dataTransfer` keys `application/reactflow` + `-label` | No (moved left→right) | source-agnostic; `BuildNodeItem` reuses `NodeLibraryItem` drag setup verbatim |
| `screenToFlowPosition` | No | drop target is the canvas |
| `addNode` single path | No | `placeNode` helper preserved |
| `isValidConnection` cycle guard | No | unchanged |
| **`colorMode`** | **YES — DONE Phase 1** | `"dark"`→`"light"` flipped at [WorkflowCanvas.tsx:319](src/components/canvas/WorkflowCanvas.tsx#L319); sign-off inherent to the explicit light-UI request; no code branches on the value (verified) |
| `fitView` | No | unchanged |
| `replaceGraph` | No | unchanged |
| `deriveProblems` run guard | No | unchanged |
| controller sole `invoke()` caller | No | no new IPC added |
| `persist partialize` = LAYOUT ONLY | Watched | new layout widths/modes added deliberately; graph-history + workflow settings explicitly excluded |
| stable selectors (no fresh object/array) | Watched | the infinite-loop trap; every new selector reviewed |
| no `.rs` edits | Yes | only `tauri.conf.json` identity/window strings |
| no `alert()`/`confirm()`/`prompt()` | No | already enforced |
| status never color-only | Watched | light status re-contrast + 'unknown' state must stay icon+text+color |
| tokens by name only | Watched | no raw hex in components |

> **Phase 10 final sign-off (all phases 0-10 DONE):** §39 acceptance 15/15 PASS · §27 contracts 8/8 PASS · `tsc` clean · `build` clean · `tauri-app.exe` boots in light (HMR-verified through the cleanup edits) · 6 IPC sole-caller in controller · partialize LAYOUT ONLY · zero raw hex in `.ts`/`.tsx` · zero `alert/confirm/prompt` calls · no color-only status · no fresh-object/array selectors · cross-zone channels (`addModeNodeType`/`pendingCenterNodeId`/`setCenter`) intact · `nodeTypes` single renderer · no `.rs` edits. The redesign is complete.
