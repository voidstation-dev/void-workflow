import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';
import type { NodeExecutionResult } from '@/nodes/runtimeContract';

/* ============================================================================
   AppNode / AppNodeData — preserved shape (regression contract §27)
   ========================================================================== */
export type AppNodeData = {
  label: string;
  [key: string]: any;
};

export type AppNode = Node<AppNodeData>;

/* ============================================================================
   Selection sync (spec §7.3 / §27)
   --------------------------------------------------------------------------
   React Flow runs the graph in CONTROLLED mode: the node objects' `selected`
   flag (synced through onNodesChange → applyNodeChanges on user clicks) is
   the real source of truth that drives both the rendered selection ring AND
   the useOnSelectionChange mirror. The store scalars (selectedNodeId /
   multiSelectIds / selectedEdgeId / selectionMode) are a *projection* of
   that, kept for the Inspector / Inspector toolbar / keyboard handlers.

   Programmatic selection (addNextStep "select the new node", duplicateNodes,
   pasteNodes, the context-menu Configure action) used to call selectNode /
   setMultiSelect, which set ONLY the scalars — they never wrote `.selected`
   on the node objects. So RF kept the previously-clicked node selected, and
   useOnSelectionChange promptly reverted the store scalars to match RF. Net
   effect: "select new" silently did nothing at runtime.

   These helpers write `.selected` on the graph objects (nodes/edges) so RF's
   controlled selection and the store stay in lockstep. Selection is
   TRANSIENT: the write skips history + markDirty (§27 — persist partializes
   LAYOUT ONLY, and node.selected/edge.selected are never in the whitelist
   anyway). A no-op when the graph already reflects the target state, so the
   useOnSelectionChange mirror becomes idempotent and stops fighting.
   ========================================================================== */
function syncNodeSelection(
  nodes: AppNode[],
  selectedNodeId: string | null,
  multiSelectIds: string[] = [],
): AppNode[] {
  const idSet =
    multiSelectIds.length > 0 ? new Set(multiSelectIds) : selectedNodeId ? new Set([selectedNodeId]) : null;
  if (idSet === null) {
    // Clearing — only allocate if any node is currently selected.
    if (!nodes.some((n) => n.selected)) return nodes;
    return nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
  }
  let changed = false;
  const next = nodes.map((n) => {
    const want = idSet.has(n.id);
    if (n.selected === want) return n;
    changed = true;
    return { ...n, selected: want };
  });
  return changed ? next : nodes;
}

function syncEdgeSelection(edges: Edge[], selectedEdgeId: string | null): Edge[] {
  if (selectedEdgeId === null) {
    if (!edges.some((e) => e.selected)) return edges;
    return edges.map((e) => (e.selected ? { ...e, selected: false } : e));
  }
  let changed = false;
  const next = edges.map((e) => {
    const want = e.id === selectedEdgeId;
    if (e.selected === want) return e;
    changed = true;
    return { ...e, selected: want };
  });
  return changed ? next : edges;
}

/* ============================================================================
   Slice types — 8 logical slices in ONE store (spec §2.1)
   ========================================================================== */

// --- graphSlice (EXISTING + replaceGraph) ---
export interface GraphSlice {
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: AppNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: AppNode) => void;
  updateNodeData: (nodeId: string, data: Partial<AppNodeData>) => void;
  replaceGraph: (graph: { nodes: AppNode[]; edges: Edge[] }) => void;
  /**
   * Clone the given nodes: new uuid per clone, ~24px offset, cloned data, edges
   * NOT duplicated (spec §21). Selects the clones (single → selectNode, multi →
   * setMultiSelect). Composes setNodes so it rides the same history-snapshot +
   * markDirty path as every other structural mutation (§27: never bypasses the
   * mutators). The floating toolbar and the Ctrl/Cmd+D shortcut share this one
   * path (composition-patterns: clear ownership, no duplicated logic).
   */
  duplicateNodes: (ids: string[]) => string[];
  /**
   * Add Next (spec §19/§34): create a node of `nodeType` ~120px below `sourceId`,
   * auto-connect source→new using the registry's single-port handle ids (the
   * exact edge shape `onConnect` produces), select the new node, and return its
   * id (so the toolbar can open the Inspector / focus config). Composes addNode +
   * onConnect so history + dirty are correct. Only connects when the source has
   * an out-port AND the new node has an in-port (otherwise creates unconnected —
   * spec §19 "auto-connect current → new" assumes compatible flow nodes).
   */
  addNextStep: (sourceId: string, nodeType: string) => string | null;
  /**
   * Clipboard (spec §53/§54). A transient in-memory clipboard of node DATA
   * (config + type), NOT the live AppNode refs — so a paste after the source
   * node is deleted still reproduces a faithful copy at the given position.
   * Copy captures the selected nodes' {type, data} (edges are NOT copied, per
   * spec §21 "Do NOT duplicate edges"); Paste creates fresh nodes (new uuids)
   * via addNode (§27 single path), arranged in the same relative layout as the
   * original selection, offset to the given anchor position. Transient — NOT
   * persisted (excluded from partialize by the whitelist; clipboard never
   * survives a reload — same as every desktop editor).
   */
  clipboard: { type: string; data: AppNodeData }[];
  copyNodes: (ids: string[]) => void;
  pasteNodes: (anchor: { x: number; y: number }) => string[];
  /**
   * Insert Between (spec §33/§66 — Phase G). Hover an edge → click its `+` →
   * pick a block → the new node is spliced IN PLACE between A and B:
   *
   *   A → B   becomes   A → New → B
   *
   * The new node is placed at the midpoint of A and B (viewport-independent
   * node-space coords). The original A→B edge is removed and replaced with
   * A→New + New→B, PRESERVING the original edge's sourceHandle/targetHandle
   * so the spliced edges carry the exact handle ids a drag-connect would
   * (§27 edge contract). Composes addNode + onConnect (single path) so history
   * + dirty are correct; selects the new node. Returns the new id (or null if
   * the edge / nodeType is invalid).
   */
  insertNodeBetween: (edgeId: string, nodeType: string) => string | null;
}

