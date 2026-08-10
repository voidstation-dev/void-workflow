import { Handle, Position, useHandleConnections, type HandleType } from '@xyflow/react';
import type { Port } from '@/nodes/registry';
import { getPortIcon } from '@/components/shell/icons';
import { cn } from '@/lib/utils';

/**
 * PortHandle — typed-port Handle (plan §13, spec §7.3, DS §10).
 *
 * Type is communicated via SHAPE (primary) + small ICON (primary) + LABEL on
 * hover/focus (11px text-muted) + native TOOLTIP + COLOR (secondary). Color is
 * reinforcement, never the sole cue (DS §10.3). Shape: circle (Text/Number/
 * Boolean/Json/Any) vs square (File/Media/Audio/Video/Artifact). Input ports on
 * the LEFT edge, output ports on the RIGHT edge (spec §7.3). The `Any` family
 * uses a DASHED outline (DS §10.4). Port type comes from the registry, NOT from
 * edges.
 *
 * Connected handle = solid fill (port color 100%); empty = 40% opacity outline
 * (DS §10.4 connected-state cue). Keyboard-focusable (tabindex=0, role=button)
 * for the §10.5 keyboard-connect contract (the actual connect flow lives in
 * useKeyboardConnect; this Handle just needs to be focusable + labelled).
 */
export interface PortHandleProps {
  port: Port;
  /** 'in' renders a target Handle on the LEFT; 'out' a source Handle on the RIGHT. */
  direction: 'in' | 'out';
  /** Whether the owning node is selected (drives label visibility). */
  nodeSelected: boolean;
  /** Whether the owning node is hovered (drives label visibility). */
  nodeHovered: boolean;
  /** Used by useHandleConnections to resolve this specific handle's edges. */
  nodeId: string;
}

const CIRCLE_TYPES = new Set(['text', 'number', 'boolean', 'json', 'any']);

export function PortHandle({ port, direction, nodeSelected, nodeHovered, nodeId }: PortHandleProps) {
  const Icon = getPortIcon(port.type);
  const isCircle = CIRCLE_TYPES.has(port.type);
  const isAny = port.type === 'any';
  const kind: HandleType = direction === 'in' ? 'target' : 'source';
  const position = direction === 'in' ? Position.Left : Position.Right;
  const showLabel = nodeSelected || nodeHovered;
  const portColor = `var(--port-${port.type})`;

  // useHandleConnections returns the connections on THIS handle (by id). RF
  // keeps it reactive — the fill flips to solid the moment an edge attaches.
  const connections = useHandleConnections({ type: kind, id: port.id, nodeId });
  const connected = connections.length > 0;

  const tooltip = `${direction === 'in' ? 'Input' : 'Output'} port: ${port.type} · ${port.label}`;

  return (
    <div className="react-flow__handle-dot group/port relative" title={tooltip}>
      <Handle
        type={kind}
        position={position}
        id={port.id}
        role="button"
        tabIndex={0}
        aria-label={tooltip}
        style={{
          backgroundColor: connected ? portColor : 'transparent',
          borderColor: portColor,
          borderWidth: '1.5px',
          borderStyle: isAny ? 'dashed' : 'solid',
          opacity: connected ? 1 : 0.4,
        }}
        className={cn(
          // 10px handle, shape via radius, 1.5px ring already inline above.
          '!h-2.5 !w-2.5',
          isCircle ? '!rounded-full' : '!rounded-control',
          // Keep the handle hit target comfortable while the visual stays 10px.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
        )}
      />
      {/* Centered 8px family icon over the handle. Hidden when not connected so
          empty ports read as low-visual-weight (DS §10.3 "untyped-ish"). */}
      {connected && (
        <Icon
          size={8}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-text-on-accent"
          aria-hidden="true"
          style={{ color: portColor }}
        />
      )}
      {showLabel && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] text-text-muted',
            direction === 'in' ? 'left-3' : 'right-3',
          )}
          aria-hidden="true"
        >
          {port.label}
        </span>
      )}
      {/* nodeId is referenced so RF re-scopes connections if a node id changes;
          also keeps the prop "used" under noUnusedParameters. */}
      <span className="sr-only" aria-hidden="true">{nodeId}</span>
    </div>
  );
}