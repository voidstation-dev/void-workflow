import { useState } from 'react';
import {
  Copy,
  Trash,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  type LucideIcon,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useArrange } from '@/hooks/useArrange';
import { useDeleteHelpers } from '@/hooks/useDeleteHelpers';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/Popover';
import { cn } from '@/lib/utils';

/**
 * GroupToolbar — spec §55/§65. The compact floating toolbar for a MULTI-
 * selection (selectionMode==='multi', >1 node). Rendered by WorkflowCanvas as
 * a bottom-center React Flow Panel (NOT a per-node NodeToolbar — the selection
 * is a group, so a single group affordance at the canvas bottom is the right
 * anchor and doesn't clip against the per-node floating toolbars).
 *
 * Actions (spec §55, exact order): Duplicate · Delete · Align. "Align" opens a
 * small popover with the 6 align (left/center-h/right/top/middle-v/bottom) +
 * 2 distribute (horizontal/vertical) actions — the same math as the
 * MultiSelectInspector, via the shared `useArrange` hook (single owner of the
 * arrange math, §27).
 *
 * Per spec §55: "Do not show single-node Configure" — there is no Configure
 * action here (that's per-node only, via the floating NodeToolbar). Delete is a
 * deliberate action (no confirm() for the group; reversible via Undo/reload).
 *
 * No `.rs` / no IPC / no new persisted state.
 */
export function GroupToolbar({ ids }: { ids: string[] }) {
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes);
  const { deleteNodes } = useDeleteHelpers();
  const { align, distribute } = useArrange(ids);
  const [alignOpen, setAlignOpen] = useState(false);

  const onDelete = () => {
    deleteNodes(ids);
  };

  const alignBtn = (icon: LucideIcon, label: string, onClick: () => void) => {
    const I = icon;
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          onClick();
          setAlignOpen(false);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <I size={14} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div
      role="toolbar"
      aria-label={`${ids.length} nodes selected`}
      className="pointer-events-auto flex items-center gap-0.5 rounded-panel border border-border-subtle bg-surface-elevated p-0.5 shadow-popover"
    >
      {/* Count label — so AT + sighted users know the toolbar scope. */}
      <span className="px-1.5 text-[11px] font-medium text-text-muted" aria-hidden="true">
        {ids.length}
      </span>

      <ToolbarButton label="Duplicate" icon={Copy} onClick={() => duplicateNodes(ids)} />

      <ToolbarButton label={`Delete ${ids.length} nodes`} icon={Trash} onClick={onDelete} danger />

      <Popover open={alignOpen} onOpenChange={setAlignOpen}>
        <PopoverTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            aria-label="Align selected nodes"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <AlignVerticalJustifyCenter size={15} aria-hidden="true" />
          </span>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[200px]">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-text-muted">Align</span>
              <div className="flex flex-wrap gap-1">
                {alignBtn(AlignVerticalJustifyStart, 'Align left', () => align('x', 'min'))}
                {alignBtn(AlignVerticalJustifyCenter, 'Align center horizontal', () => align('x', 'center'))}
                {alignBtn(AlignVerticalJustifyEnd, 'Align right', () => align('x', 'max'))}
                {alignBtn(AlignHorizontalJustifyStart, 'Align top', () => align('y', 'min'))}
                {alignBtn(AlignHorizontalJustifyCenter, 'Align center vertical', () => align('y', 'center'))}
                {alignBtn(AlignHorizontalJustifyEnd, 'Align bottom', () => align('y', 'max'))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-text-muted">Distribute</span>
              <div className="flex flex-wrap gap-1">
                {alignBtn(AlignHorizontalSpaceAround, 'Distribute horizontal', () => distribute('x'))}
                {alignBtn(AlignVerticalSpaceAround, 'Distribute vertical', () => distribute('y'))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: typeof Copy;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        danger && 'hover:text-text-error',
      )}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}