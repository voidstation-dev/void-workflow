import type { LucideIcon } from 'lucide-react';
import { Circle, TriangleAlert, XCircle, Check, Ban } from 'lucide-react';
import type { RunStatus, HealthState } from '@/store/workflowStore';
import { cn } from '@/lib/utils';

/**
 * StatusBadge — DESIGN_SYSTEM §11.4. A compact inline status: dot + optional
 * icon + REQUIRED non-empty label. NEVER color-only — the label is always
 * present and the dot/icon reinforce it. Used by History run-status rows and
 * Settings System Health rows.
 *
 * The StatusValue→token map is EXHAUSTIVE over both RunStatus (idle/starting/
 * running/succeeded/failed/cancelled) and HealthState (ready/configured/
 * degraded/down). Token names only — no raw hex.
 */
export type StatusValue = RunStatus | HealthState;

export interface StatusBadgeProps {
  status: StatusValue;
  label: string;
  icon?: LucideIcon;
  dot?: boolean;
  size?: 'sm' | 'md';
  live?: 'off' | 'polite' | 'assertive';
}

// EXHAUSTIVE over RunStatus + HealthState. A status never maps to an empty
// token; an unmapped value would render with no dot color, which the map's
// exhaustiveness prevents.
const TOKEN: Record<StatusValue, string> = {
  // RunStatus
  idle: 'status-idle',
  starting: 'status-queued',
  running: 'status-running',
  succeeded: 'status-success',
  failed: 'status-error',
  cancelled: 'status-cancelled',
  // HealthState
  ready: 'status-success',
  configured: 'status-success',
  degraded: 'status-warning',
  down: 'status-error',
  unknown: 'status-idle',
};

const ICON: Record<StatusValue, LucideIcon> = {
  idle: Circle,
  starting: Circle,
  running: Circle,
  succeeded: Check,
  failed: XCircle,
  cancelled: Ban,
  ready: Check,
  configured: Check,
  degraded: TriangleAlert,
  down: XCircle,
  unknown: Circle,
};

const WORD: Record<StatusValue, string> = {
  idle: 'idle',
  starting: 'starting',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  ready: 'ready',
  configured: 'configured',
  degraded: 'degraded',
  down: 'down',
  unknown: 'unknown',
};

export function StatusBadge({
  status,
  label,
  icon,
  dot = true,
  size = 'sm',
  live = 'off',
}: StatusBadgeProps) {
  const token = TOKEN[status];
  const Glyph = icon ?? ICON[status];
  return (
    <span
      aria-live={live === 'off' ? undefined : live}
      className={cn(
        'inline-flex items-center gap-1 rounded-control',
        size === 'sm' ? 'text-[11px]' : 'text-[12px]',
      )}
    >
      {dot && (
        <span
          className="size-1.5 rounded-full"
          style={{ background: `var(--${token})` }}
          aria-hidden="true"
        />
      )}
      <Glyph size={12} style={{ color: `var(--${token})` }} aria-hidden="true" />
      <span className="text-text-secondary">{label}</span>
      <span className="sr-only">{WORD[status]}</span>
    </span>
  );
}