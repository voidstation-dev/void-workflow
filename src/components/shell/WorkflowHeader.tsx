import { useEffect, useRef, useState } from 'react';
import {
  Save as SaveIcon,
  Play,
  Square,
  LoaderCircle,
  ChevronRight,
  TriangleAlert,
  Check,
  FolderOpen,
  RotateCcw,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { WorkflowController } from '@/hooks/useWorkflowController';

/**
 * WorkflowHeader — `<header role="banner">` h-12 (spec §3.A). Three regions:
 * LEFT: breadcrumb (project / workflow name) + save-state chip + run-state line.
 * CENTER: search box (header-level; filters the Build panel via uiSlice.buildQuery —
 *         the NodeLibrary subscribes to it). A controlled input that writes the
 *         store so the right Build panel filters without a prop drill.
 * RIGHT: ≤5 primary actions — Save + Run/Stop + state-driven Retry Failed (failed)
 *        and prominent Open Output (completed). HealthPill is gone from the header
 *        (moves to the Environment tab in Phase 9).
 *
 * Header states follow spec §19: Idle → Save+Run; Running → Stop; Failed → Retry
 * Failed; Completed → Open Output (prominent only when output exists). Save/Run
 * state are NEVER color-only (icon + text + color).
 */
interface Props {
  controller: WorkflowController;
}

export function WorkflowHeader({ controller }: Props) {
  const projectName = useWorkflowStore((s) => s.projectName);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const dirty = useWorkflowStore((s) => s.dirty);
  const saveStatus = useWorkflowStore((s) => s.saveStatus);
  const runStatus = useWorkflowStore((s) => s.runStatus);
  const runProgress = useWorkflowStore((s) => s.runProgress);
  const nodesCount = useWorkflowStore((s) => s.nodes.length);
  const lastCompletedRunId = useWorkflowStore((s) => s.lastCompletedRunId);

  const breadcrumbRef = useRef<HTMLAnchorElement | null>(null);
  // Initial focus → workflow title crumb (not Run — footgun avoidance, spec §5.5).
  useEffect(() => {
    breadcrumbRef.current?.focus();
  }, []);

  const isRunning = runStatus === 'running' || runStatus === 'starting';
  const canRun = nodesCount > 0 && !isRunning;
  // Failed → show "Retry Failed" (a full re-run; start_run always starts fresh —
  // no resume IPC exists). Completed with output → show prominent "Open Output".
  const showRetry = runStatus === 'failed';
  const showOpenOutput = runStatus === 'succeeded' && lastCompletedRunId !== null;

  return (
    <header
      role="banner"
      className="flex h-12 items-center gap-3 bg-surface-sidebar border-b border-border-subtle px-3"
    >
      {/* LEFT — breadcrumb + save chip + run line */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
        <span className="max-w-[140px] truncate text-text-muted" title={projectName}>{projectName}</span>
        <ChevronRight size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        <a
          ref={breadcrumbRef}
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-current="page"
          data-focus-target="workflow-title"
          className="max-w-[280px] truncate font-semibold text-text-primary outline-none"
          title={workflowName}
          tabIndex={-1}
        >
          {workflowName}
        </a>
      </nav>

      <SaveStateChip dirty={dirty} saveStatus={saveStatus} />

      {runStatus !== 'idle' && <RunStateLine runStatus={runStatus} progress={runProgress} />}

      {/* CENTER — search box (spec §3.A). Writes uiSlice.buildQuery; the NodeLibrary
          (right Build panel) subscribes and filters its rows. Kept honest: no fake
          results. */}
      <HeaderSearch />

      {/* RIGHT — ≤5 primary actions (spec §3.A "keep to ~5 maximum") */}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => void controller.save()}
          disabled={saveStatus === 'saving' || isRunning}
          aria-busy={saveStatus === 'saving'}
          aria-label="Save workflow"
          title={isRunning ? 'Save disabled while running' : 'Save (Ctrl/Cmd+S)'}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium',
            'border border-transparent',
            dirty ? 'bg-accent text-text-on-accent hover:bg-accent-hover' : 'bg-surface-panel text-text-secondary hover:bg-surface-hover',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {saveStatus === 'saving' ? (
            <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon size={14} aria-hidden="true" />
          )}
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>

        {showRetry ? (
          <button
            type="button"
            onClick={() => void controller.run()}
            aria-label="Retry failed workflow"
            title="Retry failed workflow (full re-run)"
            className="flex h-7 items-center gap-1.5 rounded-control bg-status-error-strong px-2.5 text-[12px] font-medium text-text-on-status hover:bg-status-error-hover"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Retry Failed
          </button>
        ) : showOpenOutput ? (
          <button
            type="button"
            onClick={() => void controller.openFolder()}
            aria-label="Open output folder"
            title="Open output folder"
            className="flex h-7 items-center gap-1.5 rounded-control bg-accent px-2.5 text-[12px] font-medium text-text-on-accent hover:bg-accent-hover"
          >
            <FolderOpen size={14} aria-hidden="true" />
            Open Output
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (isRunning ? void controller.stop() : void controller.run())}
            disabled={!isRunning && !canRun}
            aria-label={isRunning ? 'Stop workflow' : 'Run workflow'}
            title={isRunning ? 'Stop (deliberate click — Esc does not cancel a run)' : 'Run (Ctrl/Cmd+Enter)'}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium',
              isRunning
                ? 'bg-status-error-strong text-text-on-status hover:bg-status-error-hover'
                : 'bg-accent text-text-on-accent hover:bg-accent-hover',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {runStatus === 'starting' ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : isRunning ? (
              <Square size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            {runStatus === 'starting' ? 'Starting…' : isRunning ? 'Stop' : 'Run'}
          </button>
        )}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

/** Header-level search (spec §3.A). Writes uiSlice.buildQuery so the Phase 3 Build
 *  panel can subscribe to the same query without a prop drill. Esc clears. */
function HeaderSearch() {
  const buildQuery = useWorkflowStore((s) => s.buildQuery);
  const setBuildQuery = useWorkflowStore((s) => s.setBuildQuery);
  const [value, setValue] = useState(buildQuery);

  // Keep local input in sync if the query is cleared elsewhere (e.g. Phase 3 Build
  // panel clear button, or selecting a node that swaps Build→Inspector).
  useEffect(() => { setValue(buildQuery); }, [buildQuery]);

  return (
    <div className="relative ml-2 hidden min-w-0 flex-1 max-w-[360px] md:block">
      <input
        type="search"
        value={value}
        onChange={(e) => { setValue(e.target.value); setBuildQuery(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            e.stopPropagation();
            setValue('');
            setBuildQuery('');
          }
        }}
        placeholder="Search nodes, runs, settings…"
        aria-label="Search"
        className="h-7 w-full rounded-control border border-border-subtle bg-surface-panel pl-3 pr-3 text-[12px] text-text-primary placeholder:text-text-muted focus:border-border-focus"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SaveStateChip({
  dirty,
  saveStatus,
}: {
  dirty: boolean;
  saveStatus: ReturnType<typeof useWorkflowStore.getState>['saveStatus'];
}) {
  let dotClass = 'bg-status-success';
  let label = 'Saved';
  let Icon = Check;
  let textClass = 'text-text-muted';

  if (saveStatus === 'saving') {
    dotClass = 'bg-status-running';
    label = 'Saving…';
    Icon = LoaderCircle;
    textClass = 'text-text-secondary';
  } else if (saveStatus === 'error') {
    dotClass = 'bg-status-error';
    label = 'Save failed';
    Icon = TriangleAlert;
    textClass = 'text-text-error';
  } else if (dirty) {
    dotClass = 'bg-status-warning';
    label = 'Unsaved';
    Icon = TriangleAlert;
    textClass = 'text-status-warning';
  }

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center gap-1.5 rounded-control bg-surface-panel px-2 py-1"
      title={label}
    >
      {saveStatus === 'saving' ? (
        <Icon size={12} className="animate-spin text-status-running" aria-hidden="true" />
      ) : (
        <>
          <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden="true" />
          <Icon size={12} className={cn(textClass)} aria-hidden="true" />
        </>
      )}
      <span className={cn('text-[11px]', textClass)}>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RunStateLine({
  runStatus,
  progress,
}: {
  runStatus: ReturnType<typeof useWorkflowStore.getState>['runStatus'];
  progress: number | null;
}) {
  let label = '';
  let dotClass = 'bg-status-running';
  let textClass = 'text-text-accent';

  if (runStatus === 'starting') {
    label = 'Starting…';
    dotClass = 'bg-status-running';
  } else if (runStatus === 'running') {
    label = progress !== null ? `Running · ${Math.round(progress)}%` : 'Running…';
    dotClass = 'bg-status-running';
  } else if (runStatus === 'succeeded') {
    label = 'Completed';
    dotClass = 'bg-status-success';
    textClass = 'text-status-success';
  } else if (runStatus === 'failed') {
    label = 'Run failed';
    dotClass = 'bg-status-error';
    textClass = 'text-text-error';
  } else if (runStatus === 'cancelled') {
    label = 'Cancelled';
    dotClass = 'bg-status-cancelled';
    textClass = 'text-text-muted';
  }

  return (
    <div aria-live="polite" className="flex shrink-0 items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden="true" />
      <span className={cn('text-[11px]', textClass)}>{label}</span>
    </div>
  );
}