import { useCallback } from 'react';
import { useWorkflowStore, type AppNode } from '@/store/workflowStore';

/**
 * useArrange — shared align/distribute logic for the multi-select group
 * (spec §55 "Align"). One owner of the arrange math so the `MultiSelectInspector`
 * (§8.1) and the floating `GroupToolbar` (§55/§65) can never diverge — the
 * composition-patterns "single owner of the clone logic" principle, applied to
 * layout. All positioning uses `node.position` (zoom/viewport-independent flow
 * coordinates), never DOM rects.
 *
 * Align: set every selected node's x or y to the min/max/center of the
 * selection bbox. Distribute: evenly space between the extremes along an axis.
 * Both compose `setNodes` + `markDirty` — the same history-snapshot path as
 * every other structural mutation (§27).
 *
 * No `.rs` / no IPC / no new persisted state. Pure store mutation.
 */
export type ArrangeAxis = 'x' | 'y';
export type AlignMode = 'min' | 'max' | 'center';

export function useArrange(ids: string[]) {
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const markDirty = useWorkflowStore((s) => s.markDirty);

  const getSelected = useCallback(() => {
    const { nodes } = useWorkflowStore.getState();
    return nodes.filter((n) => ids.includes(n.id));
  }, [ids]);

  const align = useCallback(
    (axis: ArrangeAxis, mode: AlignMode) => {
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
        nodes.map((n: AppNode) =>
          idSet.has(n.id) ? { ...n, position: { ...n.position, [axis]: target } } : n,
        ),
      );
      markDirty();
    },
    [getSelected, ids, setNodes, markDirty],
  );

  const distribute = useCallback(
    (axis: ArrangeAxis) => {
      const sel = getSelected().sort((a, b) => a.position[axis] - b.position[axis]);
      if (sel.length < 3) return;
      const min = sel[0].position[axis];
      const max = sel[sel.length - 1].position[axis];
      const step = (max - min) / (sel.length - 1);
      const posById = new Map(sel.map((n, i) => [n.id, min + step * i]));
      const { nodes } = useWorkflowStore.getState();
      const idSet = new Set(ids);
      setNodes(
        nodes.map((n: AppNode) =>
          idSet.has(n.id)
            ? { ...n, position: { ...n.position, [axis]: posById.get(n.id)! } }
            : n,
        ),
      );
      markDirty();
    },
    [getSelected, ids, setNodes, markDirty],
  );

  return { align, distribute };
}