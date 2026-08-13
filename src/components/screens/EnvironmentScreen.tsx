import { useEffect, useState } from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { HealthState } from '@/store/workflowStore';
import { Panel } from '@/components/primitives/Panel';
import { PanelHeader } from '@/components/primitives/PanelHeader';
import { StatusBadge } from '@/components/primitives/StatusBadge';
import { ToolbarButton } from '@/components/primitives/ToolbarButton';
import type { WorkflowController } from '@/hooks/useWorkflowController';
import type { EnvironmentHealth } from '@/nodes/runtimeContract';

/**
 * EnvironmentScreen — Phase 9 (spec §20). An honest read-only view of the six
 * provider-health rows the spec requires (Tauri Backend / SQLite / FFmpeg /
 * FFprobe / Gemini / Storage). Health is NEVER color-only (StatusBadge = dot +
 * icon + label). Unprobed providers render 'Unknown' honestly — never faked
 * 'Ready'. The Backend + SQLite states are set by the controller's init path;
 * Runtime V2 probes FFmpeg, FFprobe, Gemini, storage and persistence on demand.
 *
 * Uses the shared `Panel`/`PanelHeader` primitives for landmark + scroll
 * consistency with Settings/Runs. `main[data-screen="environment"]` is reached
 * via the `main[data-screen]` landmark selector in useWorkspaceShortcuts (F6).
 */
const HEALTH_LABEL: Record<HealthState, string> = {
  ready: 'Ready',
  configured: 'Configured',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
};

// One row per provider, with an honest note for unprobed services.
const PROVIDERS: { key: keyof ReturnType<typeof useWorkflowStore.getState>['health']; label: string; note: string }[] = [
  { key: 'backend', label: 'Tauri Backend', note: 'IPC + run host (probed on init)' },
  { key: 'sqlite', label: 'SQLite', note: 'Workflow persistence (probed on init)' },
  { key: 'ffmpeg', label: 'FFmpeg', note: 'Media encode/merge — probed on first use' },
  { key: 'ffprobe', label: 'FFprobe', note: 'Media metadata — probed on first use' },
  { key: 'gemini', label: 'Gemini', note: 'AI generation — requires API key (Phase 9)' },
  { key: 'storage', label: 'Storage', note: 'Output artifacts — checked on run' },
];

export function EnvironmentScreen({ controller }: { controller: WorkflowController }) {
  const health = useWorkflowStore((s) => s.health);
  const [report, setReport] = useState<EnvironmentHealth | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setReport(await controller.refreshEnvironment());
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); }, [controller]);

  return (
    <Panel as="main" surface="canvas" ariaLabel="Environment" data-screen="environment" className="h-full">
      <PanelHeader
        title="Environment"
        level={2}
        icon={Gauge}
        actions={<ToolbarButton variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => void refresh()}>Probe now</ToolbarButton>}
      />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl">
          <p className="px-3 pt-2 text-[12px] text-text-secondary">
            System and provider health. Unprobed providers show as Unknown — no status is faked.
          </p>
          <section aria-label="Provider health" className="flex flex-col gap-2 p-3">
            {PROVIDERS.map((p) => {
              const state = health[p.key];
              return (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 rounded-panel border border-border-subtle bg-surface-panel px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-text-primary">{p.label}</div>
                    <div className="truncate text-[11px] text-text-muted">{report?.[p.key].detail ?? p.note}</div>
                  </div>
                  <StatusBadge status={state} label={HEALTH_LABEL[state]} />
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </Panel>
  );
}
