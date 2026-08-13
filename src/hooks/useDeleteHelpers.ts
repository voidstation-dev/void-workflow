import { useWorkflowStore } from '@/store/workflowStore';
import { v4 as uuidv4 } from 'uuid';

/**
 * useDeleteHelpers — shared node/edge deletion (spec §23). Single owner of the
 * delete math so the `MultiSelectInspector`, the `GroupToolbar`, the node
 * context menu, and the floating toolbar's More/Delete all share one behavior
 * (composition-patterns: single owner, no duplicated logic).
 *
 * Mirrors the keyboard Delete path (`useWorkspaceShortcuts`) — remove the node
 * + its touching edges, clear selection, mark dirty, announce. NO store action
 * is added (the keyboard shortcut is NOT modified); this composes the existing
 * `setNodes`/`setEdges` mutators so history-snapshot + dirty ride along (§27).
 *
 * No `confirm()` — deletion is immediate + reversible via Undo (Ctrl/Cmd+Z) or
 * reload (spec §23 "for trivial nodes: delete directly").
 */
export function useDeleteHelpers() {
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const clearSelection = useWorkflowStore((s) => s.clearSelection);
  const markDirty = useWorkflowStore((s) => s.markDirty);
  const setAnnouncement = useWorkflowStore((s) => s.setAnnouncement);

  const deleteNodes = (ids: string[]) => {
    const idSet = new Set(ids);
    const { nodes, edges } = useWorkflowStore.getState();
    setNodes(nodes.filter((n) => !idSet.has(n.id)));
    setEdges(edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
    clearSelection();
    markDirty();
    setAnnouncement({
      id: uuidv4(),
      text: `Deleted ${ids.length} node${ids.length > 1 ? 's' : ''}.`,
    });
  };

  const deleteEdge = (edgeId: string) => {
    const { edges } = useWorkflowStore.getState();
    setEdges(edges.filter((e) => e.id !== edgeId));
    clearSelection();
    markDirty();
    setAnnouncement({ id: uuidv4(), text: 'Connection deleted.' });
  };

  return { deleteNodes, deleteEdge };
}