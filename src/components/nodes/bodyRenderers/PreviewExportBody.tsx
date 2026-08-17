import { useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { MonitorPlay, Pause, Play, Loader2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkflowController } from '@/hooks/useWorkflowController';
import { useUpstreamVideo, useUpstreamVisualizerConfig } from '@/hooks/useUpstreamAudioMetadata';
import { useLiveVisualizer } from '@/hooks/useLiveVisualizer';
import type { BodyRendererProps } from '@/nodes/registry';
import { cn } from '@/lib/utils';

/**
 * PreviewExportBody — inline card body for the Preview & Export node.
 *
 * A LIVE preview canvas (Phase 3) renders the visualizer in real time BEFORE a
 * run: it walks the upstream `soundwaveVisualizer` for its config
 * (visualizerType / barCount / colorAccent / sensitivity) and the furthest
 * upstream `audioCover` for the audio file, then drives a Web Audio
 * `AnalyserNode` + canvas animation that mirrors the FFmpeg filters the Rust
 * executor will bake into the MP4 (showwaves / showspectrum bar / circle). This
 * is a preview only — the authoritative render is the Rust pipeline.
 *
 * The Render button calls `controller.run()` → `start_run` renders a real MP4
 * through background + audio + visualizer. A warm code-block readout summarises
 * the render target; honest placeholders show when no video / audio is bound.
 */
export function PreviewExportBody({ nodeId, data, selected }: BodyRendererProps) {
  const filename = String(data.filename ?? 'visualizer.mp4');
  const fps = String(data.fps ?? '30');
  const videoCodec = String(data.videoCodec ?? 'h264');
  const runStatus = useWorkflowStore((s) => s.runStatus);
  const controller = useWorkflowController();
  const upstreamVideo = useUpstreamVideo(nodeId, 'video');
  const visConfig = useUpstreamVisualizerConfig(nodeId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useLiveVisualizer(
    canvasRef,
    visConfig?.audioPath ?? '',
    visConfig?.visualizerType ?? 'frequencyBars',
    visConfig?.barCount ?? 48,
    visConfig?.colorAccent ?? '#7669DE',
    visConfig?.sensitivity ?? 1,
  );

  const runBusy = runStatus === 'running' || runStatus === 'starting';
  const ready = !!upstreamVideo && isTauri();
  // Live preview is available only when both the visualizer and its audio source
  // are connected upstream (the canvas needs the audio file to play + analyze).
  const liveReady = !!visConfig?.audioPath && isTauri();

  const onRender = () => {
    // The 4 YouTube-automation nodes are full runtime nodes backed by Rust
    // executors + the FFmpeg filtergraph engine. controller.run() runs the
    // pre-run guard (blocks frontend-only runtime nodes / invalid graphs) then
    // `start_run` renders the pipeline. Same path as the toolbar Run button.
    void controller.run();
  };

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {/* Live preview canvas — 16:9 frame. Phase 3 drives this with a Web Audio
          AnalyserNode mirroring the Rust FFmpeg visualizer filters. Falls back
          to an honest placeholder when the visualizer + audio aren't bound. */}
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-control border border-border-subtle bg-surface-hover',
          selected && 'ring-1 ring-border-focus',
        )}
        aria-label="Live preview"
        role="img"
      >
        {liveReady ? (
          <canvas ref={canvasRef} className="h-full w-full" aria-label="Live visualizer preview" />
        ) : upstreamVideo ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-text-muted">
            <MonitorPlay size={24} aria-hidden="true" />
            <span className="text-[10px]">
              {visConfig && !visConfig.audioPath ? 'Connect audio to the visualizer' : 'Video bound · preview needs audio'}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-text-muted">
            <MonitorPlay size={24} aria-hidden="true" />
            <span className="text-[10px]">Connect a video to preview</span>
          </div>
        )}
        <span className="absolute bottom-1 left-2 rounded-full bg-surface-overlay px-1.5 py-0.5 text-[9px] text-text-on-accent">
          {live.playing ? 'live' : 'preview'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRender}
          disabled={!isTauri()}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-control px-2 text-[12px] font-medium text-text-on-accent transition-colors',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {runBusy ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Play size={13} aria-hidden="true" />
          )}
          {runBusy ? 'Rendering…' : 'Render video'}
        </button>
        {liveReady && !runBusy && (
          <button
            type="button"
            onClick={live.toggle}
            aria-label={live.playing ? 'Pause preview' : 'Play preview'}
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-control border border-border-subtle bg-surface-panel px-2 text-[12px] text-text-secondary hover:bg-surface-hover"
          >
            {live.playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            {live.playing ? 'Pause' : 'Preview'}
          </button>
        )}
        {!ready && (
          <span className="text-[10px] text-text-muted">{isTauri() ? 'awaiting input' : 'desktop only'}</span>
        )}
      </div>

      <div className="void-codeblock">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <dt className="void-codeblock__muted">output</dt>
          <dd>{filename}</dd>
          <dt className="void-codeblock__muted">codec</dt>
          <dd>{videoCodec}{videoCodec === 'h264' ? ' (libx264)' : ' (libx265)'}</dd>
          <dt className="void-codeblock__muted">fps</dt>
          <dd>{fps}</dd>
          <dt className="void-codeblock__muted">input</dt>
          <dd>{upstreamVideo ? 'video bound' : <span className="void-codeblock__muted">not connected</span>}</dd>
        </dl>
      </div>
    </div>
  );
}