import { MoreHorizontal, Pencil, Copy, Clipboard, RotateCcw, Trash } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/primitives/DropdownMenu';

/**
 * NodeMoreMenu — spec §16/§24. The node "⋯" overflow menu, anchored to the
 * floating toolbar's More button. Actions that the backend does not support
 * are omitted entirely (spec §16/§24 "Never expose runtime actions that the
 * backend does not actually support") — so NO "Run This Node", NO "Disable"
 * (no per-node run IPC; no disable runtime). Kept honest: only Configure /
 * Duplicate / Copy Node ID / Reset Configuration / Delete.
 *
 * "Reset Configuration" restores the node's data to the registry defaults (the
 * `default` of each ConfigField + the def label). Frontend-local; no IPC.
 */
export function NodeMoreMenu({ nodeId }: { nodeId: string }) {
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setAnnouncement = useWorkflowStore((s) => s.setAnnouncement);

  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === nodeId));
  const def = node?.type ? NODE_DEFINITION_MAP[node.type] : undefined;

  // Delete: remove the node + its touching edges, clear selection, mark dirty.
  // Mirrors the keyboard Delete path (useWorkspaceShortcuts) — no confirm() for a
  // single trivial node (spec §23); reversible via Undo (Ctrl/Cmd+Z) or reload.
  const deleteNode = () => {
    const { nodes, edges } = useWorkflowStore.getState();
    useWorkflowStore.getState().setNodes(nodes.filter((n) => n.id !== nodeId));
    useWorkflowStore.getState().setEdges(
      edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
    useWorkflowStore.getState().clearSelection();
    useWorkflowStore.getState().markDirty();
    setAnnouncement({ id: crypto.randomUUID(), text: 'Node deleted.' });
  };

  const copyNodeId = async () => {
    try {
      await navigator.clipboard.writeText(nodeId);
      setAnnouncement({ id: crypto.randomUUID(), text: 'Node ID copied.' });
    } catch {
      // Clipboard may be unavailable; announce honestly, never throw.
      setAnnouncement({ id: crypto.randomUUID(), text: 'Copy failed — clipboard unavailable.' });
    }
  };

  const resetConfig = () => {
    if (!def) return;
    const defaults: Record<string, unknown> = {};
    for (const field of def.configSchema) defaults[field.key] = field.default;
    // Keep the label; reset every config key to its default.
    updateNodeData(nodeId, { ...defaults, label: def.label });
    setAnnouncement({ id: crypto.randomUUID(), text: 'Configuration reset to defaults.' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="More node actions"
          className="inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuItem
          onSelect={() => useWorkflowStore.getState().selectNode(nodeId)}
        >
          <Pencil size={14} aria-hidden="true" /> Configure
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => duplicateNodes([nodeId])}>
          <Copy size={14} aria-hidden="true" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyNodeId}>
          <Clipboard size={14} aria-hidden="true" /> Copy Node ID
        </DropdownMenuItem>
        {def && def.configSchema.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetConfig}>
              <RotateCcw size={14} aria-hidden="true" /> Reset Configuration
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={deleteNode}>
          <Trash size={14} aria-hidden="true" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}