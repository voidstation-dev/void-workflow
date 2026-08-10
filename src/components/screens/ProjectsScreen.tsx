import { FolderKanban, Plus, Pencil, Trash2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Panel } from '@/components/primitives/Panel';
import { PanelHeader } from '@/components/primitives/PanelHeader';
import { PropertyRow } from '@/components/primitives/PropertyRow';
import { ToolbarButton } from '@/components/primitives/ToolbarButton';
import { EmptyState } from '@/components/primitives/EmptyState';

/**
 * ProjectsScreen — Phase 8, spec §16. Display-only: shows the current project
 * and lets the user rename it + the workflow. New/Rename/Delete are disabled
 * with "Requires backend support" tooltips — there is NO create_project /
 * rename_project / delete_project IPC, and Phase 8 forbids adding any (no .rs
 * edits). No project switching either: load_workflow's behavior for an unknown
 * projectId is not characterized, so a Switch affordance would be fake. Honest.
 *
 * The screen container is `main[data-screen="projects"]` — the shared landmark
 * selector `main[data-screen]` is in LANDMARK_SELECTORS so F6 can reach it.
 */
const BACKEND_TOOLTIP = 'Requires backend support';

export function ProjectsScreen() {
  const projectId = useWorkflowStore((s) => s.projectId);
  const projectName = useWorkflowStore((s) => s.projectName);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setProjectName = useWorkflowStore((s) => s.setProjectName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);

  return (
    <Panel as="main" surface="canvas" ariaLabel="Projects" data-screen="projects" className="h-full">
      <PanelHeader title="Projects" level={2} icon={FolderKanban} />
      <div className="flex-1 overflow-auto p-3">
        {projectId ? (
          <Panel surface="panel" border="subtle" radius="panel" padding={3} className="mx-auto max-w-2xl gap-2">
            <h3 className="text-[13px] font-semibold text-text-primary">Current project</h3>
            <p className="text-[11px] text-text-muted">
              Only the active project is shown. Backend project listing, creation, and switching are not available yet.
            </p>
            <div className="mt-2">
              <PropertyRow
                label="Project name"
                type="text"
                value={projectName}
                onChange={(v) => setProjectName(String(v))}
                helperText="Renames the current project (frontend-local — not persisted by save)"
              />
              <PropertyRow
                label="Workflow name"
                type="text"
                value={workflowName}
                onChange={(v) => setWorkflowName(String(v))}
                helperText="Renames this workflow (frontend-local — not persisted by save)"
              />
              <PropertyRow
                label="Project id"
                type="text"
                value={String(projectId)}
                onChange={() => {}}
                disabled
                disabledReason="Backend project id — read only"
              />
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Project actions
              </div>
              <div className="flex items-center gap-2">
                <ToolbarButton variant="ghost" size="sm" icon={Plus} disabled title={BACKEND_TOOLTIP}>
                  New
                </ToolbarButton>
                <ToolbarButton variant="ghost" size="sm" icon={Pencil} disabled title={BACKEND_TOOLTIP}>
                  Rename
                </ToolbarButton>
                <ToolbarButton variant="danger" size="sm" icon={Trash2} disabled title={BACKEND_TOOLTIP}>
                  Delete
                </ToolbarButton>
              </div>
            </div>
          </Panel>
        ) : (
          <EmptyState
            title="No projects yet. Create one to start."
            body="Project management requires backend support that is not available in this build."
            action={{ label: 'New Project', onClick: () => {}, icon: <Plus size={14} aria-hidden="true" /> }}
            live="polite"
          />
        )}
      </div>
    </Panel>
  );
}