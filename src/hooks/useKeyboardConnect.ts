import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * useKeyboardConnect — spec §10.5 frozen keyboard-connect contract.
 *
 * ADDITIVE to pointer connect — never replaces it. Pending state lives in a
 * ref (NOT the persisted store) so it cannot affect save/load shape (§27).
 *
 * Flow: focus an output port Handle → press Enter or `c` ("connect") → focus
 * moves to the canvas → focus a target input port → press Enter to confirm →
 * calls the same store.onConnect path pointer-drag uses → clear. Escape
 * cancels. Cycle/type rejection is handled by isValidConnection (cycle guard)
 * + the global announcer (soft type advisory), NOT a modal (spec §7.3).
 *
 * Contract details:
 * - The focused source Handle's DOM node carries `role="button"` + an
 *   `aria-label` of the form "Output port: <type> · <label>" (PortHandle). We
 *   stash the source node id + handle id when Enter/c fires on it.
 * - On confirm, we read the focused target Handle's data-* attributes
 *   (data-node-id / data-handle-id) to build a Connection and call onConnect.
 *   PortHandle renders the Handle with id; we attach data attrs via a
 *   delegated keydown listener on the canvas wrapper rather than per-handle
 *   React handlers (cheaper, avoids touching RF's internal Handle events).
 *
 * This hook is mounted once inside CanvasInner (within the ReactFlowProvider).
 */
interface PendingConnect {
  sourceNodeId: string;
  sourceHandleId: string;
}

export function useKeyboardConnect() {
  const pendingRef = useRef<PendingConnect | null>(null);
  const { getNodes } = useReactFlow();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const store = useWorkflowStore.getState();

      // Escape cancels a pending keyboard-connect (lower priority than addMode,
      // which is handled by useWorkspaceShortcuts and returns before we'd get
      // here only if focus is on a Handle; both are independent Escape paths).
      if (e.key === 'Escape' && pendingRef.current) {
        pendingRef.current = null;
        store.setAnnouncement({ id: 'kb-connect-cancel', text: 'Connection cancelled.' });
        e.preventDefault();
        return;
      }

      const target = e.target as HTMLElement | null;
      // Only act on Handle elements (role="button" inside .react-flow__handle).
      const isHandle = target?.closest?.('.react-flow__handle[role="button"]') != null;
      if (!isHandle) return;

      if (e.key === 'Enter' || e.key === 'c') {
        const handleEl = target!.closest('.react-flow__handle') as HTMLElement | null;
        if (!handleEl) return;
        // RF renders data-handleid, data-nodeid, data-handlepos directly on the
        // .react-flow__handle div (verified in @xyflow/react v12 source). Read
        // them straight off the handle element.
        const nodeId = handleEl.getAttribute('data-nodeid') ?? '';
        const handleId = handleEl.getAttribute('data-handleid') ?? '';
        const handlePos = handleEl.getAttribute('data-handlepos') ?? '';
        if (!nodeId) return;
        // Position.Left = input (target), Position.Right = output (source).
        const isSource = handlePos === 'right';
        const isTarget = handlePos === 'left';

        if (isSource && !pendingRef.current) {
          pendingRef.current = { sourceNodeId: nodeId, sourceHandleId: handleId };
          store.setAnnouncement({
            id: 'kb-connect-start',
            text: 'Connect: focus a target input port and press Enter to confirm, Escape to cancel.',
          });
          // Move focus to the canvas so the user can Tab to a target handle.
          (document.querySelector('main[role="application"]') as HTMLElement | null)?.focus();
          e.preventDefault();
        } else if (isTarget && pendingRef.current) {
          const { sourceNodeId, sourceHandleId } = pendingRef.current;
          // Verify the source node still exists (graph may have changed).
          const exists = getNodes().some((n) => n.id === sourceNodeId);
          if (exists) {
            store.onConnect({
              source: sourceNodeId,
              target: nodeId,
              sourceHandle: sourceHandleId || null,
              targetHandle: handleId || null,
            });
            store.setAnnouncement({ id: 'kb-connect-done', text: 'Connected.' });
          }
          pendingRef.current = null;
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [getNodes]);
}