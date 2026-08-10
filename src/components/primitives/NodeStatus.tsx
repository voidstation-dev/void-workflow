import {
  Circle,
  CircleDashed,
  LoaderCircle,
  Check,
  TriangleAlert,
  XCircle,
  Ban,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import type { PerNodeState } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

/**
 * NodeStatus — DESIGN_SYSTEM §11.5 primitive. The per-node run-status footer
 * strip inside a node card (spec §11.2). Enforces the restraint invariant:
 * NEVER a full-card color wash — only a 2px left-edge accent + footer strip +
 * optional 2px progress bar.
 *
 * Anatomy (verbatim §11.5): `relative flex items-center gap-2 h-7 px-3
 * bg-surface-panel border-t border-border-subtle role="status" aria-live=
 * "polite"` → 2px left-edge accent in status color → icon 14px → label 12px
 * text-secondary → optional progress% 12px text-muted → optional 2px progress
 * bar (role="progressbar"). Reduced-motion: progress bar static fill, no
 * animated stripe (the global media query handles spinner/duration).
 *
 * Idle status renders NOTHING (the footer is only shown when a node is
 * non-idle) — the caller gates rendering on `status !== 'idle'`.
 */
export interface NodeStatusProps {
  status: PerNodeState;
  progress: number | null;
  message?: string;
  compact?: boolean;
}

export const STATUS_ICON: Record<PerNodeState, LucideIcon> = {
  idle: Circle,
  queued: CircleDashed,
  running: LoaderCircle,
  success: Check,
  warning: TriangleAlert,
  failed: XCircle,
  cancelled: Ban,
  skipped: Minus,
};

export const STATUS_LABEL: Record<PerNodeState, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  success: 'Success',
  warning: 'Warning',
  failed: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

// Map each PerNodeState to its semantic status token name (never color-only —
// always icon + label + accent). Token names only, no raw hex. Exported so the
// Inspector's Run section reuses the same maps (status never color-only).
export const STATUS_TOKEN: Record<PerNodeState, string> = {
  idle: 'status-idle',
  queued: 'status-queued',
  running: 'status-running',
  success: 'status-success',
  warning: 'status-warning',
  failed: 'status-error',
  cancelled: 'status-cancelled',
  skipped: 'status-skipped',
};

export function NodeStatus({ status, progress, message, compact = false }: NodeStatusProps) {
  const Icon = STATUS_ICON[status];
  const token = STATUS_TOKEN[status];
  // Spinner only for running + queued, only when motion is allowed (the global
  // @media prefers-reduced-motion zeroes animation-duration so this becomes a
  // static glyph automatically under reduced-motion).
  const spins = (status === 'running' || status === 'queued');
  const label = message || STATUS_LABEL[status];
  const hasProgress = progress !== null && progress > 0 && progress < 100;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${STATUS_LABEL[status]}${progress !== null ? `, ${Math.round(progress)} percent` : ''}`}
      className={cn(
        'relative flex items-center gap-1.5 border-t border-border-subtle bg-surface-panel',
        compact ? 'h-6 px-2' : 'h-7 px-3',
      )}
    >
      {/* 2px left-edge accent in the status color (restraint invariant). */}
      <span
        className="absolute left-0 inset-y-0 w-0.5"
        style={{ background: `var(--${token})` }}
        aria-hidden="true"
      />
      <Icon
        size={14}
        className={cn(spins && 'animate-spin')}
        style={{ color: `var(--${token})` }}
        aria-hidden="true"
      />
      <span className="truncate text-[12px] text-text-secondary">{label}</span>
      {progress !== null && (
        <span className="ml-auto shrink-0 text-[11px] text-text-muted">{Math.round(progress)}%</span>
      )}
      {hasProgress && (
        <span
          role="progressbar"
          aria-valuenow={Math.round(progress!)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Node progress"
          className="absolute bottom-0 inset-x-0 h-0.5 bg-border-status"
        >
          <span
            className="block h-full"
            style={{ width: `${progress}%`, background: 'var(--status-running)' }}
          />
        </span>
      )}
    </div>
  );
}