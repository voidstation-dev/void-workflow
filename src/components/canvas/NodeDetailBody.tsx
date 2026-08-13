import { useEffect, useMemo, useState } from 'react';
import { DialogTitle, DialogDescription, DialogCloseButton } from '@/components/primitives/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/primitives/Tabs';
import { PropertyRow } from '@/components/primitives/PropertyRow';
import { InspectorSection } from '@/components/primitives/InspectorSection';
import {
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TOKEN,
} from '@/components/primitives/NodeStatus';
import { EmptyState } from '@/components/primitives/EmptyState';
import { useWorkflowStore, type AppNodeData, type PerNodeState } from '@/store/workflowStore';
import { NODE_DEFINITION_MAP, type Port, type ConfigField, type PortType } from '@/nodes/registry';
import { resolvePortType } from '@/nodes/portCompat';
import { getNodeIcon, getPortIcon } from '@/components/shell/icons';
import { PreviewViewer, previewKindForType, type PreviewKind } from '@/components/canvas/PreviewViewer';
import { cn } from '@/lib/utils';

/**
 * NodeDetailBody — the heavy inner content of the generic double-click detail
 * panel (spec §26/§27/§61). Extracted from NodeDetailPanel so the panel's thin
 * Radix Dialog shell can stay eagerly mounted while this body (Tabs, registry,
 * PreviewViewer, portCompat, icons) is code-split and loaded on first open via
 * React.lazy. One component for ALL node types — the tabs are computed from the
 * node's capabilities, never per-type (spec §61 "Avoid unique panel architecture
 * per node").
 *
 * Tabs (spec §27): Configure · Input · Output · Run · Preview. Which tabs
 * appear depends on the node:
 *   - Configure: always (when the node has config fields or a name).
 *   - Input: when the node has ≥1 input port.
 *   - Output: when the node has ≥1 output port OR is executable (shows run
 *     result).
 *   - Run: when the node is executable.
 *   - Preview: when the node is preview-capable (any in/out port type ∈
 *     {text,json,media,audio,video,file,artifact} or the node type is
 *     'preview'/'mediaInfo'). Spec §32 standardizes preview by output type
 *     (text/json/image/audio/video/media-info); §52 lists the Preview node's
 *     supports as Text/JSON/Image/Audio/Video — so text + json are included.
 *   - markdownNote (non-executable, no ports) → a single Note tab.
 *
 * Honesty invariants (spec §29/§30 + the "no false run affordances" rule):
 * the Input/Output/Run/Preview tabs show REAL store state only — resolved
 * upstream inputs and node outputs are NOT persisted to the frontend by the
 * backend, so these tabs honestly render "no data captured yet" until a run
 * produces status/logs. No fake results, no disabled-but-present buttons that
 * imply capability the backend doesn't have.
 *
 * No `.rs` / no IPC / no new persisted state. The only store writes are
 * `updateNodeData` (Configure tab edits). `detailNodeId` is transient (NOT in
 * partialize). The parent mounts this body with `key={detailNodeId}` so a fresh
 * instance (and a fresh `activeTab` initializer + focus-Prompt effect) runs per
 * node open.
 */
const PREVIEWABLE_TYPES: ReadonlySet<PortType> = new Set<PortType>([
  'text',
  'json',
  'media',
  'audio',
  'video',
  'file',
  'artifact',
]);

function isPreviewCapable(
  def: { ports: { in: Port[]; out: Port[] }; type: string },
): boolean {
  if (def.type === 'preview' || def.type === 'mediaInfo') return true;
  const all = [...def.ports.in, ...def.ports.out];
  return all.some((p) => PREVIEWABLE_TYPES.has(p.type));
}

