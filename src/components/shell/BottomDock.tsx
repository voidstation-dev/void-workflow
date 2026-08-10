import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Info,
  TriangleAlert,
  XCircle,
  Terminal,
  Eraser,
  FolderOpen,
  LoaderCircle,
  CheckCircle2,
  CircleDashed,
  Ban,
  Minus,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { DockTab, RunStatus, PerNodeState, LogLevel } from '@/store/workflowStore';
import { useSplitter, splitterAria } from './useSplitter';
import { useInlineConfirm } from './useInlineConfirm';
import { cn } from '@/lib/utils';
import type { WorkflowController } from '@/hooks/useWorkflowController';

/**
 * BottomDock — Zone E (spec §9). Phase 3 shipped the shell (container + resize
 * splitter + collapsed summary bar + expanded tab bar + four tabpanel
 * containers). Phase 7 wires the four tab BODIES with real state:
 *  - Console: level-radio filters + node combobox + Clear (inline-confirm) +
 *    smart auto-scroll with "↓ N new" pill + filter-change live region + aligned
 *    level icons (ERROR→XCircle, SYSTEM→Terminal — DESIGN_SYSTEM §7).
 *  - Problems: clickable rows → selectProblem + selectNode + canvas setCenter
 *    (via the store-mediated pendingCenterNodeId channel) + aria-live on the
 *    Problems tab.
 *  - Run: header + 2px progress bar + per-node 24px rows from perNodeStatus,
 *    click → selectNode.
 *  - Artifacts: honest — read lastCompletedRunId, "Open Output Folder" via the
 *    controller's open_run_folder IPC when a run completed, empty state + a
 *    muted note documenting the per-file-list/Preview/Copy-Path gap (no backend
 *    IPC, no fake rows/stubs).
 *
 * Boot: collapsed, active tab = Console.
 */

const TABS: { id: DockTab; label: string }[] = [
  { id: 'console', label: 'Console' },
  { id: 'problems', label: 'Problems' },
  { id: 'run', label: 'Run' },
  { id: 'artifacts', label: 'Artifacts' },
];

