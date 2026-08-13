import { type ReactNode } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';

/**
 * ContextMenu — DESIGN_SYSTEM §11 (spec §53). A thin styled wrapper over Radix
 * `@radix-ui/react-context-menu` using Void tokens (NO shadcn CLI; Radix imported
 * directly as a headless layer). Radix owns the portal + right-click trigger +
 * focus + roving item nav + Esc + outside-click + collision-aware positioning;
 * we own the visuals.
 *
 * Used by the node right-click menu and the canvas (pane) right-click menu
 * (spec §53). Same visual language as `DropdownMenu` so the two menus read as
 * one family. `--accent` shadcn alias intentionally NOT referenced (App.css §129).
 *
 * Unlike DropdownMenu, ContextMenu is anchored to the pointer via a
 * `ContextMenuTrigger` wrapper — there is no explicit Trigger button. Right-
 * click anywhere inside the trigger subtree opens the menu at the cursor.
 */
export const ContextMenu = ContextMenuPrimitive.Root;

export function ContextMenuTrigger({
  children,
  className,
  asChild = true,
  ...props
}: {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
} & Omit<React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Trigger>, 'asChild'>) {
  return (
    <ContextMenuPrimitive.Trigger asChild={asChild} className={className} {...props}>
      {children}
    </ContextMenuPrimitive.Trigger>
  );
}

export function ContextMenuContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        avoidCollisions
        className={cn(
          'z-[var(--z-popover)] min-w-[180px] rounded-panel border border-border-subtle bg-surface-elevated p-1 shadow-popover',
          'focus-visible:outline-none',
          className,
        )}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export interface ContextMenuItemProps {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  /** Render a destructive item (Delete) with text-error; never color-only. */
  danger?: boolean;
  className?: string;
}

export function ContextMenuItem({
  children,
  onSelect,
  disabled,
  danger = false,
  className,
}: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
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
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator({ className }: { className?: string }) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn('my-1 h-px bg-border-subtle', className)}
    />
  );
}

/** Sub-menu (used by "Add Next" / "Add Node" pickers inside the context menu). */
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export function ContextMenuSubTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-control px-2 py-1.5 text-[12px] text-text-secondary outline-none',
        'data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary',
        'data-[state=open]:bg-surface-hover data-[state=open]:text-text-primary',
        className,
      )}
    >
      {children}
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        avoidCollisions
        className={cn(
          'z-[var(--z-popover)] min-w-[220px] rounded-panel border border-border-subtle bg-surface-elevated p-1 shadow-popover',
          'focus-visible:outline-none',
          className,
        )}
      >
        {children}
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}