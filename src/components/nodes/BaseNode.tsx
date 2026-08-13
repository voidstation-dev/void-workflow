import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useWorkflowStore, type AppNode, type PerNodeState } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';
import { getNodeIcon } from '@/components/shell/icons';
import { NodeStatus } from '@/components/primitives/NodeStatus';
import { PortHandle } from './PortHandle';
import { cn } from '@/lib/utils';

/**
 * BaseNode — the single visual renderer for all node types (Phase 5).
 *
 * Card anatomy (plan §11, spec §7.3, DS §11.5): identity (icon + label) + typed
 * ports (Input LEFT / Output RIGHT, gated on def.ports.in/out.length —
 * markdownNote renders NO handles) + a per-node run-status footer that appears
 * ONLY when the node is non-idle. The §11 "essential config summary" and
 * "essential value-result" body rows are DELIBERATELY deferred to Phase 6
 * (Inspector) — building them now, with no config form behind them, would be
 * speculative churn and risks the §7 "giant node cards" avoid-item (keep visual
 * noise low).
 *
 * Selection (spec §7.3, DS §9.1): 2px --border-focus ring + surface.elevated
 * lift + shadow-node, NO scale transform (restrained). A visually-hidden
 * "Selected" is appended to the accessible name so AT announces "AI Script,
 * selected". Per-node status is read via a shallow selector keyed on the node
 * id so a status event on one node does NOT re-render every node.
 */
function BaseNodeComponent({ id, type, data, selected }: NodeProps<AppNode>) {
  const def = type ? NODE_DEFINITION_MAP[type] : undefined;
  const Icon = getNodeIcon(def?.icon ?? 'FileText');
  const [hovered, setHovered] = useState(false);

  // Shallow per-node status selector (graft #5): select only this node's
  // PerNodeStatus so other nodes' status events don't re-render us.
  const nodeStatus = useWorkflowStore((s) => s.perNodeStatus[id]);

  const label = data?.label ?? def?.label ?? type ?? 'Node';
  const showFooter = !!nodeStatus && nodeStatus.status !== 'idle';

  const accessibleName = `${label}${selected ? ', selected' : ''}`;

  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-label={accessibleName}
      role="group"
      className={cn(
        'relative min-w-[200px] max-w-[220px] rounded-panel border-2 bg-surface-panel shadow-node transition-colors',
        selected
          ? 'border-border-focus bg-surface-elevated ring-2 ring-border-focus ring-offset-1 ring-offset-surface-canvas'
          : 'border-border-default',
      )}
    >
      {/* Identity row: icon + label. No ⋯ menu yet (Phase 6 Inspector owns
          per-node actions). */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Icon size={14} className="shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">{label}</span>
      </div>

      {/* Typed ports row: input LEFT, output RIGHT. Each PortHandle is gated on
          its side having ≥1 port (markdownNote renders none). */}
      {(def?.ports.in.length || def?.ports.out.length) ? (
        <div className="relative flex items-center justify-between px-3 py-1.5">
          <div className="flex flex-col gap-1">
            {def?.ports.in.map((port) => (
              <PortHandle
                key={port.id}
                port={port}
                direction="in"
                nodeSelected={!!selected}
                nodeHovered={hovered}
                nodeId={id}
              />
            ))}
          </div>
          <div className="flex flex-col items-end gap-1">
            {def?.ports.out.map((port) => (
              <PortHandle
                key={port.id}
                port={port}
                direction="out"
                nodeSelected={!!selected}
                nodeHovered={hovered}
                nodeId={id}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Per-node run-status footer — ONLY when non-idle (restraint invariant:
          status is a footer strip + 2px accent, never a full-card wash). */}
      {showFooter && nodeStatus && (
        <NodeStatus
          status={nodeStatus.status as PerNodeState}
          progress={nodeStatus.progress}
          message={nodeStatus.message}
          compact
        />
      )}
    </div>
  );
}

export const BaseNode = memo(BaseNodeComponent);