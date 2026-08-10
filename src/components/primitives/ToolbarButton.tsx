import type { ReactNode } from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ToolbarButton — DESIGN_SYSTEM §11.3. A compact action button for toolbars and
 * screen headers. Variants: primary (accent fill), secondary (panel fill),
 * ghost (transparent → hover), danger (text-error ghost — background NEVER
 * saturated, §8.2 restraint). Sizes: default (h-7), sm (h-6), icon (square h-7
 * w-7, requires ariaLabel + title). Supports loading + active (aria-pressed) +
 * disabled (aria-disabled + title tooltip).
 *
 * Tokens by name only. Never color-only: an icon-only button still carries a
 * visible/accessible label via ariaLabel + title. Composed by the Phase 8 App
 * Screens and the TopToolbar back affordance.
 */
export type ToolbarButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ToolbarButtonSize = 'default' | 'sm' | 'icon';

export interface ToolbarButtonProps {
  variant?: ToolbarButtonVariant;
  size?: ToolbarButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  active?: boolean;
  ariaLabel?: string;
  title?: string;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<ToolbarButtonVariant, string> = {
  primary: 'bg-accent text-text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface-panel text-text-secondary border border-border-subtle hover:bg-surface-hover hover:text-text-primary',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  danger: 'text-text-error hover:bg-surface-hover',
};

const SIZE_CLASS: Record<ToolbarButtonSize, string> = {
  default: 'h-7 px-2.5 gap-1.5',
  sm: 'h-6 px-2 gap-1 text-[11px]',
  icon: 'h-7 w-7 justify-center',
};

export function ToolbarButton({
  variant = 'ghost',
  size = 'default',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  active = false,
  ariaLabel,
  title,
  onClick,
  children,
  className,
}: ToolbarButtonProps) {
  const isIconOnly = size === 'icon';
  // Icon-only buttons MUST expose an accessible name.
  const resolvedTitle = title ?? (isIconOnly ? ariaLabel : undefined);
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-disabled={disabled || loading || undefined}
      aria-pressed={active || undefined}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      title={resolvedTitle}
      onClick={() => !disabled && !loading && onClick?.()}
      className={cn(
        'inline-flex shrink-0 items-center rounded-control text-[12px] font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {loading ? (
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={isIconOnly ? 16 : 14} aria-hidden="true" />
      ) : null}
      {children}
      {IconRight && <IconRight size={14} aria-hidden="true" />}
    </button>
  );
}