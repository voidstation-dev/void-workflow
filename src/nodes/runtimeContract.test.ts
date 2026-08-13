import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { NODE_DEFINITION_MAP } from './registry';
import { NODE_DEFINITIONS } from './registry';
import { isTypeCompatible } from './portCompat';
import { normalizeAppError, serializeWorkflowGraph, WORKFLOW_SCHEMA_VERSION } from './runtimeContract';

describe('Runtime Contract V2', () => {
  it('serializes node versions and exact edge handles', () => {
    const nodes = [
      {
        id: 'source',
        type: 'textInput',
        position: { x: 10, y: 20 },
        data: { label: 'Prompt', content: 'hello' },
      },
      {
        id: 'target',
        type: 'textTransform',
        position: { x: 30, y: 40 },
        data: { label: 'Uppercase', operation: 'uppercase' },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge',
        source: 'source',
        sourceHandle: 'text',
        target: 'target',
        targetHandle: 'text',
      },
    ];

    const graph = serializeWorkflowGraph(nodes, edges);
    expect(graph.schemaVersion).toBe(WORKFLOW_SCHEMA_VERSION);
    expect(graph.nodes.map((node) => node.version)).toEqual([2, 2]);
    expect(graph.edges[0]).toMatchObject({ sourceHandle: 'text', targetHandle: 'text' });
  });

  it('keeps annotation and canonical preview execution modes explicit', () => {
    expect(NODE_DEFINITION_MAP.markdownNote.executionMode).toBe('annotation');
    expect(NODE_DEFINITION_MAP.preview.executionMode).toBe('runtime');
    expect(NODE_DEFINITION_MAP.textInput.executionMode).toBe('runtime');
  });

  it('normalizes structured and legacy command errors', () => {
    expect(normalizeAppError({
      code: 'FFMPEG_NOT_FOUND',
      title: 'FFmpeg was not found',
      message: 'Missing executable.',
      hint: 'Configure a path.',
      retryable: false,
    })).toMatchObject({ code: 'FFMPEG_NOT_FOUND', title: 'FFmpeg was not found' });
    expect(normalizeAppError('legacy failure')).toMatchObject({
      code: 'UNKNOWN_ERROR',
      message: 'legacy failure',
    });
  });

  it('marks every future expansion node as design-only and non-executable', () => {
    const planned = NODE_DEFINITIONS.filter((definition) => definition.executionMode === 'planned');
    expect(planned).toHaveLength(34);
    expect(planned.every((definition) => definition.maturity === 'design-only' && !definition.executable)).toBe(true);
  });

  it('allows file and artifact references to feed typed media ports', () => {
    expect(isTypeCompatible('file', 'video')).toBe(true);
    expect(isTypeCompatible('artifact', 'audio')).toBe(true);
    expect(isTypeCompatible('text', 'video')).toBe(false);
  });
});
