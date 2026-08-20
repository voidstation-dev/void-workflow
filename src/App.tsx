import { useEffect } from 'react';
import { useWorkflowController } from '@/hooks/useWorkflowController';
import { useWorkspaceShortcuts } from '@/hooks/useWorkspaceShortcuts';
import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import { NodeDetailPanel } from '@/components/canvas/NodeDetailPanel';
import { KeyboardHelpDialog } from '@/components/shell/KeyboardHelpDialog';
import { UnsavedGuardDialog } from '@/components/shell/UnsavedGuardDialog';
import { ToastRegion } from '@/components/shell/ToastRegion';
import { StatusAnnouncer } from '@/components/shell/StatusAnnouncer';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * App — Phase 3 Workspace Shell. The controller owns all IPC + event
 * subscriptions; the shortcuts hook binds shell keys; WorkspaceShell mounts the
 * 5-zone grid. When a modal dialog is open, the shell behind it is `inert`
 * (modern focus-trap mechanism, spec §10.3).
 *
 * All Tier-3 modal dialogs and overlays are mounted as siblings outside the
 * `inert` container so that focus, clicks, and keyboard navigation on dialogs
 * work correctly while the underlying background shell remains inaccessible.
 */
function App() {
  const controller = useWorkflowController();
  useWorkspaceShortcuts(controller);

  useEffect(() => {
    void controller.init();
  }, [controller]);

  const dialog = useWorkflowStore((s) => s.dialog);

  return (
    <>
      <div inert={dialog !== null ? true : undefined}>
        <WorkspaceShell controller={controller} />
        <NodeDetailPanel />
      </div>

      {/* Overlays and Modals mounted outside inert wrapper */}
      <ToastRegion />
      <StatusAnnouncer />
      <KeyboardHelpDialog />
      <UnsavedGuardDialog />
    </>
  );
}

export default App;