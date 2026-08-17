import { useRef } from 'react';
import { AudioWaveform, BarChart3, Circle, Pause, Play, Sliders } from 'lucide-react';
import type { BodyRendererProps } from '@/nodes/registry';
import { useUpstreamAudioMetadata } from '@/hooks/useUpstreamAudioMetadata';
import { useLiveVisualizer, type VisualizerType } from '@/hooks/useLiveVisualizer';
import { cn } from '@/lib/utils';

/**
 * SoundwaveVisualizerBody — inline card body for the Soundwave Visualizer node.
 *
 * A 3-way visualizer-type selector (Frequency Bars / Waveform / Circular
 * Spectrum) that maps to FFmpeg's showfreqs / showwaves=cline / avectorscope
 * filters at render time, plus compact inline controls for Bar count, Color
 * accent and Sensitivity — the three parameters the spec calls out.
 *
 * A LIVE preview canvas sits at the top of the body: it walks the upstream
 * `audio` edge to the Audio & Cover node for the selected audio file, then
 * drives a Web Audio AnalyserNode + canvas animation that mirrors the FFmpeg
 * filter the Rust executor will bake into the MP4 — using the EXACT type /
 * bar count / accent / sensitivity the user is editing right now, so every
 * tweak is visible before a run. The canvas is a PREVIEW only; the
 * authoritative render is the Rust pipeline. Honest placeholder when no audio
 * is connected upstream. Works in both Tauri (fs path → convertFileSrc) and a
 * plain browser (blob URL from the HTML file-input fallback).
 */
const VISUALIZERS = [
  { value: 'frequencyBars', label: 'Bars', icon: BarChart3 },
  { value: 'waveform', label: 'Wave', icon: AudioWaveform },
  { value: 'circularSpectrum', label: 'Circle', icon: Circle },
] as const;

export function SoundwaveVisualizerBody({ nodeId, data, updateNodeData }: BodyRendererProps) {
  const visualizerType = String(data.visualizerType ?? 'frequencyBars') as VisualizerType;
  const barCount = Number(data.barCount ?? 48);
  const colorAccent = String(data.colorAccent ?? '#7669DE');
  const sensitivity = Number(data.sensitivity ?? 1);

  const upstream = useUpstreamAudioMetadata(nodeId, 'audio');
  const audioPath = upstream?.audioPath ?? '';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useLiveVisualizer(
    canvasRef,
    audioPath,
    visualizerType,
    barCount,
    colorAccent,
    sensitivity,
  );

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {/* Live preview canvas — renders the visualizer in real time against the
          upstream audio, mirroring the FFmpeg filter with the current config.
          Honest placeholder when no audio is bound upstream. */}
      <div
        className="relative aspect-video w-full overflow-hidden rounded-control border border-border-subtle bg-surface-hover"
        aria-label="Live visualizer preview"
        role="img"
      >
        {audioPath ? (
          <canvas ref={canvasRef} className="h-full w-full" aria-label="Live visualizer preview" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-text-muted">
            <AudioWaveform size={22} aria-hidden="true" />
            <span className="text-[10px]">Connect audio to preview live</span>
          </div>
        )}
        {audioPath && (
          <span className="absolute bottom-1 left-2 rounded-full bg-surface-overlay px-1.5 py-0.5 text-[9px] text-text-on-accent">
            {live.playing ? 'live' : 'preview'}
          </span>
        )}
      </div>

      {/* Visualizer type selector — 3 icon segments. */}
      <div
        role="radiogroup"
        aria-label="Visualizer type"
        className="grid grid-cols-3 gap-1 rounded-control border border-border-subtle bg-surface-hover p-0.5"
      >
        {VISUALIZERS.map((v) => {
          const Icon = v.icon;
          const active = visualizerType === v.value;
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => updateNodeData({ visualizerType: v.value })}
              className={cn(
                'inline-flex items-center justify-center gap-1 rounded-control px-1 py-1 text-[10px] transition-colors',
                active ? 'bg-surface-panel text-text-primary shadow-node-soft' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              <Icon size={12} aria-hidden="true" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Inline parameters: bar count, color accent, sensitivity. */}
      <div className="flex flex-col gap-1.5">
        <ParamRow label="Bars">
          <input
            type="number"
            min={4}
            max={256}
            step={1}
            value={barCount}
            aria-label="Bar count"
            onChange={(e) => updateNodeData({ barCount: e.target.value === '' ? 48 : Number(e.target.value) })}
            className="h-6 w-16 rounded-control border border-border-subtle bg-surface-input px-1.5 text-[11px] text-text-primary outline-none focus:border-border-focus"
          />
        </ParamRow>
        <ParamRow label="Color">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(colorAccent) ? colorAccent : '#7669DE'}
            aria-label="Color accent"
            onChange={(e) => updateNodeData({ colorAccent: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded-control border border-border-subtle bg-surface-input p-0.5"
          />
          <span className="text-[10px] tabular-nums text-text-muted">{colorAccent}</span>
        </ParamRow>
        <ParamRow label="Sens">
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={sensitivity}
            aria-label="Sensitivity"
            onChange={(e) => updateNodeData({ sensitivity: Number(e.target.value) })}
            className="h-6 flex-1"
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-text-muted">{sensitivity.toFixed(2)}×</span>
        </ParamRow>
      </div>

      {/* Play/pause + code-block readout. The live canvas above already shows
          the visualizer; this button toggles playback so the user HEARS the
          audio while watching the preview react. */}
      {audioPath && (
        <button
          type="button"
          onClick={live.toggle}
          aria-label={live.playing ? 'Pause preview' : 'Play preview'}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-control border border-border-subtle bg-surface-panel px-2 text-[12px] text-text-secondary hover:bg-surface-hover"
        >
          {live.playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {live.playing ? 'Pause' : 'Play preview'}
        </button>
      )}

      {/* Code-block readout — effective config + upstream audio metadata. */}
      <div className="void-codeblock">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <dt className="void-codeblock__muted">mode</dt>
          <dd>{visualizerType}</dd>
          <dt className="void-codeblock__muted">bars</dt>
          <dd>{barCount}</dd>
          <dt className="void-codeblock__muted">accent</dt>
          <dd>{colorAccent}</dd>
          <dt className="void-codeblock__muted">audio</dt>
          <dd>
            {upstream ? (
              `${(upstream.durationMs / 1000).toFixed(1)}s · ${(upstream.sampleRate / 1000).toFixed(1)}kHz`
            ) : (
              <span className="void-codeblock__muted">not connected</span>
            )}
          </dd>
        </dl>
      </div>
    </div>
  );
}

interface ParamRowProps {
  label: string;
  children: React.ReactNode;
}

function ParamRow({ label, children }: ParamRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex w-10 shrink-0 items-center gap-0.5 text-[10px] text-text-muted">
        <Sliders size={10} aria-hidden="true" />
        {label}
      </span>
      <div className="flex flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}