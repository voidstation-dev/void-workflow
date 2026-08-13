import { useMemo, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { Plus } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NODE_DEFINITIONS, type NodeDefinition } from '@/nodes/registry';
import { resolvePortType } from '@/nodes/portCompat';
import { getNodeIcon } from '@/components/shell/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/primitives/Popover';
import { cn } from '@/lib/utils';

/**
 * AddNextPopover — spec §19/§20. A compact `Popover + cmdk Command` picker
 * anchored to the floating toolbar's "Add Next" button. Lets the user pick a
 * block to insert BELOW the selected node; on selection `addNextStep` creates
 * the node ~120px below, auto-connects source→new (when ports are compatible),
 * selects it, and opens the Inspector (the store selection swap handles that).
 *
 * Suggested: nodes whose first input port is type-compatible with the source's
 * first output port (resolvePortType + isTypeCompatible), plus a small static
 * "common next" allowlist (spec §20 "Suggested options may be based on output
 * port type / common next nodes"). No AI recommendation (spec §20).
 * All Blocks: every NODE_DEFINITION, in registry order.
 *
 * No `.rs` / no IPC / no new persisted state. Pure local picker → store action.
 */
const COMMON_NEXT = ['textTransform', 'aiScript', 'saveArtifact', 'preview'] as const;

export function AddNextPopover({
  sourceId,
  children,
}: {
  sourceId: string;
  /** The trigger element. When omitted a default + button is used. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const source = useWorkflowStore((s) => s.nodes.find((n) => n.id === sourceId));
  // resolvePortType already returns 'any' when nodeType is falsy (no source)
  // and falls back to the single out-port when handleId is omitted — so we
  // delegate rather than re-derive the port id inline (the prior nested
  // ternary re-implemented the same fallback, convolutedly).
  const sourceOutType = resolvePortType(source?.type, undefined, 'out');

  const suggested = useMemo<NodeDefinition[]>(() => {
    // Type-compatible nodes that have ≥1 input port, deduped, in a stable order.
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
    // Prepend the static "common next" allowlist (in spec order) when present.
    const ordered: NodeDefinition[] = [];
    const byType = new Map(out.map((d) => [d.type, d]));
    for (const t of COMMON_NEXT) {
      const d = byType.get(t);
      if (d && !ordered.includes(d)) ordered.push(d);
    }
    for (const d of out) if (!ordered.includes(d)) ordered.push(d);
    return ordered;
  }, [sourceOutType]);

  const onPick = (type: string) => {
    useWorkflowStore.getState().addNextStep(sourceId, type);
    setOpen(false);
  };

  const Row = ({ def }: { def: NodeDefinition }) => {
    const Icon = getNodeIcon(def.icon);
    return (
      <Command.Item
        value={`${def.label} ${def.description} ${def.keywords.join(' ')} ${def.category}`}
        onSelect={() => onPick(def.type)}
        className={cn(
          'flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-[12px] text-text-secondary',
          'data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-primary',
          'aria-disabled:opacity-50',
        )}
      >
        <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{def.label}</span>
        <span className="text-[10px] text-text-muted">{def.category}</span>
      </Command.Item>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Add next step"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <Plus size={16} aria-hidden="true" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[280px] p-0">
        <Command label="Add next step">
          <Command.Input
            placeholder="Search blocks…"
            className="w-full border-b border-border-subtle bg-transparent px-2 py-2 text-[12px] text-text-primary outline-none placeholder:text-text-muted"
          />
          <Command.List className="max-h-[280px] overflow-auto p-1">
            <Command.Empty className="px-2 py-3 text-[12px] text-text-muted">
              No blocks found.
            </Command.Empty>
            {suggested.length > 0 && (
              <Command.Group heading="Suggested" className="text-text-primary">
                {suggested.map((def) => (
                  <Row key={def.type} def={def} />
                ))}
              </Command.Group>
            )}
            <Command.Group heading="All Blocks" className="text-text-primary">
              {NODE_DEFINITIONS.map((def) => (
                <Row key={def.type} def={def} />
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}