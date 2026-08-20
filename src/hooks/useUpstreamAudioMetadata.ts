import { useMemo } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * Edit-time data propagation for the YouTube-automation pipeline.
 *
 * The runtime contract routes typed values through edges AT RUN TIME (backend
 * DAG). But the inline body renderers need upstream info AT EDIT TIME too —
 * the Soundwave Visualizer card should show the connected Audio & Cover node's
 * probed duration/sample rate, and the Preview & Export card should know
 * whether a video is bound. These hooks walk the React Flow edges in the store
 * to find the source node feeding a given input port and read its `data`.
 *
 * This is read-only derivation over `nodes` + `edges` — it does NOT introduce
 * edge data or mutate the graph. It mirrors the runtime port-keyed lookup
 * (target port id → source node) but resolves from the live editor state. If
 * no upstream is connected, returns null so renderers show honest "not
 * connected" states.
 */

export interface UpstreamAudioMetadata {
  durationMs: number;
  sampleRate: number;
  audioCodec: string;
  channels: number;
  /** Absolute filesystem path of the upstream audio file, when the source node
   *  stored one (Audio & Cover keeps `audioPath`). Used by the live preview
   *  canvas to load the audio into a Web Audio AnalyserNode. Empty when no
   *  path is available. */
  audioPath: string;
}

/**
 * Find the source node feeding `targetPort` on `nodeId` and return its probed
 * audio metadata (durationMs/sampleRate/audioCodec/channels) if it looks like
 * audio metadata. Used by the Soundwave Visualizer body to reflect the
 * connected Audio & Cover node's probe before any run.
 */
export function useUpstreamAudioMetadata(nodeId?: string, targetPort = 'audio'): UpstreamAudioMetadata | null {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  return useMemo(() => {
    if (!nodeId) return null;
    const edge = edges.find((e) => e.target === nodeId && e.targetHandle === targetPort);
    if (!edge) return null;
    const source = nodes.find((n) => n.id === edge.source);
    if (!source?.data) return null;
    const data = source.data as Record<string, unknown>;
    const durationMs = Number(data.durationMs ?? 0);
    const sampleRate = Number(data.sampleRate ?? 0);
    const audioPath = String(data.audioPath ?? '').trim();
    if (!audioPath && durationMs <= 0 && sampleRate <= 0) return null;
    return {
      durationMs,
      sampleRate,
      audioCodec: String(data.audioCodec ?? ''),
      channels: Number(data.channels ?? 0),
      audioPath,
    };
  }, [nodes, edges, nodeId, targetPort]);
}

export interface UpstreamBackground {
  mode: 'image' | 'video';
  backgroundPath: string;
}

/**
 * Find the background media path connected upstream to `nodeId` (via 'background' handle).
 * If mode is 'image', resolves the cover image from upstream Audio & Cover.
 */
export function useUpstreamBackground(nodeId?: string): UpstreamBackground | null {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  return useMemo(() => {
    if (!nodeId) return null;
    const bgEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'background');
    if (!bgEdge) return null;
    const bgNode = nodes.find((n) => n.id === bgEdge.source);
    if (!bgNode?.data) return null;
    const bgData = bgNode.data as Record<string, unknown>;
    const mode = (bgData.mode === 'video' ? 'video' : 'image') as 'image' | 'video';
    let backgroundPath = mode === 'video' ? String(bgData.videoPath ?? '').trim() : '';

    if (mode === 'image') {
      const coverEdge = edges.find((e) => e.target === bgNode.id && e.targetHandle === 'cover');
      if (coverEdge) {
        const coverSource = nodes.find((n) => n.id === coverEdge.source);
        if (coverSource?.data) {
          backgroundPath = String((coverSource.data as Record<string, unknown>).coverPath ?? '').trim();
        }
      }
    }

    if (!backgroundPath) return null;
    return { mode, backgroundPath };
  }, [nodes, edges, nodeId]);
}


/**
 * Whether a video is bound to `targetPort` on `nodeId` (an upstream node is
 * connected). Used by the Preview & Export body to toggle the preview
 * placeholder vs "connect a video" state. Returns true when an edge + source
 * node exist; the actual rendered video only exists after a run (Phase 2).
 */
