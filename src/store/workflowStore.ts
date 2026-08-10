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

/* ============================================================================
   AppNode / AppNodeData — preserved shape (regression contract §27)
   ========================================================================== */
export type AppNodeData = {
  label: string;
  [key: string]: any;
};

export type AppNode = Node<AppNodeData>;

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
  setRunStarting: () => void;
  setRunRunning: (runId: number) => void;
  setRunProgress: (progress: number | null) => void;
  setNodeStatus: (nodeId: string, status: PerNodeState, message?: string) => void;
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
  nodeId: string | null;
  message: string;
}
export interface ProblemsSlice {
  problems: Problem[];
  selectedProblemId: string | null;
  setProblems: (problems: Problem[]) => void;
  selectProblem: (id: string | null) => void;
}

// --- uiSlice (NEW — LAYOUT ONLY is persisted) ---
export type DockTab = 'console' | 'problems' | 'run' | 'artifacts';
export type DialogKind = null | 'keyboard-help' | 'unsaved-guard';
export type ActiveScreen = 'workflow' | 'projects' | 'history' | 'settings';
export type ToastKind = 'success' | 'info' | 'error';
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  createdAt: number;
}
export type HealthState = 'ready' | 'configured' | 'degraded' | 'down';
export interface Health {
  backend: HealthState;
  sqlite: HealthState;
  ffmpeg: HealthState;
  gemini: HealthState;
}
export interface Announcement {
  id: string;
  text: string;
}
export interface UiSlice {
  activeScreen: ActiveScreen;
  appRailCollapsed: boolean;
  libraryCollapsed: boolean;
  libraryWidth: number;
  inspectorCollapsed: boolean;
  inspectorWidth: number;
  dockCollapsed: boolean;
  dockHeight: number;
  dockTab: DockTab;
  minimapOn: boolean;
  health: Health;
  dialog: DialogKind;
  toasts: Toast[];
  announcement: Announcement;
  setActiveScreen: (screen: ActiveScreen) => void;
  toggleAppRail: () => void;
  toggleLibrary: () => void;
  setLibraryWidth: (width: number) => void;
  toggleInspector: () => void;
  setInspectorWidth: (width: number) => void;
  toggleDock: () => void;
  setDockHeight: (height: number) => void;
  setDockTab: (tab: DockTab) => void;
  setMinimapOn: (on: boolean) => void;
  setHealth: (health: Partial<Health>) => void;
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
}

// --- projectSlice (NEW) ---
// HistoryEntry is frontend-populated by the controller on run terminal states
// (succeeded/failed via inferRunCompletion; cancelled via stop()). It is
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
  // Prepend a new history entry (dedup-skip if runId already recorded — used by
  // inferRunCompletion, where the first terminal wins). Capped at 200.
  appendHistory: (entry: HistoryEntry) => void;
  // Replace any existing entry for the same runId, else prepend — used by stop()
  // so a deliberate cancel overrides a racing inferred terminal state.
  replaceHistoryEntry: (entry: HistoryEntry) => void;
}

