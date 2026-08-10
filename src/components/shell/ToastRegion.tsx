import { useEffect, useRef } from 'react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { Toast } from '@/store/workflowStore';

/**
 * ToastRegion — Tier-1 feedback (spec §10.1). Replaces the 5 alert() calls.
 * Fixed bottom-right, 280px, surface-elevated, stack max 3. success/info
 * auto-dismiss 5s; error 6s OR explicit dismiss with a "Details" expander.
 * Status is never color-only: each kind has an icon + label + color.
 */
export function ToastRegion() {
  const toasts = useWorkflowStore((s) => s.toasts);
  const dismiss = useWorkflowStore((s) => s.dismissToast);

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[var(--z-toast)] flex w-[280px] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ttl = toast.kind === 'error' ? 6000 : 5000;
    timerRef.current = setTimeout(onDismiss, ttl);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.kind, onDismiss]);

  const isError = toast.kind === 'error';
  const isSuccess = toast.kind === 'success';
  const Icon = isError ? TriangleAlert : isSuccess ? Check : Info;
  const dotClass = isError
    ? 'bg-status-error'
    : isSuccess
      ? 'bg-status-success'
      : 'bg-text-muted';
  const live = isError ? 'assertive' : 'polite';

  return (
    <div
      role="status"
      aria-live={live}
      className="flex gap-2 rounded-panel border border-border-default bg-surface-elevated p-2 text-xs shadow-popover"
    >
      <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', dotClass)} aria-hidden="true" />
      <Icon size={14} className={cn('mt-0.5 shrink-0', isError ? 'text-status-error' : isSuccess ? 'text-status-success' : 'text-text-muted')} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="break-words text-text-primary">{toast.title}</div>
        {toast.description && (
          isError ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-text-muted underline">Details</summary>
              <div className="mt-1 text-text-secondary">{toast.description}</div>
            </details>
          ) : (
            <div className="mt-0.5 text-text-secondary">{toast.description}</div>
          )
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="flex min-w-6 min-h-6 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text-primary"
      >
        <X size={14} />
      </button>
    </div>
  );
}