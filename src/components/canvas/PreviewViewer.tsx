import {
  Type,
  Braces,
  Image,
  AudioLines,
  Video,
  Film,
  type LucideIcon,
} from 'lucide-react';
import type { PortType } from '@/nodes/registry';
import { InspectorSection } from '@/components/primitives/InspectorSection';
import type { PerNodeState } from '@/store/workflowStore';

/**
 * PreviewViewer — spec §32 (Phase F). The standardized preview surface,
 * dispatched BY OUTPUT TYPE (not by node type): "Preview should not be
 * reinvented per node" (§32). One `NodeDetailPanel` Preview tab calls
 * `<PreviewViewer outputType=… status=… />` for every media/text-capable
 * node; the node's first output port type (or `any` for the Preview node)
 * selects the viewer.
 *
 *   text       → formatted text viewer
 *   json       → structured tree / code viewer
 *   image      → image viewer
 *   audio      → audio player
 *   video      → video player
 *   media/file → media viewer (file/artifact fall here)
 *   media-info → structured metadata (Media Info node; §47)
 *
 * Honesty invariants (spec §29/§30, "no false run affordances"): the backend
 * does NOT persist node output values, artifact paths, or media URLs to the
 * frontend — there is no `convertFileSrc` bridge and no artifacts IPC today
 * (no `.rs` edits allowed). So each viewer is an HONEST, STRUCTURED empty
 * state: it names the type it will render, states that no content is
 * available yet, and documents exactly what will populate it once the
 * artifacts bridge lands. No viewer fabricates content, no `<video src>` is
 * pointed at a fake URL, no fake JSON tree is drawn. This is the §32
 * *structure* delivered now; the *content* arrives with the backend bridge.
 *
 * No `.rs` / no IPC / no new persisted state. Pure presentational.
 */

/** What the viewer can show once output data reaches the frontend. */
const VIEWER_HINT: Record<PreviewKind, string> = {
  text: 'Renders the node text output as wrapped, selectable paragraphs with a character + word count.',
  json: 'Renders the JSON output as a collapsible tree with a copy button and a Pretty/Compact toggle.',
  image: 'Renders the image with zoom-to-fit and an open-in-folder action once an artifact URL is available.',
  audio: 'Renders an audio player (waveform + transport) once an artifact URL is available.',
  video: 'Renders a video player (transport + scrubber) once an artifact URL is available.',
  media: 'Renders the media artifact in the appropriate player once its type + URL are available.',
  'media-info': 'Renders probed FFprobe metadata: Summary, Video, Audio, and Raw (Advanced) sub-views.',
};

/** A short, human label for each viewer kind. */
const VIEWER_LABEL: Record<PreviewKind, string> = {
  text: 'Text viewer',
  json: 'JSON tree',
  image: 'Image viewer',
  audio: 'Audio player',
  video: 'Video player',
  media: 'Media viewer',
  'media-info': 'Structured metadata',
};

/**
 * Map an output port type → the preview viewer kind. The port system has no
 * dedicated `image` type (§35/§36 ports: text/number/boolean/json/file/media/
 * audio/video/artifact/any), so image previews are reached via the `media`/
 * `file`/`artifact` ports — the backend resolves the actual MIME. Those map to
 * the generic `media` viewer, which the artifacts bridge will specialize to an
 * image/audio/video player once the URL + MIME are known.
 */
export function previewKindForType(type: PortType): PreviewKind {
  switch (type) {
    case 'text':
      return 'text';
    case 'json':
      return 'json';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'media':
    case 'file':
    case 'artifact':
    case 'any':
    case 'number':
    case 'boolean':
    default:
      return 'media';
  }
}

export type PreviewKind = 'text' | 'json' | 'image' | 'audio' | 'video' | 'media' | 'media-info';

const KIND_ICON: Record<PreviewKind, LucideIcon> = {
  text: Type,
  json: Braces,
  image: Image,
  audio: AudioLines,
  video: Video,
  media: Film,
  'media-info': Film,
};

export interface PreviewViewerProps {
  /** The preview kind to render (derive via `previewKindForType`). */
  kind: PreviewKind;
  /** This node's run status, for the honest "not run / ran but no payload" distinction. */
  status?: { status: PerNodeState; message: string } | undefined;
}

/**
 * Renders the per-type preview surface as an honest structured empty state.
 * The `status` prop lets the viewer distinguish "never run" from "ran but no
 * payload reached the frontend" — both honestly state that no content is
 * available, the latter adds why (the backend does not stream output values).
 */
export function PreviewViewer({ kind, status }: PreviewViewerProps) {
  const Icon = KIND_ICON[kind];
  const label = VIEWER_LABEL[kind];
  const hint = VIEWER_HINT[kind];
  const ran = status && status.status !== 'idle';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-panel px-2 py-1.5">
        <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-text-primary">{label}</p>
          <p className="text-[11px] text-text-muted">{hint}</p>
        </div>
      </div>

      {!ran ? (
        <p className="text-[12px] text-text-muted">
          No preview available. Run the workflow to generate output for preview.
        </p>
      ) : status?.status === 'success' ? (
        <InspectorSection title="Output">
          <p className="text-[12px] text-text-secondary">
            A run completed successfully, but node output values are not streamed to the
            frontend yet. Inline content renders here once the artifacts bridge lands
            (a per-run, per-node artifact URL).
          </p>
        </InspectorSection>
      ) : (
        <InspectorSection title="Last run">
          <p className="text-[12px] text-text-secondary">
            Last run status: {status?.status ?? 'idle'}
            {status?.message ? ` — ${status.message}` : ''}. No previewable payload is
            available.
          </p>
        </InspectorSection>
      )}

      <p className="text-[11px] text-text-muted">
        Preview is standardized by output type (spec §32), not by node type.
      </p>
    </div>
  );
}