export type WorkflowState = GraphSlice &
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
   Problems derivation — scans graph for frontend-only EXECUTABLE nodes
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
    if (def.registryState === 'frontend-only' && def.executable) {
      problems.push({
        id: `frontend-only-${node.id}`,
        severity: 'warning',
        nodeId: node.id,
        message: `Node type "${def.type}" is not registered in the backend and cannot run.`,
      });
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
      onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
        get().markDirty();
      },
      onEdgesChange: (changes: EdgeChange[]) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
        get().markDirty();
      },
      onConnect: (connection: Connection) => {
        set({ edges: addEdge(connection, get().edges) });
        get().markDirty();
      },
      setNodes: (nodes) => {
        set({ nodes });
      },
      setEdges: (edges) => {
        set({ edges });
      },
      addNode: (node) => {
        set({ nodes: [...get().nodes, node] });
        get().markDirty();
      },
      updateNodeData: (nodeId, data) => {
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
        });
      },

      /* ---- selectionSlice ---- */
      selectedNodeId: null,
      selectedEdgeId: null,
      multiSelectIds: [],
      selectionMode: 'none',
      selectNode: (nodeId) =>
        set({
          selectedNodeId: nodeId,
          selectedEdgeId: null,
          multiSelectIds: [],
          selectionMode: nodeId === null ? 'none' : 'node',
        }),
      selectEdge: (edgeId) =>
        set({
          selectedEdgeId: edgeId,
          selectedNodeId: null,
          multiSelectIds: [],
          selectionMode: edgeId === null ? 'none' : 'edge',
        }),
      setMultiSelect: (ids) =>
        set({
          multiSelectIds: ids,
          selectedNodeId: null,
          selectedEdgeId: null,
          selectionMode: ids.length > 1 ? 'multi' : 'none',
        }),
      clearSelection: () =>
        set({
          selectedNodeId: null,
          selectedEdgeId: null,
          multiSelectIds: [],
          selectionMode: 'none',
        }),

      /* ---- runSlice ---- */
      runId: null,
      runStatus: 'idle',
      runProgress: null,
      perNodeStatus: {},
      runStartedAt: null,
      runError: null,
      lastCompletedRunId: null,
      setRunStarting: () =>
        set({ runStatus: 'starting', runError: null, runProgress: null, perNodeStatus: {} }),
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
      selectProblem: (id) => set({ selectedProblemId: id }),

      /* ---- uiSlice ---- */
      activeScreen: 'workflow',
      appRailCollapsed: false,
      libraryCollapsed: false,
      libraryWidth: 240,
      inspectorCollapsed: false,
      inspectorWidth: 300,
      dockCollapsed: true,
      dockHeight: 240,
      dockTab: 'console',
      minimapOn: false,
      health: { backend: 'ready', sqlite: 'ready', ffmpeg: 'ready', gemini: 'ready' },
      dialog: null,
      toasts: [],
      announcement: { id: '', text: '' },
      setActiveScreen: (screen) => set({ activeScreen: screen }),
      toggleAppRail: () => set({ appRailCollapsed: !get().appRailCollapsed }),
      toggleLibrary: () => set({ libraryCollapsed: !get().libraryCollapsed }),
      setLibraryWidth: (width) => set({ libraryWidth: clamp(width, 200, 360) }),
      toggleInspector: () => set({ inspectorCollapsed: !get().inspectorCollapsed }),
      setInspectorWidth: (width) => set({ inspectorWidth: clamp(width, 240, 440) }),
      toggleDock: () => set({ dockCollapsed: !get().dockCollapsed }),
      setDockHeight: (height) => set({ dockHeight: clamp(height, 120, 480) }),
      setDockTab: (tab) => set({ dockTab: tab, dockCollapsed: false }),
      setMinimapOn: (on) => set({ minimapOn: on }),
      setHealth: (health) => set({ health: { ...get().health, ...health } }),
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
      // Dedup-skip: keep the FIRST recorded terminal for a runId (used by
      // inferRunCompletion). Newest-first, cap 200, session-only.
      appendHistory: (entry) =>
        set({
          history: get().history.some((h) => h.runId === entry.runId)
            ? get().history
            : [entry, ...get().history].slice(0, 200),
        }),
      // Replace-by-runId: drop any existing entry for this runId then prepend.
      // Used by stop() so a user-initiated cancel overrides a racing inferred
      // terminal state (correction #3 from the Phase 8 design verify).
      replaceHistoryEntry: (entry) =>
        set({
          history: [entry, ...get().history.filter((h) => h.runId !== entry.runId)].slice(0, 200),
        }),
    }),
    {
      name: 'void-workflow-ui',
      // LAYOUT ONLY — never graph/run/selection/save/console/problems/dialog/toasts.
      partialize: (state) => ({
        appRailCollapsed: state.appRailCollapsed,
        libraryCollapsed: state.libraryCollapsed,
        libraryWidth: state.libraryWidth,
        inspectorCollapsed: state.inspectorCollapsed,
        inspectorWidth: state.inspectorWidth,
        dockCollapsed: state.dockCollapsed,
        dockHeight: state.dockHeight,
        dockTab: state.dockTab,
        minimapOn: state.minimapOn,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Clamp persisted widths to allowed ranges (spec §3 line 121).
        state.libraryWidth = clamp(state.libraryWidth, 200, 360);
        state.inspectorWidth = clamp(state.inspectorWidth, 240, 440);
        state.dockHeight = clamp(state.dockHeight, 120, 480);
      },
    },
  ),
);