import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Settings, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Panel } from '@/components/primitives/Panel';
import { PanelHeader } from '@/components/primitives/PanelHeader';
import { InspectorSection } from '@/components/primitives/InspectorSection';
import { PropertyRow } from '@/components/primitives/PropertyRow';
import { ToolbarButton } from '@/components/primitives/ToolbarButton';
import type { WorkflowController } from '@/hooks/useWorkflowController';
import { normalizeAppError, type RuntimeSettings } from '@/nodes/runtimeContract';

/**
 * SettingsScreen — workflow preferences plus Runtime V2 settings and secure
 * Gemini connection. Native-only actions remain disabled in the web preview.
 *
 * Provider health moved to the Environment tab (spec §20) in Phase 9 — this
 * screen's "System Health" section now links there rather than duplicating the
 * six rows.
 *
 * Layout reset restores the uiSlice defaults (rightPanelWidth=300,
 * dockHeight=240, right panel expanded, dock collapsed) via the existing
 * uiSlice setters — those ARE persisted by partialize, so the reset survives
 * reload. minimapOn + theme are also uiSlice-persisted. (Phase 5 unified the
 * separate library/inspector widths into one rightPanelWidth.)
 *
 * The screen container is `main[data-screen="settings"]` — the shared landmark
 * selector `main[data-screen]` is in LANDMARK_SELECTORS so F6 can reach it.
 */
const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = { outputDirectory: '', ffmpegPath: '', ffprobePath: '', concurrency: 2 };

