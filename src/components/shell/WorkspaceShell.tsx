import { lazy, Suspense, useEffect, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowHeader } from './WorkflowHeader';
import { WorkflowTabs } from './WorkflowTabs';
import { NodeLibrary } from './NodeLibrary';
import { CanvasContainer } from './CanvasContainer';
import { Inspector } from './Inspector';
import { BottomDock } from './BottomDock';
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
  const rightPanelCollapsed = useWorkflowStore((s) => s.rightPanelCollapsed);
  const toggleRightPanel = useWorkflowStore((s) => s.toggleRightPanel);
  const activeScreen = useWorkflowStore((s) => s.activeScreen);
  // The right column renders the Build panel by default and swaps to the
  // Inspector when a node/edge/multi selection is active (Phase 5 completes the
  // Build↔Inspector single-column swap, spec §15).
  const selectionMode = useWorkflowStore((s) => s.selectionMode);

  const [isNarrow, setIsNarrow] = useState(false);
  const [narrowPanelOpen, setNarrowPanelOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      // Min widths: canvas 480 + right column 280 = 760. The right column
      // collapses below 760 so the canvas never starves. The dock renders its
      // own collapsed summary bar when too short, so no dock auto-flag.
      const narrow = window.innerWidth < 760;
      setIsNarrow(narrow);
      if (!narrow) setNarrowPanelOpen(false);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isWorkflow = activeScreen === 'workflow';
  // The single right column: Build by default, Inspector on selection. One
  // shared width + collapsed flag (Phase 5 unification).
  const rightCollapsed = rightPanelCollapsed || (isNarrow && !narrowPanelOpen);
  const panelLabel = selectionMode === 'none' ? 'Build' : 'Inspector';

  const openRightPanel = () => {
    if (rightPanelCollapsed) toggleRightPanel();
    if (isNarrow) setNarrowPanelOpen(true);
  };
  const renderScreen = (screen: ActiveScreen) => {
    switch (screen) {
      case 'runs':
        return <HistoryScreen />;
      case 'settings':
        return <SettingsScreen controller={controller} />;
      case 'environment':
        return <EnvironmentScreen controller={controller} />;
      default:
        return null;
    }
  };

  return (
    <div className="void-workspace-backdrop">
      <div
        className="void-workspace-shell grid overflow-hidden text-text-primary"
        style={{
          gridTemplateRows: '60px 48px minmax(0, 1fr) auto',
          gridTemplateColumns: 'minmax(0, 1fr)',
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
        <div className="relative min-h-0 min-w-0 overflow-hidden" style={{ gridColumn: '1 / -1' }}>
          <CanvasContainer />
          {!rightCollapsed && (selectionMode === 'none' ? <NodeLibrary /> : <Inspector />)}
          {rightCollapsed && (
            <button
              type="button"
              aria-label={`Show ${panelLabel} panel`}
              title={`Show ${panelLabel} panel (${selectionMode === 'none' ? 'Ctrl/Cmd+B' : 'Ctrl/Cmd+I'})`}
              onClick={openRightPanel}
              className="absolute right-4 top-4 z-[var(--z-toolbar)] flex h-9 items-center gap-2 rounded-[11px] border border-border-default bg-surface-panel px-3 text-[12px] font-medium text-text-secondary shadow-popover transition-[transform,box-shadow,color] hover:-translate-y-px hover:text-text-primary hover:shadow-node-selected"
            >
              <PanelRightOpen size={15} strokeWidth={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">{panelLabel}</span>
            </button>
          )}
        </div>
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
      </div>
    </div>
  );
}
