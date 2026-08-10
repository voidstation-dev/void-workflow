import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * KeyboardHelpDialog — Tier-3 modal (spec §10.3 #3). Opens when
 * `uiSlice.dialog === 'keyboard-help'` (Ctrl/Cmd+?). Renders the spec §15
 * keyboard table. Focus trap + scrim + Esc closes + returns focus.
 */
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'F6 / Shift+F6', action: 'Cycle zone landmarks forward / backward' },
  { keys: 'Alt+1 .. 4', action: 'App Rail: Workflow / Projects / History / Settings' },
  { keys: 'Ctrl/Cmd+Shift+B', action: 'Toggle App Navigation Rail' },
  { keys: 'Ctrl/Cmd+B', action: 'Toggle Node Library' },
  { keys: 'Ctrl/Cmd+I', action: 'Toggle Inspector' },
  { keys: 'Ctrl/Cmd+J', action: 'Toggle Bottom Dock' },
  { keys: 'Ctrl/Cmd+S', action: 'Save' },
  { keys: 'Ctrl/Cmd+Enter', action: 'Run (or Stop while running)' },
  { keys: 'Esc', action: 'Clear selection (then exit canvas); close modal/menu' },
  { keys: 'Ctrl/Cmd+?', action: 'Keyboard Help dialog' },
  { keys: 'Enter / Space', action: 'Activate focused control; library item add-mode; canvas node select' },
  { keys: 'Arrow keys', action: 'Rail nav; library item nav; canvas nudge (Shift = 10px)' },
  { keys: 'c', action: 'Connect from a focused output port (then Enter on a target input)' },
  { keys: 'Delete / Backspace', action: 'Delete selected node/edge' },
  { keys: 'Ctrl/Cmd+A', action: 'Select all nodes (canvas)' },
  { keys: 'Ctrl/Cmd+D', action: 'Duplicate selected node(s) (canvas)' },
  { keys: 'Shift+drag', action: 'Rubberband select on canvas' },
];

export function KeyboardHelpDialog() {
  const open = useWorkflowStore((s) => s.dialog === 'keyboard-help');
  const close = useWorkflowStore((s) => s.setDialog);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'),
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

  return (
    <div className="fixed inset-0 z-[var(--z-modal)]">
      <div aria-hidden="true" className="absolute inset-0 bg-surface-overlay" onClick={() => close(null)} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-help-title"
        className="absolute left-1/2 top-1/2 max-h-[85vh] w-[480px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel border border-border-default bg-surface-elevated shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <h2 id="kbd-help-title" className="text-[13px] font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => close(null)}
            className="rounded-control p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <table className="w-full text-[12px]">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} className="border-b border-border-subtle last:border-0">
                <th scope="row" className="px-3 py-1.5 text-left font-medium text-text-secondary">
                  <kbd className="rounded-control bg-surface-panel px-1.5 py-0.5 text-text-primary">{s.keys}</kbd>
                </th>
                <td className="px-3 py-1.5 text-text-muted">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-border-subtle px-3 py-2 text-[11px] text-text-muted">
          Stop is a deliberate button click only — Esc does not cancel a run.
        </div>
      </div>
    </div>
  );
}