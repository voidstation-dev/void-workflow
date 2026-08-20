import { Sliders } from 'lucide-react';
import type { BodyRendererProps } from '@/nodes/registry';
import { useUpstreamAudioMetadata, useUpstreamBackground } from '@/hooks/useUpstreamAudioMetadata';
import type { VisualizerType } from '@/hooks/useLiveVisualizer';
import { cn } from '@/lib/utils';

/**
 * SoundwaveVisualizerBody — lightweight, high-performance inline card body for Soundwave Visualizer.
 *
 * Uses static vector/SVG visual thumbnail cards for switching styles without running
 * continuous Canvas animation loops in the node card. This ensures 0% CPU overhead,
 * prevents canvas lag, and keeps dragging/zooming across the workflow completely smooth.
 */

interface VisualizerOption {
  value: VisualizerType;
  label: string;
  desc: string;
  renderThumbnail: (color: string, active: boolean) => React.ReactNode;
}

const VISUALIZERS: VisualizerOption[] = [
  {
    value: 'frequencyBars',
    label: 'Bars',
    desc: 'Frequency spectrum',
    renderThumbnail: (color, active) => (
      <svg viewBox="0 0 70 30" className="h-7 w-full" fill="none">
        <rect x="4" y="18" width="4.5" height="12" rx="1.5" fill={color} fillOpacity={active ? 0.6 : 0.3} />
        <rect x="11" y="12" width="4.5" height="18" rx="1.5" fill={color} fillOpacity={active ? 0.8 : 0.4} />
        <rect x="18" y="5" width="4.5" height="25" rx="1.5" fill={color} fillOpacity={active ? 1 : 0.6} />
        <rect x="25" y="14" width="4.5" height="16" rx="1.5" fill={color} fillOpacity={active ? 0.7 : 0.35} />
        <rect x="32" y="2" width="4.5" height="28" rx="1.5" fill={color} fillOpacity={active ? 1 : 0.6} />
        <rect x="39" y="8" width="4.5" height="22" rx="1.5" fill={color} fillOpacity={active ? 0.9 : 0.45} />
        <rect x="46" y="16" width="4.5" height="14" rx="1.5" fill={color} fillOpacity={active ? 0.7 : 0.35} />
        <rect x="53" y="7" width="4.5" height="23" rx="1.5" fill={color} fillOpacity={active ? 1 : 0.5} />
        <rect x="60" y="20" width="4.5" height="10" rx="1.5" fill={color} fillOpacity={active ? 0.5 : 0.25} />
      </svg>
    ),
  },
  {
    value: 'waveform',
    label: 'Wave',
    desc: 'Oscilloscope line',
    renderThumbnail: (color, active) => (
      <svg viewBox="0 0 70 30" className="h-7 w-full" fill="none">
        <path
          d="M 3 15 Q 12 15, 17 6 T 28 24 T 38 3 T 48 27 T 58 10 T 67 15"
          stroke={color}
          strokeWidth={active ? 2.5 : 1.8}
          strokeOpacity={active ? 1 : 0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    value: 'circularSpectrum',
    label: 'Circle',
    desc: 'Radial spectrum',
    renderThumbnail: (color, active) => (
      <svg viewBox="0 0 70 30" className="h-7 w-full" fill="none">
        <circle cx="35" cy="15" r="5.5" stroke={color} strokeWidth="1.2" strokeOpacity={active ? 0.8 : 0.4} />
        <line x1="35" y1="6" x2="35" y2="1.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 1 : 0.5} />
        <line x1="35" y1="24" x2="35" y2="28.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 1 : 0.5} />
        <line x1="26" y1="15" x2="21.5" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 1 : 0.5} />
        <line x1="44" y1="15" x2="48.5" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 1 : 0.5} />
        <line x1="28.5" y1="8.5" x2="24.5" y2="4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 0.9 : 0.4} />
        <line x1="41.5" y1="8.5" x2="45.5" y2="4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 0.9 : 0.4} />
        <line x1="28.5" y1="21.5" x2="24.5" y2="25.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 0.9 : 0.4} />
        <line x1="41.5" y1="21.5" x2="45.5" y2="25.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity={active ? 0.9 : 0.4} />
      </svg>
    ),
  },
];

