import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Trash2,
  Check,
  TriangleAlert,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  type LucideIcon,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useWorkflowStore, type AppNodeData } from '@/store/workflowStore';
import { useSplitter, splitterAria } from './useSplitter';
import { useInlineConfirm } from './useInlineConfirm';
import { PropertyRow } from '@/components/primitives/PropertyRow';
import { InspectorSection } from '@/components/primitives/InspectorSection';
import { InspectorTabs } from '@/components/primitives/InspectorTabs';
import {
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TOKEN,
} from '@/components/primitives/NodeStatus';
import { NODE_DEFINITION_MAP, type ConfigField } from '@/nodes/registry';
import { getPortIcon } from '@/components/shell/icons';
import { resolvePortType, isTypeCompatible } from '@/nodes/portCompat';
import { EmptyState } from '@/components/primitives/EmptyState';
import { cn } from '@/lib/utils';

/**
 * Inspector — Zone D (spec §8). Generic, context-sensitive right panel.
 * Phase 6 replaces the Phase 3 placeholder body with a mode-switching shell
 * that delegates to 4 mode components ALL defined in this file (no per-node-type
 * Inspector — plan §14 line 503, line 797):
 *   selectionMode === 'none'  → WorkflowInspector (name + stats + hint, NEVER empty)
 *   selectionMode === 'node'  → NodeInspector (name + type/id + tabs + config form
 *                               rendered from def.configSchema via PropertyRow +
 *                               optional Run section + Danger: Delete Node)
 *   selectionMode === 'edge'  → ConnectionInspector (source→target, port types,
 *                               soft advisory, label, Delete connection)
 *   selectionMode === 'multi' → MultiSelectInspector (count + bulk Align/
 *                               Distribute/Delete, no per-node config)
 *
 * Running node (spec §8 line 283): NodeInspector ADDS a read-only Run section IN
 * ADDITION TO config (mode-merge, not a 5th mode). Config inputs are disabled
 * ONLY while the node is actively running/queued (blocking-fix #1: gating on
 * `status !== 'idle'` would permanently lock editing after any run, since
 * perNodeStatus persists until resetRun). The Run section itself renders
 * whenever a status record exists (read-only post-run view is intended).
 *
 * Deletion: NO new store action (preserves §27). `deleteNodes`/`deleteEdge`
 * local helpers mirror useWorkspaceShortcuts lines 184-191 exactly:
 * setNodes(filter) + setEdges(filter touching removed source/target) +
 * clearSelection() + markDirty(). useWorkspaceShortcuts is NOT modified.
 *
 * Focus (spec §8.2 line 310): on selection change, focus moves to the Inspector
 * header <h2> so AT announces the new context; tab order resets via
 * key={selectedNodeId} remount. We do NOT focus the h2 on the 'none'
 * transition (Escape deselect) — yanking focus from canvas to Inspector would
 * harm keyboard users; AT announces the new Workflow context only when a real
 * selection appears.
 *
 * Collapse deviation (spec §8.2 line 310 "focus returns to toggle button"):
 * the Phase 3 collapsed shell renders `<div className="w-0" aria-hidden/>` with
 * NO toggle button in the DOM, so that clause is unsatisfiable as written. We
 * keep the §27-safe existing collapsed render (children unmounted → fully
 * inert) and re-expand via Ctrl/Cmd+I (useWorkspaceShortcuts). Documented here
 * as a spec reconciliation forced by the frozen Phase 3 shell.
 */
const INSPECTOR_ID = 'inspector-body';
const INSPECTOR_HEADING_ID = 'inspector-heading';

const MODE_TITLE: Record<string, string> = {
  none: 'Workflow',
  node: 'Node',
  edge: 'Connection',
  multi: 'Multi-select',
};

