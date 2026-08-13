/**
 * portCompat — typed-port compatibility helpers (plan §13, spec §7.3, DS §10).
 *
 * Backend remains authoritative for validation (plan §13). These helpers are a
 * UI nicety ONLY: they resolve a port's PortType from the registry and decide
 * whether two ports are *visually* compatible. They MUST NOT hard-block a
 * connection the backend would allow — `isValidConnection` keeps the cycle guard
 * as the only hard `return false` gate; a type mismatch is surfaced as a soft
 * advisory via the global announcer + Problems, never a hard rejection.
 */

import { NODE_DEFINITION_MAP, type PortType } from './registry';

/**
 * Resolve the PortType for a (nodeId, handleId, side) triple.
 *
 * @param nodeId  React Flow node id (looked up in the graph by the caller)
 * @param nodeType the node's `type` string (registry key)
 * @param handleId the Handle `id` ('in' / 'out'); may be null on legacy edges
 * @param side    'in' = target handle (read from def.ports.in), 'out' = source (def.ports.out)
 * @returns the PortType, or 'any' if it cannot be resolved (legacy null handle
 *          with no single-port side to fall back to). 'any' is the safe default
 *          because it is compatible with everything — a resolved 'any' never
 *          produces a false type-mismatch advisory.
 */
export function resolvePortType(
  nodeType: string | undefined,
  handleId: string | null | undefined,
  side: 'in' | 'out',
): PortType {
  if (!nodeType) return 'any';
  const def = NODE_DEFINITION_MAP[nodeType];
  if (!def) return 'any';
  const ports = side === 'in' ? def.ports.in : def.ports.out;
  if (handleId) {
    const port = ports.find((p) => p.id === handleId);
    if (port) return port.type;
  }
  // Legacy / pre-normalization edge with a null handle: if the node has exactly
  // one port on this side, fall back to it. Otherwise default to 'any'.
  if (ports.length === 1) return ports[0].type;
  return 'any';
}

/**
 * Two ports are visually compatible if either side is `any`, or they share a
 * type. Pure; used by the soft advisory path (never a hard block).
 */
export function isTypeCompatible(sourceType: PortType, targetType: PortType): boolean {
  if (sourceType === 'any' || targetType === 'any' || sourceType === targetType) return true;
  if (targetType === 'media') {
    return ['file', 'audio', 'video', 'artifact'].includes(sourceType);
  }
  if (targetType === 'video' || targetType === 'audio') {
    return ['file', 'media', 'artifact'].includes(sourceType);
  }
  if (targetType === 'artifact') {
    return ['file', 'media', 'audio', 'video'].includes(sourceType);
  }
  return false;
}
