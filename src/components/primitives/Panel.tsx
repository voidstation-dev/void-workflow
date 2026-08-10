import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Panel — DESIGN_SYSTEM §11.1. A semantic surface container: the outer shell of
 * a zone (aside/nav/section/main) or a nested card. NOT a zone landmark itself —
 * the caller picks the element + aria-label; Panel only supplies surface/border/
 * radius/padding/shadow. Composed by the Phase 8 App Screens and their nested
 * cards.
 *
 * Anatomy (§11.1): a flex column with the chosen surface background, an
 * optional border, rounded corners, and padding. Tokens by name only — no raw
 * hex. `as` maps to the rendered element; when as is a landmark-ish element
 * (aside/nav/section/main), ariaLabel SHOULD be supplied.
 */
export type PanelSurface = 'canvas' | 'sidebar' | 'panel' | 'elevated';
export type PanelBorder = 'none' | 'subtle' | 'default';
export type PanelRadius = 'none' | 'control' | 'panel';

export interface PanelProps {
  as?: ElementType;
  surface?: PanelSurface;
  border?: PanelBorder;
  radius?: PanelRadius;
  padding?: 0 | 1 | 2 | 3 | 4;
  shadow?: 'none' | 'popover';
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

const SURFACE_CLASS: Record<PanelSurface, string> = {
  canvas: 'bg-surface-canvas',
  sidebar: 'bg-surface-sidebar',
  panel: 'bg-surface-panel',
  elevated: 'bg-surface-elevated',
};

const BORDER_CLASS: Record<PanelBorder, string> = {
  none: '',
  subtle: 'border border-border-subtle',
  default: 'border border-border-default',
};

const RADIUS_CLASS: Record<PanelRadius, string> = {
  none: '',
  control: 'rounded-control',
  panel: 'rounded-panel',
};

const PAD_CLASS: Record<number, string> = {
  0: '',
  1: 'p-1',
  2: 'p-2',
  3: 'p-3',
  4: 'p-4',
};

export function Panel({
  as,
  surface = 'panel',
  border = 'subtle',
  radius = 'none',
  padding = 0,
  shadow = 'none',
  ariaLabel,
  className,
  children,
}: PanelProps) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 flex-col',
        SURFACE_CLASS[surface],
        BORDER_CLASS[border],
        RADIUS_CLASS[radius],
        PAD_CLASS[padding],
        shadow === 'popover' && 'shadow-popover',
        className,
      )}
    >
      {children}
    </Tag>
  );
}