// --- historySlice (Phase 6: client-side Undo/Redo graph-history) ---
// Snapshots of {nodes, edges} taken BEFORE each structural mutation. Transient
// (NOT persisted — excluded from partialize by the whitelist). Undo restores
// the previous snapshot and pushes the current state onto `future`; Redo the
// reverse. Capped at 50 entries (FIFO). This NEVER bypasses addNode/onConnect/
// isValidConnection — it wraps them: the mutator snapshots the pre-state, then
// applies the SAME store mutation. Undo/Redo restore whole {nodes,edges}
// snapshots via set() directly (a legitimate bulk restore, not a new edge —
// so isValidConnection is not re-evaluated; the snapshot was valid when made).
export interface GraphSnapshot {
  nodes: AppNode[];
  edges: Edge[];
}
export interface HistorySlice {
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Clear history (called on load/replaceGraph so history doesn't cross graphs). */
  resetHistory: () => void;
}

// --- selectionSlice (NEW) ---
export type SelectionMode = 'none' | 'node' | 'edge' | 'multi';
export interface SelectionSlice {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  multiSelectIds: string[];
  selectionMode: SelectionMode;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setMultiSelect: (ids: string[]) => void;
  clearSelection: () => void;
}

// --- runSlice (NEW) ---
export type RunStatus = 'idle' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type PerNodeState = 'idle' | 'queued' | 'running' | 'success' | 'warning' | 'failed' | 'cancelled' | 'skipped';
export interface PerNodeStatus {
  status: PerNodeState;
  progress: number | null;
  message: string;
  startedAt: number | null;
  endedAt: number | null;
}
export interface RunSlice {
  runId: number | null;
  runStatus: RunStatus;
  runProgress: number | null;
  perNodeStatus: Record<string, PerNodeStatus>;
  runStartedAt: number | null;
  runError: string | null;
  lastCompletedRunId: number | null;
  nodeResults: Record<string, NodeExecutionResult>;
  setRunStarting: () => void;
  setRunRunning: (runId: number) => void;
  setRunProgress: (progress: number | null) => void;
  setNodeStatus: (nodeId: string, status: PerNodeState, message?: string) => void;
  setNodeProgress: (nodeId: string, progress: number) => void;
  setNodeResult: (nodeId: string, result: NodeExecutionResult) => void;
  setRunTerminal: (status: 'succeeded' | 'failed' | 'cancelled', error?: string) => void;
  resetRun: () => void;
}

// --- saveSlice (NEW) ---
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export interface SaveSlice {
  dirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: number | null;
  markDirty: () => void;
  markClean: () => void;
  setSaving: () => void;
  setSaved: () => void;
  setSaveError: (error: string) => void;
  setSaveIdle: () => void;
}

// --- consoleSlice (NEW) ---
export type LogLevel = 'info' | 'warn' | 'error' | 'system' | 'debug';
export interface LogEntry {
  id: string;
  runId: number;
  nodeId: string | null;
  message: string;
  level: string;
  timestamp: number;
}
export interface ConsoleSlice {
  logs: LogEntry[];
  logFilters: { levels: LogLevel[]; nodeId: string | null };
  appendLog: (entry: Omit<LogEntry, 'id'>) => void;
  clearLogs: () => void;
  setLogFilter: (filter: Partial<ConsoleSlice['logFilters']>) => void;
}

// --- problemsSlice (NEW derived) ---
export type ProblemSeverity = 'error' | 'warning';
export interface Problem {
  id: string;
  severity: ProblemSeverity;
  code?: string;
  title?: string;
  nodeId: string | null;
  edgeId?: string | null;
  message: string;
  hint?: string | null;
}
export interface ProblemsSlice {
  problems: Problem[];
  selectedProblemId: string | null;
  setProblems: (problems: Problem[]) => void;
  /** Append a run-time problem (e.g. a node that failed/skipped mid-run)
   *  WITHOUT clobbering pre-run validation problems. Dedups by `id` so repeated
   *  node-status events for the same node+run produce a single dock entry. */
  pushRuntimeProblem: (problem: Problem) => void;
  selectProblem: (id: string | null) => void;
}

// --- uiSlice (NEW — LAYOUT ONLY is persisted) ---
export type DockTab = 'console' | 'problems' | 'run' | 'artifacts';
export type DialogKind = null | 'keyboard-help' | 'unsaved-guard';
export type ActiveScreen = 'workflow' | 'runs' | 'settings' | 'environment';
export type ToastKind = 'success' | 'info' | 'error';
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  createdAt: number;
}
export type HealthState = 'ready' | 'configured' | 'degraded' | 'down' | 'unknown';
export interface Health {
  backend: HealthState;
  sqlite: HealthState;
  ffmpeg: HealthState;
  ffprobe: HealthState;
  gemini: HealthState;
  storage: HealthState;
}
export interface Announcement {
  id: string;
  text: string;
}
export interface UiSlice {
  activeScreen: ActiveScreen;
  // Phase 5 unified right-column panel (spec §15): the single right column
  // hosts the Build panel (selectionMode==='none') OR the Inspector (node/edge/
  // multi). One width + one collapsed flag drives BOTH — the swap is
  // presentation-only, so layout state must be shared (otherwise each panel
  // remembers a different width and the column jumps on swap). LAYOUT ONLY
  // (persisted). Legacy libraryWidth/inspectorWidth/libraryCollapsed/
  // inspectorCollapsed are migrated in onRehydrateStorage then dropped.
  rightPanelWidth: number;
  rightPanelCollapsed: boolean;
  setRightPanelWidth: (width: number) => void;
  toggleRightPanel: () => void;
  dockCollapsed: boolean;
  dockHeight: number;
  dockTab: DockTab;
  minimapOn: boolean;
  health: Health;
  dialog: DialogKind;
  toasts: Toast[];
  announcement: Announcement;
  setActiveScreen: (screen: ActiveScreen) => void;
  toggleDock: () => void;
  setDockHeight: (height: number) => void;
  setDockTab: (tab: DockTab) => void;
  setMinimapOn: (on: boolean) => void;
  setHealth: (health: Partial<Health>) => void;
  // Card density: 'outline' = compact (title + ports only); 'detail' = full
  // (title + description + chips). Scalar, LAYOUT ONLY (persisted). The full
  // toggle UI lands in Phase 6 (Canvas toolbar); the card already respects it.
  nodeCardMode: 'outline' | 'detail';
  setNodeCardMode: (mode: 'outline' | 'detail') => void;
  /** Header-level Build search (spec §3.A). Session-only — NOT persisted. The
   *  WorkflowHeader writes it; the Phase 3 Build panel subscribes to filter. */
  buildQuery: string;
  setBuildQuery: (q: string) => void;
  setDialog: (dialog: DialogKind) => void;
  pushToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  setAnnouncement: (announcement: Announcement) => void;
  // --- Cross-zone keyboard-add channel (spec §6 frozen invariant) ---
  // Transient (NOT persisted — excluded from partialize). The NodeLibrary writes
  // the node type + the id of the library item to return focus to; WorkflowCanvas
  // consumes it on pane click / Enter-at-center and places via addNode; the
  // global Escape handler in useWorkspaceShortcuts cancels + restores focus.
  addModeNodeType: string | null;
  addModeReturnFocusId: string | null;
  setAddModeNodeType: (type: string | null, returnFocusId?: string | null) => void;
  // --- Cross-zone canvas-center channel (spec §9.4 Phase 7) ---
  // Transient (NOT persisted). The BottomDock Problems panel writes the node id
  // to pan to; CanvasInner (inside ReactFlowProvider) consumes it in an effect,
  // calls setCenter, then clears it. One-shot; partialize is a whitelist so this
  // field is automatically excluded from persistence.
  pendingCenterNodeId: string | null;
  setPendingCenter: (nodeId: string | null) => void;
  // --- Node detail panel channel (spec §26/§27 Phase E) ---
  // Transient (NOT persisted — excluded from partialize by the whitelist).
  // Double-clicking a node sets this; the NodeDetailPanel Sheet reads it and
  // renders the Configure/Input/Output/Run/Preview tabs. Closing the panel
  // (Esc / overlay click / close button) clears it. One id at a time.
  detailNodeId: string | null;
  openNodeDetail: (nodeId: string) => void;
  closeNodeDetail: () => void;
}

