import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { GripVertical, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNodeIcon } from './icons';
import type { NodeDefinition } from '@/nodes/registry';

/**
 * NodeLibraryItem — DESIGN_SYSTEM §11.10 primitive (the 10th primitive).
 *
 * Anatomy (spec §6): 28px row (h-7), 8px horizontal padding (px-2), 4px gap
 * (gap-1): [16px icon aria-hidden] [name 12px text-primary, single-line —
 * description in tooltip] [drag affordance: 12px grip-dots on hover, aria-hidden,
 * + visually-hidden "drag or press Enter to add" hint]. Hover: surface.hover
 * full row, rounded-control (4px) inset. :focus-visible: 2px --border-focus
 * ring, offset 1px (closes audit §6 no-focus-visible gap).
 *
 * Drag contract (preserved, audit §8 / §27): pointer drag sets
 * application/reactflow + application/reactflow-label; aria-grabbed flips
 * false→true during drag. No contract change.
 *
 * The library is ALWAYS keyboard-usable, never drag-only (frozen invariant):
 * Enter/Space is handled by the parent (onKeyDown) which enters add-mode and
 * focuses the canvas; Escape is handled globally by useWorkspaceShortcuts.
 */

export interface NodeLibraryItemProps {
  def: NodeDefinition;
  /** Roving tabindex: 0 for the cursor item, -1 otherwise. */
  tabIndex: 0 | -1;
  /** Fired on click (used by the parent to move the roving cursor). */
  onActivate: () => void;
  /** Arrow-key + Enter/Space handling owned by the parent (needs category ctx). */
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

type Badge = 'note' | 'not-executable' | null;

export function NodeLibraryItem({ def, tabIndex, onActivate, onKeyDown }: NodeLibraryItemProps) {
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
        tabIndex={tabIndex}
        draggable
        aria-grabbed={grabbed}
        aria-label={`${def.label}: ${def.description}`}
        title={def.description}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onKeyDown={onKeyDown}
        onClick={onActivate}
        className={cn(
          'group flex h-7 items-center gap-1 rounded-control px-2',
          'cursor-grab hover:bg-surface-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
        )}
      >
        <Icon size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">{def.label}</span>

        {badge === 'note' && (
          <span className="shrink-0 text-[10px] text-text-muted">Note</span>
        )}
        {badge === 'not-executable' && (
          <span
            className="flex shrink-0 items-center gap-0.5 text-[10px] text-status-warning"
            title="This node type has no backend handler and cannot run yet."
          >
            <TriangleAlert size={10} aria-hidden="true" />
            Not executable yet
          </span>
        )}

        <GripVertical
          size={12}
          className="shrink-0 text-text-muted opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />

        <span className="sr-only">drag or press Enter to add</span>
      </div>
    </li>
  );
}