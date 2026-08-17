import { lazy, type ComponentType, Suspense } from 'react';
import type { BodyRendererKey, BodyRendererProps } from '@/nodes/registry';

/**
 * BODY_RENDERERS — the pluggable inline-card-body renderer registry (§27
 * single-renderer contract preserved). BaseNode looks up `def.bodyRenderer`
 * and renders the component between the header and the ports row, replacing
 * the default `summarize(data)` description/chips body.
 *
 * Each renderer is code-split (React.lazy) so the YouTube-automation body
 * code — which pulls @tauri-apps/plugin-dialog + the visualizer preview canvas
 * — stays out of the initial bundle. BaseNode wraps the lazy component in a
 * <Suspense fallback={null}> so a node renders its shell immediately and the
 * body populates a frame later.
 *
 * Adding a renderer: declare a `BodyRendererKey` in registry.ts, add a lazy
 * entry here, and implement the component in this directory. The component
 * receives the live node data + an `updateNodeData` patch callback so inline
 * edits (file pickers, type selectors) bind two-way to the store exactly like
 * the Inspector — no bespoke panel, no per-node-type node component.
 */
const AudioCoverBody = lazy(() =>
  import('./AudioCoverBody').then((m) => ({ default: m.AudioCoverBody })),
);
const BackgroundMediaBody = lazy(() =>
  import('./BackgroundMediaBody').then((m) => ({ default: m.BackgroundMediaBody })),
);
const SoundwaveVisualizerBody = lazy(() =>
  import('./SoundwaveVisualizerBody').then((m) => ({ default: m.SoundwaveVisualizerBody })),
);
const PreviewExportBody = lazy(() =>
  import('./PreviewExportBody').then((m) => ({ default: m.PreviewExportBody })),
);

export const BODY_RENDERERS: Record<BodyRendererKey, ComponentType<BodyRendererProps>> = {
  audioCover: AudioCoverBody,
  backgroundMedia: BackgroundMediaBody,
  soundwaveVisualizer: SoundwaveVisualizerBody,
  previewExport: PreviewExportBody,
};

/** Resolve a renderer key to its lazy component, or null. */
export function getBodyRenderer(key: BodyRendererKey | undefined): ComponentType<BodyRendererProps> | null {
  return key ? BODY_RENDERERS[key] ?? null : null;
}

/** Shared Suspense wrapper so BaseNode doesn't repeat the fallback boilerplate. */
export function BodyRendererSlot({
  component: Component,
  ...props
}: { component: ComponentType<BodyRendererProps> } & BodyRendererProps) {
  return (
    <Suspense fallback={null}>
      <Component {...props} />
    </Suspense>
  );
}