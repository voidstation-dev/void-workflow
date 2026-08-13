import { Command } from 'cmdk';
import { Plus, ClipboardPaste, Maximize, ChevronRight } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore, type AppNode } from '@/store/workflowStore';
import { NODE_DEFINITIONS, type NodeDefinition } from '@/nodes/registry';
import { getNodeIcon } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/primitives/ContextMenu';

/**
 * CanvasContextMenuContent — spec §53 "Canvas context menu". The pane right-
 * click menu in the spec's exact order: Add Node · Paste · Fit View.
 *
 * "Add Node" is a sub-menu (the node picker) so the user can drop a new block
 * directly at the cursor without an extra placement step. "Paste" drops the
 * transient clipboard at the cursor (pairs with node-menu Copy + Ctrl/Cmd+C/V).
 * "Fit View" calls React Flow's fitView.
 *
 * Placement coordinates come from the store-driven click record (`paneClick`)
 * set by the `ContextMenuTrigger`'s onContextMenu handler in WorkflowCanvas —
 * the flow-space position is computed there via `screenToFlowPosition` so the
 * new/pasted nodes land exactly under the cursor. This content only reads the
 * record; it does not recompute coordinates (single owner of the transform).
 *
 * Honesty (spec §24): Paste is disabled (aria-disabled, never color-only) when
 * the clipboard is empty — no fake affordance.
 *
 * No `.rs` / no IPC / no new persisted state.
 */
export function CanvasContextMenuContent({
  flowPosition,
}: {
  /** Flow-space coordinates of the right-click (where to place/paste). */
  flowPosition: { x: number; y: number };
}) {
  const { fitView } = useReactFlow();

  const addNode = useWorkflowStore((s) => s.addNode);
  const pasteNodes = useWorkflowStore((s) => s.pasteNodes);
  const clipboardLen = useWorkflowStore((s) => s.clipboard.length);
  const hasClipboard = clipboardLen > 0;

  const onPickAdd = (type: string) => {
    const def = NODE_DEFINITIONS.find((d) => d.type === type);
    const newNode: AppNode = {
      id: crypto.randomUUID(),
      type,
      position: flowPosition,
      data: { label: def?.label ?? type },
    };
    addNode(newNode);
    useWorkflowStore.getState().selectNode(newNode.id);
  };

  const onPaste = () => {
    pasteNodes(flowPosition);
  };

  const onFit = () => fitView({ duration: 0 });

  const addBtn = (def: NodeDefinition) => {
    const Icon = getNodeIcon(def.icon);
    return (
      <Command.Item
        value={`${def.label} ${def.description} ${def.keywords.join(' ')} ${def.category}`}
        onSelect={() => onPickAdd(def.type)}
        className={cn(
          'flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-[12px] text-text-secondary',
          'data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-primary',
        )}
      >
        <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{def.label}</span>
        <span className="text-[10px] text-text-muted">{def.category}</span>
      </Command.Item>
    );
  };

  return (
    <ContextMenuContent>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Plus size={14} aria-hidden="true" /> Add Node
          <ChevronRight size={12} className="ml-auto text-text-muted" aria-hidden="true" />
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-[260px] p-0">
          <Command label="Add node">
            <Command.Input
              placeholder="Search blocks…"
              className="flex items-center gap-2 border-b border-border-subtle bg-transparent px-2 py-2 text-[12px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <Command.List className="max-h-[280px] overflow-auto p-1">
              <Command.Empty className="px-2 py-3 text-[12px] text-text-muted">
                No blocks found.
              </Command.Empty>
              <Command.Group heading="All Blocks" className="text-text-primary">
                {NODE_DEFINITIONS.map((d) => addBtn(d))}
              </Command.Group>
            </Command.List>
          </Command>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuItem disabled={!hasClipboard} onSelect={onPaste}>
        <ClipboardPaste size={14} aria-hidden="true" /> Paste
        {hasClipboard ? (
          <span className="ml-auto text-[10px] text-text-muted">{clipboardLen}</span>
        ) : null}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onSelect={onFit}>
        <Maximize size={14} aria-hidden="true" /> Fit View
      </ContextMenuItem>
    </ContextMenuContent>
  );
}