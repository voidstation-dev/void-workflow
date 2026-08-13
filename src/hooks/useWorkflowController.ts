import { useEffect, useRef, useCallback } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { v4 as uuidv4 } from 'uuid';
import { useWorkflowStore, deriveProblems } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';

/**
 * useWorkflowController — the ONLY imperative Tauri writer (spec §2.2).
 * Hard rule: no other code calls `invoke()`. Components read/write their own
 * slice fields; the controller owns all 6 IPC commands + the workflow-log and
 * node-status event subscriptions + the Tauri close-requested guard + the
 * transient run/save timers + the global status announcer.
 *
 * Returns a stable API object so callers can use it in effect deps.
 */

interface WorkflowLogPayload {
  run_id: number;
  node_id: string | null;
  message: string;
  level: string;
}

interface NodeStatusPayload {
  run_id: number;
  node_id: string;
  status: string;
}

export interface WorkflowController {
  init: () => Promise<void>;
  save: () => Promise<void>;
  run: () => Promise<void>;
  stop: () => Promise<void>;
  openFolder: () => Promise<void>;
  pushToast: (toast: { kind: 'success' | 'info' | 'error'; title: string; description?: string }) => void;
  dismissToast: (id: string) => void;
  announce: (text: string) => void;
}

const announceReady = (last: number) => Date.now() - last >= 1000;

