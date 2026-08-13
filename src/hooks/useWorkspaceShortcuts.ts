import { useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowController } from './useWorkflowController';

/**
 * useWorkspaceShortcuts — binds the shell + canvas keyboard shortcuts (spec §15,
 * §7.4). Mounted once in App.tsx. Priority order for Escape: addMode (keyboard
 * add) → dialog → selection-clear → exit-canvas-to-toolbar. Canvas-specific
 * keys (Delete, Ctrl/Cmd+A select-all, Ctrl/Cmd+D duplicate, Arrow nudge, `c`
 * port-connect) are bound here and gated on focus being inside the canvas main.
 *
 * `c` for port-connect is the entry cue; the actual connect flow (focus target
 * → Enter) is handled in useKeyboardConnect.
 */

const LANDMARK_SELECTORS = [
  '[role="banner"]',                          // WorkflowHeader
  'nav[aria-label="Workspace sections"]',    // WorkflowTabs
  'aside[aria-label="Node library"]',        // NodeLibrary (workflow screen only)
  'main[role="application"]',                // Canvas (workflow screen only)
  'aside[aria-label="Inspector"]',           // Inspector (workflow screen only)
  // App Screens — rendered as <main data-screen="…">. Unmounted on the
  // workflow screen (querySelector returns null → safely skipped), so F6 lands
  // on the active screen when the canvas/library/inspector landmarks are gone.
  'main[data-screen]',
  'footer[role="contentinfo"]',              // BottomDock
];

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

function focusIsInCanvas(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const canvas = document.querySelector('main[role="application"]');
  return !!canvas && canvas.contains(active);
}

