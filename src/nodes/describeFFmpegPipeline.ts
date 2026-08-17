/**
 * `describeFFmpegPipeline` — a READ-ONLY TypeScript module that reproduces, for
 * DISPLAY, the exact FFmpeg CLI the Rust `soundwaveVisualizer` executor will
 * invoke at render time. It mirrors `src-tauri/src/workflow/nodes/soundwave_
 * visualizer.rs` (`build_args` + `build_filtergraph` + `rebuild_with_opacity` +
 * `accent_to_hex` + `accent_to_rgb` + `output_dims` + `win_size` + `overlay_x/y`)
 * field-for-field and token-for-token, so the UI can show users the precise
 * command their graph compiles to BEFORE (or instead of) running it.
 *
 * IT DOES NOT EXECUTE. The Tauri webview cannot spawn OS processes; the
 * authoritative execution stays in Rust (`controller.run()` → `start_run`).
 * This module never calls `invoke()` (single-writer IPC rule). It is pure
 * derivation over node data — a documentation/diagnostics surface, not a
 * second execution path. Keeping a single source of truth (Rust) avoids the
 * classic two-implementations-drift trap; if this describer ever disagrees with
 * Rust, Rust is correct and THIS is the bug.
 *
 * Fidelity notes (the load-bearing details):
 *  - Integer math: Rust uses `u32` with integer division and `saturating_sub`.
 *    We replicate with `Math.floor(a/b)` and `Math.max(0, a-b)`.
 *  - Float formatting: Rust `format!("{}", f64)` emits the shortest string that
 *    round-trips, dropping a trailing `.0` for integral floats (1.0 → "1").
 *    JS `String(n)` follows the same IEEE-754 shortest-round-trip rule and also
 *    drops `.0`, so the two agree byte-for-byte for the same f64 bits. We use
 *    `String(n)` directly — no `toFixed`, no rounding.
 *  - `colorAccent` must start with `#` or it is ignored (falls back to default),
 *    matching Rust's `.filter(|v| v.starts_with('#'))`.
 *  - `opacity < 1.0` (the default 0.85!) triggers the rgba + colorchannelmixer
 *    rebuild, and the overlay gains `:format=auto`.
 *  - `background_mode` selects `-loop 1` (image) vs `-stream_loop -1` (video).
 */

import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/store/workflowStore';
import {
  asAudioCoverData,
  asBackgroundMediaData,
  asPreviewExportData,
  asSoundwaveVisualizerData,
  YOUTUBE_NODE_TYPES,
  type BackgroundMode,
  type FitMode,
  type VisualizerPosition,
  type VisualizerType,
} from '@/nodes/youtubeNodeData';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** A resolved view of the 4-node pipeline, walked from the graph edges. */
export interface ResolvedYouTubePipeline {
  audioCover: { nodeId: string; audioPath: string; coverPath: string };
  background: {
    nodeId: string;
    mode: BackgroundMode;
    /** The background input file the visualizer will use (cover image, or the
     *  loop video). Empty when not connected / not picked — surfaced honestly. */
    path: string;
  };
  visualizer: ReturnType<typeof asSoundwaveVisualizerData> & { nodeId: string };
  export_: ReturnType<typeof asPreviewExportData> & { nodeId: string };
  /** True only when every required input path is bound. When false, the
   *  describer still emits a command template but flags the missing inputs. */
  ready: boolean;
  /** Human-readable list of what's missing (no fabricated values). */
  missing: string[];
}

