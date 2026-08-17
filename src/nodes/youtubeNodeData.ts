/**
 * Data schema & state interfaces for the 4 YouTube-automation nodes.
 *
 * These are the FIRST per-node typed views over the open `AppNodeData` bag
 * (`{ label: string; [key: string]: any }`). They do NOT replace configSchema
 * (which drives the Inspector) — they give downstream code (the template, the
 * read-only FFmpeg pipeline describer, body renderers) a typed projection of
 * what each node's `data` actually carries, mirroring the Rust executors'
 * field reads field-for-field so a TS `describeFFmpegPipeline(...)` can emit the
 * IDENTICAL arg list the Rust `build_args` would.
 *
 * Field names follow the EXISTING runtime contract (not the request spec's
 * names) so nothing here drifts from what the Rust executors + configSchema
 * already read. The request-spec names map as:
 *   spec `bars`/`wave`/`circle`/`spectrum` → contract `frequencyBars`/`waveform`/
 *   `circularSpectrum` (+ `spectrum` is a roadmap item, no 4th style yet)
 *   spec `fill`            → contract `stretch`
 *   spec `thumbnailPath`   → contract `coverPath`
 *   spec resolution string → contract `scaleHeight` (portrait 1080x1920 is a
 *                             roadmap item; today only landscape 480/720/1080)
 *
 * Adding these interfaces does NOT touch the runtime-contract fixture
 * (`contracts/node-runtime-contract.json`), which asserts PORT shape
 * (id/type/version/executionMode) only — never `data` field names. So this is
 * a safe, additive type layer.
 *
 * No `invoke()` here — pure types + narrowing helpers.
 */

import type { AppNode } from '@/store/workflowStore';

// ---------------------------------------------------------------------------
// Node type ids (single source of truth — mirrors the registry + contract).
// ---------------------------------------------------------------------------

export const YOUTUBE_NODE_TYPES = {
  audioCover: 'audioCover',
  backgroundMedia: 'backgroundMedia',
  soundwaveVisualizer: 'soundwaveVisualizer',
  previewExport: 'previewExport',
} as const;

export type YouTubeNodeType =
  (typeof YOUTUBE_NODE_TYPES)[keyof typeof YOUTUBE_NODE_TYPES];

// ---------------------------------------------------------------------------
// Shared primitive enums (the exact string unions the Rust executors accept).
// ---------------------------------------------------------------------------

/** Background media kind. Mirrors `backgroundMedia.mode` configSchema options. */
export type BackgroundMode = 'image' | 'video';

/** Fit policy for the background layer. `stretch` is the spec's `fill`. */
export type FitMode = 'cover' | 'contain' | 'stretch';

/** Output canvas height (landscape 16:9 only today). Portrait is a roadmap item. */
export type ScaleHeight = '480' | '720' | '1080';

/**
 * Visualizer style. The registry/Rust accept exactly these three. The request
 * spec's `spectrum` (a 4th, distinct full-frame spectrum style) is NOT yet
 * implemented — it is tracked as a roadmap item, not silently aliased.
 */
export type VisualizerType = 'frequencyBars' | 'waveform' | 'circularSpectrum';

/** Vertical placement of the visualizer overlay band. */
export type VisualizerPosition = 'top' | 'center' | 'bottom';

export type VideoCodec = 'h264' | 'h265';

export type FrameRate = '24' | '30' | '60';

/** Collision policy for the exported filename. */
export type CollisionPolicy = 'rename' | 'overwrite' | 'skip';

// ---------------------------------------------------------------------------
// Node 1 — Audio & Cover (audioCover)
// ---------------------------------------------------------------------------

/**
 * Audio metadata, probed at edit time by `probe_audio_metadata` (via the
 * controller) and mirrored into `node.data` so body renderers can show real
 * duration/sample-rate BEFORE a run. These fields are NOT user-config — they
 * are runtime-injected and start absent (durationMs=0) until a file is probed.
 * Mirrors `AudioMetadata` in `runtimeContract.ts` + the Rust audioCover output.
 */
export interface AudioMetadata {
  /** Track length in milliseconds. 0 until probed (honest "unknown" state). */
  durationMs: number;
  sampleRate: number;
  audioCodec: string;
  channels: number;
  bitRate: number;
}

