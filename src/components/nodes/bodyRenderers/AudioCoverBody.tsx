import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileAudio, Image as ImageIcon, Loader2, Music } from 'lucide-react';
import { useWorkflowController } from '@/hooks/useWorkflowController';
import type { BodyRendererProps } from '@/nodes/registry';
import { cn } from '@/lib/utils';

/**
 * AudioCoverBody — inline card body for the Audio & Cover node.
 *
 * Two compact file pickers (audio + cover) that write directly to node.data
 * via `updateNodeData`, plus a warm "code-block" readout showing the probed
 * duration / sample rate / codec. Selecting an audio file triggers the
 * edit-time FFprobe metadata probe (controller.probeAudioMetadata) and stores
 * `durationMs` + `sampleRate` + `audioCodec` on the node — the Visualizer node
 * downstream reads these through the edit-time data propagation selector so its
 * bar count / sensitivity defaults make sense before any run.
 *
 * Binding is two-way and identical to the Inspector: every edit calls
 * `updateNodeData({ [field]: value })`, which merges into the store and flows
 * back through React Flow. No bespoke panel — this IS the node's body.
 */
const AUDIO_FILTERS = [{ name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'flac', 'm4a'] }];
const IMAGE_FILTERS = [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }];

function basename(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimmed.split(/[\\/]/).pop() ?? trimmed;
}

/**
 * HTML file-input fallback for the browser (no Tauri shell). Opens the native
 * browser file picker for the given accept filter and resolves an object URL
 * the live-preview canvas can play. Returns '' when the user cancels. The URL
 * is revoked when the node unmounts / picks a new file (handled by the caller
 * via updateNodeData replacing audioPath, which triggers the live-visualizer
 * teardown effect). NOTE: a blob: URL is NOT a filesystem path — the Rust
 * render will surface an honest error if the user tries to run from the
 * browser; this is an editor-preview affordance only.
 */
function pickViaHtmlInput(accept: string): Promise<string> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : '');
    };
    // Some browsers don't fire onchange when cancelled; resolve '' on blur as a
    // best-effort escape so the Promise never hangs.
    input.addEventListener('cancel', () => resolve(''), { once: true });
    input.click();
  });
}

