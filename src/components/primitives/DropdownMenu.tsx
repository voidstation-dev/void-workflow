import { type ReactNode } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * DropdownMenu — DESIGN_SYSTEM §11 (spec §16/§24/§53). A thin styled wrapper
 * over Radix `@radix-ui/react-dropdown-menu` using Void tokens (NO shadcn CLI;
 * Radix imported directly as a headless layer). Radix owns portal + focus +
 * roving item nav + Esc + outside-click + collision-aware positioning; we own
 * the visuals.
 *
 * Used by the node "More" overflow menu (spec §24) and the right-click context
 * menus (spec §53). NOT for the Add Next picker (use Popover + Command) — this
 * is a flat action menu, not a searchable list.
 *
 * `--accent` shadcn alias intentionally NOT referenced (App.css §129).
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  children,
  className,
  side = 'bottom',
  align = 'end',
  sideOffset = 6,
}: {
  children: ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        side={side}
        sideOffset={sideOffset}
        align={align}
        avoidCollisions
        className={cn(
          'z-[var(--z-popover)] min-w-[180px] rounded-panel border border-border-subtle bg-surface-elevated p-1 shadow-popover',
          'focus-visible:outline-none',
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  /** Render a destructive item (Delete) with text-error; never color-only. */
  danger?: boolean;
  className?: string;
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  danger = false,
  className,
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-control px-2 py-1.5 text-[12px] text-text-secondary outline-none',
        'data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger && 'text-text-error data-[highlighted]:text-text-error',
        className,
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('my-1 h-px bg-border-subtle', className)}
    />
  );
}