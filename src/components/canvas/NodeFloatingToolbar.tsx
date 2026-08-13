import { NodeToolbar, Position } from '@xyflow/react';
import { Plus, Copy, Pencil, Trash } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { AddNextPopover } from './AddNextPopover';
import { NodeMoreMenu } from './NodeMoreMenu';
import { cn } from '@/lib/utils';

/**
 * NodeFloatingToolbar — spec §16/§17/§18. The compact floating toolbar that
 * appears above a SELECTED node. Built on `@xyflow/react`'s `NodeToolbar`, which
 * is portaled into the React Flow viewport layer and transformed by the same
 * pan/zoom matrix as the node — so the toolbar stays glued to the node through
 * pan, zoom, node drag, and viewport resize with ZERO manual coordinate math
 * (spec §17 "Prefer NodeToolbar over manually calculating viewport coords").
 * `NodeToolbar` also handles the spec §17 edge case (flip below / shift inside
 * viewport) via its collision-avoidance.
 *
 * Actions (spec §16): Add Next · Duplicate · Configure · More · Delete.
 * Markdown Note (non-executable, spec §38): a reduced toolbar — Edit ·
 * Duplicate · Delete (no Add Next — a note has no flow output to continue; no
 * "run" affordances). The toolbar is rendered by `BaseNode` only when this node
 * is selected, so unselected nodes have no chrome (spec §15: no toolbar on hover).
 *
 * Toolbar buttons are icon-only, so each carries aria-label + title (spec §18:
 * tooltip + aria-label + keyboard focus + focus ring). Delete is a deliberate
 * action (no confirm() for a single trivial node, spec §23; reversible via
 * Undo/reload).
 *
 * No `.rs` / no IPC / no new persisted state. Pure selection → store actions.
 */
function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: typeof Plus;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary outline-none',
        'hover:bg-surface-hover hover:text-text-primary',
        'focus-visible:ring-2 focus-visible:ring-border-focus',
        danger && 'hover:text-text-error',
      )}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

export function NodeFloatingToolbar({ nodeId, isExecutable }: { nodeId: string; isExecutable: boolean }) {
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes);

  // Delete: remove the node + touching edges, clear selection, mark dirty.
  // Mirrors the keyboard Delete path + the More menu Delete — one behavior.
  const deleteNode = () => {
    const store = useWorkflowStore.getState();
    store.setNodes(store.nodes.filter((n) => n.id !== nodeId));
    store.setEdges(store.edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
    store.clearSelection();
    store.markDirty();
    store.setAnnouncement({ id: crypto.randomUUID(), text: 'Node deleted.' });
  };

  // Configure: ensure the node is the single selection (the Inspector already
  // swaps in on selection; this re-selects in case the toolbar was opened via
  // multi-select). The Inspector focuses the first field on mount (Phase E will
  // add explicit focus; today it just opens the config form).
  const configure = () => useWorkflowStore.getState().selectNode(nodeId);

  // position="top" + offset keeps the toolbar 8-12px above the node (spec §17);
  // NodeToolbar handles flip/shift on viewport collision.
  return (
    <NodeToolbar isVisible position={Position.Top} offset={8} className="flex items-center gap-0.5 rounded-panel border border-border-subtle bg-surface-elevated p-0.5 shadow-popover">
      {isExecutable && (
        <AddNextPopover sourceId={nodeId} />
      )}
      <ToolbarButton label="Duplicate" icon={Copy} onClick={() => duplicateNodes([nodeId])} />
      <ToolbarButton label="Configure" icon={Pencil} onClick={configure} />
      <NodeMoreMenu nodeId={nodeId} />
      <ToolbarButton label="Delete" icon={Trash} onClick={deleteNode} danger />
    </NodeToolbar>
  );
}