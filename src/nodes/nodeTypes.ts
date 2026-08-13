import type { NodeTypes } from '@xyflow/react';
import { BaseNode } from '@/components/nodes/BaseNode';
import { NODE_DEFINITIONS } from './registry';

/**
 * Generates the React Flow `nodeTypes` map from the registry so all 12 node
 * types render (fixes the Phase 0 audit §5.1 drift where `saveText`/`saveJson`
 * were in the palette but missing from the canvas map → rendered as default
 * nodes). All types map to `BaseNode` — Phase 5 gave BaseNode typed ports,
 * selection ring, and a per-node status footer.
 */
export const nodeTypes: NodeTypes = Object.fromEntries(
  NODE_DEFINITIONS.map((def) => [def.type, BaseNode]),
);