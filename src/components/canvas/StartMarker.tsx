import { Play } from 'lucide-react';

/**
 * StartMarker — a React Flow `Panel` overlay (NOT a node) marking the workflow
 * start (spec §7.2 / §10). The Phase 0 audit flagged that a start marker must
 * stay a presentation overlay, not a real graph node — so it never participates
 * in execution, `nodeTypes`, save JSON, or `isValidConnection`. It is purely a
 * visual affordance pinned to the top-left of the canvas viewport.
 *
 * It is non-interactive (no `role=button`, no onClick): it labels the canvas
 * entry point for orientation. `aria-hidden` because it carries no actionable
 * semantics — the Run action lives in the WorkflowHeader (spec §3.A).
 *
 * Tokens only (no raw hex). The marker uses `bg-accent` + `text-text-on-accent`
 * so it reads as the primary entry affordance without a status wash.
 */
export function StartMarker() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative flex items-center gap-1.5 rounded-full border border-[var(--start-marker-border)] bg-[var(--start-marker)] px-3 py-1.5 text-[11px] font-medium text-[var(--start-marker-text)] shadow-[0_1px_2px_rgba(24,32,48,0.04)]"
    >
      <Play size={11} aria-hidden="true" />
      Start here
      <span className="absolute left-1/2 top-full h-6 border-l border-dashed border-border-default" aria-hidden="true" />
    </div>
  );
}