export function Inspector() {
  const collapsed = useWorkflowStore((s) => s.inspectorCollapsed);
  const width = useWorkflowStore((s) => s.inspectorWidth);
  const setWidth = useWorkflowStore((s) => s.setInspectorWidth);
  const toggle = useWorkflowStore((s) => s.toggleInspector);
  const selectionMode = useWorkflowStore((s) => s.selectionMode);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const selectedEdgeId = useWorkflowStore((s) => s.selectedEdgeId);
  const multiSelectIds = useWorkflowStore((s) => s.multiSelectIds);
  const multiKey = multiSelectIds.join('|');

  const splitter = useSplitter({
    orientation: 'vertical',
    min: 240,
    max: 440,
    getValue: () => width,
    setValue: setWidth,
    toggleCollapse: toggle,
    maximizeValue: 440,
  });

  // Focus-to-h2 on selection change (spec §8.2 line 310). Lives in the shell so
  // the mounted-ref guard survives NodeInspector's key={selectedNodeId} remount.
  // Skips first render (don't steal focus on load) and the 'none' transition.
  const headerRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (selectionMode === 'none' || collapsed) return;
    headerRef.current?.focus();
  }, [selectionMode, selectedNodeId, selectedEdgeId, multiKey, collapsed]);

  if (collapsed) {
    // Collapsed → fully inert (no children rendered) per §27-safe Phase 3 shell.
    return <div className="w-0" aria-hidden="true" />;
  }

  return (
    <aside
      aria-label="Inspector"
      className="relative flex h-full min-h-0 flex-col bg-surface-sidebar border-l border-border-subtle"
      style={{ width }}
    >
      {/* Left-edge resize splitter */}
      <div
        {...splitterAria({
          orientation: 'vertical',
          value: width,
          min: 240,
          max: 440,
          controlsId: INSPECTOR_ID,
        })}
        onPointerDown={splitter.onPointerDown}
        onPointerMove={splitter.onPointerMove}
        onPointerUp={splitter.onPointerUp}
        onKeyDown={splitter.onKeyDown}
        className="absolute left-0 top-0 z-[var(--z-panel)] h-full w-1 cursor-ew-resize bg-transparent hover:bg-border-focus"
        style={{ marginLeft: -2 }}
      />

      <div className="flex h-8 shrink-0 items-center justify-between px-2">
        <h2
          id={INSPECTOR_HEADING_ID}
          ref={headerRef}
          tabIndex={-1}
          className="text-[12px] font-semibold text-text-secondary outline-none"
        >
          {MODE_TITLE[selectionMode] ?? 'Workflow'}
        </h2>
        <button
          type="button"
          aria-label="Collapse inspector"
          title="Collapse (Ctrl/Cmd+I)"
          onClick={toggle}
          className="rounded-control p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
      </div>

      <div id={INSPECTOR_ID} className="min-h-0 flex-1 overflow-y-auto">
        {selectionMode === 'none' ? (
          <WorkflowInspector />
        ) : selectionMode === 'node' && selectedNodeId ? (
          <NodeInspector key={selectedNodeId} nodeId={selectedNodeId} />
        ) : selectionMode === 'edge' && selectedEdgeId ? (
          <ConnectionInspector edgeId={selectedEdgeId} />
        ) : selectionMode === 'multi' && multiSelectIds.length > 1 ? (
          <MultiSelectInspector ids={multiSelectIds} />
        ) : (
          <WorkflowInspector />
        )}
      </div>
    </aside>
  );
}

/* ============================================================================
   Local deletion helpers (§27-safe — mirror useWorkspaceShortcuts 184-191).
   NO store action is added; useWorkspaceShortcuts is NOT modified.
   ========================================================================== */
