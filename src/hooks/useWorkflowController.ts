import { useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { v4 as uuidv4 } from 'uuid';
import { useWorkflowStore, deriveProblems } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';
import { normalizeAppError, serializeWorkflowGraph, type EnvironmentHealth, type NodeExecutionResult, type RuntimeSettings, type ValidationReport } from '@/nodes/runtimeContract';

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
  runId: number;
  nodeId: string | null;
  message: string;
  level: string;
}

interface NodeStatusPayload {
  runId: number;
  nodeId: string;
  status: string;
  message?: string | null;
}

interface NodeResultPayload extends NodeExecutionResult {
  runId: number;
  nodeId: string;
}

interface NodeProgressPayload {
  runId: number;
  nodeId: string;
  progress: number;
}

interface RunStatusPayload {
  runId: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
  durationMs: number;
}

export interface WorkflowController {
  init: () => Promise<void>;
  save: () => Promise<void>;
  run: () => Promise<void>;
  stop: () => Promise<void>;
  openFolder: () => Promise<void>;
  getRuntimeSettings: () => Promise<RuntimeSettings>;
  updateRuntimeSettings: (settings: RuntimeSettings) => Promise<RuntimeSettings>;
  setGeminiApiKey: (apiKey: string) => Promise<void>;
  clearGeminiApiKey: () => Promise<void>;
  refreshEnvironment: () => Promise<EnvironmentHealth | null>;
  pushToast: (toast: { kind: 'success' | 'info' | 'error'; title: string; description?: string }) => void;
  dismissToast: (id: string) => void;
  announce: (text: string) => void;
}