export function BottomDock({ controller }: { controller: WorkflowController }) {
  const collapsed = useWorkflowStore((s) => s.dockCollapsed);
  const height = useWorkflowStore((s) => s.dockHeight);
  const setHeight = useWorkflowStore((s) => s.setDockHeight);
  const toggle = useWorkflowStore((s) => s.toggleDock);
  const activeTab = useWorkflowStore((s) => s.dockTab);
  const setDockTab = useWorkflowStore((s) => s.setDockTab);
  const toggleDock = useWorkflowStore((s) => s.toggleDock);

  const splitter = useSplitter({
    orientation: 'horizontal',
    min: 120,
    max: 480,
    getValue: () => height,
    setValue: setHeight,
    toggleCollapse: toggle,
    maximizeValue: 480,
  });

  if (collapsed) {
    return <CollapsedBar activeTab={activeTab} onExpand={setDockTab} />;
  }

  return (
    <footer
      role="contentinfo"
      aria-label="Observability dock"
      className="flex flex-col bg-surface-panel border-t border-border-subtle"
      style={{ height }}
    >
      {/* Top resize handle */}
      <div
        {...splitterAria({ orientation: 'horizontal', value: height, min: 120, max: 480, controlsId: 'dock-body' })}
        onPointerDown={splitter.onPointerDown}
        onPointerMove={splitter.onPointerMove}
        onPointerUp={splitter.onPointerUp}
        onKeyDown={splitter.onKeyDown}
        className="h-1 w-full cursor-ns-resize bg-transparent hover:bg-border-focus"
      />

      <TabBar activeTab={activeTab} onSelect={(tab) => (tab === activeTab ? toggleDock() : setDockTab(tab))} />

      <div id="dock-body" className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'console' && <ConsolePanel />}
        {activeTab === 'problems' && <ProblemsPanel />}
        {activeTab === 'run' && <RunPanel />}
        {activeTab === 'artifacts' && <ArtifactsPanel controller={controller} />}
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Collapsed summary bar (28px)                                                */
/* -------------------------------------------------------------------------- */

function CollapsedBar({ activeTab, onExpand }: { activeTab: DockTab; onExpand: (tab: DockTab) => void }) {
  const logs = useWorkflowStore((s) => s.logs);
  const problems = useWorkflowStore((s) => s.problems);
  const runStatus = useWorkflowStore((s) => s.runStatus);
  const runProgress = useWorkflowStore((s) => s.runProgress);
  const lastCompletedRunId = useWorkflowStore((s) => s.lastCompletedRunId);
  const toggle = useWorkflowStore((s) => s.toggleDock);

  const errorCount = logs.filter((l) => (l.level || '').toLowerCase() === 'error').length;
  const problemCount = problems.length;
  const artifactCount = lastCompletedRunId !== null ? 1 : 0;

  const runLabel =
    runStatus === 'idle' ? 'Run · idle'
      : runStatus === 'running' ? `Run · ${runProgress !== null ? Math.round(runProgress) + '%' : 'running'}`
      : runStatus === 'starting' ? 'Run · starting'
      : `Run · ${runStatus}`;

  // Build the consolidated live-region text for the bar. Throttle ≤1
  // announcement per 2s (spec §9.1 / R7) so a chatty console can't flood AT.
  const lastAnnounceRef = useRef(0);
  const text = `Console ${errorCount} error${errorCount === 1 ? '' : 's'}, Problems ${problemCount}, ${runLabel}, Artifacts ${artifactCount}`;
  const [announcedText, setAnnouncedText] = useState('');
  useEffect(() => {
    const now = Date.now();
    if (now - lastAnnounceRef.current >= 2000) {
      lastAnnounceRef.current = now;
      setAnnouncedText(text);
    }
  }, [text]);

  return (
    <footer
      role="contentinfo"
      aria-label="Observability dock"
      aria-live="polite"
      aria-atomic="false"
      className="flex h-7 items-center gap-1 bg-surface-panel border-t border-border-subtle px-2 text-[11px]"
    >
      <span className="sr-only">{announcedText}</span>
      <CollapsedPill label={`Console · ${errorCount}`} active={activeTab === 'console'} errorTone={errorCount > 0} onClick={() => onExpand('console')} />
      <CollapsedPill label={`Problems · ${problemCount}`} active={activeTab === 'problems'} warningTone={problemCount > 0} onClick={() => onExpand('problems')} />
      <CollapsedPill label={runLabel} active={activeTab === 'run'} onClick={() => onExpand('run')} />
      <CollapsedPill label={`Artifacts · ${artifactCount}`} active={activeTab === 'artifacts'} onClick={() => onExpand('artifacts')} />
      <button
        type="button"
        aria-label="Expand dock"
        title="Expand (Ctrl/Cmd+J)"
        onClick={toggle}
        className="ml-auto rounded-control p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
      >
        <ChevronUp size={14} aria-hidden="true" />
      </button>
    </footer>
  );
}

function CollapsedPill({
  label,
  active,
  errorTone,
  warningTone,
  onClick,
}: {
  label: string;
  active: boolean;
  errorTone?: boolean;
  warningTone?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-control px-1.5 py-1',
        active ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
        errorTone && 'text-text-error',
        warningTone && 'text-status-warning',
      )}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Expanded tab bar (28px)                                                     */
/* -------------------------------------------------------------------------- */

function TabBar({ activeTab, onSelect }: { activeTab: DockTab; onSelect: (tab: DockTab) => void }) {
  const logs = useWorkflowStore((s) => s.logs);
  const problems = useWorkflowStore((s) => s.problems);
  const toggle = useWorkflowStore((s) => s.toggleDock);

  const counts: Record<DockTab, number> = {
    console: logs.filter((l) => (l.level || '').toLowerCase() === 'error').length,
    problems: problems.length,
    run: 0,
    artifacts: 0,
  };

  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (i: number) => {
    const clamped = ((i % TABS.length) + TABS.length) % TABS.length;
    refs.current[clamped]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusTab(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
    else if (e.key === 'End') { e.preventDefault(); focusTab(TABS.length - 1); }
  };

  return (
    <div role="tablist" aria-label="Observability" className="flex h-7 shrink-0 items-center border-b border-border-subtle px-1">
      {TABS.map((tab, i) => {
        const isActive = activeTab === tab.id;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            // §9.4 / R6: announce new problems from the tab itself when the dock
            // is expanded but the Problems panel isn't focused.
            aria-live={tab.id === 'problems' ? 'polite' : 'off'}
            className={cn(
              'flex h-7 items-center gap-1 px-2 text-[12px]',
              isActive
                ? 'border-b-2 border-border-focus text-text-primary'
                : 'border-b-2 border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1 text-[10px] leading-none',
                  tab.id === 'console' || tab.id === 'problems' ? 'bg-status-error-strong text-text-on-status' : 'bg-surface-elevated text-text-muted',
                )}
                aria-label={`${count} item${count === 1 ? '' : 's'}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Collapse dock"
        title="Collapse (Ctrl/Cmd+J)"
        onClick={toggle}
        className="ml-auto rounded-control p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Console tab panel                                                           */
/* -------------------------------------------------------------------------- */

// DESIGN_SYSTEM §7 binding console icons. ERROR→XCircle, SYSTEM→Terminal,
// WARNING→TriangleAlert, INFO→Info. Each carries a visually-hidden level label
// so status is never color-only (icon + text + color).
const LEVEL_ICON: Record<string, { Icon: LucideIcon; className: string; label: string }> = {
  error: { Icon: XCircle, className: 'text-status-error', label: 'error' },
  warn: { Icon: TriangleAlert, className: 'text-status-warning', label: 'warning' },
  warning: { Icon: TriangleAlert, className: 'text-status-warning', label: 'warning' },
  info: { Icon: Info, className: 'text-text-secondary', label: 'info' },
  system: { Icon: Terminal, className: 'text-text-muted', label: 'system' },
  debug: { Icon: Info, className: 'text-text-muted', label: 'debug' },
};

// All five levels (debug visible only under "All" — R3: no Debug pill).
const ALL_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'system', 'debug'];

// Filter pills: id → levels shown. "All" includes debug so debug logs surface
// there without a dedicated pill.
const LEVEL_PILLS: { id: string; label: string; levels: LogLevel[] }[] = [
  { id: 'all', label: 'All', levels: ALL_LEVELS },
  { id: 'info', label: 'Info', levels: ['info'] },
  { id: 'warn', label: 'Warning', levels: ['warn'] },
  { id: 'error', label: 'Error', levels: ['error'] },
  { id: 'system', label: 'System', levels: ['system'] },
];

function ConsolePanel() {
  const logs = useWorkflowStore((s) => s.logs);
  const logFilters = useWorkflowStore((s) => s.logFilters);
  const setLogFilter = useWorkflowStore((s) => s.setLogFilter);
  const clearLogs = useWorkflowStore((s) => s.clearLogs);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [seenErrorIds] = useState<Set<string>>(new Set());

  // Track the user's explicit node-filter MODE (all | selected) so that selecting
  // a node on the canvas only re-binds the filter when the user opted in — and so
  // "Selected Node" with no current selection is distinguishable from "All Nodes"
  // (correction #5: tracking via nodeId !== null was ambiguous).
  const [nodeFilterMode, setNodeFilterMode] = useState<'all' | 'selected'>('all');

  // When the user has chosen "Selected Node" mode, follow the canvas selection.
  useEffect(() => {
    if (nodeFilterMode === 'selected') {
      setLogFilter({ nodeId: selectedNodeId });
    }
  }, [selectedNodeId, nodeFilterMode, setLogFilter]);

  // Active level pill: derive from the filter set (a single-level filter
  // matches that pill; the full set matches "All").
  const activePillId = useMemo(() => {
    const lv = logFilters.levels;
    if (lv.length === ALL_LEVELS.length) return 'all';
    const match = LEVEL_PILLS.find((p) => p.id !== 'all' && p.levels.length === lv.length && p.levels.every((l) => lv.includes(l)));
    return match?.id ?? 'all';
  }, [logFilters.levels]);

  // Normalize a runtime log level before matching: the store type is 'warn'
  // but the backend may emit 'warning' (controller handles both). Normalizing
  // here stops the Warning filter from silently dropping 'warning' logs
  // (correction #1).
  const filteredLogs = useMemo(() => {
    const lv = logFilters.levels;
    const nodeId = logFilters.nodeId;
    return logs.filter((l) => {
      const lower = (l.level || '').toLowerCase();
      const normalized = lower === 'warning' ? 'warn' : lower;
      if (!lv.includes(normalized as LogLevel)) return false;
      if (nodeId !== null && l.nodeId !== nodeId) return false;
      return true;
    });
  }, [logs, logFilters]);

  // Auto-scroll: only stick to the bottom when the user is already there. If they
  // scrolled up, accumulate new-count and surface a "↓ N new" pill instead of
  // yanking them down (spec §9.3).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom) {
      const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      setNewCount(0);
    } else {
      setNewCount((c) => c + 1);
    }
  }, [filteredLogs.length, stickToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    if (atBottom !== stickToBottom) setStickToBottom(atBottom);
  };

  const jumpToBottom = () => {
    setStickToBottom(true);
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };

  // Clear Console (inline-confirm — NOT confirm(), NOT a modal).
  const { armed, arm, liveText } = useInlineConfirm();
  const onClear = () => {
    if (armed) {
      clearLogs();
    } else {
      arm('Press again to confirm clearing.');
    }
  };

  // Filter-change live region (throttled ≤1/2s — R3/spec §9.3).
  const lastFilterAnnounceRef = useRef(0);
  const [filterAnnouncement, setFilterAnnouncement] = useState('');
  useEffect(() => {
    const now = Date.now();
    if (now - lastFilterAnnounceRef.current >= 500) {
      lastFilterAnnounceRef.current = now;
      const pill = LEVEL_PILLS.find((p) => p.id === activePillId);
      setFilterAnnouncement(
        `Filtering to ${pill?.label ?? 'all'}, ${filteredLogs.length} line${filteredLogs.length === 1 ? '' : 's'}`,
      );
    }
  }, [activePillId, filteredLogs.length]);

  const nodeOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const l of logs) if (l.nodeId) ids.add(l.nodeId);
    return Array.from(ids);
  }, [logs]);

  // Roving tabindex for the log-level radiogroup (mirrors the TabBar pattern).
  // ArrowLeft/Right move focus across LEVEL_PILLS and apply the new filter.
  const levelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusLevel = (i: number) => {
    const clamped = ((i % LEVEL_PILLS.length) + LEVEL_PILLS.length) % LEVEL_PILLS.length;
    levelRefs.current[clamped]?.focus();
  };
  const onLevelKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusLevel(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusLevel(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusLevel(0); }
    else if (e.key === 'End') { e.preventDefault(); focusLevel(LEVEL_PILLS.length - 1); }
  };

  return (
    <div role="tabpanel" id="tabpanel-console" aria-labelledby="tab-console" className="flex h-full flex-col">
      <fieldset
        aria-label="Console filters"
        className="flex h-6 shrink-0 items-center gap-2 border-b border-border-subtle px-2 text-[11px] text-text-muted"
      >
        <span className="sr-only" aria-live="polite">{filterAnnouncement}</span>
        {/* Level filter — radio group of pills. */}
        <div role="radiogroup" aria-label="Log level" className="flex items-center gap-1">
          {LEVEL_PILLS.map((p, i) => {
            const isActive = activePillId === p.id;
            return (
              <button
                key={p.id}
                ref={(el) => { levelRefs.current[i] = el; }}
                type="button"
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                aria-label={`Filter: ${p.label}`}
                onClick={() => setLogFilter({ levels: p.levels })}
                onKeyDown={(e) => onLevelKeyDown(e, i)}
                className={cn(
                  'rounded-control px-1.5 py-1',
                  isActive ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <span aria-hidden="true" className="text-text-muted">·</span>
        {/* Node filter combobox. "Selected Node" follows the canvas selection. */}
        <label className="flex items-center gap-1">
          <span className="sr-only">Node filter</span>
          <select
            value={nodeFilterMode === 'selected' ? '__selected' : '__all'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__selected') {
                setNodeFilterMode('selected');
                setLogFilter({ nodeId: selectedNodeId });
              } else {
                setNodeFilterMode('all');
                setLogFilter({ nodeId: null });
              }
            }}
            className="rounded-control border border-border-subtle bg-surface-panel px-1 py-0.5 text-[11px] text-text-secondary"
          >
            <option value="__all">All Nodes</option>
            <option value="__selected">Selected Node</option>
            {nodeOptions.length > 0 && (
              <optgroup label="By node">
                {nodeOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button
          type="button"
          onClick={onClear}
          aria-label={armed ? 'Confirm clear console' : 'Clear console'}
          title={armed ? 'Press again to confirm' : 'Clear console'}
          className={cn(
            'ml-auto flex items-center gap-1 rounded-control px-1.5 py-1 hover:bg-surface-hover',
            armed ? 'text-text-error' : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <Eraser size={12} aria-hidden="true" />
          {armed ? 'Confirm clear' : 'Clear'}
        </button>
        <span className="sr-only" aria-live="assertive">{liveText}</span>
      </fieldset>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Workflow console"
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-canvas p-1 font-mono text-[12px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-text-muted">No logs yet. Run the workflow to see output.</div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-text-muted">No logs match the current filter.</div>
        ) : (
          filteredLogs.map((log) => <ConsoleLine key={log.id} log={log} seenErrorIds={seenErrorIds} />)
        )}
        <div ref={bottomRef} />
        {/* "↓ N new" pill — jump to bottom without yanking a scroll-up reader. */}
        {!stickToBottom && newCount > 0 && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label={`${newCount} new log line${newCount === 1 ? '' : 's'}. Jump to bottom`}
            className="absolute bottom-1 right-2 rounded-control border border-border-default bg-surface-panel px-2 py-1 text-[11px] text-text-secondary shadow-sm hover:bg-surface-hover"
          >
            ↓ {newCount} new
          </button>
        )}
      </div>
    </div>
  );
}

function ConsoleLine({
  log,
  seenErrorIds,
}: {
  log: ReturnType<typeof useWorkflowStore.getState>['logs'][number];
  seenErrorIds: Set<string>;
}) {
  const levelKey = (log.level || '').toLowerCase();
  const meta = LEVEL_ICON[levelKey] ?? LEVEL_ICON.info;
  const Icon = meta.Icon;
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const nodeName = log.nodeId ?? 'workflow';
  // First ERROR occurrence gets an assertive visually-hidden prefix (spec §9.3).
  const firstError = levelKey === 'error' && !seenErrorIds.has(log.id);
  if (firstError) seenErrorIds.add(log.id);
  return (
    <div className="mb-0.5 flex gap-2 whitespace-pre-wrap break-words">
      <span className="shrink-0 text-text-muted">{time}</span>
      <span className="shrink-0 text-text-secondary">{nodeName}</span>
      <Icon size={12} className={cn('mt-0.5 shrink-0', meta.className)} aria-hidden="true" />
      <span className="sr-only">{meta.label}: </span>
      {firstError && <span className="sr-only" aria-live="assertive">error: </span>}
      <span className="text-text-primary">{log.message}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Problems tab panel                                                          */
/* -------------------------------------------------------------------------- */

function ProblemsPanel() {
  const problems = useWorkflowStore((s) => s.problems);
  const selectProblem = useWorkflowStore((s) => s.selectProblem);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const setPendingCenter = useWorkflowStore((s) => s.setPendingCenter);
  // Derive the node-id Set in useMemo from the stable `nodes` array reference.
  // A selector returning `new Set(...)` allocates a fresh object on every
  // store snapshot check → useSyncExternalStore sees a change every render
  // → infinite update loop (React "Maximum update depth exceeded"). Selecting
  // the stable array and memoizing the derived Set keeps the reference stable
  // across renders when `nodes` is unchanged.
  const nodes = useWorkflowStore((s) => s.nodes);
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  // ERROR first (spec §9.4).
  const sorted = useMemo(
    () => [...problems].sort((a, b) => (a.severity === 'error' ? -1 : b.severity === 'error' ? 1 : 0)),
    [problems],
  );

  const focusNode = (p: { id: string; nodeId: string | null }) => {
    selectProblem(p.id);
    if (p.nodeId && nodeIds.has(p.nodeId)) {
      selectNode(p.nodeId);
      setPendingCenter(p.nodeId);
    }
  };

  if (problems.length === 0) {
    return (
      <div role="tabpanel" id="tabpanel-problems" aria-labelledby="tab-problems" className="flex h-full items-center justify-center p-3">
        <p className="text-[12px] text-text-muted">No problems. Workflow is valid.</p>
      </div>
    );
  }

  return (
    <div role="tabpanel" id="tabpanel-problems" aria-labelledby="tab-problems" className="flex h-full flex-col overflow-y-auto p-1">
      <ul className="flex w-full flex-col gap-1">
        {sorted.map((p) => {
          const isError = p.severity === 'error';
          const Icon = isError ? XCircle : TriangleAlert;
          const tone = isError ? 'text-status-error' : 'text-status-warning';
          const ariaLabel = `${p.severity}${p.nodeId ? ` ${p.nodeId}` : ''}: ${p.message}. Jump to node`;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-label={ariaLabel}
                onClick={() => focusNode(p)}
                className="flex w-full items-center gap-2 rounded-control bg-surface-panel px-2 py-1.5 text-left hover:bg-surface-hover"
              >
                <Icon size={14} className={cn('shrink-0', tone)} aria-hidden="true" />
                <span className="flex-1 truncate text-[11px] text-text-secondary">{p.message}</span>
                {p.nodeId && <span className="shrink-0 text-[12px] text-text-primary">{p.nodeId}</span>}
                <span className="sr-only">{isError ? 'error' : 'warning'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Run tab panel                                                               */
/* -------------------------------------------------------------------------- */

// Per-node status glyph + tone (icon + text + color, never color-only).
const PER_NODE_ICON: Record<PerNodeState, { Icon: LucideIcon; tone: string; label: string }> = {
  idle: { Icon: Clock, tone: 'text-text-muted', label: 'idle' },
  queued: { Icon: CircleDashed, tone: 'text-status-queued', label: 'queued' },
  running: { Icon: LoaderCircle, tone: 'text-status-running', label: 'running' },
  success: { Icon: CheckCircle2, tone: 'text-status-success', label: 'success' },
  warning: { Icon: TriangleAlert, tone: 'text-status-warning', label: 'warning' },
  failed: { Icon: XCircle, tone: 'text-status-error', label: 'failed' },
  cancelled: { Icon: Ban, tone: 'text-status-cancelled', label: 'cancelled' },
  skipped: { Icon: Minus, tone: 'text-text-muted', label: 'skipped' },
};

// Run-level glyph + tone.
const RUN_ICON: Record<RunStatus, { Icon: LucideIcon; tone: string }> = {
  idle: { Icon: Clock, tone: 'text-text-muted' },
  starting: { Icon: Clock, tone: 'text-text-muted' },
  running: { Icon: LoaderCircle, tone: 'text-status-running' },
  succeeded: { Icon: CheckCircle2, tone: 'text-status-success' },
  failed: { Icon: XCircle, tone: 'text-status-error' },
  cancelled: { Icon: Ban, tone: 'text-status-cancelled' },
};

function RunPanel() {
  const runStatus = useWorkflowStore((s) => s.runStatus);
  const runProgress = useWorkflowStore((s) => s.runProgress);
  const perNodeStatus = useWorkflowStore((s) => s.perNodeStatus);
  const nodes = useWorkflowStore((s) => s.nodes);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  const idle = runStatus === 'idle';
  const entries = useMemo(() => Object.entries(perNodeStatus), [perNodeStatus]);
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.data?.label ?? id;

  const runMeta = RUN_ICON[runStatus] ?? RUN_ICON.idle;
  const RunIcon = runMeta.Icon;
  const hasProgress = runProgress !== null && runProgress >= 0 && runProgress <= 100;
  const indeterminate = runStatus === 'running' && !hasProgress;
  const progressFill = hasProgress ? `${Math.round(runProgress!)}%` : indeterminate ? '50%' : '0%';
  const barTone =
    runStatus === 'succeeded' ? 'bg-status-success'
      : runStatus === 'failed' ? 'bg-status-error'
      : runStatus === 'cancelled' ? 'bg-status-cancelled'
      : 'bg-accent';

  return (
    <div role="tabpanel" id="tabpanel-run" aria-labelledby="tab-run" className="flex h-full flex-col">
      {/* 2px progress bar at top (spec §9.5). Static 50% fill when indeterminate —
          no animation, reduced-motion safe (correction #4). */}
      <div className="h-0.5 w-full bg-surface-elevated" role="progressbar" aria-label="Workflow run progress" aria-valuenow={hasProgress ? Math.round(runProgress!) : undefined} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full', barTone)} style={{ width: progressFill }} />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-3 text-[13px]">
        <RunIcon size={16} className={cn(runMeta.tone, runStatus === 'running' && 'animate-spin')} aria-hidden="true" />
        <span className="text-text-primary">Workflow Run</span>
        <span className={cn('capitalize', runMeta.tone)}>{runStatus}</span>
        {hasProgress && <span className="ml-auto text-[12px] text-text-muted">{Math.round(runProgress!)}%</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {idle ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
            <p className="text-[11px] text-text-muted">No run yet. Press Run to execute the workflow.</p>
            <p className="text-[11px] text-text-muted">
              <kbd className="rounded-control bg-surface-panel px-1">Ctrl</kbd>/<kbd className="rounded-control bg-surface-panel px-1">Cmd</kbd>+
              <kbd className="rounded-control bg-surface-panel px-1">Enter</kbd>
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center p-3 text-[11px] text-text-muted">Waiting for node status…</div>
        ) : (
          <ul className="flex flex-col">
            {entries.map(([id, st]) => {
              const meta = PER_NODE_ICON[st.status] ?? PER_NODE_ICON.idle;
              const Icon = meta.Icon;
              const progressText = st.progress !== null ? `${Math.round(st.progress)}%` : '';
              const ariaLabel = `${nodeLabel(id)}: ${meta.label}${progressText ? `, ${progressText}` : ''}`;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => selectNode(id)}
                    aria-label={ariaLabel}
                    className="flex h-6 w-full items-center gap-2 px-3 text-left hover:bg-surface-hover"
                  >
                    <Icon size={12} className={cn('shrink-0', meta.tone, (st.status === 'running' || st.status === 'queued') && 'animate-spin')} aria-hidden="true" />
                    <span className="shrink-0 text-text-muted">{meta.label}</span>
                    <span className="flex-1 truncate text-[12px] text-text-primary">{nodeLabel(id)}</span>
                    {progressText && <span className="shrink-0 text-[11px] text-text-muted">{progressText}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Artifacts tab panel                                                         */
/* -------------------------------------------------------------------------- */

function ArtifactsPanel({ controller }: { controller: WorkflowController }) {
  const lastCompletedRunId = useWorkflowStore((s) => s.lastCompletedRunId);
  const hasRun = lastCompletedRunId !== null;

  if (!hasRun) {
    return (
      <div role="tabpanel" id="tabpanel-artifacts" aria-labelledby="tab-artifacts" className="flex h-full items-center justify-center p-3">
        <p className="flex items-center gap-2 text-[12px] text-text-muted">
          <FolderOpen size={14} aria-hidden="true" />
          No artifacts yet. Run the workflow to produce outputs.
        </p>
      </div>
    );
  }

  return (
    <div role="tabpanel" id="tabpanel-artifacts" aria-labelledby="tab-artifacts" className="flex h-full flex-col gap-2 p-3">
      <button
        type="button"
        onClick={() => void controller.openFolder()}
        aria-label={`Open output folder for run ${lastCompletedRunId}`}
        className="flex items-center gap-2 self-start rounded-control border border-border-subtle bg-surface-panel px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface-hover"
      >
        <FolderOpen size={14} aria-hidden="true" />
        Open Output Folder
      </button>
      {/* R8: no backend artifacts-list IPC exists and we cannot add one (no .rs
          edits). The per-file list, Preview, and Copy Path arrive with that
          future IPC. Documented in-UI (DoD: understand what's happening without
          dev tools) — NOT stubbed with fake rows. */}
      <p className="text-[11px] text-text-muted">
        Per-file list, Preview, and Copy Path arrive with the future artifacts-list IPC.
      </p>
    </div>
  );
}