export interface AudioCoverData {
  label: string;
  /** Absolute filesystem path to the audio track. Empty until the user picks one. */
  audioPath: string;
  /** Cover / thumbnail image path. Optional (the visualizer can run without it
   *  if a video background is used). Empty until picked. */
  coverPath: string;
  /** Runtime-injected probe results. Absent/zero until `probe_audio_metadata`
   *  runs. Do NOT fabricate — body renderers read these to show honest state. */
  durationMs?: number;
  sampleRate?: number;
  audioCodec?: string;
  channels?: number;
  bitRate?: number;
}

// ---------------------------------------------------------------------------
// Node 2 — Background Media (backgroundMedia)
// ---------------------------------------------------------------------------

export interface BackgroundMediaData {
  label: string;
  mode: BackgroundMode;
  /** Loop video path (used only when mode='video'). Empty until picked. */
  videoPath: string;
  fit: FitMode;
  /** Output canvas height. Determines the 16:9 render dimensions. */
  scaleHeight: ScaleHeight;
  /** Resolved background dimensions, populated after a probe/run. Optional. */
  resolvedBackgroundPath?: string;
  mediaDimensions?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Node 3 — Soundwave Visualizer (soundwaveVisualizer)
// ---------------------------------------------------------------------------

/**
 * Visualizer config. NOTE: `fit`, `fps`, and `scaleHeight` are NOT in the
 * node's configSchema (the Inspector doesn't expose them today) BUT the Rust
 * executor reads them from `node.data` with defaults (cover / 30 / 1080). They
 * are declared optional here so the pipeline describer can read them with the
 * SAME defaults the Rust `build_args` uses, producing an identical CLI. This is
 * a pre-existing schema gap, surfaced honestly rather than papered over.
 */
export interface SoundwaveVisualizerData {
  label: string;
  visualizerType: VisualizerType;
  barCount: number;
  /** Accent colour as `#RRGGBB`. Normalised to `0xRRGGBB` / rc/gc/bc at build. */
  colorAccent: string;
  sensitivity: number;
  opacity: number;
  position: VisualizerPosition;
  // --- read by Rust build_args with defaults; NOT exposed in configSchema yet ---
  /** Background fit. Defaults to `cover` when absent (mirrors Rust). */
  fit?: FitMode;
  /** Frame rate. Defaults to 30 when absent (mirrors Rust). Stored as string. */
  fps?: FrameRate;
  /** Output height. Defaults to `1080` when absent (mirrors Rust). */
  scaleHeight?: ScaleHeight;
}

// ---------------------------------------------------------------------------
// Node 4 — Preview & Export (previewExport)
// ---------------------------------------------------------------------------

/**
 * Export config. IMPORTANT: the Rust `previewExport` executor currently COPIES
 * the upstream rendered video bit-for-bit (no re-encode). So `videoCodec` and
 * `fps` here are INFORMATIONAL for the readout — the actual codec/fps are baked
 * by the upstream `soundwaveVisualizer` render (libx264 / the visualizer's fps).
 * Re-encode-on-export (to honor h265 / a different fps) is a roadmap item; the
 * executor surfaces an honest warning when `videoCodec:h265` diverges from the
 * actual h264 render. `outputDir` selects the export destination; empty → the
 * run's output folder.
 */
export interface PreviewExportData {
  label: string;
  filename: string;
  /** Export destination directory. Empty → run output folder (backend default). */
  outputDir: string;
  videoCodec: VideoCodec;
  fps: FrameRate;
  overwrite: CollisionPolicy;
}

// ---------------------------------------------------------------------------
// Live preview / run state (Node 4) — UI-only, not persisted, not in configSchema.
// ---------------------------------------------------------------------------

/** Playback state for the in-canvas live preview (Web Audio AnalyserNode). */
export interface PreviewPlaybackState {
  isPlaying: boolean;
  /** Current playback position in seconds (0 until a run/preview produces video). */
  currentTime: number;
}

/** Render progress 0..1 (the store's `runProgress`), surfaced per-run. */
export interface RenderProgressState {
  /** 0..1, or null when no run is active. */
  progress: number | null;
  status: 'idle' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

// ---------------------------------------------------------------------------
// Narrowing helpers — typed projections over the open `AppNode.data` bag.
// ---------------------------------------------------------------------------

/** True when a node is one of the 4 YouTube-automation nodes. */
export function isYouTubeNode(node: { type?: string | null }): boolean {
  return (
    node.type !== undefined &&
    node.type !== null &&
    node.type in YOUTUBE_NODE_TYPES
  );
}

function dataOf(node: AppNode): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

export function asAudioCoverData(node: AppNode): AudioCoverData {
  const d = dataOf(node);
  return {
    label: String(d.label ?? ''),
    audioPath: String(d.audioPath ?? ''),
    coverPath: String(d.coverPath ?? ''),
    durationMs: d.durationMs !== undefined ? Number(d.durationMs) : undefined,
    sampleRate: d.sampleRate !== undefined ? Number(d.sampleRate) : undefined,
    audioCodec: d.audioCodec !== undefined ? String(d.audioCodec) : undefined,
    channels: d.channels !== undefined ? Number(d.channels) : undefined,
    bitRate: d.bitRate !== undefined ? Number(d.bitRate) : undefined,
  };
}

export function asBackgroundMediaData(node: AppNode): BackgroundMediaData {
  const d = dataOf(node);
  const mode = d.mode === 'video' ? 'video' : 'image';
  const fit =
    d.fit === 'contain' ? 'contain' : d.fit === 'stretch' ? 'stretch' : 'cover';
  const scaleHeight =
    d.scaleHeight === '480' || d.scaleHeight === '720' ? d.scaleHeight : '1080';
  return {
    label: String(d.label ?? ''),
    mode,
    videoPath: String(d.videoPath ?? ''),
    fit,
    scaleHeight,
    resolvedBackgroundPath:
      d.resolvedBackgroundPath !== undefined
        ? String(d.resolvedBackgroundPath)
        : undefined,
    mediaDimensions:
      d.mediaDimensions !== undefined
        ? (d.mediaDimensions as { width: number; height: number })
        : undefined,
  };
}

export function asSoundwaveVisualizerData(
  node: AppNode,
): SoundwaveVisualizerData {
  const d = dataOf(node);
  const visualizerType =
    d.visualizerType === 'waveform' || d.visualizerType === 'circularSpectrum'
      ? (d.visualizerType as VisualizerType)
      : 'frequencyBars';
  const position =
    d.position === 'top' || d.position === 'center'
      ? (d.position as VisualizerPosition)
      : 'bottom';
  const fit =
    d.fit === 'contain' ? 'contain' : d.fit === 'stretch' ? 'stretch' : 'cover';
  const fps =
    d.fps === '24' || d.fps === '60' ? (d.fps as FrameRate) : '30';
  const scaleHeight =
    d.scaleHeight === '480' || d.scaleHeight === '720' ? d.scaleHeight : '1080';
  return {
    label: String(d.label ?? ''),
    visualizerType,
    barCount: clampInt(Number(d.barCount ?? 48), 4, 256),
    colorAccent: typeof d.colorAccent === 'string' ? d.colorAccent : '#7669DE',
    sensitivity: clampNumber(Number(d.sensitivity ?? 1), 0.1, 8),
    opacity: clampNumber(Number(d.opacity ?? 0.85), 0.1, 1),
    position,
    fit,
    fps,
    scaleHeight,
  };
}

export function asPreviewExportData(node: AppNode): PreviewExportData {
  const d = dataOf(node);
  const videoCodec = d.videoCodec === 'h265' ? 'h265' : 'h264';
  const fps =
    d.fps === '24' || d.fps === '60' ? (d.fps as FrameRate) : '30';
  const overwrite =
    d.overwrite === 'overwrite' || d.overwrite === 'skip'
      ? (d.overwrite as CollisionPolicy)
      : 'rename';
  return {
    label: String(d.label ?? ''),
    filename: String(d.filename ?? 'visualizer.mp4'),
    outputDir: String(d.outputDir ?? ''),
    videoCodec,
    fps,
    overwrite,
  };
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function clampNumber(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}