export function useUpstreamVideo(nodeId?: string, targetPort = 'video'): boolean {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  return useMemo(() => {
    if (!nodeId) return false;
    const edge = edges.find((e) => e.target === nodeId && e.targetHandle === targetPort);
    if (!edge) return false;
    return nodes.some((n) => n.id === edge.source);
  }, [edges, nodes, nodeId, targetPort]);
}

/**
 * Resolve the visualizer config + audio path feeding a node's `video` port, by
 * walking edges to the upstream `soundwaveVisualizer` and then to its audio
 * source (`audioCover`). Used by the Preview & Export live-preview canvas so it
 * can render the SAME visualizer type / bar count / accent / sensitivity the
 * Rust executor will bake into the MP4, against the SAME audio file.
 *
 * Returns null when no visualizer or no audio is connected upstream — the
 * caller then shows its honest "connect a video" placeholder. Read-only
 * derivation over `nodes` + `edges`; no graph mutation.
 */
export interface UpstreamVisualizerConfig {
  visualizerType: 'frequencyBars' | 'waveform' | 'circularSpectrum';
  barCount: number;
  colorAccent: string;
  sensitivity: number;
  position: 'bottom' | 'center' | 'top';
  opacity: number;
  /** Audio file path from the furthest upstream `audioCover` node. Empty when
   *  the audio source has no selected path (the live canvas can't play). */
  audioPath: string;
  /** Background file path from upstream `backgroundMedia` node if connected. */
  backgroundPath: string;
}

export function useUpstreamVisualizerConfig(nodeId?: string): UpstreamVisualizerConfig | null {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  return useMemo(() => {
    if (!nodeId) return null;
    // Step 1: video edge → source node.
    const videoEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'video');
    if (!videoEdge) return null;
    const visualizerNode = nodes.find((n) => n.id === videoEdge.source);
    if (!visualizerNode || visualizerNode.type !== 'soundwaveVisualizer') return null;
    const vd = (visualizerNode.data ?? {}) as Record<string, unknown>;
    const visualizerType = String(vd.visualizerType ?? 'frequencyBars');
    if (visualizerType !== 'frequencyBars' && visualizerType !== 'waveform' && visualizerType !== 'circularSpectrum') {
      return null;
    }
    // Step 2: visualizer's `audio` edge → audioCover source node for the path.
    const audioEdge = edges.find(
      (e) => e.target === visualizerNode.id && e.targetHandle === 'audio',
    );
    const audioCoverNode = audioEdge ? nodes.find((n) => n.id === audioEdge.source) : null;
    const audioPath = audioCoverNode
      ? String((audioCoverNode.data as Record<string, unknown> | undefined)?.audioPath ?? '').trim()
      : '';

    // Step 3: visualizer's `background` edge → backgroundMedia node.
    let backgroundPath = '';
    const bgEdge = edges.find(
      (e) => e.target === visualizerNode.id && e.targetHandle === 'background',
    );
    if (bgEdge) {
      const bgNode = nodes.find((n) => n.id === bgEdge.source);
      if (bgNode?.data) {
        const bgData = bgNode.data as Record<string, unknown>;
        if (bgData.mode === 'video') {
          backgroundPath = String(bgData.videoPath ?? '').trim();
        } else {
          const coverEdge = edges.find((e) => e.target === bgNode.id && e.targetHandle === 'cover');
          if (coverEdge) {
            const coverSource = nodes.find((n) => n.id === coverEdge.source);
            if (coverSource?.data) {
              backgroundPath = String((coverSource.data as Record<string, unknown>).coverPath ?? '').trim();
            }
          }
        }
      }
    }

    const position = (String(vd.position ?? 'bottom') as 'bottom' | 'center' | 'top') || 'bottom';
    const opacity = typeof vd.opacity === 'number' ? vd.opacity : 0.85;

    return {
      visualizerType,
      barCount: Number(vd.barCount ?? 48),
      colorAccent: String(vd.colorAccent ?? '#7669DE'),
      sensitivity: Number(vd.sensitivity ?? 1),
      position,
      opacity,
      audioPath,
      backgroundPath,
    };
  }, [nodes, edges, nodeId]);
}