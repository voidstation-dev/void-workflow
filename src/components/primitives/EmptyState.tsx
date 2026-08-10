import type { ReactNode } from 'react';

/**
 * EmptyState — DESIGN_SYSTEM §11.8 primitive. The single primitive for every
 * enumerated empty state (spec §12). A real panel with a sentence + optional
 * primary/secondary actions. No illustration (restrained, plan §7). Never a
 * dead-end.
 *
 * Anatomy (verbatim §11.8): `flex flex-col items-center gap-3 p-6 text-center
 * role="status" aria-live={live}` → optional icon → h2 (14px semibold
 * text-primary) → p (12px text-secondary max-w-xs) → optional action →
 * secondaryActions. Tokens: text.primary/secondary/muted, surface.panel +
 * border.subtle + radius.control (action buttons).
 *
 * The caller decides DOM-removal-at-first-node for the canvas variant (spec
 * §7.1): render EmptyState only while `nodes.length === 0` so it is removed
 * from the DOM (not hidden) the moment a node is added.
 */
export interface EmptyStateProps {
  title: string;
  body: string;
  /** Optional primary action (single button). */
  action?: { label: string; onClick: () => void; icon?: ReactNode };
  /** Secondary actions row (e.g. the two canvas template buttons). */
  secondaryActions?: ReactNode;
  /** `positive` tone for "No problems. Workflow is valid." (reassuring, not error). */
  tone?: 'default' | 'positive';
  centered?: boolean;
  /** `aria-live` on first appearance (spec §12); 'off' once static. */
  live?: 'polite' | 'off';
}

export function EmptyState({
  title,
  body,
  action,
  secondaryActions,
  tone = 'default',
  centered = true,
  live = 'polite',
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live={live}
      className={`flex flex-col gap-3 p-6 text-center ${centered ? 'items-center justify-center' : ''} mx-auto max-w-xs`}
    >
      <h2
        className={`text-[14px] font-semibold ${
          tone === 'positive' ? 'text-status-success' : 'text-text-primary'
        }`}
      >
        {title}
      </h2>
      <p className="text-[12px] text-text-secondary">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 rounded-control border border-border-subtle bg-surface-panel px-2.5 py-1 text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          {action.icon}
          {action.label}
        </button>
      )}
      {secondaryActions && <div className="flex flex-wrap items-center justify-center gap-2">{secondaryActions}</div>}
    </div>
  );
}