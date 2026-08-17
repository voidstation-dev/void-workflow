import { lazy, memo, Suspense, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useWorkflowStore, type AppNode, type PerNodeState } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';
import { getNodeIcon } from '@/components/shell/icons';
import { NodeStatus } from '@/components/primitives/NodeStatus';
import { ContextMenu, ContextMenuTrigger } from '@/components/primitives/ContextMenu';
import { getBodyRenderer, BodyRendererSlot } from './bodyRenderers';
import { PortHandle } from './PortHandle';
import { cn } from '@/lib/utils';

// Code-split the conditional children: the floating toolbar (gated on
// `selected`) transitively pulls cmdk + @radix-ui/react-popover +
// @radix-ui/react-dropdown-menu (via AddNextPopover + NodeMoreMenu), and the
// right-click menu content pulls cmdk + @radix-ui/react-context-menu. Neither
// is needed until a node is selected / right-clicked, so deferring them shrinks
// the initial bundle. BaseNode itself stays eagerly loaded (single nodeTypes
// renderer, §27). Named exports → wrap into a default for React.lazy.
const NodeFloatingToolbar = lazy(() =>
  import('@/components/canvas/NodeFloatingToolbar').then((m) => ({ default: m.NodeFloatingToolbar })),
);
const NodeContextMenuContent = lazy(() =>
  import('@/components/canvas/NodeContextMenu').then((m) => ({ default: m.NodeContextMenuContent })),
);

/**
 * BaseNode — the single visual renderer for ALL node types (spec §7 / DS §11.5,
 * light UI §6/§7/§13). One `nodeTypes` entry per type all maps here — the
 * contract "nodeTypes = single renderer" (§27) is preserved.
 *
 * Card anatomy (light spec §7):
 *   NodeHeader  — icon + title (always)
 *   body        — description line + NodeMeta chips, rendered from the
 *                 registry's `def.summarize(data)` (spec §6/§13). ONLY shown in
 *                 `detail` mode (the uiSlice `nodeCardMode` scalar). `outline`
 *                 mode collapses to header + ports for a low-noise canvas.
 *   ports       — typed Input LEFT / Output RIGHT (gated on def.ports —
 *                 markdownNote renders none).
 *   NodeStatus  — per-node run-status footer, ONLY when non-idle (restraint
 *                  invariant: status is a 2px accent + footer strip, never a
 *                  full-card wash).
 *
 * CRITICAL (§27 infinite-loop trap): `def.summarize(data)` returns a FRESH
 * object every call. It is invoked in the COMPONENT BODY (local derivation),
 * NEVER via a Zustand selector. A selector returning a fresh object defeats
 * useSyncExternalStore's Object.is equality and re-renders forever. Calling it
 * in the body is safe — it's recomputed only when React re-renders for real
 * causes (data change, selection, status), which is correct.
 *
 * No configuration UI on the card (§32) — config stays in the Inspector.
 *
 * Selection (light spec §7 / DS §9.1): `rounded-node` (10px), `shadow-node`
 * resting; on select → `shadow-node-selected` + a 2px `--border-focus` ring +
 * `bg-surface-elevated` lift. NO scale transform (restrained). A visually-hidden
 * "selected" is appended to the accessible name so AT announces "AI Script,
 * selected". Per-node status is read via a shallow selector keyed on the node id
 * so a status event on one node does NOT re-render every node.
 */
