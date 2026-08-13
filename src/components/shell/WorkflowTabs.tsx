import { useRef, type KeyboardEvent } from 'react';
import { Workflow, Settings, History, Gauge } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { ActiveScreen } from '@/store/workflowStore';

/**
 * WorkflowTabs — secondary horizontal navigation (spec §3.B). Replaces the prior
 * left AppRail. Four tabs: Workflow / Settings / Runs / Environment. Alt+1..4 jump
 * (bound in useWorkspaceShortcuts); roving tabindex + ArrowLeft/Right/Home/End
 * within the row. The active tab is NEVER color-only: accent underline + filled
 * bg + aria-current="page" + bold text. The tab row is its own grid row (40px)
 * directly under the header.
 */
interface TabItem {
  screen: ActiveScreen;
  label: string;
  icon: typeof Workflow;
  hint: string;
}

const TABS: TabItem[] = [
  { screen: 'workflow', label: 'Workflow', icon: Workflow, hint: 'Workflow canvas (Alt+1)' },
  { screen: 'settings', label: 'Settings', icon: Settings, hint: 'Workflow settings (Alt+2)' },
  { screen: 'runs', label: 'Runs', icon: History, hint: 'Run history (Alt+3)' },
  { screen: 'environment', label: 'Environment', icon: Gauge, hint: 'System & provider health (Alt+4)' },
];

export function WorkflowTabs() {
  const activeScreen = useWorkflowStore((s) => s.activeScreen);
  const setActiveScreen = useWorkflowStore((s) => s.setActiveScreen);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const i = Math.max(0, Math.min(TABS.length - 1, index));
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusTab(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusTab(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(TABS.length - 1);
    }
  };

  return (
    <nav
      aria-label="Workspace sections"
      aria-orientation="horizontal"
      className="flex h-10 items-center gap-1 bg-surface-sidebar border-b border-border-subtle px-3"
    >
      {TABS.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = activeScreen === tab.screen;
        return (
          <button
            key={tab.screen}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            aria-label={tab.hint}
            title={tab.hint}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveScreen(tab.screen)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium',
              'transition-colors',
              isActive
                ? 'bg-accent-subtle text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {tab.label}
            {/* 2px accent underline — active state is NEVER color-only
                (underline + tinted bg + accent text + aria-current). */}
            {isActive && (
              <span
                className="absolute -bottom-[9px] left-2 right-2 h-0.5 rounded-full bg-accent"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}