// --- projectSlice (NEW) ---
// HistoryEntry is frontend-populated by the controller on run terminal states
// (succeeded/failed/cancelled via the authoritative backend run event). It is
// session-only — NOT persisted (excluded from partialize by the whitelist). The
// shape extends the Phase 3 dead `history` field with endedAt/duration/failedNode
// so the History screen can render status, time, and the offending node.
export interface HistoryEntry {
  runId: number;
  status: RunStatus;
  startedAt: number;
  endedAt: number;
  duration: number;
  failedNode?: string;
}
export interface ProjectSlice {
  projectId: number;
  projectName: string;
  workflowName: string;
  history: HistoryEntry[];
  setWorkflowName: (name: string) => void;
  setProjectName: (name: string) => void;
  // Prepend a new history entry (dedup-skip if runId already recorded).
  appendHistory: (entry: HistoryEntry) => void;
  // Replace any existing entry for the same runId, else prepend.
  replaceHistoryEntry: (entry: HistoryEntry) => void;
}

export type WorkflowState = GraphSlice &
  HistorySlice &
  SelectionSlice &
  RunSlice &
  SaveSlice &
  ConsoleSlice &
  ProblemsSlice &
  UiSlice &
  ProjectSlice;

/* ============================================================================
   Constants
   ========================================================================== */
