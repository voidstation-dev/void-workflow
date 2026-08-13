import { type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dialog (Sheet) — DESIGN_SYSTEM §11 (spec §26/§27/§41). A thin styled wrapper
 * over Radix `@radix-ui/react-dialog` using Void tokens (NO shadcn CLI; Radix
 * imported directly as a headless layer). Radix owns portal + focus trap +
 * Esc + outside-click + `aria-modal`; we own the visuals.
 *
 * Used by the Phase E `NodeDetailPanel` as a right-side Sheet (spec §26
 * "open large right-side Node Detail Sheet", recommended width 420–520px).
 * The `side` prop slides from the right by default; the overlay dims the
 * canvas without hiding it (a Sheet, not a centered modal — the canvas stays
 * visible so the node-under-edit is in context).
 *
 * `--accent` shadcn alias intentionally NOT referenced (App.css §129).
 * No animation utilities (tailwindcss-animate not installed) — Radix works
 * un-animated; the `data-[state=open]` classes below are present for future
 * use but intentionally do not reference animate-in utilities.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  children,
  className,
  side = 'right',
  width = 480,
  onOpenAutoFocus,
}: {
  children: ReactNode;
  className?: string;
  side?: 'right' | 'left' | 'center';
  /** Sheet width in px (spec §26: 420–520). Ignored for center. */
  width?: number;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-[calc(var(--z-modal)-1)] bg-black/20 backdrop-blur-[1px]',
          'data-[state=open]:opacity-100',
        )}
      />
      <DialogPrimitive.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'fixed z-[var(--z-modal)] flex flex-col bg-surface-elevated shadow-popover outline-none',
          // Right-side Sheet: full height, top/right/bottom 0, rounded left.
          side === 'right' &&
            'inset-y-0 right-0 left-auto rounded-l-panel border-y border-l border-border-subtle',
          side === 'left' &&
            'inset-y-0 left-0 right-auto rounded-r-panel border-y border-r border-border-subtle',
          side === 'center' &&
            'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-panel border border-border-subtle',
          className,
        )}
        style={side !== 'center' ? { width } : undefined}
        aria-describedby={undefined}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Sheet close button — top-right, icon-only, aria-label. */
export function DialogCloseButton({ label = 'Close' }: { label?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <X size={16} aria-hidden="true" />
    </DialogPrimitive.Close>
  );
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Title
      className={cn('text-[14px] font-semibold text-text-primary', className)}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Description
      className={cn('text-[12px] text-text-muted', className)}
    >
      {children}
    </DialogPrimitive.Description>
  );
}