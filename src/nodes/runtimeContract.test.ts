import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { NODE_DEFINITION_MAP } from './registry';
import { NODE_DEFINITIONS } from './registry';
import { isTypeCompatible } from './portCompat';
import { normalizeAppError, serializeWorkflowGraph, WORKFLOW_SCHEMA_VERSION } from './runtimeContract';
import { deriveProblems, type WorkflowState } from '@/store/workflowStore';

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
    // The 34 "design-only" planned nodes drift freely during design — never
    // executable, always maturity 'design-only'. Excludes the 4 YouTube-
    // automation nodes (audioCover/backgroundMedia/soundwaveVisualizer/
    // previewExport) which are now 'runtime' + 'canonical' + 'beta' with
    // frozen contracts, inline body renderers, AND Rust executors — a distinct,
    // contract-asserted, executable category.
    const designOnly = NODE_DEFINITIONS.filter(
      (definition) => definition.executionMode === 'planned' && definition.maturity === 'design-only',
    );
    expect(designOnly).toHaveLength(34);
    expect(designOnly.every((definition) => !definition.executable)).toBe(true);
  });

  it('registers the YouTube-automation pipeline as runtime + canonical + beta with frozen contracts', () => {
    const pipeline = ['audioCover', 'backgroundMedia', 'soundwaveVisualizer', 'previewExport']
      .map((type) => NODE_DEFINITION_MAP[type])
      .filter((d): d is NonNullable<typeof d> => Boolean(d));
    expect(pipeline).toHaveLength(4);
    // Phase 2 flipped these to full runtime nodes — executable, canonical, with
    // Rust executors backing them. Still 'beta' (newer than the stable core).
    expect(pipeline.every((d) => d.executionMode === 'runtime' && d.maturity === 'beta' && d.executable)).toBe(true);
    expect(pipeline.every((d) => d.registryState === 'canonical' && d.bodyRenderer)).toBe(true);
    // All four carry a v2 contract version so they serialize + migrate at v2.
    expect(pipeline.every((d) => d.version === 2)).toBe(true);
  });

  it('allows file and artifact references to feed typed media ports', () => {
    expect(isTypeCompatible('file', 'video')).toBe(true);
    expect(isTypeCompatible('artifact', 'audio')).toBe(true);
    expect(isTypeCompatible('text', 'video')).toBe(false);
  });
});

// deriveProblems is a pure function over { nodes } — build a minimal fake state
// with just the node fields it reads (id/type/data). The full WorkflowState is
// not needed; we cast the partial since the function never touches other slices.
function problemsState(nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>) {
  return { nodes } as unknown as WorkflowState;
}

describe('deriveProblems — required-value warnings', () => {
  it('warns when an audioCover node has an empty audioPath', () => {
    const problems = deriveProblems(problemsState([
      { id: 'ac', type: 'audioCover', data: { label: 'Audio & Cover', audioPath: '' } },
    ]));
    const valueProblem = problems.find((p) => p.code === 'REQUIRED_VALUE_MISSING');
    expect(valueProblem).toBeDefined();
    expect(valueProblem?.severity).toBe('warning');
    expect(valueProblem?.nodeId).toBe('ac');
    expect(valueProblem?.message).toMatch(/Audio file/i);
  });

  it('does not warn when audioCover has a non-empty audioPath', () => {
    const problems = deriveProblems(problemsState([
      { id: 'ac', type: 'audioCover', data: { label: 'Audio & Cover', audioPath: 'C:/tracks/song.mp3' } },
    ]));
    expect(problems.some((p) => p.code === 'REQUIRED_VALUE_MISSING')).toBe(false);
  });

  it('warns on backgroundMedia videoPath only when mode is video', () => {
    // image mode → cover comes from the upstream edge, no videoPath warning.
    const imageProblems = deriveProblems(problemsState([
      { id: 'bg', type: 'backgroundMedia', data: { label: 'Background Media', mode: 'image' } },
    ]));
    expect(imageProblems.some((p) => p.code === 'REQUIRED_VALUE_MISSING')).toBe(false);

    // video mode → videoPath is required, empty → warning.
    const videoProblems = deriveProblems(problemsState([
      { id: 'bg', type: 'backgroundMedia', data: { label: 'Background Media', mode: 'video', videoPath: '' } },
    ]));
    const valueProblem = videoProblems.find((p) => p.code === 'REQUIRED_VALUE_MISSING');
    expect(valueProblem).toBeDefined();
    expect(valueProblem?.nodeId).toBe('bg');
    expect(valueProblem?.message).toMatch(/Loop video/i);

    // video mode + non-empty videoPath → no warning.
    const okVideo = deriveProblems(problemsState([
      { id: 'bg', type: 'backgroundMedia', data: { label: 'Background Media', mode: 'video', videoPath: 'loop.mp4' } },
    ]));
    expect(okVideo.some((p) => p.code === 'REQUIRED_VALUE_MISSING')).toBe(false);
  });

  it('does not emit value problems for nodes without requiredDataFields', () => {
    const problems = deriveProblems(problemsState([
      { id: 'sw', type: 'soundwaveVisualizer', data: { label: 'Soundwave Visualizer' } },
    ]));
    expect(problems.some((p) => p.code === 'REQUIRED_VALUE_MISSING')).toBe(false);
  });

  it('warns when a textInput has empty content', () => {
    const problems = deriveProblems(problemsState([
      { id: 'ti', type: 'textInput', data: { label: 'Text Input', content: '   ' } },
    ]));
    const valueProblem = problems.find((p) => p.code === 'REQUIRED_VALUE_MISSING');
    expect(valueProblem).toBeDefined();
    expect(valueProblem?.nodeId).toBe('ti');
  });
});