export interface FFmpegPipelineDescription {
  /** The full argv vector, in invocation order. Input paths may be empty
   *  placeholders when inputs aren't bound (see `missing`). */
  args: string[];
  /** Just the `-filter_complex` value — handy for the UI to show separately. */
  filterComplex: string;
  /** A single shell-escaped command string (`ffmpeg …`) for display. */
  command: string;
  /** The resolved config that produced this command (for readouts). */
  resolved: ResolvedYouTubePipeline;
  /** Honest caveats: missing inputs, backend-resolved output path, no-re-encode
   *  export, etc. Never empty in a real graph — always states the limits. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers — mirror the Rust functions exactly (see module doc).
// ---------------------------------------------------------------------------

/** Rust `accent_to_hex`: strip leading `#`, require 6 hex digits, else default. */
function accentToHex(accent: string): string {
  const hex = accent.replace(/^#+/, '').toLowerCase();
  if (hex.length === 6 && /^[0-9a-f]{6}$/.test(hex)) return `0x${hex}`;
  return '0x7669de';
}

/** Rust `accent_to_rgb`: per-channel u8/255, else default #7669DE. */
function accentToRgb(accent: string): [number, number, number] {
  const hex = accent.replace(/^#+/, '').toLowerCase();
  if (hex.length === 6 && /^[0-9a-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b];
  }
  return [0.463, 0.412, 0.871];
}

/** Rust `output_dims`: 480→854x480, 720→1280x720, else→1920x1080. */
function outputDims(scaleHeight: number): [number, number] {
  if (scaleHeight === 480) return [854, 480];
  if (scaleHeight === 720) return [1280, 720];
  return [1920, 1080];
}

/** Rust `win_size`: clamp to [16, 65536] (no power-of-two rounding). */
function winSize(count: number): number {
  return Math.min(65536, Math.max(16, Math.round(count)));
}

/** Rust `overlay_x`: (out_w - vis_w) / 2, integer, saturating. */
function overlayX(outW: number, visW: number): string {
  return String(Math.floor(Math.max(0, outW - visW) / 2));
}

/** Rust `overlay_y`: top→margin, center→(out_h-vis_h)/2, else→(out_h-vis_h)-margin. */
function overlayY(
  outH: number,
  visH: number,
  position: VisualizerPosition,
  margin: number,
): string {
  if (position === 'top') return String(margin);
  if (position === 'center')
    return String(Math.floor(Math.max(0, outH - visH) / 2));
  return String(Math.max(0, Math.max(0, outH - visH) - margin));
}

interface FilterParts {
  filterComplex: string;
  bgScale: string;
  visualizerFilter: string;
  x: string;
  y: string;
}

/** Rust `build_filtergraph` — produces the opacity-less graph + its parts. */
function buildFiltergraph(
  visualizerType: VisualizerType,
  accent: string,
  barCount: number,
  sensitivity: number,
  fit: FitMode,
  position: VisualizerPosition,
  [outW, outH]: [number, number],
  fps: number,
): FilterParts {
  const hex = accentToHex(accent);
  // Rectangular visualizers span full width + a quarter height; circular is a
  // square sized to the smaller canvas dimension / 3 (min 200) so it stays round.
  let visW: number;
  let visH: number;
  if (visualizerType === 'circularSpectrum') {
    const side = Math.max(200, Math.floor(Math.min(outW, outH) / 3));
    visW = side;
    visH = side;
  } else {
    visW = outW;
    visH = Math.max(120, Math.floor(outH / 4));
  }
  const margin = Math.floor(outH / 24);

  const bgScale =
    fit === 'contain'
      ? `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black`
      : fit === 'stretch'
        ? `scale=${outW}:${outH}`
        : `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;

  const visualizerFilter =
    visualizerType === 'waveform'
      ? `showwaves=s=${visW}x${visH}:mode=cline:rate=${fps}:colors=${hex}`
      : visualizerType === 'circularSpectrum'
        ? (() => {
            const [r, g, b] = accentToRgb(accent);
            return `avectorscope=s=${visW}x${visH}:rate=${fps}:rc=${r}:gc=${g}:bc=${b}:zoom=0.5`;
          })()
        : `showfreqs=s=${visW}x${visH}:mode=bar:colors=${hex}:win_size=${winSize(barCount)}`;

  const x = overlayX(outW, visW);
  const y = overlayY(outH, visH, position, margin);

  const filterComplex =
    `[1:a]volume=${sensitivity}[a];` +
    `[a]${visualizerFilter}[vis];` +
    `[0:v]${bgScale},setsar=1,fps=${fps}[bg];` +
    `[bg][vis]overlay=${x}:${y}[v]`;

  return { filterComplex, bgScale, visualizerFilter, x, y };
}

/** Rust `rebuild_with_opacity` — rewrites the graph tail with alpha + format=auto. */
function buildFiltergraphWithOpacity(
  visualizerType: VisualizerType,
  accent: string,
  barCount: number,
  sensitivity: number,
  fit: FitMode,
  position: VisualizerPosition,
  [outW, outH]: [number, number],
  fps: number,
  opacity: number,
): string {
  const base = buildFiltergraph(
    visualizerType,
    accent,
    barCount,
    sensitivity,
    fit,
    position,
    [outW, outH],
    fps,
  );
  return (
    `[1:a]volume=${sensitivity}[a];` +
    `[a]${base.visualizerFilter},format=rgba,colorchannelmixer=aa=${opacity}[vis];` +
    `[0:v]${base.bgScale},setsar=1,fps=${fps}[bg];` +
    `[bg][vis]overlay=${base.x}:${base.y}:format=auto[v]`
  );
}

// ---------------------------------------------------------------------------
// Graph resolution — walk edges to build the resolved pipeline view.
// ---------------------------------------------------------------------------

function findNodeByType(nodes: AppNode[], type: string): AppNode | undefined {
  return nodes.find((n) => n.type === type);
}

/**
 * Resolve the 4-node YouTube pipeline from the graph. Walks edges to bind
 * audioCover → (backgroundMedia, soundwaveVisualizer) → previewExport, reads
 * each node's typed data, and determines the background path (cover image in
 * `image` mode, or the loop video in `video` mode). Never fabricates paths.
 */
export function resolveYouTubePipeline(
  nodes: AppNode[],
  edges: Edge[],
): ResolvedYouTubePipeline {
  const audioCover = findNodeByType(nodes, YOUTUBE_NODE_TYPES.audioCover);
  const backgroundMedia = findNodeByType(
    nodes,
    YOUTUBE_NODE_TYPES.backgroundMedia,
  );
  const visualizer = findNodeByType(
    nodes,
    YOUTUBE_NODE_TYPES.soundwaveVisualizer,
  );
  const exportNode = findNodeByType(nodes, YOUTUBE_NODE_TYPES.previewExport);

  const audioCoverData = audioCover ? asAudioCoverData(audioCover) : null;
  const bgData = backgroundMedia ? asBackgroundMediaData(backgroundMedia) : null;
  const visData = visualizer ? asSoundwaveVisualizerData(visualizer) : null;
  const exportData = exportNode ? asPreviewExportData(exportNode) : null;

  // Find the cover feeding backgroundMedia (image mode uses it as background).
  let coverPath = audioCoverData?.coverPath ?? '';
  if (backgroundMedia && audioCover) {
    const coverEdge = edges.find(
      (e) =>
        e.target === backgroundMedia.id && e.targetHandle === 'cover',
    );
    if (coverEdge) {
      const src = nodes.find((n) => n.id === coverEdge.source);
      if (src) coverPath = asAudioCoverData(src).coverPath;
    }
  }

  const mode: BackgroundMode = bgData?.mode ?? 'image';
  const backgroundPath =
    mode === 'video' ? (bgData?.videoPath ?? '') : coverPath;

  const missing: string[] = [];
  if (!audioCoverData?.audioPath) missing.push('Audio & Cover: no audio file selected');
  if (mode === 'image' && !backgroundPath)
    missing.push('Background Media (image): no cover image connected');
  if (mode === 'video' && !backgroundPath)
    missing.push('Background Media (video): no loop video selected');
  if (!visualizer) missing.push('Soundwave Visualizer node missing');
  if (!exportNode) missing.push('Preview & Export node missing');
  const ready = missing.length === 0;

  return {
    audioCover: {
      nodeId: audioCover?.id ?? '',
      audioPath: audioCoverData?.audioPath ?? '',
      coverPath,
    },
    background: {
      nodeId: backgroundMedia?.id ?? '',
      mode,
      path: backgroundPath,
    },
    visualizer: {
      nodeId: visualizer?.id ?? '',
      ...(visData ?? asSoundwaveVisualizerData(emptyVisualizerNode())),
    },
    export_: {
      nodeId: exportNode?.id ?? '',
      ...(exportData ?? asPreviewExportData(emptyExportNode())),
    },
    ready,
    missing,
  };
}

function emptyVisualizerNode(): AppNode {
  return {
    id: '',
    type: YOUTUBE_NODE_TYPES.soundwaveVisualizer,
    position: { x: 0, y: 0 },
    data: { label: '' },
  };
}
function emptyExportNode(): AppNode {
  return {
    id: '',
    type: YOUTUBE_NODE_TYPES.previewExport,
    position: { x: 0, y: 0 },
    data: { label: '' },
  };
}

// ---------------------------------------------------------------------------
// The describer — mirrors Rust `build_args` arg-vector assembly.
// ---------------------------------------------------------------------------

/**
 * Build the FFmpeg argv the Rust executor would invoke, for DISPLAY. This is
 * the read-only counterpart to `soundwave_visualizer.rs::build_args`. It does
 * not run anything. Pass the resolved pipeline from `resolveYouTubePipeline`.
 */
export function describeFFmpegPipeline(
  resolved: ResolvedYouTubePipeline,
): FFmpegPipelineDescription {
  const notes: string[] = [];
  for (const m of resolved.missing) notes.push(`Missing input: ${m}`);

  const v = resolved.visualizer;
  const fps = Number(v.fps ?? '30');
  const scaleHeight = Number(v.scaleHeight ?? '1080');
  const dims = outputDims(scaleHeight);
  const fit = v.fit ?? 'cover';
  const opacity = v.opacity;

  const filterComplex =
    opacity < 1.0
      ? buildFiltergraphWithOpacity(
          v.visualizerType,
          v.colorAccent,
          v.barCount,
          v.sensitivity,
          fit,
          v.position,
          dims,
          fps,
          opacity,
        )
      : buildFiltergraph(
          v.visualizerType,
          v.colorAccent,
          v.barCount,
          v.sensitivity,
          fit,
          v.position,
          dims,
          fps,
        ).filterComplex;

  // --- Assemble argv in Rust's exact order ---
  const args: string[] = ['-y'];
  // Input 0: background. image → -loop 1 ; video → -stream_loop -1.
  if (resolved.background.mode === 'image') {
    args.push('-loop', '1');
  } else {
    args.push('-stream_loop', '-1');
  }
  args.push('-i', resolved.background.path || '<background not connected>');
  // Input 1: audio.
  args.push('-i', resolved.audioCover.audioPath || '<audio not connected>');

  args.push('-filter_complex', filterComplex, '-map', '[v]', '-map', '1:a');

  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
  );

  // Output path: previewExport copies to outputDir/filename or the backend
  // run folder. The run folder is backend-resolved (a temp dir + run id), so we
  // surface it as a placeholder token rather than inventing a path.
  const outputBase = resolved.export_.filename || 'visualizer.mp4';
  const output =
    resolved.export_.outputDir.trim().length > 0
      ? `${resolved.export_.outputDir.replace(/[\\/]+$/, '')}/${outputBase}`
      : `<run output folder>/${outputBase}`;
  args.push(output);
  notes.push(
    resolved.export_.outputDir.trim().length > 0
      ? `Output path resolved from the export node's outputDir.`
      : `Output path is backend-resolved (run folder + ${outputBase}); set the export node's outputDir to pin it.`,
  );

  // Honest caveat: previewExport currently copies (no re-encode), so codec/fps
  // here describe the UPSTREAM render, not a re-encode step.
  notes.push(
    'The export node copies the rendered video (no re-encode): codec/fps are baked by the visualizer render, not re-applied on export.',
  );
  if (resolved.export_.videoCodec === 'h265') {
    notes.push(
      'videoCodec=h265 diverges from the actual h264 render — the Rust executor surfaces this as a warning (re-encode-on-export is a roadmap item).',
    );
  }
  if (opacity < 1.0) {
    notes.push(
      `opacity=${opacity} < 1.0 → visualizer chain gains format=rgba,colorchannelmixer=aa=${opacity}; overlay uses format=auto.`,
    );
  }

  const command = `ffmpeg ${args.map(shellQuote).join(' ')}`;
  return { args, filterComplex, command, resolved, notes };
}

/** Minimal shell-quoting for display only (not used for execution). */
function shellQuote(arg: string): string {
  if (arg === '' || /[\s"'\\<>|&;(){}$`!*?#~]/.test(arg)) {
    return `"${arg.replace(/([\\"])/g, '\\$1')}"`;
  }
  return arg;
}

// ---------------------------------------------------------------------------
// Convenience: full graph → description in one call (`generateFFmpegPipeline`
// equivalent). Accepts the store's nodes/edges directly.
// ---------------------------------------------------------------------------

export interface WorkflowStateLike {
  nodes: AppNode[];
  edges: Edge[];
}

/** Graph-in, description-out — the `generateFFmpegPipeline(workflowState)`
 *  entry point. Resolves the 4-node chain then describes the FFmpeg CLI.
 *  Read-only; never executes; never calls `invoke()`. */
export function describeYouTubePipeline(
  state: WorkflowStateLike,
): FFmpegPipelineDescription {
  return describeFFmpegPipeline(resolveYouTubePipeline(state.nodes, state.edges));
}