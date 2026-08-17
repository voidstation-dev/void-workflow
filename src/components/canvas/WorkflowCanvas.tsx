import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  useOnSelectionChange,
  getOutgoers,
  MarkerType,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { useWorkflowStore, AppNode } from '@/store/workflowStore';
import { nodeTypes } from '@/nodes/nodeTypes';
import { NODE_DEFINITIONS } from '@/nodes/registry';
import { resolvePortType, isTypeCompatible } from '@/nodes/portCompat';
import { useKeyboardConnect } from '@/hooks/useKeyboardConnect';
import { youtubeVisualizerTemplate } from '@/nodes/youtubeTemplatePreset';
import { CanvasToolbar } from './CanvasToolbar';
import { StartMarker } from './StartMarker';
import { ContextMenu, ContextMenuTrigger } from '@/components/primitives/ContextMenu';
import { InsertEdge } from './InsertEdge';

// Code-split the gated canvas children: the pane right-click menu content pulls
// cmdk + @radix-ui/react-context-menu, and the multi-select GroupToolbar pulls
// @radix-ui/react-popover + the arrange/delete hooks. Neither is needed on the
// initial workflow view (no right-click yet, no multi-select), so deferring
// them shrinks the initial bundle. Named exports → wrap into a default for
// React.lazy.
const CanvasContextMenuContent = lazy(() =>
  import('./CanvasContextMenu').then((m) => ({ default: m.CanvasContextMenuContent })),
);
const GroupToolbar = lazy(() => import('./GroupToolbar').then((m) => ({ default: m.GroupToolbar })));

// Phase G (spec §33/§66): the default edge is the custom InsertEdge — the
// normal bezier path PLUS a hover `+` button at the midpoint that opens a node
// picker to splice a new node between A and B (A→B becomes A→New→B). A single
// edgeTypes map (defined once, stable ref) so RF doesn't warn about a new map
// each render (§27 stable selectors — same discipline for edgeTypes).
const edgeTypes = { insert: InsertEdge };

const defaultEdgeOptions = {
  type: 'insert',
  style: { stroke: 'var(--edge-stroke)', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--border-default)', width: 16, height: 16 },
} as const;

function CanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, replaceGraph } = useWorkflowStore();
  const { screenToFlowPosition, getNodes, getEdges, fitView, setCenter } = useReactFlow();
  // Pane context-menu: capture the flow-space click position so the menu's
  // "Add Node"/"Paste" can place exactly at the cursor. Radix ContextMenu
  // opens at the native contextmenu point; we just record the coords here
  // (single owner of screenToFlowPosition — the menu content only reads them).
  const [paneFlowPos, setPaneFlowPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Phase 6: zoom/fit/undo-redo/density/minimap moved to CanvasToolbar; the
  // canvas still needs fitView (templates + pendingCenter) and setCenter.
  // Cross-zone keyboard-add channel (spec §6): the library writes addModeNodeType;
  // we consume it on a pane click / Enter-at-center and place via addNode.
  const addModeNodeType = useWorkflowStore((s) => s.addModeNodeType);
  const setAddModeNodeType = useWorkflowStore((s) => s.setAddModeNodeType);
  const announce = useWorkflowStore((s) => s.setAnnouncement);
  const minimapOn = useWorkflowStore((s) => s.minimapOn);
  const selectedEdgeId = useWorkflowStore((s) => s.selectedEdgeId);
  const perNodeStatus = useWorkflowStore((s) => s.perNodeStatus);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const selectEdge = useWorkflowStore((s) => s.selectEdge);
  const setMultiSelect = useWorkflowStore((s) => s.setMultiSelect);
  // Multi-select group toolbar (spec §55/§65): shown when >1 node is selected.
  // selectionMode is a scalar; multiSelectIds is the store's existing array
  // (stable ref — not a derived fresh array, §27-safe).
  const selectionMode = useWorkflowStore((s) => s.selectionMode);
  const multiSelectIds = useWorkflowStore((s) => s.multiSelectIds);
  const showGroupToolbar = selectionMode === 'multi' && multiSelectIds.length > 1;
  // Cross-zone canvas-center channel (spec §9.4): the BottomDock Problems panel
  // writes pendingCenterNodeId; we pan the canvas to it, then clear the one-shot.
  const pendingCenterNodeId = useWorkflowStore((s) => s.pendingCenterNodeId);
  const setPendingCenter = useWorkflowStore((s) => s.setPendingCenter);
  // Phase E (spec §26): double-click a node opens the NodeDetailPanel Sheet.
  const openNodeDetail = useWorkflowStore((s) => s.openNodeDetail);

  // Consume a pending center request from the dock (Problems click-to-focus).
  // Lives here because useReactFlow().setCenter must run inside the provider.
  useEffect(() => {
    if (pendingCenterNodeId === null) return;
    const node = getNodes().find((n) => n.id === pendingCenterNodeId);
    if (node) {
      const w = node.measured?.width ?? 140;
      const h = node.measured?.height ?? 60;
      const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: 1,
        duration: reduce ? 0 : 300,
      });
    }
    setPendingCenter(null);
  }, [pendingCenterNodeId, getNodes, setCenter, setPendingCenter]);

  // §10.5 keyboard-connect (additive, never touches pointer flow).
  useKeyboardConnect();

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      // Prevent self connection
      if (connection.source === connection.target) return false;

      const currentNodes = getNodes();
      const currentEdges = getEdges();
      const target = currentNodes.find((node) => node.id === connection.target);

      if (!target) return true;

      // Check if target is eventually a source for our current connection's source
      const hasCycle = (node: Node, visited: Set<string> = new Set()) => {
        if (visited.has(node.id)) return false;
        visited.add(node.id);

        const outgoers = getOutgoers(node, currentNodes, currentEdges);
        for (const outgoer of outgoers) {
          if (outgoer.id === connection.source) return true;
          if (hasCycle(outgoer, visited)) return true;
        }
        return false;
      };

      if (hasCycle(target)) return false;

      // SOFT type advisory (spec §7.3: backend authoritative; type-incompatible
      // reported via Problems, NOT a hard block). We do NOT return false — the
      // cycle guard above is the only hard gate. A mismatch is announced so the
      // user knows the edge will likely fail at run time. This preserves the
      // §27 connect contract: a connection the backend would allow is never
      // rejected by the UI.
      const sourceNode = currentNodes.find((n) => n.id === connection.source);
      const sourceType = resolvePortType(sourceNode?.type, connection.sourceHandle, 'out');
      const targetType = resolvePortType(target.type, connection.targetHandle, 'in');
      if (!isTypeCompatible(sourceType, targetType)) {
        announce({
          id: 'type-mismatch',
          text: `Type mismatch: ${sourceType} → ${targetType}. Backend validation is authoritative; this will be reported in Problems.`,
        });
      }

      return true;
    },
    [getNodes, getEdges, announce],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Shared placement helper — the SINGLE node-construction path used by both
  // drag-drop and keyboard-add, so they can never produce divergent nodes.
  const placeNode = useCallback(
    (nodeType: string, label: string, position: { x: number; y: number }) => {
      const newNode: AppNode = {
        id: uuidv4(),
        type: nodeType,
        position,
        data: { label: label || nodeType },
      };
      addNode(newNode);
    },
    [addNode],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      // Check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      placeNode(type, label, position);
    },
    [screenToFlowPosition, placeNode],
  );

  // Keyboard-add: a pane (background) click during add-mode places the node at
  // the click position. onPaneClick does NOT fire on nodes/edges, so this won't
  // clobber node selection — clicks on existing nodes are ignored in add-mode.
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!addModeNodeType) return;
      const def = NODE_DEFINITIONS.find((d) => d.type === addModeNodeType);
      if (!def) {
        setAddModeNodeType(null);
        return;
      }
      placeNode(
        def.type,
        def.label,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
      setAddModeNodeType(null);
      announce({ id: uuidv4(), text: 'Node placed.' });
    },
    [addModeNodeType, screenToFlowPosition, placeNode, setAddModeNodeType, announce],
  );

  // Phase E (spec §26): double-click a node → open the NodeDetailPanel Sheet
  // (Configure / Input / Output / Run / Preview tabs). Single click still
  // selects (RF default) → toolbar + Inspector; the double-click is the
  // distinct "open detail" gesture and does not replace selection. The detail
  // panel reads `detailNodeId` from the store and renders as a right-side Sheet.
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: AppNode) => {
      openNodeDetail(node.id);
    },
    [openNodeDetail],
  );

  // Keyboard-add: Enter at canvas center places the node. Window-level so Enter
  // is caught regardless of which canvas child holds focus; guarded by
  // addModeNodeType so it only fires during add-mode. Escape is NOT handled
  // here — the global useWorkspaceShortcuts handler cancels + restores focus.
  useEffect(() => {
    if (!addModeNodeType) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const def = NODE_DEFINITIONS.find((d) => d.type === addModeNodeType);
      if (!def) {
        setAddModeNodeType(null);
        return;
      }
      const rect = document.querySelector('main[role="application"]')?.getBoundingClientRect();
      if (!rect) return;
      placeNode(
        def.type,
        def.label,
        screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }),
      );
      setAddModeNodeType(null);
      announce({ id: uuidv4(), text: 'Node placed.' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addModeNodeType, screenToFlowPosition, placeNode, setAddModeNodeType, announce]);

  // Selection mirror (spec §7.3): useOnSelectionChange is the ONLY multi-select
  // writer into selectionSlice. Mirrors RF selection → store. Single node/edge
  // → selectNode/selectEdge; multiple → setMultiSelect.
  useOnSelectionChange({
    onChange: ({ nodes: selNodes, edges: selEdges }) => {
      if (selNodes.length > 1) {
        setMultiSelect(selNodes.map((n) => n.id));
      } else if (selNodes.length === 1) {
        selectNode(selNodes[0].id);
      } else if (selEdges.length === 1) {
        selectEdge(selEdges[0].id);
      } else if (selEdges.length === 0 && selNodes.length === 0) {
        // Don't fight the store's own clearSelection calls — only mirror when
        // RF reports an active selection. A no-op here avoids loops.
      }
    },
  });

  // Edge styling: derive styled edges in render via useMemo so store.edges
  // stays plain (save serializes store.edges — §27). Selected edge → accent
  // 2px; run-payload edge (feeding a running node) → animated dashed status.
  // running color. Per-edge aria-label includes source/target/type.
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const isSelected = edge.id === selectedEdgeId;
      const targetStatus = perNodeStatus[edge.target]?.status;
      const isRunningPayload = targetStatus === 'running' || targetStatus === 'queued';
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      const sourceType = resolvePortType(sourceNode?.type, edge.sourceHandle, 'out');
      const sourceLabel = sourceNode?.data?.label ?? sourceNode?.type ?? 'node';
      const targetLabel = targetNode?.data?.label ?? targetNode?.type ?? 'node';
      const className = [
        isSelected ? 'edge-selected' : '',
        isRunningPayload ? 'edge-run-payload' : '',
      ].filter(Boolean).join(' ');
      return {
        ...edge,
        // Phase G: render every edge as the InsertEdge (custom edge with the
        // hover `+` insert button, spec §33) unless it explicitly sets a
        // different custom type. Legacy edges saved as type:'default' get
        // normalized here so loaded graphs also gain the `+` affordance —
        // store.edges stays plain (save serializes the original type; the
        // rendered override never persists). See edgeTypes + defaultEdgeOptions.
        type: edge.type && edge.type !== 'default' ? edge.type : 'insert',
        animated: isRunningPayload,
        className,
        ariaLabel: `Connection from ${sourceLabel} to ${targetLabel}: ${sourceType}`,
      };
    });
  }, [edges, selectedEdgeId, perNodeStatus, nodes]);

  // Pane context menu (spec §53). RF fires onPaneContextMenu on pane right-
  // click; we record the flow-space click position for the Radix ContextMenu's
  // Add Node / Paste actions to place exactly at the cursor. We do NOT clear
  // selection and do NOT call preventDefault here — the Radix ContextMenuTrigger
  // wrapping the canvas opens the menu at the cursor and suppresses the native
  // browser menu; calling preventDefault in this RF handler first would make
  // the bubbling contextmenu event defaultPrevented before Radix sees it, and
  // Radix skips opening on a default-prevented event. So we only capture coords.
  const onPaneContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      setPaneFlowPos(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [screenToFlowPosition],
  );

  // Empty-state template buttons (spec §7.1). Insert pre-wired nodes+edges via
  // the SAME store path (addNode + onConnect), then fitView({duration:0}).
  const addTemplateTextAiPreview = useCallback(() => {
    const textId = uuidv4();
    const aiId = uuidv4();
    const previewId = uuidv4();
    const baseX = 80;
    const gap = 380;
    addNode({ id: textId, type: 'textInput', position: { x: baseX, y: 160 }, data: { label: 'Text Input' } });
    addNode({ id: aiId, type: 'aiScript', position: { x: baseX + gap, y: 160 }, data: { label: 'AI Script (Gemini)' } });
    addNode({ id: previewId, type: 'preview', position: { x: baseX + gap * 2, y: 160 }, data: { label: 'Preview' } });
    onConnect({ source: textId, target: aiId, sourceHandle: 'out', targetHandle: 'in' });
    onConnect({ source: aiId, target: previewId, sourceHandle: 'out', targetHandle: 'in' });
    setTimeout(() => fitView({ duration: 0, maxZoom: 1, padding: 0.18 }), 0);
  }, [addNode, onConnect, fitView]);

  // "Local Media → Info": registry has no media-source node (fileInput outputs
  // `file`, not `media`). Documented gap — Phase 6 follow-up to add a media
  // source + correct the template. Shipped as mediaInfo → preview (any→any,
  // type-compatible) so the first node is the Info node. Label kept for spec
  // text parity; the gap is noted here.
  const addTemplateMediaInfo = useCallback(() => {
    const mediaId = uuidv4();
    const previewId = uuidv4();
    addNode({ id: mediaId, type: 'mediaInfo', position: { x: 120, y: 160 }, data: { label: 'Media Info' } });
    addNode({ id: previewId, type: 'preview', position: { x: 340, y: 160 }, data: { label: 'Preview' } });
    onConnect({ source: mediaId, target: previewId, sourceHandle: 'out', targetHandle: 'in' });
    setTimeout(() => fitView({ duration: 0, maxZoom: 1, padding: 0.18 }), 0);
  }, [addNode, onConnect, fitView]);

  // YouTube Visualizer template (4 runtime nodes): Audio & Cover → Background
  // Media → Soundwave Visualizer → Preview & Export, wired with the REAL
  // registry handle ids (audio/metadata/cover/background/video) — unlike the
  // two legacy templates above which still use the stale 'out'/'in' handles.
  // Loaded via replaceGraph (single store mutation → one history snapshot +
  // markDirty). Node ids are remapped to fresh uuids so a re-load never
  // collides, and edges are rewritten to match. File paths are intentionally
  // empty (no fabricated audio/cover/duration); the user binds real media and
  // the probe reports honest values.
  const addTemplateYouTubeVisualizer = useCallback(() => {
    const template = youtubeVisualizerTemplate();
    const idMap = new Map<string, string>();
    const remappedNodes = template.nodes.map((n) => {
      const newId = uuidv4();
      idMap.set(n.id, newId);
      return { ...n, id: newId } as AppNode;
    });
    const remappedEdges = template.edges.map((e) => ({
      ...e,
      id: uuidv4(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));
    replaceGraph({ nodes: remappedNodes, edges: remappedEdges });
    setTimeout(() => fitView({ duration: 0, maxZoom: 1, padding: 0.18 }), 0);
  }, [replaceGraph, fitView]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div className="flex-grow h-full w-full bg-surface-canvas">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        defaultEdgeOptions={defaultEdgeOptions}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
        colorMode="light"
        // Multi-select (spec §16 "Phase 5+"): cheap additive RF built-ins.
        // selectionOnDrag=false keeps pan/drag semantics unchanged — rubberband
        // only with Shift held (selectionKeyCode). Shift+click adds.
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
      >
        <Background color="var(--surface-canvas-grid)" gap={28} size={1} />
        {/* Phase 6: StartMarker — a React Flow Panel overlay (NOT a node),
            pinned top-center as a visual workflow-start affordance. aria-hidden
            (no actionable semantics; Run lives in the header). Never enters
            nodeTypes, save JSON, or isValidConnection (spec §7.2 / §10). */}
        {nodes.length > 0 && (
          <Panel position="top-center" className="pointer-events-none mt-5">
            <StartMarker />
          </Panel>
        )}
        {/* Phase 6: CanvasToolbar — bottom-left compact bar (spec §9):
            Outline/Detail density toggle, Undo/Redo, Fit, zoom −/%/+, Minimap.
            Replaces the vertical Controls + the bottom-right Fit+zoom Panel. */}
        <Panel position="bottom-left" className="mb-3 ml-3">
          <CanvasToolbar />
        </Panel>
        {/* Multi-select group toolbar (spec §55/§65): Duplicate · Delete · Align.
            Shown only when >1 node is selected. Rendered as a bottom-center
            Panel lifted ABOVE the CanvasToolbar so the two don't overlap. */}
        {showGroupToolbar && (
          <Panel position="bottom-center" className="mb-[3.25rem]">
            <Suspense fallback={null}>
              <GroupToolbar ids={multiSelectIds} />
            </Suspense>
          </Panel>
        )}
        {/* Empty state (spec §7.1): DOM-removed (conditional render, not
            hidden) the moment nodes.length > 0. aria-live polite on first
            appearance. pointer-events-auto on the action buttons only. */}
        {nodes.length === 0 && (
          <Panel position="top-center" className="pointer-events-none">
            <div
              role="status"
              aria-live="polite"
              className="mx-auto max-w-xs rounded-panel border border-border-subtle bg-surface-canvas/80 p-6 text-center backdrop-blur-sm"
            >
              <h2 className="text-[14px] font-semibold text-text-primary">Build your workflow</h2>
              <p className="mt-1 text-[12px] text-text-secondary">
                Drag a node from the library, or press Tab to focus the library and press Enter to add.
              </p>
              <div className="mt-1 text-[11px] text-text-muted">or start with:</div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={addTemplateYouTubeVisualizer}
                  className="pointer-events-auto rounded-control px-2.5 py-1 text-[11px] font-medium text-text-on-accent transition-colors"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  YouTube Visualizer
                </button>
                <button
                  type="button"
                  onClick={addTemplateTextAiPreview}
                  className="pointer-events-auto rounded-control border border-border-subtle bg-surface-panel px-2.5 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  Text → AI → Preview
                </button>
                <button
                  type="button"
                  onClick={addTemplateMediaInfo}
                  className="pointer-events-auto rounded-control border border-border-subtle bg-surface-panel px-2.5 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  Local Media → Info
                </button>
              </div>
            </div>
          </Panel>
        )}
        {/* Minimap (spec §7.2): OFF by default, persisted in uiSlice.minimapOn.
            aria-hidden (visual orientation aid, non-operable for AT). */}
        {minimapOn && (
          <MiniMap
            aria-hidden="true"
            pannable
            zoomable
            className="rounded-panel border border-border-default bg-surface-panel [&_.react-flow__minimap-mask]:fill-accent-subtle [&_.react-flow__minimap-node]:fill-border-default"
            maskColor="var(--surface-overlay)"
            nodeColor="var(--border-default)"
          />
        )}
      </ReactFlow>
    </div>
      </ContextMenuTrigger>
      {/* Pane right-click menu (spec §53): Add Node · Paste · Fit View.
          flowPosition is captured by onPaneContextMenu at right-click time. The
          eager ContextMenu wrapper handles the right-click immediately; the lazy
          content (cmdk Add-Node list + actions) populates ms later on Tauri
          local FS. Null fallback → no visible gap. */}
      <Suspense fallback={null}>
        <CanvasContextMenuContent flowPosition={paneFlowPos} />
      </Suspense>
    </ContextMenu>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
