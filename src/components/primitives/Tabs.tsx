import { type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Tabs — DESIGN_SYSTEM §11 (spec §27/§41). A thin styled wrapper over Radix
 * `@radix-ui/react-tabs` using Void tokens (NO shadcn CLI; Radix imported
 * directly as a headless layer). Radix owns roving tab focus, Arrow nav,
 * `aria-selected`/`aria-controls`, and the active-tab/panel wiring; we own
 * the visuals.
 *
 * Used by the Phase E `NodeDetailPanel` for the Configure / Input / Output /
 * Run / Preview tabs (spec §27). The trigger row sits in the Sheet header; the
 * active panel fills the Sheet body and scrolls independently.
 *
 * `--accent` shadcn alias intentionally NOT referenced (App.css §129).
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex shrink-0 items-center gap-0.5 border-b border-border-subtle px-2',
        className,
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'relative -mb-px inline-flex h-9 items-center px-2.5 text-[12px] font-medium text-text-secondary outline-none',
        'hover:text-text-primary',
        'focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-border-focus',
        // Active: accent text + 2px accent underline (status never color-only —
        // the underline is the shape; accent text reinforces). Uses the focus
        // border token so it composes with the rest of the selected language.
        'data-[state=active]:text-text-primary',
        'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-[2px] data-[state=active]:after:bg-accent',
        className,
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn(
        'flex-1 overflow-y-auto px-3 py-3 outline-none',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
        className,
      )}
    >
      {children}
    </TabsPrimitive.Content>
  );
}