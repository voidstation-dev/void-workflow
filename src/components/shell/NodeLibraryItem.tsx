import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNodeIcon } from './icons';
import type { NodeDefinition } from '@/nodes/registry';

/**
 * NodeLibraryItem — Build panel item (spec §10). 42–48px tall row, subtle border,
 * white background, 8px radius (rounded-control), mild hover elevation, whole-row
 * draggable. Renders the node icon + label + an optional description line + a
 * trailing badge (Note / Not-executable-yet / New / Beta / Experimental).
 *
 * Drag contract (preserved, audit §8 / §27): pointer drag sets
 * application/reactflow + application/reactflow-label; aria-grabbed flips
 * false→true during drag. No contract change. Source-agnostic — the panel
 * moved left→right but the drop side (canvas) is unaffected.
 *
 * The library is ALWAYS keyboard-usable, never drag-only (frozen invariant):
 * Enter/Space is handled by the parent (onKeyDown) which enters add-mode and
 * focuses the canvas; Escape is handled globally by useWorkspaceShortcuts.
 *
 * Status is never color-only: "Not executable yet" = TriangleAlert icon + text +
 * text-status-warning. The "Note" badge is a type indicator (text-text-muted),
 * not a warning — markdownNote never blocks a run.
 */

export interface NodeLibraryItemProps {
  def: NodeDefinition;
  /** Arrow-key + Enter/Space handling owned by the parent (needs category ctx). */
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

type Badge = 'note' | 'not-executable' | null;

export function NodeLibraryItem({ def, onKeyDown }: NodeLibraryItemProps) {
  const Icon = getNodeIcon(def.icon);
  const [grabbed, setGrabbed] = useState(false);

  const badge: Badge =
    def.type === 'markdownNote'
      ? 'note'
      : def.registryState === 'frontend-only' && def.executable
        ? 'not-executable'
        : null;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    // §27 drag contract — preserved byte-for-byte.
    e.dataTransfer.setData('application/reactflow', def.type);
    e.dataTransfer.setData('application/reactflow-label', def.label);
    e.dataTransfer.effectAllowed = 'move';
    setGrabbed(true);
  };
  const handleDragEnd = () => setGrabbed(false);

  return (
    <li>
      <div
        id={`library-item-${def.type}`}
        role="button"
        tabIndex={0}
        draggable
        aria-grabbed={grabbed}
        aria-label={`${def.label}: ${def.description}`}
        title={def.description}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onKeyDown={onKeyDown}
        className={cn(
          'group flex min-h-[44px] cursor-grab items-center gap-2 rounded-control border border-border-subtle bg-surface-panel px-3 py-2',
          'transition-shadow hover:border-border-default hover:shadow-node',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
        )}
      >
        <Icon size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-text-primary">{def.label}</div>
          <div className="truncate text-[11px] text-text-muted">{def.description}</div>
        </div>

        {badge === 'note' && (
          <span className="shrink-0 text-[10px] text-text-muted">Note</span>
        )}
        {badge === 'not-executable' && (
          <span
            className="flex shrink-0 items-center gap-0.5 text-[10px] text-status-warning"
            title="This node type has no backend handler and cannot run yet."
          >
            <TriangleAlert size={10} aria-hidden="true" />
          </span>
        )}

        <span className="sr-only">drag or press Enter to add</span>
      </div>
    </li>
  );
}