function useDeleteHelpers() {
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const clearSelection = useWorkflowStore((s) => s.clearSelection);
  const markDirty = useWorkflowStore((s) => s.markDirty);
  const setAnnouncement = useWorkflowStore((s) => s.setAnnouncement);

  const deleteNodes = (ids: string[]) => {
    const idSet = new Set(ids);
    const { nodes, edges } = useWorkflowStore.getState();
    setNodes(nodes.filter((n) => !idSet.has(n.id)));
    setEdges(edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
    clearSelection();
    markDirty();
    setAnnouncement({
      id: uuidv4(),
      text: `Deleted ${ids.length} node${ids.length > 1 ? 's' : ''}.`,
    });
  };

  const deleteEdge = (edgeId: string) => {
    const { edges } = useWorkflowStore.getState();
    setEdges(edges.filter((e) => e.id !== edgeId));
    clearSelection();
    markDirty();
    setAnnouncement({ id: uuidv4(), text: 'Connection deleted.' });
  };

  return { deleteNodes, deleteEdge };
}

/* ============================================================================
   Workflow Inspector (mode 'none') — NEVER empty (no dead panel).
   ========================================================================== */
function WorkflowInspector() {
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const markDirty = useWorkflowStore((s) => s.markDirty);
  const nodesCount = useWorkflowStore((s) => s.nodes.length);
  const edgesCount = useWorkflowStore((s) => s.edges.length);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="workflow-name-input" className="text-[11px] text-text-muted">
          Workflow name
        </label>
        <input
          id="workflow-name-input"
          type="text"
          value={workflowName}
          onChange={(e) => {
            setWorkflowName(e.target.value);
            markDirty();
          }}
          aria-label="Workflow name"
          className="rounded-control border border-border-subtle bg-surface-input px-2 py-1 text-[13px] text-text-primary outline-none focus:border-border-focus"
        />
      </div>

      <div className="flex flex-col gap-1 text-[11px] text-text-muted">
        <div className="flex justify-between">
          <span>Nodes</span>
          <span className="text-text-secondary">{nodesCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Connections</span>
          <span className="text-text-secondary">{edgesCount}</span>
        </div>
      </div>

      <p className="border-t border-border-subtle pt-2 text-[12px] text-text-muted">
        Select a node or connection to edit it.
      </p>
    </div>
  );
}

/* ============================================================================
   Node Inspector (mode 'node') — generic, rendered from def.configSchema.
   ========================================================================== */
function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === nodeId));
  const status = useWorkflowStore((s) => (nodeId ? s.perNodeStatus[nodeId] : undefined));
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const { deleteNodes } = useDeleteHelpers();
  const confirm = useInlineConfirm();

  const def = node?.type ? NODE_DEFINITION_MAP[node.type] : undefined;
  const tabs = def?.inspectorTabs ?? ['Configuration'];
  const [activeTab, setActiveTab] = useState(tabs[0]);

  if (!node || !def) {
    return (
      <EmptyState
        title="Node no longer exists"
        body="The selected node was removed."
        action={{ label: 'Clear selection', onClick: () => useWorkflowStore.getState().clearSelection() }}
        live="off"
      />
    );
  }

  // Blocking-fix #1: gate config-disable on ACTIVE run state only (running/
  // queued). perNodeStatus persists after a run completes; gating on
  // `status !== 'idle'` would permanently lock editing. The Run section itself
  // renders whenever a record exists (read-only post-run view).
  const isActive = !!status && (status.status === 'running' || status.status === 'queued');
  const hasStatusRecord = !!status && status.status !== 'idle';

  const label = node.data?.label ?? def.label ?? node.type;

  const renderConfigFields = (fields: ConfigField[]) =>
    fields.map((field) => {
      const rowType = field.type === 'file-picker' ? 'file' : field.type;
      const value = node.data?.[field.key] ?? field.default;
      return (
        <PropertyRow
          key={field.key}
          label={field.label}
          type={rowType as 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'slider' | 'file'}
          value={value}
          onChange={(v) => updateNodeData(nodeId, { [field.key]: v } as Partial<AppNodeData>)}
          options={field.options}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          helperText={field.help}
          disabled={isActive}
          disabledReason={isActive ? 'Editing disabled while running' : undefined}
        />
      );
    });

  const configPanel = (
    <>
      {isActive && (
        <p className="text-[11px] text-text-muted">Editing disabled while running.</p>
      )}
      <InspectorSection title={tabs.length > 1 ? activeTab : tabs[0]}>
        <div className="flex flex-col gap-1">{renderConfigFields(def.configSchema)}</div>
      </InspectorSection>
    </>
  );

  return (
    <div className="flex flex-col">
      {/* Name + Type/ID header (spec §8.2 lines 288-289) */}
      <div className="flex flex-col gap-2 border-b border-border-subtle p-3">
        <input
          type="text"
          value={label}
          aria-label="Node name"
          onChange={(e) => updateNodeData(nodeId, { label: e.target.value })}
          disabled={isActive}
          className="h-7 w-full rounded-control border border-border-subtle bg-surface-input px-2 text-[13px] text-text-primary outline-none focus:border-border-focus disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <div className="text-[11px] text-text-muted">
          {def.label}
          <span className="sr-only">, id: {node.id}</span>
        </div>
      </div>

      {/* Config: tabs (only if >1) or single section; Advanced section
          architecture is supported but none of the 3 validation nodes declare
          advanced fields, so only Basic renders. */}
      {tabs.length > 1 ? (
        <InspectorTabs
          tabs={tabs.map((t) => ({ id: t, label: t }))}
          activeTab={activeTab}
          onChange={setActiveTab}
        >
          {() => configPanel}
        </InspectorTabs>
      ) : (
        configPanel
      )}

      {/* Run section (mode-merge, spec §8 line 283): read-only, renders whenever
          a status record exists. Config above is disabled only while isActive. */}
      {hasStatusRecord && status && (
        <InspectorSection title="Run">
          <div className="flex items-center gap-1.5">
            {(() => {
              const Icon = STATUS_ICON[status.status];
              return (
                <Icon
                  size={14}
                  aria-hidden="true"
                  className={status.status === 'running' || status.status === 'queued' ? 'animate-spin' : ''}
                  style={{ color: `var(--${STATUS_TOKEN[status.status]})` }}
                />
              );
            })()}
            <span className="text-[12px] text-text-secondary">{STATUS_LABEL[status.status]}</span>
          </div>
          {status.progress !== null && (
            <div
              role="progressbar"
              aria-valuenow={Math.round(status.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Node progress"
              className="h-1 w-full rounded-full bg-border-default"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${status.progress}%`, background: 'var(--status-running)' }}
              />
            </div>
          )}
          {status.message && (
            <p className="text-[11px] text-text-muted">{status.message}</p>
          )}
          {status.startedAt !== null && (
            <p className="text-[11px] text-text-muted">
              Started: {new Date(status.startedAt).toLocaleTimeString()}
            </p>
          )}
          {status.endedAt !== null && (
            <p className="text-[11px] text-text-muted">
              Ended: {new Date(status.endedAt).toLocaleTimeString()}
            </p>
          )}
        </InspectorSection>
      )}

      {/* Danger zone (spec §8.2 line 306): always bottom, inline-confirm. */}
      <InspectorSection title="Delete Node" variant="danger">
        <button
          type="button"
          aria-label={`Delete ${label}`}
          onClick={() => (confirm.armed ? deleteNodes([nodeId]) : confirm.arm())}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-control border border-border-subtle px-2 py-1 text-[12px]',
            confirm.armed ? 'text-text-error' : 'text-text-secondary',
            'hover:bg-surface-hover',
          )}
        >
          <Trash2 size={12} aria-hidden="true" />
          {confirm.armed ? 'Confirm delete' : `Delete ${label}`}
        </button>
        <span className="sr-only" aria-live="assertive">
          {confirm.liveText}
        </span>
      </InspectorSection>
    </div>
  );
}

/* ============================================================================
   Connection Inspector (mode 'edge').
   ========================================================================== */
function ConnectionInspector({ edgeId }: { edgeId: string }) {
  const edge = useWorkflowStore((s) => s.edges.find((e) => e.id === edgeId));
  const source = useWorkflowStore((s) => s.nodes.find((n) => n.id === edge?.source));
  const target = useWorkflowStore((s) => s.nodes.find((n) => n.id === edge?.target));
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const markDirty = useWorkflowStore((s) => s.markDirty);
  const clearSelection = useWorkflowStore((s) => s.clearSelection);
  const { deleteEdge } = useDeleteHelpers();
  const confirm = useInlineConfirm();

  if (!edge || !source || !target) {
    return (
      <EmptyState
        title="Connection no longer exists"
        body="The selected connection was removed."
        action={{ label: 'Clear selection', onClick: clearSelection }}
        live="off"
      />
    );
  }

  const sourceType = resolvePortType(source.type, edge.sourceHandle, 'out');
  const targetType = resolvePortType(target.type, edge.targetHandle, 'in');
  const compatible = isTypeCompatible(sourceType, targetType);
  const sourceIcon = getPortIcon(sourceType);
  const targetIcon = getPortIcon(targetType);

  const sourceLabel = source.data?.label ?? source.type ?? 'node';
  const targetLabel = target.data?.label ?? target.type ?? 'node';

  return (
    <div className="flex flex-col">
      <InspectorSection title="Connection">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-16 shrink-0 text-[11px] text-text-muted">Source</span>
            {(() => {
              const SIcon = sourceIcon;
              return <SIcon size={12} className="shrink-0 text-text-secondary" aria-hidden="true" />;
            })()}
            <span className="min-w-0 flex-1 truncate text-text-primary">{sourceLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-16 shrink-0 text-[11px] text-text-muted">Target</span>
            {(() => {
              const TIcon = targetIcon;
              return <TIcon size={12} className="shrink-0 text-text-secondary" aria-hidden="true" />;
            })()}
            <span className="min-w-0 flex-1 truncate text-text-primary">{targetLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {compatible ? (
              <>
                <Check size={12} className="text-status-success" aria-hidden="true" />
                <span className="text-status-success">Types compatible</span>
              </>
            ) : (
              <>
                <TriangleAlert size={12} className="text-text-error" aria-hidden="true" />
                <span className="text-text-error">
                  Type mismatch: {sourceType} → {targetType}. Backend validation is authoritative.
                </span>
              </>
            )}
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Label">
        <PropertyRow
          label="Label"
          type="text"
          value={(edge.data?.label as string) ?? ''}
          onChange={(v) => {
            const { edges } = useWorkflowStore.getState();
            setEdges(edges.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, label: v } } : e)));
            markDirty();
          }}
          placeholder="Optional connection label"
        />
      </InspectorSection>

      <InspectorSection title="Delete Connection" variant="danger">
        <button
          type="button"
          aria-label="Delete connection"
          onClick={() => (confirm.armed ? deleteEdge(edgeId) : confirm.arm())}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-control border border-border-subtle px-2 py-1 text-[12px]',
            confirm.armed ? 'text-text-error' : 'text-text-secondary',
            'hover:bg-surface-hover',
          )}
        >
          <Trash2 size={12} aria-hidden="true" />
          {confirm.armed ? 'Confirm delete' : 'Delete connection'}
        </button>
        <span className="sr-only" aria-live="assertive">
          {confirm.liveText}
        </span>
      </InspectorSection>
    </div>
  );
}

/* ============================================================================
   Multi-select Inspector (mode 'multi') — count + bulk Arrange/Delete, no
   per-node config (spec §8.1 line 281).
   ========================================================================== */
function MultiSelectInspector({ ids }: { ids: string[] }) {
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const markDirty = useWorkflowStore((s) => s.markDirty);
  const { deleteNodes } = useDeleteHelpers();
  const confirm = useInlineConfirm();

  const getSelected = () => {
    const { nodes } = useWorkflowStore.getState();
    return nodes.filter((n) => ids.includes(n.id));
  };

  // Align: set every selected node's x or y to the min/max/mid of the selection
  // bbox. Uses node.position (zoom/viewport-independent, not DOM rects).
  const align = (axis: 'x' | 'y', mode: 'min' | 'max' | 'center') => {
    const sel = getSelected();
    if (sel.length < 2) return;
    const vals = sel.map((n) => n.position[axis]);
    const target =
      mode === 'min'
        ? Math.min(...vals)
        : mode === 'max'
          ? Math.max(...vals)
          : vals.reduce((a, b) => a + b, 0) / vals.length;
    const { nodes } = useWorkflowStore.getState();
    const idSet = new Set(ids);
    setNodes(
      nodes.map((n) =>
        idSet.has(n.id) ? { ...n, position: { ...n.position, [axis]: target } } : n,
      ),
    );
    markDirty();
  };

  // Distribute: evenly space selected nodes between the extremes along an axis.
  const distribute = (axis: 'x' | 'y') => {
    const sel = getSelected().sort((a, b) => a.position[axis] - b.position[axis]);
    if (sel.length < 3) return;
    const min = sel[0].position[axis];
    const max = sel[sel.length - 1].position[axis];
    const step = (max - min) / (sel.length - 1);
    const posById = new Map(sel.map((n, i) => [n.id, min + step * i]));
    const { nodes } = useWorkflowStore.getState();
    const idSet = new Set(ids);
    setNodes(
      nodes.map((n) =>
        idSet.has(n.id) ? { ...n, position: { ...n.position, [axis]: posById.get(n.id)! } } : n,
      ),
    );
    markDirty();
  };

  const arrangeBtn = (icon: LucideIcon, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    >
      {(() => {
        const I = icon;
        return <I size={14} aria-hidden="true" />;
      })()}
    </button>
  );

  return (
    <div className="flex flex-col">
      <div className="border-b border-border-subtle p-3">
        <p className="text-[12px] text-text-secondary">{ids.length} nodes selected</p>
      </div>

      <InspectorSection title="Arrange">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">Align</span>
            <div className="flex flex-wrap gap-1">
              {arrangeBtn(AlignVerticalJustifyStart, 'Align left', () => align('x', 'min'))}
              {arrangeBtn(AlignVerticalJustifyCenter, 'Align center horizontal', () => align('x', 'center'))}
              {arrangeBtn(AlignVerticalJustifyEnd, 'Align right', () => align('x', 'max'))}
              {arrangeBtn(AlignHorizontalJustifyStart, 'Align top', () => align('y', 'min'))}
              {arrangeBtn(AlignHorizontalJustifyCenter, 'Align center vertical', () => align('y', 'center'))}
              {arrangeBtn(AlignHorizontalJustifyEnd, 'Align bottom', () => align('y', 'max'))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">Distribute</span>
            <div className="flex flex-wrap gap-1">
              {arrangeBtn(AlignHorizontalSpaceAround, 'Distribute horizontal', () => distribute('x'))}
              {arrangeBtn(AlignVerticalSpaceAround, 'Distribute vertical', () => distribute('y'))}
            </div>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title={`Delete ${ids.length} Nodes`} variant="danger">
        <button
          type="button"
          aria-label={`Delete ${ids.length} nodes`}
          onClick={() => (confirm.armed ? deleteNodes(ids) : confirm.arm())}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-control border border-border-subtle px-2 py-1 text-[12px]',
            confirm.armed ? 'text-text-error' : 'text-text-secondary',
            'hover:bg-surface-hover',
          )}
        >
          <Trash2 size={12} aria-hidden="true" />
          {confirm.armed ? 'Confirm delete' : `Delete ${ids.length} nodes`}
        </button>
        <span className="sr-only" aria-live="assertive">
          {confirm.liveText}
        </span>
      </InspectorSection>
    </div>
  );
}