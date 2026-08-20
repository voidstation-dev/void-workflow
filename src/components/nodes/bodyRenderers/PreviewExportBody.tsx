import { useRef, useState } from 'react';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Film,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkflowController } from '@/hooks/useWorkflowController';
import { useUpstreamVideo, useUpstreamVisualizerConfig } from '@/hooks/useUpstreamAudioMetadata';
import { useLiveVisualizer } from '@/hooks/useLiveVisualizer';
import type { BodyRendererProps } from '@/nodes/registry';
import { cn } from '@/lib/utils';

function formatTime(sec: number): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SPEED_PRESETS = [
  { id: 'ultrafast', label: '⚡ Ultra Fast (~3s)', preset: 'ultrafast', scaleHeight: 720, fps: 24 },
  { id: 'veryfast', label: '🚀 Balanced (~8s)', preset: 'veryfast', scaleHeight: 1080, fps: 30 },
  { id: 'faster', label: '💎 High Quality', preset: 'faster', scaleHeight: 1080, fps: 60 },
] as const;

export function PreviewExportBody({ nodeId, data, updateNodeData, selected }: BodyRendererProps) {
  const filename = String(data.filename ?? 'visualizer.mp4');
  const fps = Number(data.fps ?? 30);
  const preset = String(data.preset ?? 'ultrafast');
  const scaleHeight = Number(data.scaleHeight ?? 1080);
  const videoCodec = String(data.videoCodec ?? 'h264');
  const runStatus = useWorkflowStore((s) => s.runStatus);
  const nodeResults = useWorkflowStore((s) => s.nodeResults);
  const controller = useWorkflowController();

  const upstreamVideo = useUpstreamVideo(nodeId, 'video');
  const visConfig = useUpstreamVisualizerConfig(nodeId);

  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [viewMode, setViewMode] = useState<'composite' | 'rendered'>('composite');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useLiveVisualizer(
    canvasRef,
    visConfig?.audioPath ?? '',
    visConfig?.visualizerType ?? 'frequencyBars',
    visConfig?.barCount ?? 48,
    visConfig?.colorAccent ?? '#7669DE',
    visConfig?.sensitivity ?? 1,
    {
      backgroundPath: visConfig?.backgroundPath ?? '',
      position: visConfig?.position ?? 'bottom',
      opacity: visConfig?.opacity ?? 0.85,
      simulateIdle: false, // Do NOT auto-simulate when idle
    },
  );

  const runBusy = runStatus === 'running' || runStatus === 'starting';
  const ready = !!upstreamVideo && isTauri();
  const hasAudio = !!visConfig?.audioPath;
  const hasBackground = !!visConfig?.backgroundPath;

  // Check if output artifact is produced from a recent run
  const ownResult = nodeResults[nodeId];
  const renderedArtifact = ownResult?.artifacts?.find((a) => a.path?.endsWith('.mp4'));
  const renderedVideoSrc =
    renderedArtifact && isTauri()
      ? convertFileSrc(renderedArtifact.path)
      : renderedArtifact?.path;

  const onRender = () => {
    void controller.run();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!live.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    live.seek(pos * live.duration);
  };

  const toggleMute = () => {
    if (muted) {
      live.setVolume(1);
      setMuted(false);
    } else {
      live.setVolume(0);
      setMuted(true);
    }
  };

  const applySpeedPreset = (p: typeof SPEED_PRESETS[number]) => {
    updateNodeData({
      preset: p.preset,
      scaleHeight: p.scaleHeight,
      fps: p.fps,
    });
  };

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-3">
      {/* Video Review Surface */}
      <div
        className={cn(
          'group relative aspect-video w-full overflow-hidden rounded-control border border-border-subtle bg-surface-hover shadow-sm transition-all',
          selected && 'ring-1 ring-border-focus',
          expanded && 'aspect-[16/9] min-h-[240px]',
        )}
        aria-label="Overall video review preview"
        role="region"
      >
        {viewMode === 'rendered' && renderedVideoSrc ? (
          /* Native Rendered MP4 Video Player */
          <video
            src={renderedVideoSrc}
            controls
            autoPlay
            className="h-full w-full bg-black object-contain"
            aria-label="Final rendered video player"
          />
        ) : (
          /* Live Composite Video Review (Background + Soundwave + Audio) */
          <>
            <canvas ref={canvasRef} className="h-full w-full" aria-label="Composite video preview" />

            {/* Center Play Button Overlay when Idle/Paused */}
            {!live.playing && hasAudio && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={live.toggle}
                  aria-label="Play video review"
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-md hover:scale-110 hover:bg-accent active:scale-95 transition-all"
                >
                  <Play size={18} className="ml-0.5 fill-current" />
                </button>
              </div>
            )}

            {/* Bottom Interactive Player Controls */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 transition-opacity">
              {/* Timeline Scrubber */}
              <div
                onClick={handleSeek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={live.duration || 100}
                aria-valuenow={live.currentTime}
                aria-label="Audio timeline progress"
                className="group/track relative mb-1.5 h-1.5 w-full cursor-pointer rounded-full bg-white/20 transition-all hover:h-2.5"
              >
                <div
                  className="h-full rounded-full bg-accent relative transition-all"
                  style={{ width: `${Math.min(100, (live.progress || 0) * 100)}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-2.5 w-2.5 rounded-full bg-white shadow opacity-0 group-hover/track:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={live.toggle}
                    disabled={!hasAudio}
                    aria-label={live.playing ? 'Pause' : 'Play'}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-all"
                  >
                    {live.playing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={!hasAudio}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    className="text-text-muted hover:text-white disabled:opacity-40 transition-colors"
                  >
                    {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>

                  <span className="text-[10px] font-mono tracking-tight text-white/90">
                    {formatTime(live.currentTime)} / {formatTime(live.duration || 0)}
                  </span>
                </div>

                <div className="text-[9px] font-mono text-white/70">
                  {scaleHeight}p · {fps}fps
                </div>
              </div>
            </div>
          </>
        )}

        {/* Top bar info badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1 pointer-events-auto">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-md">
              <Film size={10} className="text-accent" aria-hidden="true" />
              {viewMode === 'rendered' ? 'Final Video Output' : 'Overall Video Preview'}
            </span>
            {hasBackground && viewMode !== 'rendered' && (
              <span className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] text-text-muted backdrop-blur-md">
                + Background
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 pointer-events-auto">
            {renderedArtifact && (
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'rendered' ? 'composite' : 'rendered')}
                className="rounded-full bg-emerald-500/80 px-2 py-0.5 text-[9px] font-medium text-white shadow backdrop-blur-md hover:bg-emerald-500 transition-colors"
              >
                {viewMode === 'rendered' ? 'Switch to Preview' : 'Watch Final MP4'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Minimize preview' : 'Expand preview'}
              className="rounded-full bg-black/50 p-1 text-text-muted hover:text-white backdrop-blur-md transition-colors"
            >
              {expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
          </div>
        </div>

        {/* Empty state notice if nothing connected */}
        {!upstreamVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface-panel/90 text-text-muted">
            <MonitorPlay size={26} aria-hidden="true" />
            <span className="text-[11px] font-medium">Connect Soundwave Visualizer to review</span>
            <span className="text-[9px] text-text-muted">Shows audio + background + soundwave in one preview</span>
          </div>
        )}
      </div>

      {/* Render Speed & Quality Mode Selector */}
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            <Zap size={10} className="text-amber-400" />
            Render Speed
          </span>
          <span className="text-[9px] font-mono text-text-muted">
            {preset} · {scaleHeight}p
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {SPEED_PRESETS.map((p) => {
            const active = preset === p.preset && scaleHeight === p.scaleHeight;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applySpeedPreset(p)}
                className={cn(
                  'rounded-control border px-1.5 py-1 text-[10px] font-medium transition-all text-center truncate',
                  active
                    ? 'border-accent bg-accent/15 text-text-primary font-semibold shadow-node-soft'
                    : 'border-border-subtle bg-surface-hover text-text-muted hover:text-text-secondary hover:border-border-focus',
                )}
                title={p.label}
              >
                {p.id === 'ultrafast' ? '⚡ Ultra Fast' : p.id === 'veryfast' ? '🚀 Balanced' : '💎 High Q'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onRender}
          disabled={!ready || runBusy}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium text-text-on-accent transition-all shadow-sm',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {runBusy ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Play size={13} aria-hidden="true" />
          )}
          {runBusy ? 'Rendering MP4…' : 'Render Video (MP4)'}
        </button>

        {!ready && (
          <span className="text-[10px] text-text-muted">{isTauri() ? 'awaiting input' : 'desktop only'}</span>
        )}
      </div>

      {/* Rendered MP4 result badge if available */}
      {renderedArtifact && (
        <div className="flex items-center justify-between rounded-control border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
          <span className="flex items-center gap-1 truncate font-mono text-[10px]">
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            {renderedArtifact.name || 'visualizer.mp4'}
          </span>
          <button
            type="button"
            onClick={() => setViewMode('rendered')}
            className="text-[9px] font-semibold text-emerald-400 hover:underline shrink-0"
          >
            Watch Video ▶
          </button>
        </div>
      )}

      {/* Code-block readout */}
      <div className="void-codeblock">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
          <dt className="void-codeblock__muted">target</dt>
          <dd className="font-mono">{filename}</dd>
          <dt className="void-codeblock__muted">codec</dt>
          <dd>{videoCodec === 'h264' ? 'H.264 (libx264)' : 'H.265 (libx265)'}</dd>
          <dt className="void-codeblock__muted">quality</dt>
          <dd>{scaleHeight}p @ {fps}fps ({preset})</dd>
          <dt className="void-codeblock__muted">layers</dt>
          <dd>
            {hasBackground ? 'Background Media' : 'Solid Canvas'} + {visConfig?.visualizerType || 'Visualizer'} + Audio
          </dd>
        </dl>
      </div>
    </div>
  );
}