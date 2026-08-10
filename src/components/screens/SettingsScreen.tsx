import { Settings, RotateCcw } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { HealthState } from '@/store/workflowStore';
import { Panel } from '@/components/primitives/Panel';
import { PanelHeader } from '@/components/primitives/PanelHeader';
import { InspectorSection } from '@/components/primitives/InspectorSection';
import { PropertyRow } from '@/components/primitives/PropertyRow';
import { ToolbarButton } from '@/components/primitives/ToolbarButton';
import { StatusBadge } from '@/components/primitives/StatusBadge';

/**
 * SettingsScreen — Phase 8, spec §16. Frontend-only preferences + read-only
 * System Health, composed entirely from §11 primitives. The parts that need
 * backend integration (Gemini key, output dir, FFmpeg path, concurrency) are
 * disabled with "Requires backend support" tooltips — no set_gemini_key /
 * get_settings IPC exists, and Phase 8 forbids adding any (no .rs edits). NO
 * Gemini key modal (deferred). NO empty state (spec §12 line 441).
 *
 * Layout reset restores the uiSlice defaults (libraryWidth=240, inspectorWidth=
 * 300, dockHeight=240, all zones un-collapsed, dock collapsed) via the existing
 * uiSlice setters — those ARE persisted by partialize, so the reset survives
 * reload. minimapOn + theme are also uiSlice-persisted.
 *
 * The screen container is `main[data-screen="settings"]` — the shared landmark
 * selector `main[data-screen]` is in LANDMARK_SELECTORS so F6 can reach it.
 */
const BACKEND_TOOLTIP = 'Requires backend support';

const HEALTH_LABEL: Record<HealthState, string> = {
  ready: 'Ready',
  configured: 'Configured',
  degraded: 'Degraded',
  down: 'Down',
};

export function SettingsScreen() {
  const minimapOn = useWorkflowStore((s) => s.minimapOn);
  const setMinimapOn = useWorkflowStore((s) => s.setMinimapOn);
  const projectName = useWorkflowStore((s) => s.projectName);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setProjectName = useWorkflowStore((s) => s.setProjectName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const health = useWorkflowStore((s) => s.health);
  const setLibraryWidth = useWorkflowStore((s) => s.setLibraryWidth);
  const setInspectorWidth = useWorkflowStore((s) => s.setInspectorWidth);
  const setDockHeight = useWorkflowStore((s) => s.setDockHeight);
  const toggleLibrary = useWorkflowStore((s) => s.toggleLibrary);
  const toggleInspector = useWorkflowStore((s) => s.toggleInspector);
  const toggleDock = useWorkflowStore((s) => s.toggleDock);
  const libraryCollapsed = useWorkflowStore((s) => s.libraryCollapsed);
  const inspectorCollapsed = useWorkflowStore((s) => s.inspectorCollapsed);
  const dockCollapsed = useWorkflowStore((s) => s.dockCollapsed);

  const resetLayout = () => {
    // Restore the uiSlice defaults. Each setter is a no-op when already at the
    // target value; toggles flip only when needed. The defaults match the
    // store initializer (lines 449-453): 240 / 300 / 240, all zones expanded,
    // dock collapsed. These are LAYOUT fields — persisted by partialize — so
    // the reset survives reload (unlike name edits, which are not persisted).
    setLibraryWidth(240);
    setInspectorWidth(300);
    setDockHeight(240);
    if (libraryCollapsed) toggleLibrary();
    if (inspectorCollapsed) toggleInspector();
    if (!dockCollapsed) toggleDock();
  };

  return (
    <Panel as="main" surface="canvas" ariaLabel="Settings" data-screen="settings" className="h-full">
      <PanelHeader title="Settings" level={2} icon={Settings} />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl">
          <InspectorSection title="Appearance & Canvas" level={3}>
            <PropertyRow
              label="Minimap"
              type="toggle"
              value={minimapOn}
              onChange={(v) => setMinimapOn(Boolean(v))}
              helperText="Show the canvas minimap (also in the toolbar ⋯ menu)"
            />
            <PropertyRow
              label="Theme"
              type="text"
              value="Dark"
              onChange={() => {}}
              disabled
              disabledReason="Light mode is a stretch goal"
              helperText="Dark-first is the only theme in this build"
            />
          </InspectorSection>

          <InspectorSection title="Layout" level={3}>
            <div className="flex items-center gap-2 py-1">
              <ToolbarButton variant="secondary" size="sm" icon={RotateCcw} onClick={resetLayout}>
                Reset layout
              </ToolbarButton>
              <span className="text-[11px] text-text-muted">
                Restores default panel widths and collapses the dock
              </span>
            </div>
          </InspectorSection>

          <InspectorSection title="Project" level={3}>
            <PropertyRow
              label="Project name"
              type="text"
              value={projectName}
              onChange={(v) => setProjectName(String(v))}
              helperText="Frontend-local — not persisted by save"
            />
            <PropertyRow
              label="Workflow name"
              type="text"
              value={workflowName}
              onChange={(v) => setWorkflowName(String(v))}
              helperText="Frontend-local — not persisted by save"
            />
          </InspectorSection>

          <InspectorSection title="System Health" level={3}>
            <div className="flex flex-col gap-2 py-1">
              <StatusBadge status={health.backend} label={`Backend · ${HEALTH_LABEL[health.backend]}`} />
              <StatusBadge status={health.sqlite} label={`SQLite · ${HEALTH_LABEL[health.sqlite]}`} />
              <StatusBadge status={health.ffmpeg} label={`FFmpeg · ${HEALTH_LABEL[health.ffmpeg]}`} />
              <StatusBadge status={health.gemini} label={`Gemini · ${HEALTH_LABEL[health.gemini]}`} />
            </div>
          </InspectorSection>

          <InspectorSection title="Backend Integration" level={3} defaultCollapsed>
            <PropertyRow label="Gemini API key" type="text" value="" onChange={() => {}} disabled disabledReason={BACKEND_TOOLTIP} placeholder="Not configured" />
            <PropertyRow label="Output directory" type="text" value="" onChange={() => {}} disabled disabledReason={BACKEND_TOOLTIP} placeholder="Not configured" />
            <PropertyRow label="FFmpeg path" type="text" value="" onChange={() => {}} disabled disabledReason={BACKEND_TOOLTIP} placeholder="Not configured" />
            <PropertyRow label="Concurrency" type="number" value={1} onChange={() => {}} disabled disabledReason={BACKEND_TOOLTIP} min={1} max={16} unit="workers" />
          </InspectorSection>
        </div>
      </div>
    </Panel>
  );
}