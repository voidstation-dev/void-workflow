import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Image as ImageIcon, Film } from 'lucide-react';
import type { BodyRendererProps } from '@/nodes/registry';
import { cn } from '@/lib/utils';

/**
 * BackgroundMediaBody — inline card body for the Background Media node.
 *
 * A segmented Image/Video toggle that writes `mode` to node.data, plus a
 * contextual file picker: hidden in Image mode (the cover from the upstream
 * Audio & Cover node is used), shown in Video mode for a short loop .mp4. A
 * warm code-block readout summarises the active layer so the card reads at a
 * glance without opening the Inspector.
 */
const VIDEO_FILTERS = [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }];

function basename(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimmed.split(/[\\/]/).pop() ?? trimmed;
}

export function BackgroundMediaBody({ data, updateNodeData }: BodyRendererProps) {
  const mode = String(data.mode ?? 'image') === 'video' ? 'video' : 'image';
  const videoPath = String(data.videoPath ?? '');
  const fit = String(data.fit ?? 'cover');
  const scaleHeight = String(data.scaleHeight ?? '1080');

  const pickVideo = async () => {
    if (!isTauri()) return;
    const selected = await open({ multiple: false, filters: VIDEO_FILTERS });
    if (typeof selected === 'string') updateNodeData({ videoPath: selected });
  };

  const fitLabel: Record<string, string> = { cover: 'Cover', contain: 'Contain', stretch: 'Stretch' };

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {/* Segmented Image/Video toggle. */}
      <div
        role="radiogroup"
        aria-label="Background type"
        className="inline-flex self-start rounded-control border border-border-subtle bg-surface-hover p-0.5"
      >
        <Segment
          active={mode === 'image'}
          icon={<ImageIcon size={12} aria-hidden="true" />}
          label="Image"
          onClick={() => updateNodeData({ mode: 'image' })}
        />
        <Segment
          active={mode === 'video'}
          icon={<Film size={12} aria-hidden="true" />}
          label="Video loop"
          onClick={() => updateNodeData({ mode: 'video' })}
        />
      </div>

      {mode === 'video' && (
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-control bg-accent-subtle text-text-accent" aria-hidden="true">
            <Film size={13} />
          </span>
          <span className="w-12 shrink-0 text-[10px] text-text-muted">Loop</span>
          <button
            type="button"
            onClick={pickVideo}
            disabled={!isTauri()}
            title={videoPath || 'Choose a short .mp4 to loop'}
            className={cn(
              'min-w-0 flex-1 truncate rounded-control border border-border-subtle bg-surface-input px-2 py-1 text-left text-[11px] hover:border-border-focus',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              videoPath ? 'text-text-primary' : 'text-text-muted',
            )}
          >
            {basename(videoPath) || 'Choose a short .mp4 to loop'}
          </button>
          <button
            type="button"
            onClick={pickVideo}
            disabled={!isTauri()}
            aria-label="Browse for loop video"
            className="h-6 shrink-0 rounded-control border border-border-subtle bg-surface-panel px-2 text-[10px] text-text-muted hover:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Browse
          </button>
        </div>
      )}

      <div className="void-codeblock">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <dt className="void-codeblock__muted">layer</dt>
          <dd>{mode === 'video' ? 'looping video' : 'static image (from cover)'}</dd>
          <dt className="void-codeblock__muted">fit</dt>
          <dd>{fitLabel[fit] ?? fit}</dd>
          <dt className="void-codeblock__muted">output</dt>
          <dd>{scaleHeight}p</dd>
        </dl>
      </div>
    </div>
  );
}

interface SegmentProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function Segment({ active, icon, label, onClick }: SegmentProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-control px-2 py-1 text-[11px] transition-colors',
        active ? 'bg-surface-panel text-text-primary shadow-node-soft' : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {icon}
      {label}
    </button>
  );
}