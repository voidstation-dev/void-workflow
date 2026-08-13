import { History } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { HistoryEntry } from '@/store/workflowStore';
import { Panel } from '@/components/primitives/Panel';
import { PanelHeader } from '@/components/primitives/PanelHeader';
import { StatusBadge } from '@/components/primitives/StatusBadge';
import { EmptyState } from '@/components/primitives/EmptyState';

/**
 * HistoryScreen — Phase 8 "Runs" route, spec §16. Frontend-populated: the
 * controller records a HistoryEntry on every run terminal state (succeeded/
 * failed via inferRunCompletion, cancelled via stop()). History is session-only
 * — NOT persisted (excluded from partialize by the whitelist), capped at 200.
 *
 * Runs are grouped by Today / Earlier (spec §16) — a soft grouping header row
 * (not a table section, to keep the table's single <tbody> semantics) rendered
 * as a styled <th colSpan> divider. Row click → setDockTab('run') (the dock
 * expands; no separate run-details screen — spec keeps these surfaces
 * secondary). Empty state per spec §12.
 *
 * The screen container is `main[data-screen="runs"]` — the shared landmark
 * selector `main[data-screen]` is in LANDMARK_SELECTORS so F6 can reach it.
 * The component keeps the name `HistoryScreen`/file `HistoryScreen.tsx` per
 * §40 ("don't force the suggested structure if a good equivalent exists"); it
 * IS the Runs screen (the WorkflowTabs label is "Runs").
 */
function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

const RUN_STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

// Today = same calendar day as now (local). Earlier = everything before.
function isToday(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function HistoryScreen() {
  const history = useWorkflowStore((s) => s.history);
  const setDockTab = useWorkflowStore((s) => s.setDockTab);

  const openRun = () => {
    setDockTab('run');
  };

  const today = history.filter((e) => isToday(e.startedAt));
  const earlier = history.filter((e) => !isToday(e.startedAt));

  const renderRow = (entry: HistoryEntry) => (
    <tr
      key={entry.runId}
      role="button"
      tabIndex={0}
      aria-label={`Run ${entry.runId}, ${RUN_STATUS_LABEL[entry.status] ?? entry.status}, started ${new Date(entry.startedAt).toLocaleString()}, ${formatDuration(entry.duration)}${entry.failedNode ? `, failed at ${entry.failedNode}` : ''}. Press to open the Run dock.`}
      onClick={openRun}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRun();
        }
      }}
      className="cursor-pointer border-b border-border-subtle text-[12px] hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
    >
      <td className="px-3 py-1.5">
        <StatusBadge status={entry.status} label={RUN_STATUS_LABEL[entry.status] ?? entry.status} />
      </td>
      <td className="px-3 py-1.5 text-text-secondary">#{entry.runId}</td>
      <td className="px-3 py-1.5 text-text-secondary">
        {new Date(entry.startedAt).toLocaleTimeString()}
      </td>
      <td className="px-3 py-1.5 text-text-secondary">{formatDuration(entry.duration)}</td>
      <td className="px-3 py-1.5 text-text-error">
        {entry.failedNode ?? <span className="text-text-muted">—</span>}
      </td>
    </tr>
  );

  // A grouping divider row: a single <th colSpan> styled as a section header.
  const groupHeader = (label: string, count: number) => (
    <tr className="pointer-events-none">
      <th
        scope="rowgroup"
        colSpan={5}
        className="bg-surface-sidebar px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
      >
        {label} <span className="font-normal text-text-muted">· {count}</span>
      </th>
    </tr>
  );

  return (
    <Panel as="main" surface="canvas" ariaLabel="Runs" data-screen="runs" className="h-full">
      <PanelHeader title="Runs" level={2} icon={History} />
      <div className="flex-1 overflow-auto">
        {history.length === 0 ? (
          <EmptyState
            title="No runs yet. Your run history will appear here."
            body="Run a workflow to record it. History is kept for this session only."
            live="polite"
          />
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-[1] bg-surface-panel text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-semibold">Status</th>
                <th scope="col" className="px-3 py-1.5 font-semibold">Run</th>
                <th scope="col" className="px-3 py-1.5 font-semibold">Started</th>
                <th scope="col" className="px-3 py-1.5 font-semibold">Duration</th>
                <th scope="col" className="px-3 py-1.5 font-semibold">Failed node</th>
              </tr>
            </thead>
            <tbody>
              {today.length > 0 && groupHeader('Today', today.length)}
              {today.map(renderRow)}
              {earlier.length > 0 && groupHeader('Earlier', earlier.length)}
              {earlier.map(renderRow)}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}