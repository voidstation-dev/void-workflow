import { WorkflowCanvas } from '@/components/canvas/WorkflowCanvas';

/**
 * CanvasContainer — Zone C (spec §7). `<main role="application">` with a
 * visually-hidden `<h2>` accessible name, wrapping WorkflowCanvas. Phase 5
 * shipped the empty-state overlay, minimap, typed ports, edge/selection
 * styling inside WorkflowCanvas.
 */
export function CanvasContainer() {
  return (
    <main
      aria-label="Workflow canvas"
      role="application"
      className="relative flex min-w-[480px] flex-1 flex-col bg-surface-canvas"
      tabIndex={-1}
    >
      <h2 className="sr-only">Workflow canvas</h2>
      <WorkflowCanvas />
    </main>
  );
}