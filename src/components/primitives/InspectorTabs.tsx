import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * InspectorTabs — DESIGN_SYSTEM §8.2 / §14. The Inspector section tabs.
 * `role="tablist" aria-label="Inspector sections"`, each tab `role="tab"`
 * `aria-selected` `aria-controls` with roving tabindex (0 on active, -1 on
 * others), ArrowLeft/Right to switch (wraps), content in `role="tabpanel"
 * aria-labelledby`. Active tab is controlled by the parent (NodeInspector).
 *
 * Rendered ONLY when a node declares more than one `inspectorTab` (spec §8.2:
 * "simple nodes hide tabs they don't have"). All 3 Phase 6 validation nodes
 * (Text Input, Text Transform, Delay) have a single 'Configuration' tab and so
 * skip this primitive entirely — NodeInspector renders the one section directly.
 */
export interface InspectorTabsProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
  children: (activeId: string) => ReactNode;
}

export function InspectorTabs({ tabs, activeTab, onChange, children }: InspectorTabsProps) {
  const onKey = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (currentIndex + dir + tabs.length) % tabs.length;
    const nextId = tabs[next].id;
    onChange(nextId);
    // Roving tabindex: focus the newly active tab.
    document.getElementById(`inspector-tab-${nextId}`)?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Inspector sections"
        className="flex border-b border-border-subtle"
      >
        {tabs.map((t, i) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`inspector-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`inspector-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'h-7 px-2 text-[12px]',
                isActive
                  ? 'border-b-2 border-accent text-text-primary'
                  : 'text-text-muted',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`inspector-panel-${activeTab}`}
        aria-labelledby={`inspector-tab-${activeTab}`}
        className="p-3 space-y-2"
      >
        {children(activeTab)}
      </div>
    </div>
  );
}