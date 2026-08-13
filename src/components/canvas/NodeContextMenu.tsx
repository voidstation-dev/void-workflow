import { Command } from 'cmdk';
import { Pencil, Plus, Copy, Trash, ChevronRight } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NODE_DEFINITIONS, NODE_DEFINITION_MAP, type NodeDefinition } from '@/nodes/registry';
import { resolvePortType } from '@/nodes/portCompat';
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
 * NodeContextMenuContent — spec §53. The right-click menu for a NODE, in the
 * spec's exact item order: Configure · Add Next · Duplicate · Copy · Delete.
 * "Add Next" is a sub-menu (the node picker) so the user can insert a new block
 * below the right-clicked node without a separate popover round-trip.
 *
 * Honesty (spec §24): we expose ONLY actions the backend/frontend actually
 * supports. No "Run This Node", no "Disable" (no per-node run IPC; no disable
 * runtime). Delete is a deliberate action (no `confirm()` for a single trivial
 * node, spec §23 — reversible via Undo/reload). "Copy" writes the transient
 * clipboard (pairs with the canvas-menu Paste + Ctrl/Cmd+V).
 *
 * The menu is right-click-opened (Radix ContextMenu anchors at the cursor). The
 * owner `NodeContextMenu` wraps the node subtree in a `ContextMenuTrigger`,
 * so a right-click anywhere on a node selects it (matching click-then-act
 * expectation) and opens this menu. We DO set the selection to the right-
 * clicked node on context — so the menu actions act on the node the user
 * right-clicked, even if a different node was selected before.
 *
 * No `.rs` / no IPC / no new persisted state. Pure selection → store actions.
 */
const COMMON_NEXT = ['textTransform', 'aiScript', 'saveArtifact', 'preview'] as const;

function buildSuggested(sourceType: string | undefined): NodeDefinition[] {
  const sourceOutType = resolvePortType(sourceType, undefined, 'out');
  const seen = new Set<string>();
  const out: NodeDefinition[] = [];
  for (const def of NODE_DEFINITIONS) {
    if (def.ports.in.length === 0) continue;
    const inType = def.ports.in[0].type;
    const compat = sourceOutType === 'any' || inType === 'any' || sourceOutType === inType;
    if (compat && !seen.has(def.type)) {
      seen.add(def.type);
      out.push(def);
    }
  }
  const ordered: NodeDefinition[] = [];
  const byType = new Map(out.map((d) => [d.type, d]));
  for (const t of COMMON_NEXT) {
    const d = byType.get(t);
    if (d && !ordered.includes(d)) ordered.push(d);
  }
  for (const d of out) if (!ordered.includes(d)) ordered.push(d);
  return ordered;
}

export function NodeContextMenuContent({ nodeId }: { nodeId: string }) {
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes);
  const copyNodes = useWorkflowStore((s) => s.copyNodes);
  const setAnnouncement = useWorkflowStore((s) => s.setAnnouncement);

  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === nodeId));
  const def = node?.type ? NODE_DEFINITION_MAP[node.type] : undefined;

  const deleteNode = () => {
    const store = useWorkflowStore.getState();
    store.setNodes(store.nodes.filter((n) => n.id !== nodeId));
    store.setEdges(store.edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
    store.clearSelection();
    store.markDirty();
    setAnnouncement({ id: crypto.randomUUID(), text: 'Node deleted.' });
  };

  // Configure: make this node the single selection so the Inspector swaps in.
  const configure = () => useWorkflowStore.getState().selectNode(nodeId);

  // Add Next sub-menu items (reuses the same suggestion logic as the toolbar
  // AddNextPopover — single owner of the "what to suggest" rule).
  const suggested = def ? buildSuggested(node?.type) : [];
  const executable = def?.executionMode === 'runtime';

  const onPickNext = (type: string) => {
    useWorkflowStore.getState().addNextStep(nodeId, type);
  };

  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={configure}>
        <Pencil size={14} aria-hidden="true" /> Configure
      </ContextMenuItem>

      {executable && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus size={14} aria-hidden="true" /> Add Next
            <ChevronRight size={12} className="ml-auto text-text-muted" aria-hidden="true" />
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[260px] p-0">
            <Command label="Add next step">
              <Command.Input
                placeholder="Search blocks…"
                className="flex items-center gap-2 border-b border-border-subtle bg-transparent px-2 py-2 text-[12px] text-text-primary outline-none placeholder:text-text-muted"
              />
              <Command.List className="max-h-[280px] overflow-auto p-1">
                <Command.Empty className="px-2 py-3 text-[12px] text-text-muted">
                  No blocks found.
                </Command.Empty>
                {suggested.length > 0 && (
                  <Command.Group heading="Suggested" className="text-text-primary">
                    {suggested.map((d) => (
                      <NextRow key={d.type} def={d} onPick={onPickNext} />
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="All Blocks" className="text-text-primary">
                  {NODE_DEFINITIONS.map((d) => (
                    <NextRow key={d.type} def={d} onPick={onPickNext} />
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => duplicateNodes([nodeId])}>
        <Copy size={14} aria-hidden="true" /> Duplicate
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!node}
        onSelect={() => {
          if (node) copyNodes([nodeId]);
        }}
      >
        <Copy size={14} aria-hidden="true" /> Copy
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem danger onSelect={deleteNode}>
        <Trash size={14} aria-hidden="true" /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function NextRow({ def, onPick }: { def: NodeDefinition; onPick: (type: string) => void }) {
  const Icon = getNodeIcon(def.icon);
  return (
    <Command.Item
      value={`${def.label} ${def.description} ${def.keywords.join(' ')} ${def.category}`}
      onSelect={() => onPick(def.type)}
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
}
