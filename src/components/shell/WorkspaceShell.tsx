import { useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { TopToolbar } from './TopToolbar';
import { AppRail } from './AppRail';
import { NodeLibrary } from './NodeLibrary';
import { CanvasContainer } from './CanvasContainer';
import { Inspector } from './Inspector';
import { BottomDock } from './BottomDock';
import { ToastRegion } from './ToastRegion';
import { StatusAnnouncer } from './StatusAnnouncer';
import { KeyboardHelpDialog } from './KeyboardHelpDialog';
import { UnsavedGuardDialog } from './UnsavedGuardDialog';
import { ProjectsScreen } from '@/components/screens/ProjectsScreen';
import { HistoryScreen } from '@/components/screens/HistoryScreen';
import { SettingsScreen } from '@/components/screens/SettingsScreen';
import type { WorkflowController } from '@/hooks/useWorkflowController';
import type { ActiveScreen } from '@/store/workflowStore';

/**
 * WorkspaceShell — the 5-zone CSS grid (spec §3). Row 1: toolbar (48px).
 * Row 2: body grid [App Rail 56px] [Node Library w] [Canvas 1fr] [Inspector w].
 * Row 3: Bottom Dock (full width, overlays all columns). When a zone collapses,
 * its column tracks → 0px (Library/Inspector) or a 4px strip (Rail). Canvas is
 * `minmax(480px, 1fr)` and never starves.
 *
 * Graceful fallback (R5): if the window is too narrow for the sum of min widths,
 * Library then Inspector auto-collapse; if too short, the dock collapses.
 */
export function WorkspaceShell({ controller }: { controller: WorkflowController }) {
  const appRailCollapsed = useWorkflowStore((s) => s.appRailCollapsed);
  const libraryCollapsed = useWorkflowStore((s) => s.libraryCollapsed);
  const libraryWidth = useWorkflowStore((s) => s.libraryWidth);
  const inspectorCollapsed = useWorkflowStore((s) => s.inspectorCollapsed);
  const inspectorWidth = useWorkflowStore((s) => s.inspectorWidth);
  const activeScreen = useWorkflowStore((s) => s.activeScreen);

  const [autoCollapsed, setAutoCollapsed] = useState({ library: false, inspector: false });

  useEffect(() => {
    const onResize = () => {
      // Min widths: rail 56 + library 200 + canvas 480 + inspector 240 = 976.
      // Library collapses first (<976, leaving rail+canvas+inspector=776),
      // then inspector (<776, leaving rail+canvas=536). The earlier thresholds
      // were one step too low, leaving the inspector clipped between 776–976
      // with its splitter unreachable (audit §10/Resize). The dock renders its
      // own collapsed summary bar when too short, so no dock auto-flag is needed.
      const tooNarrow = window.innerWidth < 976;
      setAutoCollapsed({
        library: tooNarrow,                  // <976: drop library
        inspector: window.innerWidth < 776,  // <776: drop inspector too
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showLibrary = !libraryCollapsed && !autoCollapsed.library;
  const showInspector = !inspectorCollapsed && !autoCollapsed.inspector;

  const isWorkflow = activeScreen === 'workflow';
  const railCol = appRailCollapsed ? '4px' : '56px';
  const libraryCol = isWorkflow && showLibrary ? `${libraryWidth}px` : '0px';
  const inspectorCol = isWorkflow && showInspector ? `${inspectorWidth}px` : '0px';

  const renderScreen = (screen: ActiveScreen) => {
    switch (screen) {
      case 'projects':
        return <ProjectsScreen />;
      case 'history':
        return <HistoryScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return null;
    }
  };

  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-surface-canvas text-text-primary"
      style={{
        gridTemplateRows: '48px 1fr auto',
        // Workflow path is BYTE-IDENTICAL to Phase 7 (rail/library/1fr/inspector).
        // Non-workflow: rail stays, library+inspector cols collapse to 0, the
        // screen spans the 1fr middle — same 0px-collapse pattern already used
        // for hidden library/inspector above.
        gridTemplateColumns: `${railCol} ${libraryCol} minmax(480px, 1fr) ${inspectorCol}`,
      }}
    >
      {/* Row 1 — toolbar spans all columns */}
      <div style={{ gridColumn: '1 / -1' }}>
        <TopToolbar controller={controller} />
      </div>

      {isWorkflow ? (
        <>
          {/* Row 2 — body grid (App Rail, Library, Canvas, Inspector) */}
          <AppRail />
          <NodeLibrary />
          <CanvasContainer />
          <Inspector />
        </>
      ) : (
        <>
          {/* Row 2 — App Rail stays; Canvas+Library+Inspector UNMOUNT and the
              active screen replaces them spanning cols 2/4 (spec §3 line 123:
              "the canvas area is replaced by the active screen"). ReactFlowProvider
              unmounts → @xyflow internal viewport lost; graphSlice in Zustand
              survives so re-entering Workflow re-renders without a reload. The
              controller's event listeners stay attached → a live run keeps
              updating the store while the canvas is unmounted. Viewport resets
              on return (documented out-of-scope; not in uiSlice). */}
          <AppRail />
          <div style={{ gridColumn: '2 / 4' }} className="min-w-0 overflow-hidden">
            {renderScreen(activeScreen)}
          </div>
        </>
      )}

      {/* Row 3 — dock spans all columns (overlays full width). Stays in BOTH
          screen modes (spec §3 line 123: "The Bottom Dock stays"). BottomDock
          renders its own collapsed summary bar when collapsed, so the dock is
          always mounted regardless of `showDock` (the prior dead ternary — two
          identical branches — is collapsed to a single render). */}
      <div style={{ gridColumn: '1 / -1' }}><BottomDock controller={controller} /></div>

      {/* Overlays (not part of the grid flow) */}
      <ToastRegion />
      <StatusAnnouncer />
      <KeyboardHelpDialog />
      <UnsavedGuardDialog />
    </div>
  );
}