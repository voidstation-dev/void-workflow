import { useRef, type KeyboardEvent } from 'react';
import { Workflow, FolderKanban, History, Settings } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { ActiveScreen } from '@/store/workflowStore';

interface RailItem {
  screen: ActiveScreen;
  label: string;
  icon: typeof Workflow;
  hint: string;
  // Kept optional (defaulting false) so the existing disabled-state CSS stays
  // for future use without breaking strict tsc. Phase 8 enables all four items.
  disabled?: boolean;
}

const ITEMS: RailItem[] = [
  { screen: 'workflow', label: 'Workflow', icon: Workflow, hint: 'Workflow canvas' },
  { screen: 'projects', label: 'Projects', icon: FolderKanban, hint: 'Projects' },
  { screen: 'history', label: 'History', icon: History, hint: 'Run history' },
  { screen: 'settings', label: 'Settings', icon: Settings, hint: 'Settings' },
];

/**
 * AppRail — 56px fixed icon-only navigation (spec §4). Alt+1..4 jump to
 * screens; roving tabindex + ArrowUp/Down/Home/End; active item shows a 2px
 * left accent bar + filled icon + aria-current="page" (active state is NEVER
 * color-only). `aria-orientation="vertical"` on the nav (spec §4 line 144).
 * Collapsible to a 4px re-open strip (Ctrl/Cmd+Shift+B).
 */
export function AppRail() {
  const collapsed = useWorkflowStore((s) => s.appRailCollapsed);
  const activeScreen = useWorkflowStore((s) => s.activeScreen);
  const setActiveScreen = useWorkflowStore((s) => s.setActiveScreen);
  const toggle = useWorkflowStore((s) => s.toggleAppRail);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Expand app navigation rail"
        title="Expand app rail (Ctrl/Cmd+Shift+B)"
        className="flex w-6 cursor-pointer items-center justify-center bg-surface-sidebar border-r border-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {/* Visible 8px bar; the 24px button is the real hit target (audit §2). */}
        <span className="h-full w-2 bg-surface-hover" aria-hidden="true" />
      </button>
    );
  }

  const focusItem = (index: number) => {
    const i = Math.max(0, Math.min(ITEMS.length - 1, index));
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(ITEMS.length - 1);
    }
  };

  return (
    <nav
      aria-label="App navigation"
      aria-orientation="vertical"
      className="flex w-14 flex-col items-center gap-1 bg-surface-sidebar border-r border-border-subtle py-2"
    >
      {ITEMS.map((item, index) => {
        const Icon = item.icon;
        const isActive = activeScreen === item.screen;
        const isDisabled = item.disabled ?? false;
        return (
          <button
            key={item.screen}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            disabled={isDisabled}
            aria-disabled={isDisabled || undefined}
            aria-current={isActive ? 'page' : undefined}
            aria-label={isDisabled ? `${item.label} — ${item.hint}` : item.label}
            title={isDisabled ? `${item.label} — ${item.hint}` : item.label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => !isDisabled && setActiveScreen(item.screen)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative flex h-10 w-10 items-center justify-center rounded-control',
              'text-text-muted hover:bg-surface-hover hover:text-text-primary',
              'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
              isActive && 'bg-surface-hover text-text-primary',
            )}
          >
            {/* 2px left accent bar — active state is NEVER color-only (icon +
                filled bg + accent bar + aria-current). aria-hidden (decorative). */}
            {isActive && (
              <span
                className="absolute left-0 inset-y-0 w-0.5 bg-accent"
                aria-hidden="true"
              />
            )}
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}