/** Best-effort display name for a blob: URL (object URLs have no filename). */
function basenameFromBlob(url: string): string {
  // Object URLs look like "blob:http://localhost:1420/uuid" — no real name.
  // We surface a short label so the readout isn't an ugly opaque token.
  return url.startsWith('blob:') ? 'selected audio' : basename(url);
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function AudioCoverBody({ data, updateNodeData }: BodyRendererProps) {
  const controller = useWorkflowController();
  const audioPath = String(data.audioPath ?? '');
  const coverPath = String(data.coverPath ?? '');
  const durationMs = Number(data.durationMs ?? 0);
  const sampleRate = Number(data.sampleRate ?? 0);
  const audioCodec = String(data.audioCodec ?? '');
  const probeError = String(data.probeError ?? '');

  // Local probing state so the spinner shows while FFprobe runs without
  // round-tripping through the store (keeps it a transient UI affordance).
  const [probing, setProbing] = useState(false);
  // Track the last path we probed so re-selecting the same file (or editing an
  // unrelated field) doesn't re-probe.
  const probedRef = useRef<string>('');

  useEffect(() => {
    const path = audioPath.trim();
    if (!path || path === probedRef.current || !isTauri()) return;
    probedRef.current = path;
    let cancelled = false;
    setProbing(true);
    controller
      .probeAudioMetadata(path)
      .then((meta) => {
        if (cancelled || !meta) return;
        updateNodeData({
          durationMs: meta.durationMs,
          sampleRate: meta.sampleRate,
          audioCodec: meta.audioCodec,
          channels: meta.channels,
          probeError: '',
        });
      })
      .catch((error) => {
        if (cancelled) return;
        updateNodeData({
          durationMs: 0,
          sampleRate: 0,
          audioCodec: '',
          channels: 0,
          probeError: String(error?.message ?? error),
        });
      })
      .finally(() => {
        if (!cancelled) setProbing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audioPath, controller, updateNodeData]);

  const pickAudio = async () => {
    if (isTauri()) {
      // Native dialog → real filesystem path. The Rust probe + render use this
      // path directly, so this is the only path that produces an actual MP4.
      const selected = await open({ multiple: false, filters: AUDIO_FILTERS });
      if (typeof selected === 'string') {
        probedRef.current = ''; // force re-probe on the new path
        updateNodeData({ audioPath: selected });
      }
      return;
    }
    // Browser fallback (vite dev without the Tauri shell): the native OS dialog
    // isn't available, so use an HTML file input. We store a blob: URL — enough
    // for the live-preview canvas (Web Audio can decode it) but NOT a real fs
    // path, so a Rust render would report an honest "file not found" rather than
    // silently failing. This keeps the editor usable for layout/preview in the
    // browser while the desktop app remains the render environment.
    const url = await pickViaHtmlInput('audio/*');
    if (url) {
      probedRef.current = '';
      updateNodeData({ audioPath: url, audioName: url ? basenameFromBlob(url) : '' });
    }
  };
  const pickCover = async () => {
    if (isTauri()) {
      const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
      if (typeof selected === 'string') updateNodeData({ coverPath: selected });
      return;
    }
    const url = await pickViaHtmlInput('image/*');
    if (url) updateNodeData({ coverPath: url });
  };

  const hasAudio = !!audioPath;
  // Display name: prefer a saved audioName (browser blob fallback has no real
  // filename), else basename of the path (Tauri fs path).
  const audioName = String(data.audioName ?? '') || (audioPath.startsWith('blob:') ? 'selected audio' : basename(audioPath));
  const coverName = coverPath.startsWith('blob:') ? 'selected image' : basename(coverPath);
  const inTauri = isTauri();

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      {/* Compact file pickers — two rows, each an icon + name + Browse.
          In Tauri the native OS dialog returns a real filesystem path (usable
          by the Rust render); in a plain browser an HTML file input returns a
          blob: URL (preview-only — the render surfaces an honest error). */}
      <div className="flex flex-col gap-1.5">
        <PickerRow
          icon={<FileAudio size={13} aria-hidden="true" />}
          label="Audio"
          value={audioName}
          placeholder="Choose .mp3 / .wav"
          onClick={pickAudio}
          accent={hasAudio}
          trailing={probing ? <Loader2 size={12} className="animate-spin text-text-muted" aria-hidden="true" /> : null}
        />
        <PickerRow
          icon={<ImageIcon size={13} aria-hidden="true" />}
          label="Cover"
          value={coverName}
          placeholder="Choose .jpg / .png"
          onClick={pickCover}
          accent={!!coverPath}
        />
      </div>

      {/* Code-block metadata readout — warm paper fill, monospaced. Shows
          honest "unknown until probed" states rather than fake values. */}
      <div className="void-codeblock" role="status" aria-live="polite">
        {probing ? (
          <span className="void-codeblock__muted">Probing audio metadata…</span>
        ) : hasAudio ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <dt className="void-codeblock__muted">duration</dt>
            <dd>{formatDuration(durationMs)}{durationMs > 0 ? `  ·  ${(durationMs / 1000).toFixed(2)}s` : ''}</dd>
            <dt className="void-codeblock__muted">sampleRate</dt>
            <dd>{sampleRate > 0 ? `${sampleRate} Hz  ·  ${(sampleRate / 1000).toFixed(1)} kHz` : '—'}</dd>
            <dt className="void-codeblock__muted">codec</dt>
            <dd>{audioCodec || '—'}</dd>
            <dt className="void-codeblock__muted">channels</dt>
            <dd>{Number(data.channels ?? 0) > 0 ? String(data.channels) : '—'}</dd>
          </dl>
        ) : (
          <span className="void-codeblock__muted">
            <Music size={10} className="mr-1 inline align-[-1px]" aria-hidden="true" />
            No audio selected — duration + sample rate appear here.
          </span>
        )}
        {probeError && (
          <dd className="mt-1 text-[10px] text-text-error">{probeError}</dd>
        )}
        {/* Honest browser-mode caveat: blob URLs play in the live preview but
            are not filesystem paths, so the Rust render cannot use them. The
            desktop app is the render environment. */}
        {hasAudio && !inTauri && (
          <dd className="mt-1 text-[10px] text-text-muted">
            Browser preview only — run the desktop app to render an MP4.
          </dd>
        )}
      </div>
    </div>
  );
}

interface PickerRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  trailing?: React.ReactNode;
}

function PickerRow({ icon, label, value, placeholder, onClick, disabled, accent, trailing }: PickerRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-control',
          accent ? 'bg-accent-subtle text-text-accent' : 'bg-surface-hover text-text-muted',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="w-12 shrink-0 text-[10px] text-text-muted">{label}</span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? 'Native file dialog is available in the desktop app' : value || placeholder}
        className={cn(
          'min-w-0 flex-1 truncate rounded-control border border-border-subtle bg-surface-input px-2 py-1 text-left text-[11px]',
          'disabled:opacity-60 disabled:cursor-not-allowed hover:border-border-focus',
          value ? 'text-text-primary' : 'text-text-muted',
        )}
      >
        {value || placeholder}
      </button>
      {trailing}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`Browse for ${label}`}
        className="h-6 shrink-0 rounded-control border border-border-subtle bg-surface-panel px-2 text-[10px] text-text-muted hover:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Browse
      </button>
    </div>
  );
}