import { type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

/**
 * Popover — DESIGN_SYSTEM §11 (spec §63). A thin styled wrapper over Radix
 * `@radix-ui/react-popover` using Void tokens (NO shadcn CLI — the Phase 1
 * decision locked custom primitives; Radix is imported directly as a headless,
 * unstyled layer and styled here). Radix owns portal + focus + outside-click +
 * Esc + collision-aware positioning (side/align + avoidCollisions); we own the
 * visuals: `bg-surface-elevated`, `border-border-subtle`, `rounded-panel`,
 * `shadow-popover`, `z-popover`.
 *
 * Used by Add Next (the node picker, spec §20) and any other anchored floating
 * panel. NOT for modals (use Dialog) or menus (use DropdownMenu).
 *
 * Tokens by name only. `--accent` shadcn alias is intentionally NOT referenced
 * (App.css §129 — it would shadow Void's own `--accent`).
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export interface PopoverContentProps {
  children: ReactNode;
  className?: string;
  /** Radix side relative to the trigger. Default 'bottom'. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Width to clamp the panel to. Pass a Tailwind class (e.g. 'w-[320px]'). */
  sideOffset?: number;
}

export function PopoverContent({
  children,
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side={side}
        sideOffset={sideOffset}
        align={align}
        avoidCollisions
        // Pop the panel above React Flow's canvas chrome but below modals.
        // z-popover (30) < z-modal (50).
        className={cn(
          'z-[var(--z-popover)] min-w-[200px] rounded-panel border border-border-subtle bg-surface-elevated p-1 shadow-popover',
          'focus-visible:outline-none',
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}