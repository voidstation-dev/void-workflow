import { useWorkflowStore } from '@/store/workflowStore';

/**
 * StatusAnnouncer — the single canonical aria-live channel for transient
 * spatial feedback (spec §10.4): selection changes, connection results, run
 * milestones, library add-mode. Visually hidden; keyed by announcement id so
 * each new text is announced (repeat text with a new id still announces).
 */
export function StatusAnnouncer() {
  const announcement = useWorkflowStore((s) => s.announcement);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement.text}
    </div>
  );
}