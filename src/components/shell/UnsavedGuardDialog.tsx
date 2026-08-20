import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { LoaderCircle } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkflowController } from '@/hooks/useWorkflowController';

/**
 * UnsavedGuardDialog — Tier-3 modal (spec §10.3 #1). Triggered by the
 * controller's Tauri `onCloseRequested` handler when `saveSlice.dirty===true`.
 * Save → saves then approves close; Discard → marks clean then approves close;
 * Cancel → dismisses the dialog (close is prevented, window stays open).
 *
 * The close-approval escape hatch (`window.__voidApproveClose`) is published by
 * the controller; this dialog calls it after Save/Discard so the window close
 * re-triggers and is allowed through.
 */
export function UnsavedGuardDialog() {
  const open = useWorkflowStore((s) => s.dialog === 'unsaved-guard');
  const close = useWorkflowStore((s) => s.setDialog);
  const markClean = useWorkflowStore((s) => s.markClean);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const controller = useWorkflowController();

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    // Focus the primary action (Save) first so Enter activates it — not Cancel
    // (the DOM-first button). Use a data attribute to pick it regardless of the
    // button order in the DOM (Cancel/Discard/Save).
    const primary = dialogRef.current?.querySelector<HTMLElement>('[data-primary="true"]');
    (primary ?? dialogRef.current?.querySelector<HTMLElement>('button'))?.focus();

    // Tab trap — mirror KeyboardHelpDialog so Tab/Shift+Tab can't escape to the
    // background scrim (audit §4/Focus). Disabled buttons are skipped.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const approveClose = () => {
    close(null);
    const approve = (window as any).__voidApproveClose as (() => void) | undefined;
    if (approve) {
      approve();
    } else if (isTauri()) {
      void getCurrentWindow().close();
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)]">
      {/* Scrim: clicking outside the dialog cancels (matches KeyboardHelpDialog).
          stopPropagation on the panel below keeps inner clicks from closing. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-surface-overlay"
        onClick={() => close(null)}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-desc"
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-1/2 w-[360px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-border-default bg-surface-elevated shadow-modal"
      >
        <div className="px-3 py-3">
          <h2 id="unsaved-title" className="text-[13px] font-semibold text-text-primary">Unsaved changes</h2>
          <p id="unsaved-desc" className="mt-1 text-[12px] text-text-muted">
            You have unsaved changes. Save before closing?
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => close(null)}
              className="rounded-control bg-surface-panel px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                markClean();
                approveClose();
              }}
              className="rounded-control bg-surface-panel px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-hover"
            >
              Discard
            </button>
            <button
              type="button"
              data-primary="true"
              disabled={saving}
              aria-busy={saving}
              onClick={() => {
                setSaving(true);
                void controller.save().then((ok) => {
                  setSaving(false);
                  // Only close the window when the save actually succeeded —
                  // save() returns false on error (and has already surfaced a
                  // toast). Closing on failure would silently lose the user's
                  // changes. Keep the dialog open so they can retry or cancel.
                  if (ok) approveClose();
                });
              }}
              className="flex items-center gap-1.5 rounded-control bg-accent px-3 py-1.5 text-[12px] text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}