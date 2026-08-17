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

export interface ValidationProblem {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  title: string;
  message: string;
  hint: string | null;
  nodeId: string | null;
  edgeId: string | null;
}

export interface ValidationReport {
  valid: boolean;
  problems: ValidationProblem[];
}

export interface AppErrorPayload {
  code: string;
  title: string;
  message: string;
  hint: string | null;
  details: unknown;
  retryable: boolean;
}

export interface RuntimeSettings {
  outputDirectory: string;
  ffmpegPath: string;
  ffprobePath: string;
  concurrency: number;
}

/**
 * Edit-time audio metadata mirror of the Rust `AudioMetadata` struct
 * (`runtime::media::AudioMetadata`). Returned by the `probe_audio_metadata`
 * Tauri command for the Audio & Cover node's inline body renderer. Stored on
 * `node.data` (durationMs / sampleRate / audioCodec / channels) so the
 * downstream Soundwave Visualizer reads it through the edit-time data
 * propagation selector without a run.
 */
export interface AudioMetadata {
  durationMs: number;
  sampleRate: number;
  audioCodec: string;
  channels: number;
  bitRate: number | null;
}

export interface HealthProbe {
  state: 'ready' | 'configured' | 'degraded' | 'down' | 'unknown';
  detail: string;
}

export interface EnvironmentHealth {
  backend: HealthProbe;
  sqlite: HealthProbe;
  storage: HealthProbe;
  ffmpeg: HealthProbe;
  ffprobe: HealthProbe;
  gemini: HealthProbe;
}

export function normalizeAppError(error: unknown): AppErrorPayload {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = error as Partial<AppErrorPayload>;
    return {
      code: typeof value.code === 'string' ? value.code : 'UNKNOWN_ERROR',
      title: typeof value.title === 'string' ? value.title : 'Operation failed',
      message: typeof value.message === 'string' ? value.message : 'An unknown error occurred.',
      hint: typeof value.hint === 'string' ? value.hint : null,
      details: value.details ?? null,
      retryable: value.retryable === true,
    };
  }
  const message = String(error);
  return { code: 'UNKNOWN_ERROR', title: 'Operation failed', message, hint: null, details: null, retryable: false };
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
