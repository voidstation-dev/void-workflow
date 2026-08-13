import { lazy, Suspense, useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowHeader } from './WorkflowHeader';
import { WorkflowTabs } from './WorkflowTabs';
import { NodeLibrary } from './NodeLibrary';
import { CanvasContainer } from './CanvasContainer';
import { Inspector } from './Inspector';
import { BottomDock } from './BottomDock';
import { ToastRegion } from './ToastRegion';
import { StatusAnnouncer } from './StatusAnnouncer';
import { KeyboardHelpDialog } from './KeyboardHelpDialog';
import { UnsavedGuardDialog } from './UnsavedGuardDialog';
import type { WorkflowController } from '@/hooks/useWorkflowController';
import type { ActiveScreen } from '@/store/workflowStore';

// Non-workflow screens are code-split — they are never needed on the default
// workflow view, so deferring them shrinks the initial bundle. Named exports
// → wrap into a default for React.lazy. The workflow screen's components
// (CanvasContainer/NodeLibrary/Inspector) stay eagerly imported above.
const HistoryScreen = lazy(() =>
  import('@/components/screens/HistoryScreen').then((m) => ({ default: m.HistoryScreen })),
);
const SettingsScreen = lazy(() =>
  import('@/components/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);
const EnvironmentScreen = lazy(() =>
  import('@/components/screens/EnvironmentScreen').then((m) => ({ default: m.EnvironmentScreen })),
);

/**
 * WorkspaceShell — light UI grid (spec §2). Row 1: header (48px). Row 2:
 * secondary tabs (40px). Row 3: body grid [Node Library w][Canvas 1fr]
 * on the workflow screen, or the active screen spanning the full body.
 * Row 4: Bottom Dock (full width). The left AppRail is gone — replaced by the
 * horizontal WorkflowTabs (spec §3.B). The right column stays the Inspector for
 * now; Phase 3 moves NodeLibrary to the right as the Build panel and Phase 5
 * completes the Build↔Inspector single-column swap.
 *
 * Graceful fallback: if the window is too narrow for library+canvas min widths,
 * the library auto-collapses (canvas never starves). Min comfortable width 1200
 * (spec §29); below that the Build panel becomes a drawer in a later phase.
 */
export function WorkspaceShell({ controller }: { controller: WorkflowController }) {
  // Phase 5 unified right-column panel (spec §15): one width + one collapsed
  // flag drive BOTH the Build panel (selectionMode==='none') and the Inspector
  // (node/edge/multi). The swap is presentation-only, so layout state is shared
  // — no width jump on swap. LAYOUT ONLY (persisted).
  const rightPanelWidth = useWorkflowStore((s) => s.rightPanelWidth);
  const rightPanelCollapsed = useWorkflowStore((s) => s.rightPanelCollapsed);
  const activeScreen = useWorkflowStore((s) => s.activeScreen);
  // The right column renders the Build panel by default and swaps to the
  // Inspector when a node/edge/multi selection is active (Phase 5 completes the
  // Build↔Inspector single-column swap, spec §15).
  const selectionMode = useWorkflowStore((s) => s.selectionMode);

  const [autoCollapsed, setAutoCollapsed] = useState(false);

  useEffect(() => {
    const onResize = () => {
      // Min widths: canvas 480 + right column 280 = 760. The right column
      // collapses below 760 so the canvas never starves. The dock renders its
      // own collapsed summary bar when too short, so no dock auto-flag.
      setAutoCollapsed(window.innerWidth < 760);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isWorkflow = activeScreen === 'workflow';
  // The single right column: Build by default, Inspector on selection. One
  // shared width + collapsed flag (Phase 5 unification).
  const rightCollapsed = rightPanelCollapsed || autoCollapsed;
  const rightCol = isWorkflow && !rightCollapsed ? `${rightPanelWidth}px` : '0px';

  const renderScreen = (screen: ActiveScreen) => {
    switch (screen) {
      case 'runs':
        return <HistoryScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'environment':
        return <EnvironmentScreen />;
      default:
        return null;
    }
  };

  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-surface-canvas text-text-primary"
      style={{
        gridTemplateRows: '48px 40px 1fr auto',
        // Workflow path: [Canvas 1fr][Right w]. The right column is a SINGLE
        // column hosting the Build panel (default) or the Inspector (when a
        // node/edge/multi selection is active) — the Phase 3 beginning of the
        // Build↔Inspector single-column swap (spec §15). Non-workflow: the right
        // col collapses to 0, the screen spans cols 1/-1. ReactFlowProvider
        // unmounts on screen switch → @xyflow internal viewport lost; graphSlice
        // in Zustand survives so re-entering Workflow re-renders without a
        // reload. The controller's event listeners stay attached → a live run
        // keeps updating the store while unmounted.
        gridTemplateColumns: `minmax(480px, 1fr) ${rightCol}`,
      }}
    >
      {/* Row 1 — header spans all columns */}
      <div style={{ gridColumn: '1 / -1' }}>
        <WorkflowHeader controller={controller} />
      </div>

      {/* Row 2 — secondary tabs span all columns */}
      <div style={{ gridColumn: '1 / -1' }}>
        <WorkflowTabs />
      </div>

      {isWorkflow ? (
        <>
          {/* Row 3 — canvas on the left, single right column (Build↔Inspector). */}
          <CanvasContainer />
          {selectionMode === 'none' ? <NodeLibrary /> : <Inspector />}
        </>
      ) : (
        <>
          {/* Row 3 — the active screen spans the full body (right col 0).
              Suspense fallback is null: screen swap is an explicit user action
              and the chunk resolves in ms on Tauri local FS — no flash. */}
          <div style={{ gridColumn: '1 / -1' }} className="min-w-0 overflow-hidden">
            <Suspense fallback={null}>{renderScreen(activeScreen)}</Suspense>
          </div>
        </>
      )}

      {/* Row 4 — dock spans all columns. Stays in all screen modes (spec §3).
          BottomDock renders its own collapsed summary bar when collapsed. */}
      <div style={{ gridColumn: '1 / -1' }}><BottomDock controller={controller} /></div>

      {/* Overlays (not part of the grid flow) */}
      <ToastRegion />
      <StatusAnnouncer />
      <KeyboardHelpDialog />
      <UnsavedGuardDialog />
    </div>
  );
}