import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Save as SaveIcon,
  Play,
  Square,
  LoaderCircle,
  Ellipsis,
  ChevronRight,
  TriangleAlert,
  Check,
  FolderOpen,
  Keyboard,
  PanelRightClose,
  PanelLeftClose,
  PanelTopClose,
  CircleAlert,
  Map,
  ArrowLeft,
  Download,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { HealthState } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { WorkflowController } from '@/hooks/useWorkflowController';

/**
 * TopToolbar — `<header role="banner">` h-12, 3 regions (spec §5).
 * LEFT: breadcrumb (project / workflow name) + save-state chip + run-state line.
 * CENTER: health pill (stubbed "Ready", slot reserved).
 * RIGHT: Save button, Run/Stop button (same DOM node), ⋯ overflow menu.
 * Save state + run state are NEVER color-only (icon + text + color).
 */

interface Props {
  controller: WorkflowController;
}

export function TopToolbar({ controller }: Props) {
  const projectName = useWorkflowStore((s) => s.projectName);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const dirty = useWorkflowStore((s) => s.dirty);
  const saveStatus = useWorkflowStore((s) => s.saveStatus);
  const runStatus = useWorkflowStore((s) => s.runStatus);
  const runProgress = useWorkflowStore((s) => s.runProgress);
  const nodesCount = useWorkflowStore((s) => s.nodes.length);
  const lastCompletedRunId = useWorkflowStore((s) => s.lastCompletedRunId);
  const toggleAppRail = useWorkflowStore((s) => s.toggleAppRail);
  const toggleLibrary = useWorkflowStore((s) => s.toggleLibrary);
  const toggleInspector = useWorkflowStore((s) => s.toggleInspector);
  const toggleDock = useWorkflowStore((s) => s.toggleDock);
  const setDialog = useWorkflowStore((s) => s.setDialog);
  const minimapOn = useWorkflowStore((s) => s.minimapOn);
  const setMinimapOn = useWorkflowStore((s) => s.setMinimapOn);
  const activeScreen = useWorkflowStore((s) => s.activeScreen);
  const setActiveScreen = useWorkflowStore((s) => s.setActiveScreen);
  const health = useWorkflowStore((s) => s.health);

  const breadcrumbRef = useRef<HTMLAnchorElement | null>(null);
  // Initial focus → workflow title crumb (not Run — footgun avoidance, spec §5.5).
  useEffect(() => {
    breadcrumbRef.current?.focus();
  }, []);

  const isRunning = runStatus === 'running' || runStatus === 'starting';
  const canRun = nodesCount > 0 && !isRunning;

  return (
    <header
      role="banner"
      className="flex h-12 items-center gap-3 bg-surface-sidebar border-b border-border-subtle px-3"
    >
      {/* LEFT — back affordance (non-workflow screens) + breadcrumb + save chip + run line */}
      {activeScreen !== 'workflow' && (
        <button
          type="button"
          onClick={() => setActiveScreen('workflow')}
          aria-label="Back to workflow"
          title="Back to workflow (Alt+1)"
          className="flex h-7 shrink-0 items-center gap-1 rounded-control px-2 text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Workflow
        </button>
      )}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
        <span className="max-w-[140px] truncate text-text-muted" title={projectName}>{projectName}</span>
        <ChevronRight size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
        <a
          ref={breadcrumbRef}
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-current="page"
          data-focus-target="workflow-title"
          className="max-w-[280px] truncate font-semibold text-text-primary outline-none"
          title={workflowName}
          tabIndex={-1}
        >
          {workflowName}
        </a>
      </nav>

      <SaveStateChip dirty={dirty} saveStatus={saveStatus} />

      {runStatus !== 'idle' && <RunStateLine runStatus={runStatus} progress={runProgress} />}

      {/* CENTER — health pill. Wired to uiSlice.health.backend (real state set by
          the controller's init/IPC-failure paths). Status is never color-only:
          icon + text + color, with a screen-reader word. */}
      <HealthPill backend={health.backend} />

      {/* RIGHT — Save + Run/Stop + overflow menu */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void controller.save()}
          disabled={saveStatus === 'saving' || isRunning}
          aria-busy={saveStatus === 'saving'}
          aria-label="Save workflow"
          title={isRunning ? 'Save disabled while running' : 'Save (Ctrl/Cmd+S)'}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium',
            'border border-transparent',
            dirty ? 'bg-accent text-text-on-accent hover:bg-accent-hover' : 'bg-surface-panel text-text-secondary hover:bg-surface-hover',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {saveStatus === 'saving' ? (
            <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon size={14} aria-hidden="true" />
          )}
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>

        <button
          type="button"
          onClick={() => (isRunning ? void controller.stop() : void controller.run())}
          disabled={!isRunning && !canRun}
          aria-label={isRunning ? 'Stop workflow' : 'Run workflow'}
          title={isRunning ? 'Stop (deliberate click — Esc does not cancel a run)' : 'Run (Ctrl/Cmd+Enter)'}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium',
            isRunning
              ? 'bg-status-error-strong text-text-on-status hover:bg-status-error-hover'
              : 'bg-accent text-text-on-accent hover:bg-accent-hover',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {runStatus === 'starting' ? (
            <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          ) : isRunning ? (
            <Square size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          {runStatus === 'starting' ? 'Starting…' : isRunning ? 'Stop' : 'Run'}
        </button>

        <OverflowMenu
          controller={controller}
          lastCompletedRunId={lastCompletedRunId}
          actions={{
            toggleAppRail,
            toggleLibrary,
            toggleInspector,
            toggleDock,
            toggleMinimap: () => setMinimapOn(!minimapOn),
            minimapOn,
            openKeyboardHelp: () => setDialog('keyboard-help'),
            openSettings: () => setActiveScreen('settings'),
          }}
        />
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function SaveStateChip({
  dirty,
  saveStatus,
}: {
  dirty: boolean;
  saveStatus: ReturnType<typeof useWorkflowStore.getState>['saveStatus'];
}) {
  let dotClass = 'bg-status-success';
  let label = 'Saved';
  let Icon = Check;
  let textClass = 'text-text-muted';

  if (saveStatus === 'saving') {
    dotClass = 'bg-status-running';
    label = 'Saving…';
    Icon = LoaderCircle;
    textClass = 'text-text-secondary';
  } else if (saveStatus === 'error') {
    dotClass = 'bg-status-error';
    label = 'Save failed';
    Icon = TriangleAlert;
    textClass = 'text-text-error';
  } else if (dirty) {
    dotClass = 'bg-status-warning';
    label = 'Unsaved';
    Icon = TriangleAlert;
    textClass = 'text-status-warning';
  }

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center gap-1.5 rounded-control bg-surface-panel px-2 py-1"
      title={label}
    >
      {saveStatus === 'saving' ? (
        <Icon size={12} className="animate-spin text-status-running" aria-hidden="true" />
      ) : (
        <>
          <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden="true" />
          <Icon size={12} className={cn(textClass)} aria-hidden="true" />
        </>
      )}
      <span className={cn('text-[11px]', textClass)}>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

// Backend health glyph + tone (icon + text + color — never color-only).
const HEALTH_META: Record<HealthState, { Icon: typeof Check; tone: string; dot: string; label: string; word: string }> = {
  ready: { Icon: Check, tone: 'text-status-success', dot: 'bg-status-success', label: 'Ready', word: 'Backend ready' },
  configured: { Icon: Check, tone: 'text-status-success', dot: 'bg-status-success', label: 'Connected', word: 'Backend configured' },
  degraded: { Icon: TriangleAlert, tone: 'text-status-warning', dot: 'bg-status-warning', label: 'Degraded', word: 'Backend degraded' },
  down: { Icon: CircleAlert, tone: 'text-status-error', dot: 'bg-status-error', label: 'Offline', word: 'Backend offline' },
};

function HealthPill({ backend }: { backend: HealthState }) {
  const meta = HEALTH_META[backend] ?? HEALTH_META.ready;
  const Icon = meta.Icon;
  return (
    <div className="mx-auto flex items-center gap-1.5" aria-live="polite">
      <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden="true" />
      <Icon size={12} className={cn(meta.tone)} aria-hidden="true" />
      <span className={cn('text-[11px]', meta.tone)}>{meta.label}</span>
      <span className="sr-only">{meta.word}</span>
    </div>
  );
}

function RunStateLine({
  runStatus,
  progress,
}: {
  runStatus: ReturnType<typeof useWorkflowStore.getState>['runStatus'];
  progress: number | null;
}) {
  let label = '';
  let dotClass = 'bg-status-running';
  let textClass = 'text-text-accent';

  if (runStatus === 'starting') {
    label = 'Starting…';
    dotClass = 'bg-status-running';
  } else if (runStatus === 'running') {
    label = progress !== null ? `Running · ${Math.round(progress)}%` : 'Running…';
    dotClass = 'bg-status-running';
  } else if (runStatus === 'succeeded') {
    label = 'Completed';
    dotClass = 'bg-status-success';
    textClass = 'text-status-success';
  } else if (runStatus === 'failed') {
    label = 'Failed · see Problems';
    dotClass = 'bg-status-error';
    textClass = 'text-text-error';
  } else if (runStatus === 'cancelled') {
    label = 'Cancelled';
    dotClass = 'bg-status-cancelled';
    textClass = 'text-text-muted';
  }

  return (
    <div aria-live="polite" className="flex shrink-0 items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden="true" />
      <span className={cn('text-[11px]', textClass)}>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface OverflowActions {
  toggleAppRail: () => void;
  toggleLibrary: () => void;
  toggleInspector: () => void;
  toggleDock: () => void;
  toggleMinimap: () => void;
  minimapOn: boolean;
  openKeyboardHelp: () => void;
  openSettings: () => void;
}

function OverflowMenu({
  controller,
  lastCompletedRunId,
  actions,
}: {
  controller: WorkflowController;
  lastCompletedRunId: number | null;
  actions: OverflowActions;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const items: { label: string; icon: typeof SaveIcon; action: () => void; disabled?: boolean; pressed?: boolean }[] = [
    { label: 'Toggle App Rail', icon: PanelRightClose, action: actions.toggleAppRail },
    { label: 'Toggle Node Library', icon: PanelLeftClose, action: actions.toggleLibrary },
    { label: 'Toggle Inspector', icon: PanelRightClose, action: actions.toggleInspector },
    { label: 'Toggle Bottom Dock', icon: PanelTopClose, action: actions.toggleDock },
    { label: 'Toggle Minimap', icon: Map, action: actions.toggleMinimap, pressed: actions.minimapOn },
    { label: 'Open Output', icon: FolderOpen, action: () => void controller.openFolder(), disabled: lastCompletedRunId === null },
    { label: 'Export Workflow', icon: Download, action: () => {}, disabled: true },
    { label: 'Keyboard Help', icon: Keyboard, action: actions.openKeyboardHelp },
    { label: 'Settings', icon: SettingsIcon, action: actions.openSettings },
  ];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Index of the first enabled item — used for the roving tabindex seed so the
  // first Tab into the menu lands on a focusable item, never a disabled one.
  const firstEnabled = items.findIndex((it) => !it.disabled);

  // Move focus to the next/prev ENABLED item, skipping disabled ones (a native
  // disabled <button> can't receive focus, so naively targeting i±1 stalls nav
  // when a disabled item sits in the path — audit §3/Keyboard).
  const focusEnabled = (from: number, dir: 1 | -1) => {
    const n = items.length;
    for (let step = 1; step <= n; step++) {
      const idx = (((from + dir * step) % n) + n) % n;
      if (!items[idx].disabled) {
        itemRefs.current[idx]?.focus();
        return;
      }
    }
  };
  const focusEdge = (dir: 1 | -1) => {
    const idx = dir === 1 ? items.findIndex((it) => !it.disabled) : (() => {
      for (let i = items.length - 1; i >= 0; i--) if (!items[i].disabled) return i;
      return -1;
    })();
    if (idx >= 0) itemRefs.current[idx]?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const i = itemRefs.current.findIndex((el) => el === document.activeElement);
      focusEnabled(i, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = itemRefs.current.findIndex((el) => el === document.activeElement);
      focusEnabled(i, -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusEdge(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusEdge(-1);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More actions"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-8 z-[var(--z-popover)] w-52 rounded-panel border border-border-default bg-surface-elevated p-1 shadow-popover"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                aria-disabled={item.disabled}
                aria-pressed={item.pressed}
                tabIndex={i === firstEnabled ? 0 : -1}
                onClick={() => {
                  item.action();
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[12px]',
                  'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {item.label}
                {item.pressed && <Check size={12} className="ml-auto text-status-success" aria-hidden="true" />}
                {item.disabled && <CircleAlert size={12} className="ml-auto text-text-muted" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}