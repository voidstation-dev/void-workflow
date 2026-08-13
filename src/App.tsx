import { useEffect } from 'react';
import { useWorkflowController } from '@/hooks/useWorkflowController';
import { useWorkspaceShortcuts } from '@/hooks/useWorkspaceShortcuts';
import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * App — Phase 3 Workspace Shell. The controller owns all IPC + event
 * subscriptions; the shortcuts hook binds shell keys; WorkspaceShell mounts the
 * 5-zone grid. When a modal dialog is open, the shell behind it is `inert`
 * (modern focus-trap mechanism, spec §10.3).
 */
function App() {
  const controller = useWorkflowController();
  useWorkspaceShortcuts(controller);

  useEffect(() => {
    void controller.init();
  }, [controller]);

  const dialog = useWorkflowStore((s) => s.dialog);

  return (
    <div inert={dialog !== null ? true : undefined}>
      <WorkspaceShell controller={controller} />
    </div>
  );
}

export default App;