export function SettingsScreen({ controller }: { controller: WorkflowController }) {
  const minimapOn = useWorkflowStore((s) => s.minimapOn);
  const setMinimapOn = useWorkflowStore((s) => s.setMinimapOn);
  const projectName = useWorkflowStore((s) => s.projectName);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setProjectName = useWorkflowStore((s) => s.setProjectName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const setRightPanelWidth = useWorkflowStore((s) => s.setRightPanelWidth);
  const setDockHeight = useWorkflowStore((s) => s.setDockHeight);
  const toggleRightPanel = useWorkflowStore((s) => s.toggleRightPanel);
  const toggleDock = useWorkflowStore((s) => s.toggleDock);
  const rightPanelCollapsed = useWorkflowStore((s) => s.rightPanelCollapsed);
  const dockCollapsed = useWorkflowStore((s) => s.dockCollapsed);
  const geminiHealth = useWorkflowStore((s) => s.health.gemini);
  const [runtimeSettings, setRuntimeSettings] = useState(DEFAULT_RUNTIME_SETTINGS);
  const [geminiKey, setGeminiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void controller.getRuntimeSettings().then(setRuntimeSettings).catch((error) => {
      const payload = normalizeAppError(error);
      controller.pushToast({ kind: 'error', title: payload.title, description: payload.message });
    });
  }, [controller]);

  const saveRuntime = async () => {
    setSaving(true);
    try {
      const updated = await controller.updateRuntimeSettings(runtimeSettings);
      setRuntimeSettings(updated);
      controller.pushToast({ kind: 'success', title: 'Runtime settings saved' });
    } catch (error) {
      const payload = normalizeAppError(error);
      controller.pushToast({ kind: 'error', title: payload.title, description: payload.message });
    } finally {
      setSaving(false);
    }
  };

  const saveGeminiKey = async () => {
    if (!geminiKey.trim()) return;
    setSaving(true);
    try {
      await controller.setGeminiApiKey(geminiKey);
      setGeminiKey('');
      controller.pushToast({ kind: 'success', title: 'Gemini connection saved securely' });
    } catch (error) {
      const payload = normalizeAppError(error);
      controller.pushToast({ kind: 'error', title: payload.title, description: payload.message });
    } finally {
      setSaving(false);
    }
  };

  const resetLayout = () => {
    // Restore the uiSlice defaults. Each setter is a no-op when already at the
    // target value; toggles flip only when needed. The defaults match the
    // store initializer: rightPanelWidth 300, dockHeight 240, right panel
    // expanded, dock collapsed. These are LAYOUT fields — persisted by
    // partialize — so the reset survives reload (unlike name edits, which are
    // not persisted). Phase 5: library/inspector widths unified → rightPanelWidth.
    setRightPanelWidth(300);
    setDockHeight(240);
    if (rightPanelCollapsed) toggleRightPanel();
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
              value="Light"
              onChange={() => {}}
              disabled
              disabledReason="Theme is fixed to light in this build"
              helperText="Light workflow-builder theme (spec §1)"
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

          {/* Phase 9: System Health moved to the Environment tab (spec §20). This
              section now points there rather than duplicating the 6 health rows.
              The Gemini API key below stays here (it's a setting, not health). */}
          <InspectorSection title="System Health" level={3}>
            <p className="py-1 text-[12px] text-text-secondary">
              Provider health (Tauri / SQLite / FFmpeg / FFprobe / Gemini / Storage) now lives in the{' '}
              <button
                type="button"
                onClick={() => useWorkflowStore.getState().setActiveScreen('environment')}
                className="text-accent hover:underline"
              >
                Environment
              </button>{' '}
              tab.
            </p>
          </InspectorSection>

          <InspectorSection title="Runtime" level={3}>
            <PropertyRow
              label="Output folder"
              type="file"
              pickerMode="directory"
              value={runtimeSettings.outputDirectory}
              onChange={(value) => setRuntimeSettings((current) => ({ ...current, outputDirectory: String(value) }))}
              placeholder="Default run folder"
              helperText="Empty uses the app data run folder"
            />
            <PropertyRow
              label="FFmpeg"
              type="file"
              value={runtimeSettings.ffmpegPath}
              onChange={(value) => setRuntimeSettings((current) => ({ ...current, ffmpegPath: String(value) }))}
              placeholder="Auto-detect from PATH"
            />
            <PropertyRow
              label="FFprobe"
              type="file"
              value={runtimeSettings.ffprobePath}
              onChange={(value) => setRuntimeSettings((current) => ({ ...current, ffprobePath: String(value) }))}
              placeholder="Auto-detect from PATH"
            />
            <PropertyRow
              label="Concurrency"
              type="number"
              value={runtimeSettings.concurrency}
              onChange={(value) => setRuntimeSettings((current) => ({ ...current, concurrency: Number(value) }))}
              min={1}
              max={16}
              unit="workers"
            />
            <div className="flex justify-end py-1">
              <ToolbarButton variant="primary" size="sm" icon={Save} loading={saving} disabled={!isTauri()} onClick={() => void saveRuntime()}>
                Save runtime
              </ToolbarButton>
            </div>
          </InspectorSection>

          <InspectorSection title="Gemini" level={3}>
            <PropertyRow
              label="API key"
              type="password"
              value={geminiKey}
              onChange={(value) => setGeminiKey(String(value))}
              placeholder={geminiHealth === 'configured' ? 'Configured — enter a new key to replace' : 'Enter API key'}
              helperText="Stored in the operating system credential vault; never written to workflow JSON"
            />
            <div className="flex justify-end gap-2 py-1">
              <ToolbarButton variant="secondary" size="sm" icon={Trash2} disabled={!isTauri() || geminiHealth !== 'configured'} onClick={() => void controller.clearGeminiApiKey().then(() => controller.pushToast({ kind: 'success', title: 'Gemini connection cleared' })).catch((error) => {
                const payload = normalizeAppError(error);
                controller.pushToast({ kind: 'error', title: payload.title, description: payload.message });
              })}>
                Clear key
              </ToolbarButton>
              <ToolbarButton variant="primary" size="sm" icon={Save} loading={saving} disabled={!isTauri() || !geminiKey.trim()} onClick={() => void saveGeminiKey()}>
                Save key
              </ToolbarButton>
            </div>
          </InspectorSection>
        </div>
      </div>
    </Panel>
  );
}
