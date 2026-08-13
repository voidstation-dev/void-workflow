import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * InspectorSection — DESIGN_SYSTEM §11.6. A titled, collapsible group of
 * PropertyRows inside the Inspector (Basic / Advanced / Danger, spec §8.2).
 * Drives the generic inspector from `configSchema`.
 *
 * Anatomy (§11.6): `<section border-b border-subtle last:border-0>` → (danger
 * variant: top `border-t border-subtle` divider) → header button (aria-expanded
 * + aria-controls, 12px semibold, ChevronDown rotated when collapsed) → body
 * `role="region" aria-labelledby` (unmounted when collapsed, so no tabbable
 * content leaks).
 *
 * Danger variant (§8.2): heading `text-error` + visually-hidden "Danger zone: "
 * prefix + top border divider. Action label text-error, background NEVER
 * saturated (restraint — plan §7).
 *
 * Blocking-fix #2 (verifier): `bodyId` + `headingId` are derived via `useId()`
 * and wired to aria-controls / the region id / aria-labelledby / the heading id
 * so the §11.6 `role="region" aria-labelledby` contract holds.
 */
export interface InspectorSectionProps {
  title: string;
  level?: 2 | 3;
  icon?: LucideIcon;
  variant?: 'default' | 'danger';
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  id?:string;
  children: ReactNode;
}

export function InspectorSection({
  title,
  level = 3,
  icon: Icon,
  variant = 'default',
  defaultCollapsed = false,
  collapsed,
  onToggle,
  id,
  children,
}: InspectorSectionProps) {
  const autoId = useId();
  const bodyId = id ?? autoId;
  const headingId = `${bodyId}-h`;

  const isControlled = collapsed !== undefined && onToggle !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = isControlled ? collapsed : internalCollapsed;
  const toggle = isControlled ? onToggle : () => setInternalCollapsed((c) => !c);

  return (
    <section className="border-b border-border-subtle last:border-0">
      {variant === 'danger' && <div className="border-t border-border-subtle" />}
      <div role="heading" aria-level={level} id={headingId}>
        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls={bodyId}
          onClick={toggle}
          className="flex w-full items-center gap-1.5 px-3 h-7 text-[12px] font-semibold"
        >
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={cn('shrink-0 transition-transform', isCollapsed && '-rotate-90')}
          />
          {Icon ? (
            <Icon size={12} className="shrink-0" aria-hidden="true" />
          ) : null}
          {variant === 'danger' && (
            <span className="sr-only">Danger zone: </span>
          )}
          <span className={variant === 'danger' ? 'text-text-error' : 'text-text-secondary'}>
            {title}
          </span>
        </button>
      </div>
      {!isCollapsed && (
        <div
          id={bodyId}
          role="region"
          aria-labelledby={headingId}
          className="p-3 space-y-2"
        >
          {children}
        </div>
      )}
    </section>
  );
}