const LOG_CAP = 2000;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* ============================================================================
   Problems derivation — scans graph for frontend-only runtime nodes
   (spec §14.2 Run guard). Called by the controller after replaceGraph +
   on graph mutations.
   ========================================================================== */
export function deriveProblems(state: WorkflowState): Problem[] {
  const problems: Problem[] = [];
  for (const node of state.nodes) {
    const def = node.type ? NODE_DEFINITION_MAP[node.type] : undefined;
    if (!def) {
      problems.push({
        id: `unknown-${node.id}`,
        severity: 'error',
        nodeId: node.id,
        message: `Unknown node type "${node.type}".`,
      });
      continue;
    }
    if (def.registryState === 'frontend-only' && def.executionMode === 'runtime') {
      problems.push({
        id: `frontend-only-${node.id}`,
        severity: 'warning',
        nodeId: node.id,
        message: `Node type "${def.type}" is not registered in the backend and cannot run.`,
      });
    }
    if (def.executionMode === 'planned') {
      problems.push({
        id: `planned-${node.id}`,
        severity: 'error',
        code: 'PLANNED_NODE_UNAVAILABLE',
        title: 'Node is available for design only',
        nodeId: node.id,
        message: `${def.label} is marked Coming later and has no runtime executor.`,
        hint: 'Remove the planned node before running this workflow.',
      });
    }
    // Required *value* check (spec §pre-run): warn when a node is missing a
    // required scalar data field. Advise-only — does NOT block the run. The
    // node will then fail at runtime with an honest error if still empty.
    // Conditional fields (def.requiredDataFields[].when) are only checked when
    // their predicate passes (e.g. backgroundMedia.videoPath only when mode='video').
    const data = (node.data ?? {}) as Record<string, unknown>;
    for (const field of def.requiredDataFields ?? []) {
      if (field.when && !field.when(data)) continue;
      const raw = data[field.key];
      const empty = raw == null || raw === '' || (typeof raw === 'string' && raw.trim() === '');
      if (empty) {
        problems.push({
          id: `missing-value-${node.id}-${field.key}`,
          severity: 'warning',
          code: 'REQUIRED_VALUE_MISSING',
          title: `${def.label} needs a value`,
          nodeId: node.id,
          message: `${field.label} is empty on ${def.label}.`,
          hint: field.hint ?? null,
        });
      }
    }
  }
  return problems;
}

/* ============================================================================
   Store
   ========================================================================== */
