import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP } from '@/nodes/registry';
import sharedContract from '../../contracts/node-runtime-contract.json';

export const WORKFLOW_SCHEMA_VERSION = 2 as const;

// Fail fast during frontend startup/build if visual ports drift from the
// backend contract fixture. Rust runs the reciprocal assertion in unit tests.
for (const [type, expected] of Object.entries(sharedContract)) {
  const definition = NODE_DEFINITION_MAP[type];
  if (!definition) throw new Error(`Runtime contract references unknown node type: ${type}`);
  const inputs = Object.fromEntries(definition.ports.in.map((port) => [port.id, port.type]));
  const outputs = Object.fromEntries(definition.ports.out.map((port) => [port.id, port.type]));
  const requiredInputs = definition.ports.in.filter((port) => port.required).map((port) => port.id);
  if (
    definition.version !== expected.version
    || definition.executionMode !== expected.executionMode
    || JSON.stringify(inputs) !== JSON.stringify(expected.inputs)
    || JSON.stringify(outputs) !== JSON.stringify(expected.outputs)
    || JSON.stringify(requiredInputs) !== JSON.stringify(expected.requiredInputs)
  ) {
    throw new Error(`Frontend runtime contract mismatch for node type: ${type}`);
  }
}

export type NodeValue =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'json'; value: unknown }
  | { kind: 'file'; value: FileRef }
  | { kind: 'media' | 'audio' | 'video'; value: MediaRef }
  | { kind: 'artifact'; value: ArtifactRef }
  | { kind: 'any'; value: unknown };

export interface FileRef {
  path: string;
  name: string;
  size: number;
  mime: string | null;
}

export interface MediaRef {
  path: string;
  mime: string | null;
  metadata: unknown;
}

export interface ArtifactRef {
  id: string;
  kind: string;
  path: string;
  mime: string | null;
  size: number;
  metadata: unknown;
  createdByNode: string;
}

export interface NodeExecutionResult {
  outputs: Record<string, NodeValue>;
  artifacts: ArtifactRef[];
  metadata: unknown;
  warnings: string[];
  durationMs: number;
}

export interface WorkflowGraphV2 {
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export function serializeWorkflowGraph(nodes: AppNode[], edges: Edge[]): WorkflowGraphV2 {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      version: NODE_DEFINITION_MAP[node.type ?? '']?.version ?? 1,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}