export function useWorkflowController(): WorkflowController {
  const store = useWorkflowStore;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastAnnounceRef = useRef<number>(0);
  const closeApprovedRef = useRef<boolean>(false);

  const pushToast = useCallback<WorkflowController['pushToast']>((toast) => {
    store.getState().pushToast(toast);
  }, [store]);

  const dismissToast = useCallback<WorkflowController['dismissToast']>((id) => {
    store.getState().dismissToast(id);
  }, [store]);

  const announce = useCallback<WorkflowController['announce']>((text) => {
    // Throttle announcements to ≤1/sec (spec §10.4).
    if (!announceReady(lastAnnounceRef.current)) return;
    lastAnnounceRef.current = Date.now();
    store.getState().setAnnouncement({ id: uuidv4(), text });
  }, [store]);

  const addTimer = (t: ReturnType<typeof setTimeout>) => {
    timersRef.current.push(t);
  };
  const clearTimer = (t: ReturnType<typeof setTimeout>) => {
    clearTimeout(t);
    timersRef.current = timersRef.current.filter((x) => x !== t);
  };

  const init = useCallback<WorkflowController['init']>(async () => {
    // Keep the Vite web preview usable for visual QA. Native persistence and
    // execution remain Tauri-only; the browser simply keeps the in-memory graph.
    if (!isTauri()) {
      store.getState().setHealth({ backend: 'unknown' });
      return;
    }
    try {
      await invoke<string>('init_project');
      store.getState().setHealth({ backend: 'ready' });
      const graphJson = await invoke<string>('load_workflow', { projectId: store.getState().projectId });
      const parsed = JSON.parse(graphJson) as { nodes: any[]; edges: any[] };
      store.getState().replaceGraph({ nodes: parsed.nodes || [], edges: parsed.edges || [] });
      announce('Workflow loaded');
    } catch (err) {
      store.getState().setHealth({ backend: 'down' });
      pushToast({ kind: 'error', title: 'Failed to initialize project', description: `${String(err)} — check the backend connection and retry.` });
      announce('Initialization failed');
    }
  }, [store, announce, pushToast]);

  const save = useCallback<WorkflowController['save']>(async () => {
    const state = store.getState();
    if (state.saveStatus === 'saving') return;
    state.setSaving();
    try {
      const graphJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });
      await invoke('save_workflow', { projectId: state.projectId, graphJson });
      store.getState().setSaved();
      pushToast({ kind: 'success', title: 'Saved' });
      // Fade the "Saved" chip back to idle after 2.5s.
      const t = setTimeout(() => {
        store.getState().setSaveIdle();
        clearTimer(t);
      }, 2500);
      addTimer(t);
    } catch (err) {
      store.getState().setSaveError(String(err));
      pushToast({ kind: 'error', title: 'Failed to save workflow', description: `${String(err)} — check the backend connection and retry.` });
    }
  }, [store, pushToast]);

  const run = useCallback<WorkflowController['run']>(async () => {
    const state = store.getState();

    // --- Pre-run guard (spec §14.2): block if the graph contains any
    //     frontend-only EXECUTABLE node. markdownNote (executable:false) does
    //     NOT block. ---
    const blocking = state.nodes
      .map((n) => (n.type ? NODE_DEFINITION_MAP[n.type] : undefined))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .filter((d) => d.registryState === 'frontend-only' && d.executable);
    if (blocking.length > 0) {
      store.getState().setProblems(deriveProblems(state));
      pushToast({
        kind: 'error',
        title: 'Run blocked',
        description: `Graph contains non-executable node${blocking.length > 1 ? 's' : ''}: ${blocking.map((b) => b.type).join(', ')}. Remove or replace them before running.`,
      });
      announce('Run blocked: graph contains non-executable nodes');
      return;
    }

    state.setRunStarting();
    try {
      const graphJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });
      const runId = await invoke<number>('start_run', { projectId: state.projectId, graphJson });
      store.getState().setRunRunning(runId);
      announce('Run started');
    } catch (err) {
      store.getState().setRunTerminal('failed', String(err));
      pushToast({ kind: 'error', title: 'Failed to start workflow', description: `${String(err)} — check the backend connection and retry.` });
      announce('Run failed to start');
    }
  }, [store, pushToast, announce]);

  const stop = useCallback<WorkflowController['stop']>(async () => {
    const { runId } = store.getState();
    if (runId === null) return;
    try {
      await invoke('cancel_run', { runId });
      // Re-read runStartedAt after the await: setRunTerminal does NOT clear it
      // (only resetRun does, 3s later), but the await is a yield so we read the
      // freshest value rather than a stale binding. runId is the local above.
      const startedAt = store.getState().runStartedAt ?? Date.now();
      store.getState().setRunTerminal('cancelled');
      // Record the cancel via replace-by-runId so a deliberate cancel overrides
      // any racing inferred terminal state that inferRunCompletion may have
      // appended during the await. Runs BEFORE resetRun (which clears runId/
      // runStartedAt). Guarded: runId is non-null here (early-return above).
      store.getState().replaceHistoryEntry({
        runId,
        status: 'cancelled',
        startedAt,
        endedAt: Date.now(),
        duration: Date.now() - startedAt,
      });
      pushToast({ kind: 'info', title: 'Run cancelled' });
      announce('Run cancelled');
      // Fade cancelled → idle after 3s (spec §11.3).
      const t = setTimeout(() => {
        store.getState().resetRun();
        clearTimer(t);
      }, 3000);
      addTimer(t);
    } catch (err) {
      pushToast({ kind: 'error', title: 'Failed to cancel workflow', description: `${String(err)} — check the backend connection and retry.` });
    }
  }, [store, pushToast, announce]);

  const openFolder = useCallback<WorkflowController['openFolder']>(async () => {
    const { lastCompletedRunId } = store.getState();
    if (lastCompletedRunId === null) {
      pushToast({ kind: 'info', title: 'No completed run', description: 'Run the workflow first to open its output folder.' });
      return;
    }
    try {
      // Fixes the audit §5.2 `currentRunId || 1` hack — uses the real
      // last-completed run id from runSlice.
      await invoke('open_run_folder', { runId: lastCompletedRunId });
    } catch (err) {
      pushToast({ kind: 'error', title: 'Failed to open folder', description: `${String(err)} — check the backend connection and retry.` });
    }
  }, [store, pushToast]);

  // --- Event subscriptions + window-close guard (mount once) ---
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenLog: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    // Run-completion inference (spec §11.4 + §11.3). The backend's executor is
    // fire-and-forget — it emits per-node terminal events but NO run-level
    // "run completed" event, and we cannot add one (no .rs edits). So we infer
    // completion from the accumulated per-node statuses: once every node that
    // started (startedAt !== null) is terminal, the run is over. If any node
    // failed → run failed (auto-open Problems + error toast + assertive-style
    // announce via the toast region); otherwise succeeded (sets
    // lastCompletedRunId so the Run/Artifacts tabs become honest). Guarded by
    // runStatus==='running' so a late event after a terminal state can't flip
    // it back. Honest edge case: a graph whose nodes never emit any event stays
    // 'running' — acceptable, and documented here.
    const inferRunCompletion = () => {
      const st = store.getState();
      if (st.runStatus !== 'running') return;
      const entries = Object.entries(st.perNodeStatus);
      const touched = entries.filter(([, v]) => v.startedAt !== null);
      if (touched.length === 0) return;
      const allTerminal = touched.every(([, v]) =>
        ['success', 'failed', 'cancelled', 'skipped', 'warning'].includes(v.status),
      );
      if (!allTerminal) return;
      const failedEntry = touched.find(([, v]) => v.status === 'failed');
      if (failedEntry) {
        const [nodeId, v] = failedEntry;
        const reason = v.message || 'node failed';
        const startedAt = st.runStartedAt ?? Date.now();
        st.setRunTerminal('failed', reason);
        // Record history AFTER setRunTerminal (which does not clear runId/
        // runStartedAt — only resetRun does, 3s later in stop()). Dedup-skip
        // via appendHistory so a natural completion is recorded once.
        if (st.runId !== null) {
          st.appendHistory({
            runId: st.runId,
            status: 'failed',
            startedAt,
            endedAt: Date.now(),
            duration: Date.now() - startedAt,
            failedNode: nodeId,
          });
        }
        st.setDockTab('problems');
        st.pushToast({ kind: 'error', title: 'Run failed', description: reason });
        announce(`Run failed at ${nodeId}: ${reason}`);
      } else {
        const startedAt = st.runStartedAt ?? Date.now();
        st.setRunTerminal('succeeded');
        if (st.runId !== null) {
          st.appendHistory({
            runId: st.runId,
            status: 'succeeded',
            startedAt,
            endedAt: Date.now(),
            duration: Date.now() - startedAt,
          });
        }
      }
    };

    listen<WorkflowLogPayload>('workflow-log', (event) => {
      const p = event.payload;
      store.getState().appendLog({
        runId: p.run_id,
        nodeId: p.node_id,
        message: p.message,
        level: p.level,
        timestamp: Date.now(),
      });
      // Per-node status inference from log level (spec §11.4 fallback). Only
      // escalate UP to running when the node has no terminal state yet, so an
      // explicit failed/warning from a node-status event is never overwritten.
      if (p.node_id) {
        const level = (p.level || '').toLowerCase();
        if (level === 'error') {
          store.getState().setNodeStatus(p.node_id, 'failed', p.message);
        } else if (level === 'warn' || level === 'warning') {
          store.getState().setNodeStatus(p.node_id, 'warning', p.message);
        } else if (level === 'info') {
          const cur = store.getState().perNodeStatus[p.node_id]?.status;
          if (cur === 'idle' || cur === 'queued' || cur === undefined) {
            store.getState().setNodeStatus(p.node_id, 'running', p.message);
          }
        }
      }
      inferRunCompletion();
    }).then((f) => { unlistenLog = f; });

    listen<NodeStatusPayload>('node-status', (event) => {
      const p = event.payload;
      if (!p.node_id) return;
      const status = (p.status || '').toLowerCase() as any;
      store.getState().setNodeStatus(p.node_id, status);
      inferRunCompletion();
    }).then((f) => { unlistenStatus = f; });

    // Unsaved-changes guard on window close (spec §10.3 modal #1).
    getCurrentWindow().onCloseRequested((event) => {
      if (closeApprovedRef.current) return; // user already approved in guard dialog
      if (store.getState().dirty) {
        event.preventDefault();
        store.getState().setDialog('unsaved-guard');
      }
    }).then((f) => { unlistenClose = f; });

    return () => {
      unlistenLog?.();
      unlistenStatus?.();
      unlistenClose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear transient timers on unmount.
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  // Escape hatch the UnsavedGuardDialog uses to approve + re-trigger close
  // after the user picks Save/Discard. Kept on window so the dialog (which has
  // no controller ref) can call it without prop-drilling.
  if (isTauri()) {
    (window as any).__voidApproveClose = () => {
      closeApprovedRef.current = true;
      getCurrentWindow().close();
    };
  }

  return { init, save, run, stop, openFolder, pushToast, dismissToast, announce };
}
