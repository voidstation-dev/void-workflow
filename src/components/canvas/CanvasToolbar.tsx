import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Map as MapIcon,
  Rows3,
  LayoutGrid,
} from 'lucide-react';
import { useReactFlow, useStore } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

/**
 * CanvasToolbar — bottom-center canvas controls (spec §7.2 / §9 light). Replaces
 * the vertical @xyflow `Controls` and the bottom-right Fit+zoom Panel with a
 * single compact horizontal bar: Outline/Detail density toggle (writes
 * `uiSlice.nodeCardMode`), Undo/Redo (Phase 6 client-side graph-history),
 * Fit view, zoom −/%/+, and Minimap toggle (writes `uiSlice.minimapOn`).
 *
 * Rendered as a React Flow `Panel position="bottom-center"`, so it overlays the
 * canvas and inherits RF's coordinate container. Each control is a labelled
 * 28px button with `aria-label` + `title`; the bar is a `role="toolbar"` with an
 * `aria-label` so AT announces it as a group.
 *
 * Tokens only (no raw hex). Status is never color-only: disabled Undo/Redo use
 * `aria-disabled` + `opacity` + `cursor-not-allowed`, NOT a color change.
 */
export function CanvasToolbar() {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  // Live zoom % — scalar selector, stable (a number).
  const zoomPct = useStore((s) => Math.round((s.transform[2] ?? 1) * 100));

  const nodeCardMode = useWorkflowStore((s) => s.nodeCardMode);
  const setNodeCardMode = useWorkflowStore((s) => s.setNodeCardMode);
  const minimapOn = useWorkflowStore((s) => s.minimapOn);
  const setMinimapOn = useWorkflowStore((s) => s.setMinimapOn);
  const canUndo = useWorkflowStore((s) => s.canUndo);
  const canRedo = useWorkflowStore((s) => s.canRedo);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);

  const btnBase =
    'inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
  const btnDisabled = 'aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent';

  const isDetail = nodeCardMode === 'detail';

  return (
    <div
      role="toolbar"
      aria-label="Canvas controls"
      className="pointer-events-auto flex items-center gap-0.5 rounded-[11px] border border-border-default bg-surface-panel p-1 shadow-popover"
    >
      {/* Outline/Detail density toggle (spec §15). Two-state segmented control:
          Outline (compact: header + ports only) vs Detail (full card). The
          active state is NOT color-only — active gets bg-surface-hover +
          text-text-primary + aria-pressed=true; inactive is muted. */}
      <div className="flex items-center" role="group" aria-label="Card density">
        <button
          type="button"
          aria-pressed={!isDetail}
          aria-label="Outline cards"
          title="Outline (compact cards)"
          onClick={() => setNodeCardMode('outline')}
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11px] font-medium', !isDetail ? 'bg-text-primary text-white' : 'text-text-secondary hover:bg-surface-hover')}
        >
          <Rows3 size={14} aria-hidden="true" />
          Outline
        </button>
        <button
          type="button"
          aria-pressed={isDetail}
          aria-label="Detail cards"
          title="Detail (full cards)"
          onClick={() => setNodeCardMode('detail')}
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11px] font-medium', isDetail ? 'bg-text-primary text-white' : 'text-text-secondary hover:bg-surface-hover')}
        >
          <LayoutGrid size={14} aria-hidden="true" />
          Detail
        </button>
      </div>

      <ToolbarDivider />

      {/* Undo/Redo (Phase 6 client-side graph-history). Disabled state is
          aria-disabled + opacity + cursor (never color-only). */}
      <button
        type="button"
        aria-label="Undo"
        title="Undo (Ctrl/Cmd+Z)"
        aria-disabled={!canUndo}
        disabled={!canUndo}
        onClick={undo}
        className={cn(btnBase, btnDisabled)}
      >
        <Undo2 size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (Ctrl/Cmd+Shift+Z)"
        aria-disabled={!canRedo}
        disabled={!canRedo}
        onClick={redo}
        className={cn(btnBase, btnDisabled)}
      >
        <Redo2 size={14} aria-hidden="true" />
      </button>

      <ToolbarDivider />

      {/* Zoom out / % (click to reset to 100%) / zoom in / fit */}
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => zoomOut({ duration: 0 })}
        className={btnBase}
      >
        <ZoomOut size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Zoom: ${zoomPct}%. Click to reset to 100%`}
        title="Reset to 100%"
        onClick={() => zoomTo(1, { duration: 0 })}
        className="inline-flex h-7 min-w-[3rem] items-center justify-center rounded-control px-1.5 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        {zoomPct}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => zoomIn({ duration: 0 })}
        className={btnBase}
      >
        <ZoomIn size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Fit view"
        title="Fit view (0)"
        onClick={() => fitView({ duration: 0, maxZoom: 1, padding: 0.18 })}
        className={btnBase}
      >
        <Maximize size={14} aria-hidden="true" />
      </button>

      <ToolbarDivider />

      {/* Minimap toggle (writes uiSlice.minimapOn, persisted). */}
      <button
        type="button"
        aria-pressed={minimapOn}
        aria-label="Toggle minimap"
        title="Toggle minimap"
        onClick={() => setMinimapOn(!minimapOn)}
        className={cn(btnBase, minimapOn ? 'bg-surface-hover text-text-primary' : '')}
      >
        <MapIcon size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border-subtle" aria-hidden="true" />;
}