function BaseNodeComponent({ id, type, data, selected }: NodeProps<AppNode>) {
  const def = type ? NODE_DEFINITION_MAP[type] : undefined;
  const Icon = getNodeIcon(def?.icon ?? 'FileText');
  const [hovered, setHovered] = useState(false);

  // Shallow per-node status selector: select only THIS node's PerNodeStatus so
  // other nodes' status events don't re-render us.
  const nodeStatus = useWorkflowStore((s) => s.perNodeStatus[id]);
  // Scalar card-density mode (LAYOUT ONLY, persisted). Default 'detail'.
  const nodeCardMode = useWorkflowStore((s) => s.nodeCardMode);

  const label = data?.label ?? def?.label ?? type ?? 'Node';
  const showFooter = !!nodeStatus && nodeStatus.status !== 'idle';
  // Status-driven card border (additive to the footer accent). The running node
  // gets an accent border so it's visible across the canvas at a glance; a
  // failed node gets an error border; skipped/cancelled get a warning border.
  // Only applied when NOT selected, so the selection ring/border still wins.
  // Uses the same status tokens as NodeStatus (--color-status-running etc.).
  const status = nodeStatus?.status;
  const statusBorder =
    status === 'running'
      ? 'border-status-running'
      : status === 'failed'
        ? 'border-status-error'
        : status === 'skipped' || status === 'cancelled'
          ? 'border-status-warning'
          : '';

  const accessibleName = `${label}${selected ? ', selected' : ''}`;

  // Local body derivation — NOT a selector (see header caveat). summarize is
  // pure; calling it in the render body with the node's data is safe and never
  // loops. Guard for defs without summarize (none currently, but defensive).
  const summary =
    nodeCardMode === 'detail' && def?.summarize ? def.summarize(data ?? {}) : null;
  const description = summary?.description ?? def?.description;
  const chips = summary?.chips ?? undefined;

  const hasPorts = !!(def?.ports.in.length || def?.ports.out.length);
  // Phase C (spec §16/§17): the floating toolbar appears ONLY when selected
  // (spec §15: no toolbar on hover). NodeToolbar is a child of the node root so
  // React Flow transforms it with the same pan/zoom matrix (no manual math).
  const showToolbar = !!selected && !!def;

  // Pluggable inline body renderer (§27 single-renderer contract preserved).
  // When the registry declares `bodyRenderer`, render that component between
  // the header and the ports row INSTEAD of the default description/chips body.
  // The renderer owns its layout (file pickers, code-block readouts, preview
  // canvas) and binds two-way to the store via updateNodeData — no per-node-type
  // node component. Falls back to the summarize() body below when undefined.
  const BodyRenderer = def ? getBodyRenderer(def.bodyRenderer) : null;
  // updateNodeData is a stable store action; selecting it once is cheap and
  // gives the renderer a patch callback mirroring the Inspector's binding.
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  // Node context menu (spec §53): right-clicking a node opens its menu. On
  // open, make this node the single selection so the menu's actions target the
  // node the user right-clicked (even if a different node was selected before).
  // selectNode is a stable function selector.
  const selectNode = useWorkflowStore((s) => s.selectNode);

  return (
    <ContextMenu onOpenChange={(open) => { if (open) selectNode(id); }}>
      <ContextMenuTrigger asChild>
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-label={accessibleName}
      role="group"
      className={cn(
        'workflow-node relative min-w-[320px] max-w-[380px] overflow-visible rounded-[14px] border bg-surface-panel shadow-node transition-[box-shadow,border-color]',
        selected
          ? 'border-border-focus bg-surface-elevated shadow-node-selected ring-1 ring-border-focus ring-offset-1 ring-offset-surface-canvas'
          : cn('border-border-default', statusBorder),
      )}
    >
      {showToolbar && (
        <Suspense fallback={null}>
          <NodeFloatingToolbar nodeId={id} isExecutable={def.executionMode === 'runtime'} />
        </Suspense>
      )}
      {/* NodeHeader — icon + title (always present). No ⋯ menu yet (Phase 6
          Inspector owns per-node actions). */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-text-accent">
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.015em] text-text-primary">
          {label}
        </span>
      </div>

      {/* Body — inline renderer OR default description + NodeMeta chips.
          Detail mode only; outline mode collapses the card to header + ports
          (low visual noise, spec §7). When `def.bodyRenderer` is set, the
          pluggable renderer owns the body (file pickers, code-block readouts,
          preview canvas); otherwise the registry's `summarize(data)` drives the
          description + chips. Both paths are pure functions of node.data. */}
      {nodeCardMode === 'detail' && BodyRenderer ? (
        <BodyRendererSlot
          component={BodyRenderer}
          nodeId={id}
          data={data ?? {}}
          updateNodeData={(patch) => updateNodeData(id, patch)}
          selected={!!selected}
        />
      ) : (
        nodeCardMode === 'detail' && (description || chips?.length) && (
          <div className="flex flex-col gap-1.5 px-4 pb-3">
            {description && (
              <p className="text-[11px] leading-relaxed text-text-secondary">{description}</p>
            )}
            {chips && chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1" aria-hidden="true">
                {chips.map((chip, i) => (
                  <span
                    key={`${chip}-${i}`}
                    className="rounded-full border border-border-subtle bg-surface-hover px-2 py-0.5 text-[10px] text-text-secondary"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Typed ports row: input LEFT, output RIGHT. Each PortHandle is gated on
          its side having ≥1 port (markdownNote renders none). */}
      {hasPorts ? (
        <div className="relative flex items-center justify-between border-t border-border-subtle px-4 py-2.5">
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
      </ContextMenuTrigger>
      {/* Node right-click menu (spec §53): Configure · Add Next · Duplicate · Copy · Delete.
          The eager ContextMenu wrapper handles right-click → selectNode wiring
          immediately; the lazy content (cmdk list + actions) populates ms later
          on Tauri local FS. Null fallback → no visible gap. */}
      <Suspense fallback={null}>
        <NodeContextMenuContent nodeId={id} />
      </Suspense>
    </ContextMenu>
  );
}

export const BaseNode = memo(BaseNodeComponent);