export default function NodeDetailBody({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === nodeId));
  const status = useWorkflowStore((s) => (nodeId ? s.perNodeStatus[nodeId] : undefined));
  const logs = useWorkflowStore((s) => s.logs);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const edges = useWorkflowStore((s) => s.edges);
  const nodeResults = useWorkflowStore((s) => s.nodeResults);

  const def = node?.type ? NODE_DEFINITION_MAP[node.type] : undefined;

  // Tabs are computed from capabilities — stable order, presence-gated.
  const tabs = useMemo(() => {
    if (!def) return [] as { id: string; label: string }[];
    const out: { id: string; label: string }[] = [];
    const isNote = def.type === 'markdownNote';
    if (isNote) {
      out.push({ id: 'note', label: 'Note' });
      return out;
    }
    // Configure is always present (every node has a name + most have fields).
    out.push({ id: 'configure', label: 'Configure' });
    if (def.ports.in.length > 0) out.push({ id: 'input', label: 'Input' });
    if (def.ports.out.length > 0 || def.executionMode !== 'annotation') out.push({ id: 'output', label: 'Output' });
    if (def.executionMode === 'runtime') out.push({ id: 'run', label: 'Run' });
    if (isPreviewCapable(def)) out.push({ id: 'preview', label: 'Preview' });
    return out;
  }, [def]);

  if (!node || !def) {
    return (
      <div className="flex h-full flex-col p-3">
        <DialogTitle className="sr-only">Node detail</DialogTitle>
        <EmptyState
          title="Node no longer exists"
          body="The node was removed."
          action={{ label: 'Close', onClick: onClose }}
          live="off"
        />
      </div>
    );
  }

  const Icon = getNodeIcon(def.icon);
  const label = node.data?.label ?? def.label ?? node.type;
  const isActive = !!status && (status.status === 'running' || status.status === 'queued');

  const renderConfigFields = (fields: ConfigField[]) =>
    fields.map((field) => {
      const rowType = field.type === 'file-picker' ? 'file' : field.type;
      const value = node.data?.[field.key] ?? field.default;
      return (
        <PropertyRow
          key={field.key}
          id={`cfg-${nodeId}-${field.key}`}
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

  // Input tab: the node's input ports + the resolved upstream source for each
  // (which node/edge feeds it). The backend does not persist the resolved
  // VALUE, so we show the structural upstream honestly (spec §29 "Display
  // current resolved upstream input" — the source + type; the value is a
  // run-time artifact shown in Output/Run).
  const upstreamEdges = edges.filter((e) => e.target === nodeId);

  // Preview tab (§32): the viewer kind is resolved BY OUTPUT TYPE, not node
  // type. Priority: (1) the Media Info node → 'media-info' structured
  // metadata (§47); (2) the node's first output port type; (3) for nodes with
  // no output (Preview, Save* nodes) the resolved upstream input type. Falls
  // back to 'media' (the generic media viewer) when nothing resolves.
  const previewKind: PreviewKind = useMemo(() => {
    if (!def) return 'media';
    if (def.type === 'mediaInfo') return 'media-info';
    if (def.ports.out.length > 0) return previewKindForType(def.ports.out[0].type);
    // No output ports: resolve the upstream input type (Preview / Save nodes).
    const firstIn = def.ports.in[0];
    if (firstIn) {
      const feed = upstreamEdges.find((e) => (e.targetHandle ?? 'in') === firstIn.id);
      if (feed) {
        const sourceNode = useWorkflowStore.getState().nodes.find((n) => n.id === feed.source);
        const sourceType = resolvePortType(sourceNode?.type, feed.sourceHandle, 'out');
        if (sourceType !== 'any') return previewKindForType(sourceType);
      }
      return previewKindForType(firstIn.type);
    }
    return 'media';
  }, [def, upstreamEdges]);

  // Output tab: latest per-node status + this node's log lines (real store
  // state). Honest "no output yet" when idle.
  const nodeLogs = logs.filter((l) => l.nodeId === nodeId);
  const ownResult = nodeResults[nodeId];
  const upstreamResult = upstreamEdges[0] ? nodeResults[upstreamEdges[0].source] : undefined;
  const visibleResult = ownResult ?? (def.type === 'preview' ? upstreamResult : undefined);

  const durationLabel =
    status?.startedAt != null && status?.endedAt != null
      ? `${((status.endedAt - status.startedAt) / 1000).toFixed(1)}s`
      : null;

  // Controlled active tab. `useState` initializer reads `tabs[0]` once at
  // mount (the dialog remounts per node via key, so a stale tab from a prior
  // node can't leak in). `defaultValue` was ignored by Radix here (no tab
  // activated, all panels hidden) — controlled `value`/`onValueChange` is
  // robust and also lets us clamp the active tab if a capability changes.
  //
  // Spec §52: the Preview node double-clicks straight into the Preview tab
  // ("open Preview immediately") rather than landing on Configure. Other
  // nodes open on their first tab (Configure). The dialog remounts per node,
  // so this initializer runs fresh each open — no stale-tab leak.
  const [activeTab, setActiveTab] = useState<string>(
    def?.type === 'preview' && tabs.some((t) => t.id === 'preview')
      ? 'preview'
      : tabs[0]?.id ?? 'configure',
  );

  // Spec §45: double-clicking an AI Script node opens the detail panel AND
  // focuses the Prompt textarea so the user can start authoring immediately.
  // Frontend-only (no IPC). Skipped while the node is running/queued (the
  // Prompt is disabled then — focusing a disabled control is pointless). The
  // dialog remounts per node (key=detailNodeId), so this runs fresh each open.
  // The `setTimeout(0)` covers the React.lazy chunk-load-then-mount latency
  // (single-digit ms on Tauri local FS) — no additional delay needed.
  useEffect(() => {
    if (def?.type !== 'aiScript' || isActive) return;
    const id = `cfg-${nodeId}-prompt`;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id) as HTMLTextAreaElement | null;
      el?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [def, nodeId, isActive]);

  return (
    <div className="flex h-full flex-col">
      {/* Header: icon + name + type/ID + close */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <Icon size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate">{label}</DialogTitle>
          <DialogDescription className="truncate">
            {def.label}
            <span className="sr-only">, id: {node.id}</span>
          </DialogDescription>
        </div>
        <DialogCloseButton label="Close detail panel" />
      </div>

      {/* Tabs */}
      {tabs.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Configure tab */}
          {tabs.some((t) => t.id === 'configure') && (
            <TabsContent value="configure">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-text-muted" htmlFor={`detail-name-${nodeId}`}>
                    Name
                  </label>
                  <input
                    id={`detail-name-${nodeId}`}
                    type="text"
                    value={label}
                    aria-label="Node name"
                    onChange={(e) => updateNodeData(nodeId, { label: e.target.value })}
                    disabled={isActive}
                    className="h-7 w-full rounded-control border border-border-subtle bg-surface-input px-2 text-[13px] text-text-primary outline-none focus:border-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                {isActive && (
                  <p className="text-[11px] text-text-muted">Editing disabled while running.</p>
                )}
                {def.type === 'mediaInfo' ? (
                  // Spec §47: Media Info Configure tab hosts Summary / Video /
                  // Audio / Raw sub-tabs, with Raw FFprobe output as Advanced
                  // only. The one per-node structural exception, delivered as
                  // nested Radix Tabs inside the generic panel (§61 still
                  // holds — no bespoke sheet). Each sub-tab is an honest empty
                  // state until a run delivers probed metadata to the frontend
                  // (no `.rs` IPC today); the structure is ready to populate.
                  <MediaInfoSubTabs status={status} />
                ) : (
                  <>
                    {def.configSchema.length > 0 ? (
                      <InspectorSection title="Configuration">
                        <div className="flex flex-col gap-1">{renderConfigFields(def.configSchema.filter((f) => !f.advanced))}</div>
                      </InspectorSection>
                    ) : (
                      <p className="text-[12px] text-text-muted">This node has no configuration fields.</p>
                    )}
                    {def.configSchema.some((f) => f.advanced) && (
                      <InspectorSection title="Advanced" defaultCollapsed>
                        <div className="flex flex-col gap-1">{renderConfigFields(def.configSchema.filter((f) => f.advanced))}</div>
                      </InspectorSection>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          )}

          {/* Input tab */}
          {tabs.some((t) => t.id === 'input') && (
            <TabsContent value="input">
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-text-secondary">
                  Inputs feed this node from upstream.
                </p>
                {def.ports.in.map((port) => {
                  const feed = upstreamEdges.find((e) => (e.targetHandle ?? 'in') === port.id);
                  const sourceNode = feed
                    ? useWorkflowStore.getState().nodes.find((n) => n.id === feed.source)
                    : undefined;
                  const sourceType = feed
                    ? resolvePortType(sourceNode?.type, feed.sourceHandle, 'out')
                    : 'any';
                  return (
                    <PortRow
                      key={port.id}
                      port={port}
                      feed={feed ? { sourceLabel: sourceNode?.data?.label ?? sourceNode?.type ?? 'node', sourceType } : undefined}
                    />
                  );
                })}
                <p className="text-[11px] text-text-muted">
                  Resolved input values are produced at run time and shown in the Output tab after a run.
                </p>
              </div>
            </TabsContent>
          )}

          {/* Output tab */}
          {tabs.some((t) => t.id === 'output') && (
            <TabsContent value="output">
              <div className="flex flex-col gap-2">
                {def.ports.out.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-medium text-text-muted">Output ports</p>
                    {def.ports.out.map((port) => (
                      <PortRow key={port.id} port={port} />
                    ))}
                  </div>
                )}
                {status && status.status !== 'idle' ? (
                  <InspectorSection title="Latest result">
                    <StatusLine status={status.status} message={status.message} />
                    {status.progress !== null && status.progress !== undefined && (
                      <p className="mt-1 text-[11px] text-text-muted">Progress: {Math.round(status.progress * 100)}%</p>
                    )}
                  </InspectorSection>
                ) : (
                  <p className="text-[12px] text-text-muted">
                    No output captured yet. Run the workflow to produce a result.
                  </p>
                )}
                {visibleResult && (
                  <InspectorSection title="Runtime value">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-input p-2 text-[11px] text-text-secondary">
                      {JSON.stringify(visibleResult, null, 2)}
                    </pre>
                  </InspectorSection>
                )}
              </div>
            </TabsContent>
          )}

          {/* Run tab */}
          {tabs.some((t) => t.id === 'run') && (
            <TabsContent value="run">
              <div className="flex flex-col gap-2">
                {def.executionMode !== 'runtime' ? (
                  <p className="text-[12px] text-text-muted">This node does not execute.</p>
                ) : !status || status.status === 'idle' ? (
                  <p className="text-[12px] text-text-muted">Not run yet in this session.</p>
                ) : (
                  <>
                    <InspectorSection title="Last run">
                      <div className="flex flex-col gap-1">
                        <StatusLine status={status.status} message={status.message} />
                        {durationLabel && (
                          <p className="text-[11px] text-text-muted">Duration: {durationLabel}</p>
                        )}
                        {status.progress !== null && status.progress !== undefined && (
                          <p className="text-[11px] text-text-muted">Progress: {Math.round(status.progress * 100)}%</p>
                        )}
                      </div>
                    </InspectorSection>
                    {nodeLogs.length > 0 ? (
                      <InspectorSection title="Logs">
                        <div className="flex flex-col gap-0.5">
                          {nodeLogs.map((l) => (
                            <div key={l.id} className="font-mono text-[11px] leading-snug text-text-secondary">
                              <span className={cn(l.level === 'error' ? 'text-text-error' : 'text-text-muted')}>
                                [{l.level}]
                              </span>{' '}
                              {l.message}
                            </div>
                          ))}
                        </div>
                      </InspectorSection>
                    ) : (
                      <p className="text-[11px] text-text-muted">No logs for this node.</p>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          )}

          {/* Preview tab — standardized by output type and backed by the latest
              node-result payload (or the upstream result for viewer nodes). */}
          {tabs.some((t) => t.id === 'preview') && (
            <TabsContent value="preview">
              <PreviewViewer
                kind={previewKind}
                status={status ? { status: status.status, message: status.message } : undefined}
                result={visibleResult}
              />
            </TabsContent>
          )}

          {/* Note tab (markdownNote) */}
          {tabs.some((t) => t.id === 'note') && (
            <TabsContent value="note">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-medium text-text-muted">Markdown</p>
                <PropertyRow
                  label="Content"
                  type="textarea"
                  value={node.data?.content ?? ''}
                  onChange={(v) => updateNodeData(nodeId, { content: v } as Partial<AppNodeData>)}
                  placeholder="Write a note…"
                />
                <p className="text-[11px] text-text-muted">
                  Notes document the canvas and never execute.
                </p>
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState title="No detail" body="This node has no detail view." live="off" />
        </div>
      )}
    </div>
  );
}

/** A single port row with an icon, label, type, and optional upstream feed. */
function PortRow({
  port,
  feed,
}: {
  port: Port;
  feed?: { sourceLabel: string; sourceType: PortType };
}) {
  const PortIcon = getPortIcon(port.type);
  return (
    <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-panel px-2 py-1.5">
      <PortIcon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-text-primary">{port.label}</p>
        {feed ? (
          <p className="truncate text-[11px] text-text-muted">
            from {feed.sourceLabel} · {feed.sourceType}
          </p>
        ) : (
          <p className="text-[11px] text-text-muted">type: {port.type}</p>
        )}
      </div>
      {port.required && (
        <span className="text-[10px] text-text-muted">required</span>
      )}
    </div>
  );
}

/** Status line — icon + label, color via token (status never color-only). */
function StatusLine({ status, message }: { status: PerNodeState; message: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <div className="flex items-center gap-1.5">
      <Icon
        size={14}
        aria-hidden="true"
        className={status === 'running' || status === 'queued' ? 'animate-spin' : ''}
        style={{ color: `var(--${STATUS_TOKEN[status]})` }}
      />
      <span className="text-[12px] text-text-secondary">{STATUS_LABEL[status]}</span>
      {message && <span className="truncate text-[11px] text-text-muted">— {message}</span>}
    </div>
  );
}

/**
 * MediaInfoSubTabs — spec §47 (Phase F). The Media Info Configure tab hosts
 * Summary / Video / Audio / Raw sub-tabs, with Raw FFprobe output as Advanced
 * only (§47: "Raw FFprobe output is Advanced only"). Rendered as nested Radix
 * Tabs inside the generic NodeDetailPanel — the one per-node structural
 * exception (§61 still holds: no bespoke sheet).
 *
 * Honesty: probed metadata is NOT streamed to the frontend (no `.rs` IPC), so
 * each sub-tab is an honest, structured empty state naming the fields it will
 * show once a run delivers them. No fabricated metadata rows.
 */
const MEDIA_INFO_SUBTABS = ['summary', 'video', 'audio', 'raw'] as const;
type MediaInfoSubtab = (typeof MEDIA_INFO_SUBTABS)[number];

function MediaInfoSubTabs({
  status,
}: {
  status: { status: PerNodeState; message: string; progress: number | null } | undefined;
}) {
  const [subtab, setSubtab] = useState<MediaInfoSubtab>('summary');
  const ran = !!status && status.status !== 'idle';

  return (
    <Tabs value={subtab} onValueChange={(v) => setSubtab(v as MediaInfoSubtab)} className="flex flex-col gap-2">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="video">Video</TabsTrigger>
        <TabsTrigger value="audio">Audio</TabsTrigger>
        <TabsTrigger value="raw">Raw</TabsTrigger>
      </TabsList>

      <TabsContent value="summary">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-text-muted">Summary</p>
          <MetadataRows
            rows={[
              { label: 'Container', value: undefined },
              { label: 'Duration', value: undefined },
              { label: 'Overall bitrate', value: undefined },
            ]}
            ran={ran}
            status={status}
          />
        </div>
      </TabsContent>

      <TabsContent value="video">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-text-muted">Video stream</p>
          <MetadataRows
            rows={[
              { label: 'Codec', value: undefined },
              { label: 'Resolution', value: undefined },
              { label: 'Frame rate', value: undefined },
              { label: 'Pixel format', value: undefined },
            ]}
            ran={ran}
            status={status}
          />
        </div>
      </TabsContent>

      <TabsContent value="audio">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-text-muted">Audio stream</p>
          <MetadataRows
            rows={[
              { label: 'Codec', value: undefined },
              { label: 'Sample rate', value: undefined },
              { label: 'Channels', value: undefined },
              { label: 'Bitrate', value: undefined },
            ]}
            ran={ran}
            status={status}
          />
        </div>
      </TabsContent>

      <TabsContent value="raw">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-text-muted">
            Raw FFprobe output <span className="text-text-muted">(Advanced)</span>
          </p>
          {!ran ? (
            <p className="text-[12px] text-text-muted">
              No probe available. Run the workflow to capture FFprobe output.
            </p>
          ) : status?.status === 'success' ? (
            <div className="rounded-control border border-border-subtle bg-surface-panel p-2">
              <p className="font-mono text-[11px] leading-snug text-text-muted">
                The raw FFprobe JSON will render here once probed metadata is streamed
                to the frontend.
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-text-muted">
              Last run status: {status?.status ?? 'idle'}
              {status?.message ? ` — ${status.message}` : ''}. No probe captured.
            </p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

/**
 * MetadataRows — a compact key/value list for one Media Info sub-tab. Each
 * `value` is `undefined` until a run delivers probed metadata (honest empty
 * state — shows the field name + a muted "—" placeholder, never a fake value).
 */
function MetadataRows({
  rows,
  ran,
  status,
}: {
  rows: { label: string; value: string | undefined }[];
  ran: boolean;
  status: { status: PerNodeState; message: string } | undefined;
}) {
  if (!ran) {
    return (
      <p className="text-[12px] text-text-muted">
        No metadata available. Run the workflow to probe the media.
      </p>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-0.5 rounded-control border border-border-subtle bg-surface-panel p-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-[11px] text-text-muted">{row.label}</span>
            <span className="font-mono text-[11px] text-text-secondary">
              {row.value ?? '—'}
            </span>
          </div>
        ))}
      </div>
      {status?.status !== 'success' && (
        <p className="text-[11px] text-text-muted">
          Last run did not succeed
          {status?.message ? ` (${status.message})` : ''}; metadata may be incomplete.
        </p>
      )}
    </>
  );
}
