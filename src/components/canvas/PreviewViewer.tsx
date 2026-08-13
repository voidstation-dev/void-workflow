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
import type { NodeExecutionResult, NodeValue } from '@/nodes/runtimeContract';

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
 * Runtime Contract V2 supplies typed node-result payloads. Text, JSON, paths,
 * and artifact references render here directly; native media URL conversion
 * remains a later runtime-service concern.
 *
 * Pure presentational; result ownership remains in the workflow store.
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
  result?: NodeExecutionResult;
}

/**
 * Renders the per-type preview surface as an honest structured empty state.
 * The `status` prop lets the viewer distinguish "never run" from "ran but no
 * payload reached the frontend" — both honestly state that no content is
 * available, the latter adds why (the backend does not stream output values).
 */
function displayValue(value: NodeValue): string {
  if (value.kind === 'text') return value.value;
  if (value.kind === 'number' || value.kind === 'boolean') return String(value.value);
  if (value.kind === 'file' || value.kind === 'media' || value.kind === 'audio' || value.kind === 'video' || value.kind === 'artifact') return value.value.path;
  return JSON.stringify(value.value, null, 2);
}

export function PreviewViewer({ kind, status, result }: PreviewViewerProps) {
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

      {result && Object.keys(result.outputs).length > 0 ? (
        <InspectorSection title="Output">
          {Object.entries(result.outputs).map(([port, value]) => (
            <div key={port} className="flex flex-col gap-1">
              <p className="text-[11px] font-medium text-text-muted">{port}</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-input p-2 text-[12px] text-text-secondary">{displayValue(value)}</pre>
            </div>
          ))}
        </InspectorSection>
      ) : result && result.artifacts.length > 0 ? (
        <InspectorSection title="Artifacts">
          {result.artifacts.map((artifact) => (
            <p key={artifact.id} className="break-all text-[12px] text-text-secondary">{artifact.path}</p>
          ))}
        </InspectorSection>
      ) : !ran ? (
        <p className="text-[12px] text-text-muted">
          No preview available. Run the workflow to generate output for preview.
        </p>
      ) : status?.status === 'success' ? (
        <InspectorSection title="Output">
          <p className="text-[12px] text-text-secondary">
            The node completed without a previewable output value.
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