const announceReady = (last: number) => Date.now() - last >= 1000;
const errorDescription = (error: unknown) => {
  const payload = normalizeAppError(error);
  return payload.hint ? `${payload.message} ${payload.hint}` : payload.message;
};

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

  const refreshEnvironment = useCallback<WorkflowController['refreshEnvironment']>(async () => {
    if (!isTauri()) return null;
    try {
      const report = await invoke<EnvironmentHealth>('probe_environment');
      store.getState().setHealth({
        backend: report.backend.state,
        sqlite: report.sqlite.state,
        storage: report.storage.state,
        ffmpeg: report.ffmpeg.state,
        ffprobe: report.ffprobe.state,
        gemini: report.gemini.state,
      });
      return report;
    } catch (error) {
      store.getState().setHealth({ backend: 'down' });
      return null;
    }
  }, [store]);

  const getRuntimeSettings = useCallback<WorkflowController['getRuntimeSettings']>(async () => {
    return invoke<RuntimeSettings>('get_runtime_settings');
  }, []);

  const updateRuntimeSettings = useCallback<WorkflowController['updateRuntimeSettings']>(async (settings) => {
    const updated = await invoke<RuntimeSettings>('update_runtime_settings', { settings });
    await refreshEnvironment();
    return updated;
  }, [refreshEnvironment]);

  const setGeminiApiKey = useCallback<WorkflowController['setGeminiApiKey']>(async (apiKey) => {
    await invoke('set_gemini_api_key', { apiKey });
    await refreshEnvironment();
  }, [refreshEnvironment]);

  const clearGeminiApiKey = useCallback<WorkflowController['clearGeminiApiKey']>(async () => {
    await invoke('clear_gemini_api_key');
    await refreshEnvironment();
  }, [refreshEnvironment]);

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
      await refreshEnvironment();
      announce('Workflow loaded');
    } catch (err) {
      const error = normalizeAppError(err);
      store.getState().setHealth({ backend: 'down' });
      pushToast({ kind: 'error', title: error.title, description: errorDescription(err) });
      announce('Initialization failed');
    }
  }, [store, announce, pushToast, refreshEnvironment]);

  const save = useCallback<WorkflowController['save']>(async () => {
    const state = store.getState();
    if (state.saveStatus === 'saving') return;
    state.setSaving();
    try {
      const graphJson = JSON.stringify(serializeWorkflowGraph(state.nodes, state.edges));
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
      const error = normalizeAppError(err);
      store.getState().setSaveError(error.message);
      pushToast({ kind: 'error', title: error.title, description: errorDescription(err) });
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
      .filter((d) => d.registryState === 'frontend-only' && d.executionMode === 'runtime');
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

    try {
      const graphJson = JSON.stringify(serializeWorkflowGraph(state.nodes, state.edges));
      const validation = await invoke<ValidationReport>('validate_workflow', { graphJson });
      store.getState().setProblems(validation.problems);
      if (!validation.valid) {
        store.getState().setDockTab('problems');
        pushToast({
          kind: 'error',
          title: 'Workflow needs attention',
          description: `${validation.problems.length} problem${validation.problems.length === 1 ? '' : 's'} must be fixed before this workflow can run.`,
        });
        announce('Run blocked: workflow validation failed');
        return;
      }
      state.setRunStarting();
      const runId = await invoke<number>('start_run', { projectId: state.projectId, graphJson });
      // A very fast workflow can deliver its terminal backend event before
      // the command promise resolves. Never overwrite that authoritative state.
      if (store.getState().runStatus === 'starting') {
        store.getState().setRunRunning(runId);
      }
      announce('Run started');
    } catch (err) {
      const error = normalizeAppError(err);
      store.getState().setRunTerminal('failed', error.message);
      pushToast({ kind: 'error', title: error.title, description: errorDescription(err) });
      announce('Run failed to start');
    }
  }, [store, pushToast, announce]);

  const stop = useCallback<WorkflowController['stop']>(async () => {
    const { runId } = store.getState();
    if (runId === null) return;
    try {
      await invoke('cancel_run', { runId });
      pushToast({ kind: 'info', title: 'Cancellation requested' });
      announce('Cancellation requested');
    } catch (err) {
      const error = normalizeAppError(err);
      pushToast({ kind: 'error', title: error.title, description: errorDescription(err) });
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
      const error = normalizeAppError(err);
      pushToast({ kind: 'error', title: error.title, description: errorDescription(err) });
    }
  }, [store, pushToast]);

  // --- Event subscriptions + window-close guard (mount once) ---
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenLog: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenResult: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenRunStatus: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    listen<WorkflowLogPayload>('workflow-log', (event) => {
      const p = event.payload;
      const current = store.getState();
      if ((current.runId === null && current.runStatus !== 'starting') || (current.runId !== null && p.runId !== current.runId)) return;
      store.getState().appendLog({
        runId: p.runId,
        nodeId: p.nodeId,
        message: p.message,
        level: p.level,
        timestamp: Date.now(),
      });
      // Per-node status inference from log level (spec §11.4 fallback). Only
      // escalate UP to running when the node has no terminal state yet, so an
      // explicit failed/warning from a node-status event is never overwritten.
      if (p.nodeId) {
        const level = (p.level || '').toLowerCase();
        if (level === 'error') {
          store.getState().setNodeStatus(p.nodeId, 'failed', p.message);
        } else if (level === 'warn' || level === 'warning') {
          store.getState().setNodeStatus(p.nodeId, 'warning', p.message);
        } else if (level === 'info') {
          const cur = store.getState().perNodeStatus[p.nodeId]?.status;
          if (cur === 'idle' || cur === 'queued' || cur === undefined) {
            store.getState().setNodeStatus(p.nodeId, 'running', p.message);
          }
        }
      }
    }).then((f) => { unlistenLog = f; });

    listen<NodeStatusPayload>('node-status', (event) => {
      const p = event.payload;
      const current = store.getState();
      if (!p.nodeId || (current.runId === null && current.runStatus !== 'starting') || (current.runId !== null && p.runId !== current.runId)) return;
      const allowed = ['idle', 'queued', 'running', 'success', 'warning', 'failed', 'cancelled', 'skipped'] as const;
      const normalized = (p.status || '').toLowerCase();
      if (!allowed.includes(normalized as typeof allowed[number])) return;
      store.getState().setNodeStatus(p.nodeId, normalized as typeof allowed[number], p.message ?? undefined);
    }).then((f) => { unlistenStatus = f; });

    listen<NodeResultPayload>('node-result', (event) => {
      const p = event.payload;
      const current = store.getState();
      if ((current.runId === null && current.runStatus !== 'starting') || (current.runId !== null && p.runId !== current.runId)) return;
      store.getState().setNodeResult(p.nodeId, {
        outputs: p.outputs,
        artifacts: p.artifacts,
        metadata: p.metadata,
        warnings: p.warnings,
        durationMs: p.durationMs,
      });
    }).then((f) => { unlistenResult = f; });

    listen<NodeProgressPayload>('node-progress', (event) => {
      const p = event.payload;
      const current = store.getState();
      if ((current.runId === null && current.runStatus !== 'starting') || (current.runId !== null && p.runId !== current.runId)) return;
      store.getState().setNodeProgress(p.nodeId, Math.max(0, Math.min(1, p.progress)));
    }).then((f) => { unlistenProgress = f; });

    listen<RunStatusPayload>('run-status', (event) => {
      const p = event.payload;
      const state = store.getState();
      if ((state.runId === null && state.runStatus !== 'starting') || (state.runId !== null && p.runId !== state.runId)) return;
      if (p.status === 'running') {
        state.setRunRunning(p.runId);
        return;
      }
      const startedAt = state.runStartedAt ?? Date.now() - p.durationMs;
      const uiStatus = p.status === 'completed' ? 'succeeded' : p.status;
      state.setRunTerminal(uiStatus, p.error ?? undefined);
      state.replaceHistoryEntry({
        runId: p.runId,
        status: uiStatus,
        startedAt,
        endedAt: Date.now(),
        duration: p.durationMs,
      });
      if (uiStatus === 'failed') {
        state.setDockTab('problems');
        state.pushToast({ kind: 'error', title: 'Run failed', description: p.error ?? undefined });
      } else if (uiStatus === 'cancelled') {
        state.pushToast({ kind: 'info', title: 'Run cancelled' });
      }
      announce(`Run ${uiStatus}`);
    }).then((f) => { unlistenRunStatus = f; });

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
      unlistenResult?.();
      unlistenProgress?.();
      unlistenRunStatus?.();
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

  return useMemo(() => ({
    init,
    save,
    run,
    stop,
    openFolder,
    getRuntimeSettings,
    updateRuntimeSettings,
    setGeminiApiKey,
    clearGeminiApiKey,
    refreshEnvironment,
    pushToast,
    dismissToast,
    announce,
  }), [init, save, run, stop, openFolder, getRuntimeSettings, updateRuntimeSettings, setGeminiApiKey, clearGeminiApiKey, refreshEnvironment, pushToast, dismissToast, announce]);
}