export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      /* ---- graphSlice ---- */
      nodes: [],
      edges: [],
      // Phase 6: pushHistory snapshots the pre-mutation {nodes, edges} onto
      // `past` (capped 50, FIFO) and clears `future` (any new edit branches).
      // Called BEFORE each structural mutation so Undo restores the pre-state.
      // NOT called for continuous drag/resize position changes (would flood
      // history) — only for add/connect/delete/data-edit. RF remove-via-key
      // goes through onNodesChange with a 'remove' change → snapshot there.
      onNodesChange: (changes: NodeChange<AppNode>[]) => {
        if (changes.some((c) => c.type === 'remove')) {
          const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
          set({ past, future: [], canUndo: true, canRedo: false });
        }
        set({ nodes: applyNodeChanges(changes, get().nodes) });
        get().markDirty();
      },
      onEdgesChange: (changes: EdgeChange[]) => {
        if (changes.some((c) => c.type === 'remove')) {
          const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
          set({ past, future: [], canUndo: true, canRedo: false });
        }
        set({ edges: applyEdgeChanges(changes, get().edges) });
        get().markDirty();
      },
      onConnect: (connection: Connection) => {
        const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
        set({ past, future: [], canUndo: true, canRedo: false });
        set({ edges: addEdge(connection, get().edges) });
        get().markDirty();
      },
      setNodes: (nodes) => {
        const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
        set({ past, future: [], canUndo: true, canRedo: false });
        set({ nodes });
      },
      setEdges: (edges) => {
        const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
        set({ past, future: [], canUndo: true, canRedo: false });
        set({ edges });
      },
      addNode: (node) => {
        const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
        set({ past, future: [], canUndo: true, canRedo: false });
        set({ nodes: [...get().nodes, node] });
        get().markDirty();
      },
      updateNodeData: (nodeId, data) => {
        const past = [...get().past, { nodes: get().nodes, edges: get().edges }].slice(-50);
        set({ past, future: [], canUndo: true, canRedo: false });
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
          ),
        });
        get().markDirty();
      },
      replaceGraph: ({ nodes, edges }) => {
        // §27 Load-path guard: Phase 5 switched handles from Position.Top/Bottom
        // (no id) to Position.Left/Right with id='in'/'out'. Existing saved
        // edges have sourceHandle/targetHandle === null and would NOT reattach
        // to the newly-id'd handles. Normalise null handles to the single port
        // on that side when the node has exactly one port (the common case). If
        // the node has multiple ports, the user must reconnect manually.
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        const normalisedEdges = edges.map((edge) => {
          const next: Edge = { ...edge };
          if (next.sourceHandle == null) {
            const src = nodeMap.get(edge.source);
            const def = src?.type ? NODE_DEFINITION_MAP[src.type] : undefined;
            const outPorts = def?.ports.out ?? [];
            if (outPorts.length === 1) next.sourceHandle = outPorts[0].id;
          }
          if (next.targetHandle == null) {
            const tgt = nodeMap.get(edge.target);
            const def = tgt?.type ? NODE_DEFINITION_MAP[tgt.type] : undefined;
            const inPorts = def?.ports.in ?? [];
            if (inPorts.length === 1) next.targetHandle = inPorts[0].id;
          }
          return next;
        });
        set({
          nodes,
          edges: normalisedEdges,
          dirty: false,
          saveStatus: 'idle',
          saveError: null,
          selectedNodeId: null,
          selectedEdgeId: null,
          multiSelectIds: [],
          selectionMode: 'none',
          logs: [],
          problems: deriveProblems({ ...get(), nodes, edges: normalisedEdges }),
          // run state is left untouched — a loaded graph doesn't cancel a live run
          // Phase 6: a loaded graph is a fresh history boundary — clear undo/redo
          // so history never crosses graphs.
          past: [],
          future: [],
          canUndo: false,
          canRedo: false,
        });
      },

      duplicateNodes: (ids) => {
        const { nodes } = get();
        const sourceMap = new Map(nodes.map((n) => [n.id, n]));
        const clones: AppNode[] = [];
        for (const id of ids) {
          const n = sourceMap.get(id);
          if (!n) continue;
          clones.push({
            ...n,
            id: uuidv4(),
            position: { x: n.position.x + 24, y: n.position.y + 24 },
            data: { ...n.data },
            selected: false,
          });
        }
        if (clones.length === 0) return [];
        // setNodes snapshots pre-state (history) + markDirty — the same path
        // every structural mutation takes (§27: never bypass the mutators).
        get().setNodes([...get().nodes, ...clones]);
        const cloneIds = clones.map((c) => c.id);
        if (cloneIds.length === 1) get().selectNode(cloneIds[0]);
        else get().setMultiSelect(cloneIds);
        return cloneIds;
      },

      addNextStep: (sourceId, nodeType) => {
        const { nodes } = get();
        const source = nodes.find((n) => n.id === sourceId);
        if (!source) return null;
        const def = NODE_DEFINITION_MAP[nodeType];
        if (!def) return null;
        const newId = uuidv4();
        // Place ~120px below the source, aligned on x (top→bottom flow, spec §34).
        const newNode: AppNode = {
          id: newId,
          type: nodeType,
          position: { x: source.position.x, y: source.position.y + 120 },
          data: { label: def.label || nodeType },
        };
        // addNode + (optionally) onConnect — both snapshot history + markDirty,
        // so Add Next is undoable as one logical step (two snapshots, acceptable).
        get().addNode(newNode);
        // Auto-connect source→new only when both sides have a single port to wire
        // (the common flow case). Uses the registry handle ids so the edge shape
        // matches what onConnect produces from a drag-connect (§27 edge contract).
        const srcDef = source.type ? NODE_DEFINITION_MAP[source.type] : undefined;
        const outPort = srcDef?.ports.out[0];
        const inPort = def.ports.in[0];
        if (outPort && inPort) {
          get().onConnect({
            source: sourceId,
            target: newId,
            sourceHandle: outPort.id,
            targetHandle: inPort.id,
          });
        }
        get().selectNode(newId);
        return newId;
      },

      /* ---- clipboard (spec §53/§54) ---- Transient node-data clipboard.
       * copyNodes stores {type,data} for the given ids (dedupes, preserves
       * order). pasteNodes clones each at `anchor` preserving the selection's
       * internal relative layout, via addNode (§27 single path). Edges are
       * never copied (spec §21). Not persisted — clipboard dies on reload. */
      clipboard: [],
      copyNodes: (ids) => {
        const idSet = new Set(ids);
        const { nodes } = get();
        // Only nodes with a defined type are copyable (a node without a type
        // can't be re-created on paste — AppNode.type is optional in xyflow but
        // every registry node sets it). Filter defensively so the clipboard
        // type stays `string`, never `string | undefined`.
        const kept = nodes.filter((n) => idSet.has(n.id) && typeof n.type === 'string');
        set({
          clipboard: kept.map((n) => ({
            type: n.type as string,
            data: { ...n.data } as AppNodeData,
          })),
        });
        get().setAnnouncement({
          id: uuidv4(),
          text: `Copied ${kept.length} node${kept.length > 1 ? 's' : ''}.`,
        });
      },
      pasteNodes: (anchor) => {
        const { clipboard } = get();
        if (clipboard.length === 0) return [];
        // Reproduce the copied selection's relative layout: compute the bbox
        // origin from the ORIGINAL node positions at copy time. We don't have
        // those here (we stored only type+data), so place each pasted node at
        // anchor + index*24 step (a small staircase). This is deterministic and
        // matches the "24px offset" duplicate convention (§21). For a single
        // copied node the result is exactly at `anchor`.
        const created: AppNode[] = clipboard.map((c, i) => ({
          id: uuidv4(),
          type: c.type,
          position: { x: anchor.x + i * 24, y: anchor.y + i * 24 },
          data: { ...c.data },
        }));
        created.forEach((n) => get().addNode(n));
        const ids = created.map((n) => n.id);
        if (ids.length === 1) get().selectNode(ids[0]);
        else get().setMultiSelect(ids);
        get().setAnnouncement({
          id: uuidv4(),
          text: `Pasted ${ids.length} node${ids.length > 1 ? 's' : ''}.`,
        });
        return ids;
      },
      insertNodeBetween: (edgeId, nodeType) => {
        const { edges, nodes } = get();
        const edge = edges.find((e) => e.id === edgeId);
        if (!edge) return null;
        const def = NODE_DEFINITION_MAP[nodeType];
        if (!def) return null;
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) return null;
        const newId = uuidv4();
        // Midpoint of the two connected nodes (node-space coords — zoom-
        // independent, same as addNextStep's offset). A typical top→bottom flow
        // (§34) puts the new node visually between A and B on the edge's path.
        const newNode: AppNode = {
          id: newId,
          type: nodeType,
          position: {
            x: (source.position.x + target.position.x) / 2,
            y: (source.position.y + target.position.y) / 2,
          },
          data: { label: def.label || nodeType },
        };
        // addNode snapshots history + markDirty (single node-creation path, §27).
        get().addNode(newNode);
        // Splice: remove A→B, add A→New + New→B via onConnect so the new edges
        // carry the exact shape a drag-connect produces (§27 edge contract).
        // Preserve the ORIGINAL edge's handles: A's out-handle stays the same,
        // B's in-handle stays the same. The new node's in/out handles come from
        // the registry (the single-port ids). If the new node has no in/out
        // port, skip that half (the new node sits half-connected — never a crash).
        const newIn = def.ports.in[0]?.id;
        const newOut = def.ports.out[0]?.id;
        const aToNew = newIn
          ? {
              source: edge.source,
              target: newId,
              sourceHandle: edge.sourceHandle ?? null,
              targetHandle: newIn,
            }
          : null;
        const newToB = newOut
          ? {
              source: newId,
              target: edge.target,
              sourceHandle: newOut,
              targetHandle: edge.targetHandle ?? null,
            }
          : null;
        // Remove the original edge first (setEdges, snapshots history), then
        // add the two splices (onConnect, each snapshots history). This yields
        // 3 history snapshots for one logical "insert between" — acceptable, and
        // each step is individually a valid graph state.
        get().setEdges(get().edges.filter((e) => e.id !== edgeId));
        if (aToNew) get().onConnect(aToNew);
        if (newToB) get().onConnect(newToB);
        get().selectNode(newId);
        get().setAnnouncement({
          id: uuidv4(),
          text: `Inserted ${def.label} between nodes.`,
        });
        return newId;
      },

      /* ---- historySlice (Phase 6: client-side Undo/Redo) ---- */
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
      undo: () => {
        const { past, future, nodes, edges } = get();
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        // Push the CURRENT state onto future; restore `previous`.
        set({
          nodes: previous.nodes,
          edges: previous.edges,
          past: past.slice(0, -1),
          future: [{ nodes, edges }, ...future].slice(0, 50),
          canUndo: past.length > 1,
          canRedo: true,
          dirty: true,
        });
        get().markDirty();
        get().setAnnouncement({ id: uuidv4(), text: 'Undo.' });
      },
      redo: () => {
        const { past, future, nodes, edges } = get();
        if (future.length === 0) return;
        const next = future[0];
        set({
          nodes: next.nodes,
          edges: next.edges,
          past: [...past, { nodes, edges }].slice(-50),
          future: future.slice(1),
          canUndo: true,
          canRedo: future.length > 1,
          dirty: true,
        });
        get().markDirty();
        get().setAnnouncement({ id: uuidv4(), text: 'Redo.' });
      },
      resetHistory: () =>
        set({ past: [], future: [], canUndo: false, canRedo: false }),

      /* ---- selectionSlice ---- */
      selectedNodeId: null,
      selectedEdgeId: null,
      multiSelectIds: [],
      selectionMode: 'none',
      selectNode: (nodeId) => {
        const { nodes, edges } = get();
        set({
          selectedNodeId: nodeId,
          selectedEdgeId: null,
          multiSelectIds: [],
          selectionMode: nodeId === null ? 'none' : 'node',
          // Sync RF controlled-mode selection flags (transient; no history/dirty).
          nodes: syncNodeSelection(nodes, nodeId),
          edges: syncEdgeSelection(edges, null),
        });
      },
      selectEdge: (edgeId) => {
        const { nodes, edges } = get();
        set({
          selectedEdgeId: edgeId,
          selectedNodeId: null,
          multiSelectIds: [],
          selectionMode: edgeId === null ? 'none' : 'edge',
          nodes: syncNodeSelection(nodes, null),
          edges: syncEdgeSelection(edges, edgeId),
        });
      },
      setMultiSelect: (ids) => {
        const { nodes, edges } = get();
        set({
          multiSelectIds: ids,
          selectedNodeId: null,
          selectedEdgeId: null,
          selectionMode: ids.length > 1 ? 'multi' : 'none',
          // A 0/1-id set is a clear/single-select — still write the flags so RF
          // drops its prior selection (e.g. after duplicate→setMultiSelect([one])).
          nodes: syncNodeSelection(nodes, null, ids),
          edges: syncEdgeSelection(edges, null),
        });
      },
      clearSelection: () => {
        const { nodes, edges } = get();
        set({
          selectedNodeId: null,
          selectedEdgeId: null,
          multiSelectIds: [],
          selectionMode: 'none',
          nodes: syncNodeSelection(nodes, null),
          edges: syncEdgeSelection(edges, null),
        });
      },

      /* ---- runSlice ---- */
      runId: null,
      runStatus: 'idle',
      runProgress: null,
      perNodeStatus: {},
      runStartedAt: null,
      runError: null,
      lastCompletedRunId: null,
      nodeResults: {},
      setRunStarting: () =>
        set({ runStatus: 'starting', runError: null, runProgress: null, perNodeStatus: {}, nodeResults: {} }),
      setRunRunning: (runId) =>
        set({ runStatus: 'running', runId, runStartedAt: Date.now() }),
      setRunProgress: (progress) => set({ runProgress: progress }),
      setNodeStatus: (nodeId, status, message) =>
        set({
          perNodeStatus: {
            ...get().perNodeStatus,
            [nodeId]: {
              status,
              progress: get().perNodeStatus[nodeId]?.progress ?? null,
              message: message ?? get().perNodeStatus[nodeId]?.message ?? '',
              startedAt: get().perNodeStatus[nodeId]?.startedAt ?? Date.now(),
              endedAt: status === 'running' ? null : Date.now(),
            },
          },
        }),
      setNodeProgress: (nodeId, progress) => {
        const current = get().perNodeStatus[nodeId];
        set({
          perNodeStatus: {
            ...get().perNodeStatus,
            [nodeId]: {
              status: current?.status ?? 'running',
              progress,
              message: current?.message ?? '',
              startedAt: current?.startedAt ?? Date.now(),
              endedAt: current?.endedAt ?? null,
            },
          },
        });
      },
      setNodeResult: (nodeId, result) =>
        set({ nodeResults: { ...get().nodeResults, [nodeId]: result } }),
      setRunTerminal: (status, error) =>
        set({
          runStatus: status,
          runError: error ?? null,
          runProgress: null,
          lastCompletedRunId: status === 'succeeded' ? get().runId : get().lastCompletedRunId,
        }),
      resetRun: () =>
        set({
          runId: null,
          runStatus: 'idle',
          runProgress: null,
          perNodeStatus: {},
          runStartedAt: null,
          runError: null,
          nodeResults: {},
        }),

      /* ---- saveSlice ---- */
      dirty: false,
      saveStatus: 'idle',
      saveError: null,
      lastSavedAt: null,
      markDirty: () => set({ dirty: true }),
      markClean: () => set({ dirty: false, saveStatus: 'idle', saveError: null }),
      setSaving: () => set({ saveStatus: 'saving', saveError: null }),
      setSaved: () => set({ saveStatus: 'saved', dirty: false, saveError: null, lastSavedAt: Date.now() }),
      setSaveError: (error) => set({ saveStatus: 'error', saveError: error }),
      setSaveIdle: () => set({ saveStatus: 'idle' }),

      /* ---- consoleSlice ---- */
      logs: [],
      logFilters: { levels: ['info', 'warn', 'error', 'system', 'debug'], nodeId: null },
      appendLog: (entry) => {
        const logs = [...get().logs, { ...entry, id: uuidv4() }];
        if (logs.length > LOG_CAP) logs.splice(0, logs.length - LOG_CAP);
        set({ logs });
      },
      clearLogs: () => set({ logs: [] }),
      setLogFilter: (filter) => set({ logFilters: { ...get().logFilters, ...filter } }),

      /* ---- problemsSlice ---- */
      problems: [],
      selectedProblemId: null,
      setProblems: (problems) => set({ problems }),
      pushRuntimeProblem: (problem) =>
        set((s) => ({
          problems: s.problems.some((p) => p.id === problem.id) ? s.problems : [...s.problems, problem],
        })),
      selectProblem: (id) => set({ selectedProblemId: id }),

      /* ---- uiSlice ---- */
      activeScreen: 'workflow',
      // Phase 5: unified right-column panel (spec §15). Single width + collapsed
      // flag for the Build/Inspector swap. Clamp 280-360 (Build is the default
      // panel; the Inspector's wider 300px needs are met within this range, and a
      // single range keeps the swap stable). Persisted (LAYOUT ONLY).
      rightPanelWidth: 320,
      rightPanelCollapsed: false,
      setRightPanelWidth: (width) => set({ rightPanelWidth: clamp(width, 280, 360) }),
      toggleRightPanel: () => set({ rightPanelCollapsed: !get().rightPanelCollapsed }),
      dockCollapsed: true,
      dockHeight: 240,
      dockTab: 'console',
      minimapOn: false,
      health: { backend: 'ready', sqlite: 'ready', ffmpeg: 'unknown', ffprobe: 'unknown', gemini: 'unknown', storage: 'unknown' },
      dialog: null,
      toasts: [],
      announcement: { id: '', text: '' },
      setActiveScreen: (screen) => set({ activeScreen: screen }),
      toggleDock: () => set({ dockCollapsed: !get().dockCollapsed }),
      setDockHeight: (height) => set({ dockHeight: clamp(height, 120, 480) }),
      setDockTab: (tab) => set({ dockTab: tab, dockCollapsed: false }),
      setMinimapOn: (on) => set({ minimapOn: on }),
      setHealth: (health) => set({ health: { ...get().health, ...health } }),
      nodeCardMode: 'detail',
      setNodeCardMode: (mode) => set({ nodeCardMode: mode }),
      buildQuery: '',
      setBuildQuery: (q) => set({ buildQuery: q }),
      setDialog: (dialog) => set({ dialog }),
      pushToast: (toast) =>
        set({
          toasts: [...get().toasts.slice(-2), { ...toast, id: uuidv4(), createdAt: Date.now() }],
        }),
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      setAnnouncement: (announcement) => set({ announcement }),
      addModeNodeType: null,
      addModeReturnFocusId: null,
      setAddModeNodeType: (type, returnFocusId = null) =>
        set({ addModeNodeType: type, addModeReturnFocusId: returnFocusId ?? null }),
      pendingCenterNodeId: null,
      setPendingCenter: (nodeId) => set({ pendingCenterNodeId: nodeId }),
      // Phase E: transient detail-panel channel. NOT in partialize (whitelist),
      // so never persisted. openNodeDetail just sets the id; closeNodeDetail
      // clears it. The NodeDetailPanel Sheet is the sole reader.
      detailNodeId: null,
      openNodeDetail: (nodeId) => set({ detailNodeId: nodeId }),
      closeNodeDetail: () => set({ detailNodeId: null }),

      /* ---- projectSlice ---- */
      projectId: 1,
      projectName: 'Default Project',
      workflowName: 'Untitled Workflow',
      history: [],
      // Name edits are frontend-local: save serializes {nodes, edges} ONLY
      // (controller.save → save_workflow) and load returns graph JSON ONLY, so
      // names are NOT part of the persisted graph. We deliberately do NOT call
      // markDirty() here — doing so would set an "Unsaved" chip that saving can
      // never clear (silent data-loss UX). Honest Phase 8 state.
      setWorkflowName: (name) => set({ workflowName: name }),
      setProjectName: (name) => set({ projectName: name }),
      // Dedup-skip: keep the first recorded terminal for a runId.
      appendHistory: (entry) =>
        set({
          history: get().history.some((h) => h.runId === entry.runId)
            ? get().history
            : [entry, ...get().history].slice(0, 200),
        }),
      // Replace-by-runId: drop any existing entry for this runId then prepend.
      replaceHistoryEntry: (entry) =>
        set({
          history: [entry, ...get().history.filter((h) => h.runId !== entry.runId)].slice(0, 200),
        }),
    }),
    {
      name: 'void-workflow-ui',
      // LAYOUT ONLY — never graph/run/selection/save/console/problems/dialog/toasts.
      partialize: (state) => ({
        rightPanelWidth: state.rightPanelWidth,
        rightPanelCollapsed: state.rightPanelCollapsed,
        dockCollapsed: state.dockCollapsed,
        dockHeight: state.dockHeight,
        dockTab: state.dockTab,
        minimapOn: state.minimapOn,
        nodeCardMode: state.nodeCardMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Phase 5 migration: prior sessions persisted separate
        // libraryWidth/inspectorWidth/libraryCollapsed/inspectorCollapsed.
        // Fold them into the unified rightPanelWidth/rightPanelCollapsed
        // (prefer the Inspector's wider width when both exist — the Inspector
        // needs more room than the Build list), then drop the legacy keys so
        // the next persist writes only the unified pair. New installs that
        // never had the legacy keys keep the init defaults.
        const s = state as unknown as Record<string, unknown>;
        const hadLegacy =
          'libraryWidth' in s || 'inspectorWidth' in s ||
          'libraryCollapsed' in s || 'inspectorCollapsed' in s;
        if (hadLegacy) {
          const libW = typeof s.libraryWidth === 'number' ? s.libraryWidth : 300;
          const insW = typeof s.inspectorWidth === 'number' ? s.inspectorWidth : 300;
          const libC = typeof s.libraryCollapsed === 'boolean' ? s.libraryCollapsed : false;
          const insC = typeof s.inspectorCollapsed === 'boolean' ? s.inspectorCollapsed : false;
          // Prefer the wider of the two widths (Inspector commonly 300; Build
          // 240) so neither panel shrinks on first swap. Collapsed: collapse
          // only if BOTH were collapsed (don't surprise-expand).
          s.rightPanelWidth = Math.max(libW, insW);
          s.rightPanelCollapsed = libC && insC;
          delete s.libraryWidth;
          delete s.inspectorWidth;
          delete s.libraryCollapsed;
          delete s.inspectorCollapsed;
        }
        // Clamp persisted widths to allowed ranges (spec §3 line 121).
        if (typeof s.rightPanelWidth === 'number') {
          s.rightPanelWidth = clamp(s.rightPanelWidth, 280, 360);
        }
        state.dockHeight = clamp(state.dockHeight, 120, 480);
      },
    },
  ),
);

// Dev-only debug hook: expose the store on `window.__voidStore` so the Phase C
// interaction model can be exercised deterministically in a headless browser
// (where Tauri IPC + React Flow add-mode placement are hard to drive via CDP).
// DEV-gated so it is stripped from production builds; no behavior change.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __voidStore?: typeof useWorkflowStore }).__voidStore =
    useWorkflowStore;
}
