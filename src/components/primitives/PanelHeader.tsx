import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * PanelHeader — DESIGN_SYSTEM §11.2. A 32px (28px dense) titled header for a
 * Panel: 13px semibold title in an h2/h3, an optional leading icon, trailing
 * actions, and an optional collapse affordance. Composed by the Phase 8 App
 * Screens and Settings sections.
 *
 * Anatomy (§11.2): `flex items-center gap-2 px-2 border-b border-subtle` with
 * the title in a heading element. The collapse button carries
 * aria-expanded/aria-controls/aria-label. Tokens by name only.
 */
export interface PanelHeaderProps {
  title: string;
  level?: 2 | 3;
  icon?: LucideIcon;
  actions?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  controlsId?: string;
  dense?: boolean;
  className?: string;
}

export function PanelHeader({
  title,
  level = 2,
  icon: Icon,
  actions,
  collapsible = false,
  collapsed = false,
  onToggle,
  controlsId,
  dense = false,
  className,
}: PanelHeaderProps) {
  const Heading = (level === 2 ? 'h2' : 'h3') as 'h2' | 'h3';
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border-subtle px-2',
        dense ? 'h-7' : 'h-8',
        className,
      )}
    >
      {collapsible && (
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={controlsId}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={onToggle}
          className="flex shrink-0 items-center text-text-muted hover:text-text-primary"
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn('transition-transform', collapsed && '-rotate-90')}
          />
        </button>
      )}
      {Icon && <Icon size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />}
      <Heading className="flex-1 truncate text-[13px] font-semibold text-text-primary">
        {title}
      </Heading>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}