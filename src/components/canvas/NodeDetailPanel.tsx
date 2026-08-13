import { lazy, Suspense } from 'react';
import { Dialog, DialogContent } from '@/components/primitives/Dialog';
import { useWorkflowStore } from '@/store/workflowStore';

// The heavy body (Tabs, node registry, PreviewViewer, portCompat, icons) is
// code-split — only loaded when a node is first opened for detail. The thin
// Dialog shell stays eagerly mounted so the portal container exists immediately.
const NodeDetailBody = lazy(() => import('./NodeDetailBody'));

/**
 * NodeDetailPanel — spec §26/§27/§61. The generic double-click detail panel.
 * Rendered as a right-side Sheet (Radix Dialog) when `detailNodeId` is set.
 *
 * This file holds only the always-mounted Radix Dialog shell. The per-node
 * content lives in `NodeDetailBody` (lazy) — one component for ALL node types,
 * tabs computed from capabilities (spec §61 "Avoid unique panel architecture
 * per node"). See NodeDetailBody for the tab/honesty/focus-Prompt contracts.
 *
 * `detailNodeId` is transient (NOT in partialize). No `.rs` / no IPC. The only
 * store writes are `updateNodeData` (Configure edits) and
 * `openNodeDetail`/`closeNodeDetail`.
 */
export function NodeDetailPanel() {
  const detailNodeId = useWorkflowStore((s) => s.detailNodeId);
  const closeNodeDetail = useWorkflowStore((s) => s.closeNodeDetail);

  return (
    <Dialog
      open={detailNodeId !== null}
      onOpenChange={(open) => {
        if (!open) closeNodeDetail();
      }}
    >
      <DialogContent side="right" width={480} aria-describedby={undefined}>
        {detailNodeId ? (
          // `key` forces a fresh NodeDetailBody (and so a fresh `activeTab`
          // useState initializer + focus-Prompt effect) per node — no stale tab
          // leaks when switching between nodes, and the §52 Preview-node "open
          // on Preview" shortcut re-evaluates per node. The null Suspense
          // fallback is transparent: the body just appears (chunk load is
          // single-digit ms on Tauri local FS), and the existing `setTimeout(0)`
          // in the body's focus-Prompt effect covers the load-then-mount latency.
          <Suspense fallback={null}>
            <NodeDetailBody key={detailNodeId} nodeId={detailNodeId} onClose={closeNodeDetail} />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}