/**
 * Default template preset for the YouTube visualizer pipeline — a complete,
 * importable 4-node graph wired exactly as the runtime contract expects.
 *
 * This is a TEMPLATE: the nodes carry their real configSchema defaults
 * (visualizer style, bar count, accent, fit, scaleHeight, fps, filename…)
 * but the FILE PATHS are intentionally EMPTY until the user binds real media.
 * We do NOT fabricate a track duration, a cover path, or a loop video — doing
 * so would violate the project's no-fabricated-values rule (body renderers +
 * the Rust executors surface honest "not connected / unknown until probed"
 * states, and faking e.g. `durationMs: 180000` would mislead the UI into
 * showing 180.0s for a file that doesn't exist). The user drops in their own
 * audio + cover after loading the template; the probe + render then report
 * real numbers.
 *
 * Wiring (handle ids mirror the registry port ids verbatim):
 *   audioCover.audio       → soundwaveVisualizer.audio
 *   audioCover.metadata    → soundwaveVisualizer.metadata
 *   audioCover.cover       → backgroundMedia.cover
 *   backgroundMedia.background → soundwaveVisualizer.background
 *   soundwaveVisualizer.video  → previewExport.video
 *
 * The result is loadable directly into the React Flow store via
 * `replaceGraph(template.nodes, template.edges)` (GraphSlice). Positions form a
 * left-to-right reading flow; spacing keeps the cards uncrowded.
 *
 * No `invoke()` — this is a plain data module.
 */

import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/store/workflowStore';
import { YOUTUBE_NODE_TYPES } from '@/nodes/youtubeNodeData';

export interface YouTubeTemplatePreset {
  nodes: AppNode[];
  edges: Edge[];
  /** Human label for template galleries / the empty-state picker. */
  name: string;
  description: string;
}

// Stable ids so the template can be re-applied deterministically (and edges can
// reference them by literal). When inserted into a live graph that already has
// these ids, the store should remap — but for a fresh/empty canvas these are fine.
const NODE_IDS = {
  audioCover: 'yt-template-audio-cover',
  background: 'yt-template-background',
  visualizer: 'yt-template-visualizer',
  export: 'yt-template-preview-export',
} as const;

/**
 * The default 4-node YouTube visualizer pipeline. Load with:
 *   const t = youtubeVisualizerTemplate();
 *   store.getState().replaceGraph(t.nodes, t.edges);
 * Returns a FRESH copy each call (deep-cloned via structuredClone) so multiple
 * loads don't share node object identity.
 */
export function youtubeVisualizerTemplate(): YouTubeTemplatePreset {
  const nodes: AppNode[] = [
    {
      id: NODE_IDS.audioCover,
      type: YOUTUBE_NODE_TYPES.audioCover,
      position: { x: 0, y: 240 },
      data: {
        label: 'Audio & Cover',
        // Empty until the user picks real files — no fabricated paths/durations.
        audioPath: '',
        coverPath: '',
      },
    },
    {
      id: NODE_IDS.background,
      type: YOUTUBE_NODE_TYPES.backgroundMedia,
      position: { x: 360, y: 40 },
      data: {
        label: 'Background Media',
        mode: 'image', // image → uses the incoming cover as the background
        videoPath: '', // unused in image mode; empty until mode flips to 'video'
        fit: 'cover',
        scaleHeight: '1080',
      },
    },
    {
      id: NODE_IDS.visualizer,
      type: YOUTUBE_NODE_TYPES.soundwaveVisualizer,
      position: { x: 720, y: 240 },
      data: {
        label: 'Soundwave Visualizer',
        visualizerType: 'frequencyBars', // spec's "bars"
        barCount: 64, // the request's 64 bars (configSchema max is 256; default 48)
        colorAccent: '#7669DE', // project accent; pair with a gradient via the
        // body renderer if desired (single-accent today; a two-color
        // {primary,secondary} scheme is a roadmap item — the Rust filters use
        // one accent color via showfreqs/showwaves/avectorscope).
        sensitivity: 1,
        opacity: 0.85,
        position: 'bottom',
      },
    },
    {
      id: NODE_IDS.export,
      type: YOUTUBE_NODE_TYPES.previewExport,
      position: { x: 1080, y: 240 },
      data: {
        label: 'Preview & Export',
        filename: 'visualizer.mp4',
        outputDir: '', // empty → backend run output folder
        videoCodec: 'h264',
        fps: '60', // the request's 60fps
        overwrite: 'rename',
      },
    },
  ];

  // Edges carry sourceHandle/targetHandle equal to the registry port ids.
  // Animated + moderate z-index so they read clearly over the canvas.
  const baseEdge = {
    animated: true,
    zIndex: 10,
  } as const;

  const edges: Edge[] = [
    {
      ...baseEdge,
      id: 'e-audio-cover→visualizer-audio',
      source: NODE_IDS.audioCover,
      sourceHandle: 'audio',
      target: NODE_IDS.visualizer,
      targetHandle: 'audio',
    },
    {
      ...baseEdge,
      id: 'e-audio-cover→visualizer-metadata',
      source: NODE_IDS.audioCover,
      sourceHandle: 'metadata',
      target: NODE_IDS.visualizer,
      targetHandle: 'metadata',
    },
    {
      ...baseEdge,
      id: 'e-audio-cover→background-cover',
      source: NODE_IDS.audioCover,
      sourceHandle: 'cover',
      target: NODE_IDS.background,
      targetHandle: 'cover',
    },
    {
      ...baseEdge,
      id: 'e-background→visualizer-background',
      source: NODE_IDS.background,
      sourceHandle: 'background',
      target: NODE_IDS.visualizer,
      targetHandle: 'background',
    },
    {
      ...baseEdge,
      id: 'e-visualizer→export-video',
      source: NODE_IDS.visualizer,
      sourceHandle: 'video',
      target: NODE_IDS.export,
      targetHandle: 'video',
    },
  ];

  return {
    name: 'YouTube Visualizer',
    description:
      'Audio + cover → background → audio-reactive visualizer → preview & export. ' +
      'Pick your audio and cover to start; the pipeline renders an MP4 with FFmpeg.',
    nodes: structuredClone(nodes) as AppNode[],
    edges: structuredClone(edges) as Edge[],
  };
}

/**
 * Serialize the template to plain JSON (for a preset gallery, saving to disk,
 * or diffing). Stable shape: nodes then edges. No React Flow internals beyond
 * the standard Node/Edge fields are emitted.
 */
export function youtubeVisualizerTemplateJSON(): string {
  const t = youtubeVisualizerTemplate();
  return JSON.stringify(
    { name: t.name, description: t.description, nodes: t.nodes, edges: t.edges },
    null,
    2,
  );
}