export function useWorkspaceShortcuts(controller: WorkflowController): void {
  useEffect(() => {
    const isMac =
      typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
    const cmd = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

    const cycleLandmark = (forward: boolean) => {
      const landmarks = LANDMARK_SELECTORS
        .map((s) => document.querySelector(s))
        .filter((el): el is Element => el !== null) as HTMLElement[];
      if (landmarks.length === 0) return;
      const active = document.activeElement;
      const currentIndex = landmarks.findIndex((lm) => lm.contains(active));
      let nextIndex: number;
      if (currentIndex === -1) {
        nextIndex = 0;
      } else {
        const step = forward ? 1 : -1;
        nextIndex = (currentIndex + step + landmarks.length) % landmarks.length;
      }
      const target = landmarks[nextIndex];
      target.setAttribute('tabindex', '-1');
      target.focus();
    };

    const onKey = (e: KeyboardEvent) => {
      const store = useWorkflowStore.getState();

      // Escape works everywhere (closes dialog / clears selection / cancels add-mode).
      if (e.key === 'Escape') {
        // Add-mode (keyboard-add) takes highest priority so Esc always cancels
        // a pending placement + returns focus to the originating library item,
        // regardless of where focus currently sits (spec §6 frozen invariant).
        if (store.addModeNodeType) {
          store.setAddModeNodeType(null);
          if (store.addModeReturnFocusId) {
            document.getElementById(store.addModeReturnFocusId)?.focus();
          }
          e.preventDefault();
          return;
        }
        if (store.dialog !== null) {
          store.setDialog(null);
          e.preventDefault();
          return;
        }
        if (store.selectionMode !== 'none') {
          store.clearSelection();
          controller.announce('Selection cleared');
          e.preventDefault();
          return;
        }
        // Second Esc: exit canvas focus to the toolbar (spec §7.4 "Exit canvas"
        // affordance). Final fall-through AFTER addMode > dialog > selection,
        // guarded so it only fires when focus is inside the canvas.
        if (
          !store.addModeNodeType &&
          store.dialog === null &&
          store.selectionMode === 'none' &&
          focusIsInCanvas()
        ) {
          const tb = document.querySelector('[data-focus-target="workflow-title"]') as HTMLElement | null;
          tb?.focus();
          e.preventDefault();
          return;
        }
      }

      // F6 / Shift+F6 cycle landmarks — works everywhere.
      if (e.key === 'F6') {
        e.preventDefault();
        cycleLandmark(!e.shiftKey);
        return;
      }

      // Alt+1..4 — works everywhere (spec §3.B secondary tabs). Order matches the
      // tab row: 1=Workflow, 2=Settings, 3=Runs, 4=Environment.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          store.setActiveScreen('workflow');
          e.preventDefault();
          return;
        }
        if (e.key === '2') {
          store.setActiveScreen('settings');
          e.preventDefault();
          return;
        }
        if (e.key === '3') {
          store.setActiveScreen('runs');
          e.preventDefault();
          return;
        }
        if (e.key === '4') {
          store.setActiveScreen('environment');
          e.preventDefault();
          return;
        }
      }

      // The remaining shortcuts use Cmd/Ctrl — ignore when typing in a field
      // so editor shortcuts (Ctrl+B bold, etc.) aren't hijacked.
      if (isTypingTarget(e.target)) return;

      // Ctrl/Cmd+? → Keyboard Help. Browsers vary; accept '?' or '/'.
      if (cmd(e) && (e.key === '?' || e.key === '/')) {
        e.preventDefault();
        store.setDialog(store.dialog === 'keyboard-help' ? null : 'keyboard-help');
        return;
      }

      if (!cmd(e)) {
        // Non-cmd keys below only fire when focus is in the canvas (§7.4 canvas
        // keyboard contract). `c` is also a useKeyboardConnect entry cue.
        if (!focusIsInCanvas()) return;

        // `c` — connect from a focused output port (spec §15, §10.5).
        // useKeyboardConnect handles the actual flow; this just prevents the
        // default so it doesn't bubble when on a handle. We do NOT swallow it
        // globally — let useKeyboardConnect decide.
        if (e.key === 'c') {
          // If focus is on a Handle, useKeyboardConnect handles it (capture
          // listener). Nothing to do here.
          return;
        }

        // Arrow keys — nudge selected node by 1px (Shift=10px) (spec §7.4).
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const { selectedNodeId, multiSelectIds, nodes } = store;
          const ids = multiSelectIds.length > 0 ? multiSelectIds : (selectedNodeId ? [selectedNodeId] : []);
          if (ids.length === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          store.setNodes(
            nodes.map((n) =>
              ids.includes(n.id)
                ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
                : n,
            ),
          );
          store.markDirty();
          return;
        }

        // Delete / Backspace — remove selected nodes/edges (spec §7.4). No
        // `confirm()` (forbidden) — deletion is immediate + reversible via reload
        // if unsaved. Announce the result.
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const { selectedNodeId, selectedEdgeId, multiSelectIds, nodes, edges } = store;
          const selectedNodeIds = multiSelectIds.length > 0 ? multiSelectIds : (selectedNodeId ? [selectedNodeId] : []);
          const hasSelection = selectedNodeIds.length > 0 || selectedEdgeId !== null;
          if (!hasSelection) return;
          e.preventDefault();
          const remainingNodes = nodes.filter((n) => !selectedNodeIds.includes(n.id));
          const removedNodeIds = new Set(selectedNodeIds);
          // Drop edges touching removed nodes + the selected edge.
          const remainingEdges = edges.filter((edge) => {
            if (selectedEdgeId && edge.id === selectedEdgeId) return false;
            if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) return false;
            return true;
          });
          store.setNodes(remainingNodes);
          store.setEdges(remainingEdges);
          store.clearSelection();
          store.markDirty();
          const nCount = selectedNodeIds.length;
          const eCount = selectedEdgeId ? 1 : 0;
          controller.announce(
            `Deleted ${nCount > 0 ? `${nCount} node${nCount > 1 ? 's' : ''}` : ''}${nCount > 0 && eCount > 0 ? ' and ' : ''}${eCount > 0 ? '1 edge' : ''}`,
          );
          return;
        }

        return;
      }

      // --- Cmd/Ctrl combos below ---

      // Phase 5: unified right-column panel (spec §15). Both Ctrl/Cmd+B
      // (Build) and Ctrl/Cmd+I (Inspector) toggle the same single right panel —
      // its content is Build (no selection) or Inspector (selection), so one
      // toggle collapses/expands the whole column regardless of content.
      if (!e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        store.toggleRightPanel();
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        store.toggleRightPanel();
        return;
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        store.toggleDock();
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void controller.save();
        return;
      }
      // Phase 6: client-side Undo/Redo graph-history (app-wide, spec §7.4).
      // Ctrl/Cmd+Z = undo; Ctrl/Cmd+Shift+Z OR Ctrl/Cmd+Y = redo. Only undo/
      // redo graph mutations — text editing in inputs is NOT captured (guarded
      // above by isTypingTarget, which returns early before this branch).
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (store.runStatus === 'running') {
          void controller.stop();
        } else if (store.runStatus === 'idle' || store.runStatus === 'succeeded' || store.runStatus === 'cancelled' || store.runStatus === 'failed') {
          void controller.run();
        }
        return;
      }

      // --- Canvas-specific Cmd/Ctrl combos (§7.4) — only when in canvas ---
      if (!focusIsInCanvas()) return;

      // Ctrl/Cmd+A — select all nodes (spec §7.4). Don't hijack text-select
      // in inputs (guarded above by isTypingTarget).
      if (e.key === 'a' || e.key === 'A') {
        if (store.nodes.length === 0) return;
        e.preventDefault();
        store.setMultiSelect(store.nodes.map((n) => n.id));
        controller.announce(`Selected ${store.nodes.length} nodes`);
        return;
      }

      // Ctrl/Cmd+D — duplicate selected node(s) (spec §7.4). Prevent the
      // browser bookmark default. Delegates to the shared `duplicateNodes`
      // store action so the keyboard shortcut and the floating-node toolbar
      // can never produce divergent duplicates (composition-patterns: single
      // owner of the clone logic).
      if (e.key === 'd' || e.key === 'D') {
        const { selectedNodeId, multiSelectIds } = store;
        const ids = multiSelectIds.length > 0 ? multiSelectIds : (selectedNodeId ? [selectedNodeId] : []);
        if (ids.length === 0) return;
        e.preventDefault();
        const cloneIds = store.duplicateNodes(ids);
        if (cloneIds.length > 0) {
          controller.announce(`Duplicated ${cloneIds.length} node${cloneIds.length > 1 ? 's' : ''}`);
        }
        return;
      }

      // Ctrl/Cmd+C — copy selected node(s) to the transient clipboard (spec §54).
      // Pairs with Ctrl/Cmd+V paste below. Mirrors the context-menu Copy item
      // (spec §53) — one clipboard, one behavior.
      if (e.key === 'c' || e.key === 'C') {
        const { selectedNodeId, multiSelectIds } = store;
        const ids = multiSelectIds.length > 0 ? multiSelectIds : (selectedNodeId ? [selectedNodeId] : []);
        if (ids.length === 0) return;
        e.preventDefault();
        store.copyNodes(ids);
        return;
      }

      // Ctrl/Cmd+V — paste from the clipboard (spec §54). Place near the
      // current selection's top-left (or a fixed canvas origin when nothing is
      // selected). The context-menu Paste places exactly at the cursor via
      // screenToFlowPosition; the keyboard path has no cursor, so it uses a
      // deterministic anchor near the selection. Reuses addNode via the store
      // action (§27 single path).
      if (e.key === 'v' || e.key === 'V') {
        if (store.clipboard.length === 0) return;
        e.preventDefault();
        // Anchor: the top-left-most selected node, else a fixed offset. Keeps
        // the pasted group near where the user is looking.
        let anchor = { x: 100, y: 100 };
        if (store.selectedNodeId) {
          const src = store.nodes.find((n) => n.id === store.selectedNodeId);
          if (src) anchor = { x: src.position.x + 40, y: src.position.y + 40 };
        } else if (store.multiSelectIds.length > 0) {
          const sel = store.nodes.filter((n) => store.multiSelectIds.includes(n.id));
          if (sel.length > 0) {
            anchor = {
              x: Math.min(...sel.map((n) => n.position.x)) + 40,
              y: Math.min(...sel.map((n) => n.position.y)) + 40,
            };
          }
        }
        store.pasteNodes(anchor);
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);
}