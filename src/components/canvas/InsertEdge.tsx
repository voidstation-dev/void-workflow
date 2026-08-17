import { useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  Position,
} from '@xyflow/react';
import { Command } from 'cmdk';
import { Plus } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NODE_DEFINITIONS, type NodeDefinition } from '@/nodes/registry';
import { getNodeIcon } from '@/components/shell/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/primitives/Popover';
import { cn } from '@/lib/utils';

/**
 * InsertEdge — spec §33/§66 (Phase G). A custom edge renderer that paints the
 * normal bezier path AND a small `+` button at the path's label midpoint. The
 * `+` is revealed on edge hover (spec §33 "When hovering connection: show small
 * +"). Clicking it opens a `Popover + cmdk Command` node picker (the same picker
 * AddNextPopover uses). Selecting a block splices it IN PLACE between A and B:
 *
 *   A → B   becomes   A → New → B
 *
 * via the store's `insertNodeBetween(edgeId, nodeType)` action (§27 single
 * path — composes addNode + onConnect; preserves the original handles).
 *
 * The picker's "Suggested" list mirrors AddNextPopover: nodes whose first input
 * port is type-compatible with A's output port. No AI recommendation (spec §20).
 *
 * Edge classes (`edge-selected` / `edge-run-payload`) are forwarded so the
 * custom edge inherits the App.css selection + run-payload styling exactly like
 * the default edge. The `+` button is `pointer-events-auto` inside the
 * `EdgeLabelRenderer` (which is pointer-events-none by default).
 *
 * No `.rs` / no IPC / no new persisted state. Pure local picker → store action.
 */

const COMMON_NEXT = ['textTransform', 'aiScript', 'saveArtifact', 'preview'] as const;

export function InsertEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
  source,
  target,
  markerEnd,
  style,
}: EdgeProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Multi-edge spacing (spec §7.3): when two edges share the same (source,
  // target) node pair — e.g. audioCover→soundwaveVisualizer carries BOTH
  // `audio` and `metadata` on separate handles — React Flow v12 draws them on
  // top of each other (getBezierPath routes from node-center tangents and
  // ignores handle identity for vertical separation). Compute this edge's
  // ordinal among the parallel edges (stable sort by id) and offset both
  // endpoints perpendicular to the connection axis so the curves fan apart.
  // For the common horizontal Left→Right / Right→Left routing, the perpendicular
  // axis is Y, so we shift sourceY/targetY. Offset sign alternates around 0 so a
  // pair straddles the original line rather than both shifting one way.
  const parallelOffset = useWorkflowStore((s) => {
    const peers = s.edges.filter(
      (e) => e.source === source && e.target === target,
    );
    if (peers.length <= 1) return 0;
    // Stable ascending order by id; this edge's index sets its lane.
    const sorted = [...peers].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const idx = sorted.findIndex((e) => e.id === id);
    if (idx < 0) return 0;
    // Even count: lanes −n/2 … +n/2 (symmetric, no centre lane).
    // Odd count: lanes −(n−1)/2 … +(n−1)/2 (centre lane stays on the line).
    const n = sorted.length;
    const lane = idx - (n - 1) / 2;
    return lane * 22; // 22px lane gap — readable separation, won't clip cards.
  });

  const shiftedSourceY = sourceY + parallelOffset;
  const shiftedTargetY = targetY + parallelOffset;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY: shiftedSourceY,
    sourcePosition,
    targetX,
    targetY: shiftedTargetY,
    targetPosition,
  });

  // A's output port type, for the "Suggested" group (mirror AddNextPopover).
  const sourceOutType = useWorkflowStore((s) => {
    const node = s.nodes.find((n) => n.id === source);
    if (!node?.type) return 'any';
    const def = NODE_DEFINITIONS.find((d) => d.type === node.type);
    return def?.ports.out[0]?.type ?? 'any';
  });

  const suggested = useMemo<NodeDefinition[]>(() => {
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
  }, [sourceOutType]);

  const onPick = (type: string) => {
    useWorkflowStore.getState().insertNodeBetween(id, type);
    setPickerOpen(false);
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
        )}
      >
        <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{def.label}</span>
        <span className="text-[10px] text-text-muted">{def.category}</span>
      </Command.Item>
    );
  };

  return (
    <>
      {/* The path itself. RF applies the edge's `className` (edge-selected /
          edge-run-payload, set in WorkflowCanvas.styledEdges) to the edge's
          wrapper <g> automatically — so App.css selection / run-payload styling
          still applies to the custom edge without us forwarding it. */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          // Generous invisible hit zone centered on the path midpoint so the
          // `+` reveals on hover even when the pointer isn't exactly on the
          // (opacity:0) button — a chicken-and-egg otherwise. 40×40 with
          // negative margins keeps it centered on (labelX,labelY).
          // pointer-events-auto re-enables interaction (EdgeLabelRenderer is
          // pointer-events-none by default).
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          className="pointer-events-auto absolute flex items-center justify-center"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            width: 40,
            height: 40,
          }}
        >
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Insert node between"
                title="Insert node between"
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-surface-elevated text-text-secondary shadow-popover transition-opacity',
                  'hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  hovered || pickerOpen ? 'opacity-100' : 'opacity-0',
                )}
              >
                <Plus size={12} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" sideOffset={6} className="w-[280px] p-0">
              <Command label="Insert node between">
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
        </div>
      </EdgeLabelRenderer>
    </>
  );
}