export function SoundwaveVisualizerBody({ nodeId, data, updateNodeData }: BodyRendererProps) {
  const visualizerType = String(data.visualizerType ?? 'frequencyBars') as VisualizerType;
  const barCount = Number(data.barCount ?? 48);
  const colorAccent = String(data.colorAccent ?? '#7669DE');
  const sensitivity = Number(data.sensitivity ?? 1);

  const upstream = useUpstreamAudioMetadata(nodeId, 'audio');
  const upstreamBg = useUpstreamBackground(nodeId);
  const audioPath = upstream?.audioPath ?? '';
  const backgroundPath = upstreamBg?.backgroundPath ?? '';

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-3">
      {/* Visual Style Cards Grid (Static SVG Thumbnails) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Visualizer Style</span>
          <span className="text-[9px] text-text-muted">
            {VISUALIZERS.find((v) => v.value === visualizerType)?.desc}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Visualizer style"
          className="grid grid-cols-3 gap-1.5"
        >
          {VISUALIZERS.map((v) => {
            const active = visualizerType === v.value;
            return (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateNodeData({ visualizerType: v.value })}
                className={cn(
                  'group flex flex-col items-center justify-between rounded-control border p-1.5 transition-all text-left',
                  active
                    ? 'border-accent bg-accent/10 shadow-node-soft'
                    : 'border-border-subtle bg-surface-hover hover:border-border-focus hover:bg-surface-hover/80',
                )}
              >
                {/* SVG Visual Waveform Representation */}
                <div className="flex h-8 w-full items-center justify-center">
                  {v.renderThumbnail(active ? colorAccent : 'currentColor', active)}
                </div>

                <span
                  className={cn(
                    'mt-1 text-[10px] font-medium tracking-tight transition-colors',
                    active ? 'text-text-primary font-semibold' : 'text-text-muted group-hover:text-text-secondary',
                  )}
                >
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline parameters: bar count, color accent, sensitivity */}
      <div className="flex flex-col gap-1.5 pt-1">
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
          <span className="text-[9px] text-text-muted">{barCount} segments</span>
        </ParamRow>

        <ParamRow label="Color">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(colorAccent) ? colorAccent : '#7669DE'}
            aria-label="Color accent"
            onChange={(e) => updateNodeData({ colorAccent: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded-control border border-border-subtle bg-surface-input p-0.5"
          />
          <span className="text-[10px] font-mono text-text-muted">{colorAccent}</span>
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
            className="h-6 flex-1 cursor-pointer"
            style={{ accentColor: colorAccent }}
          />
          <span className="w-8 text-right text-[10px] tabular-nums font-mono text-text-muted">
            {sensitivity.toFixed(2)}×
          </span>
        </ParamRow>
      </div>

      {/* Code-block readout */}
      <div className="void-codeblock mt-0.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
          <dt className="void-codeblock__muted">mode</dt>
          <dd className="font-mono">{visualizerType}</dd>
          <dt className="void-codeblock__muted">bars</dt>
          <dd className="font-mono">{barCount}</dd>
          <dt className="void-codeblock__muted">accent</dt>
          <dd className="font-mono">{colorAccent}</dd>
          <dt className="void-codeblock__muted">audio</dt>
          <dd>
            {upstream && upstream.durationMs > 0 ? (
              `${(upstream.durationMs / 1000).toFixed(1)}s · ${(upstream.sampleRate / 1000).toFixed(1)}kHz`
            ) : audioPath ? (
              'connected'
            ) : (
              <span className="void-codeblock__muted">not connected</span>
            )}
          </dd>
          {backgroundPath && (
            <>
              <dt className="void-codeblock__muted">bg</dt>
              <dd className="truncate">{upstreamBg?.mode === 'video' ? 'video loop' : 'cover image'}</dd>
            </>
          )}
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
      <span className="flex w-11 shrink-0 items-center gap-0.5 text-[10px] text-text-muted">
        <Sliders size={10} aria-hidden="true" />
        {label}
      </span>
      <div className="flex flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}