import { useEffect } from 'react';
import { useWorkflowController } from '@/hooks/useWorkflowController';
import { useWorkspaceShortcuts } from '@/hooks/useWorkspaceShortcuts';
import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import { NodeDetailPanel } from '@/components/canvas/NodeDetailPanel';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * App — Phase 3 Workspace Shell. The controller owns all IPC + event
 * subscriptions; the shortcuts hook binds shell keys; WorkspaceShell mounts the
 * 5-zone grid. When a modal dialog is open, the shell behind it is `inert`
 * (modern focus-trap mechanism, spec §10.3).
 *
 * Phase E: the NodeDetailPanel is mounted here as a sibling of the shell. It's
 * a Radix Dialog portal (controlled by the transient `detailNodeId` store
 * field), so it overlays the whole app without being a child of any zone —
 * the canvas stays visible behind the Sheet for context (spec §26).
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
      <NodeDetailPanel />
    </div>
  );
}

export default App;