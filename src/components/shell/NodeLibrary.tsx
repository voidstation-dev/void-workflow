import { useMemo, type KeyboardEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NODE_DEFINITIONS, type NodeCategory, type NodeDefinition } from '@/nodes/registry';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSplitter, splitterAria } from './useSplitter';
import { NodeLibraryItem } from './NodeLibraryItem';
import { cn } from '@/lib/utils';

/**
 * NodeLibrary (Build Panel) — right-side workspace element (spec §9). Reads from
 * the single source of truth registry and renders a searchable, single-level
 * category-grouped list. Width 280–320px, white panel, `border-l`, independently
 * scrollable, no overlap over the canvas.
 *
 * The category order adds RULES (spec §8) — empty until an MVP2 Condition node
 * exists; the `grouped[cat].length > 0` filter keeps it hidden when empty so no
 * empty section renders.
 *
 * Search is sourced from `uiSlice.buildQuery` so the header search box (spec §3.A)
 * and this panel's local search box stay in sync (one source of truth). Both
 * inputs write the same store field. Clear-on-Esc + live aria-live count.
 *
 * Phase 4 delivered the full §6 keyboard-add end-to-end; that contract is
 * preserved here unchanged: Enter/Space → setAddModeNodeType + announce + focus
 * canvas → WorkflowCanvas places via the shared addNode path → Escape cancels.
 *
 * Drag contract (§27) preserved: dataTransfer keys application/reactflow +
 * application/reactflow-label; aria-grabbed false→true during drag. Handled
 * inside NodeLibraryItem. Source-agnostic — moving the panel left→right does
 * not affect the drop side (the canvas).
 *
 * NOTE: the component keeps the name `NodeLibrary`/file `NodeLibrary.tsx` to
 * preserve imports (spec §40 "don't force the suggested structure if a good
 * equivalent exists"); it IS the Build panel. Phase 5 completes the
 * Build↔Inspector single-column swap.
 */

const LIBRARY_ID = 'node-library-body';
// If real NODE_DEFINITIONS exceeds ~40, install @tanstack/react-virtual and wrap
// each per-category <ul> in a virtualizer (overscan 4). The row anatomy is stable
// for it. Until then flat render is cheaper. Phase 4+ detail.

// Spec §8 category order (adds RULES between AI and MEDIA).
const CATEGORY_ORDER: NodeCategory[] = ['INPUT', 'TEXT', 'AI', 'RULES', 'MEDIA', 'UTILITY', 'OUTPUT'];
const DEFAULT_COLLAPSE: Record<NodeCategory, boolean> = {
  INPUT: false, // expanded by default (spec §9 example)
  TEXT: false,
  AI: false,
  RULES: true, // empty for now — collapsed by default
  MEDIA: false,
  UTILITY: true, // collapsed by default (spec §9 groups RULES/UTILITY)
  OUTPUT: false, // expanded by default (spec §9 example)
};
const CAT_STORAGE_KEY = 'void-workflow:library-category-collapse';

export function NodeLibrary() {
  // Phase 5: unified right-column panel (spec §15). The Build panel shares one
  // width + one collapsed flag with the Inspector (set in WorkspaceShell). The
  // shell gates collapsed-render, so `collapsed` here is always false when
  // mounted; the splitter/toggle write the shared store fields.
  const collapsed = useWorkflowStore((s) => s.rightPanelCollapsed);
  const width = useWorkflowStore((s) => s.rightPanelWidth);
  const setWidth = useWorkflowStore((s) => s.setRightPanelWidth);
  const toggle = useWorkflowStore((s) => s.toggleRightPanel);
  const announce = useWorkflowStore((s) => s.setAnnouncement);
  const setAddModeNodeType = useWorkflowStore((s) => s.setAddModeNodeType);
  // Single source of truth for search — shared with the header search box.
  const query = useWorkflowStore((s) => s.buildQuery);
  const setQuery = useWorkflowStore((s) => s.setBuildQuery);

  const [collapseMap, setCollapseMap] = useLocalStorage<Record<NodeCategory, boolean>>(
    CAT_STORAGE_KEY,
    DEFAULT_COLLAPSE,
  );

  const splitter = useSplitter({
    orientation: 'vertical',
    min: 280,
    max: 360,
    getValue: () => width,
    setValue: setWidth,
    toggleCollapse: toggle,
    maximizeValue: 360,
  });

  if (collapsed) {
    return <div className="w-0" aria-hidden="true" />;
  }

  // --- Derived data ----------------------------------------------------------
  const allItems = useMemo<NodeDefinition[]>(() => NODE_DEFINITIONS, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query, allItems]);

  const grouped = useMemo(() => {
    const g: Record<NodeCategory, NodeDefinition[]> = {
      INPUT: [], TEXT: [], AI: [], RULES: [], MEDIA: [], UTILITY: [], OUTPUT: [],
    };
    for (const d of filtered) g[d.category].push(d);
    return g;
  }, [filtered]);

  const matchCount = filtered.length;

  // --- Keyboard: roving tabindex within a category + add-mode entry ----------
  const onItemKeyDown = (e: KeyboardEvent<HTMLDivElement>, def: NodeDefinition, cat: NodeCategory) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Enter add-mode: write the node type + the id to return focus to, announce,
      // and focus the canvas. WorkflowCanvas consumes addModeNodeType on pane
      // click / Enter-at-center; the global Esc handler cancels + restores focus.
      setAddModeNodeType(def.type, `library-item-${def.type}`);
      announce({
        id: uuidv4(),
        text: `Selected ${def.label}. Click on canvas to place, Escape to cancel.`,
      });
      (document.querySelector('main[role="application"]') as HTMLElement | null)?.focus();
      return;
    }

    const list = grouped[cat];
    if (!list.length) return;

    // DOM-focus-based roving tabindex: derive the current index from the
    // focused element rather than tracking a cursor in state. ArrowDown/Up
    // move relative to the focused item; Home/End jump to the ends.
    const currentIndex = list.findIndex(
      (d) => document.activeElement?.id === `library-item-${d.type}`,
    );
    const base = currentIndex === -1 ? 0 : currentIndex;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(base + 1, list.length - 1);
      document.getElementById(`library-item-${list[next].type}`)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(base - 1, 0);
      document.getElementById(`library-item-${list[next].type}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      document.getElementById(`library-item-${list[0].type}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      document.getElementById(`library-item-${list[list.length - 1].type}`)?.focus();
    }
  };

  return (
    <aside
      aria-label="Node library"
      className="relative flex h-full min-h-0 flex-col bg-surface-sidebar border-l border-border-subtle"
      style={{ width }}
    >
      <div className="flex h-auto shrink-0 flex-col gap-0.5 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-text-primary">Build</h2>
          <button
            type="button"
            aria-label="Collapse build panel"
            title="Collapse (Ctrl/Cmd+B)"
            onClick={toggle}
            className="rounded-control p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[11px] text-text-muted">Drag block into workflow</p>
      </div>

      <div id={LIBRARY_ID} className="min-h-0 flex-1 overflow-y-auto pb-2">
        {/* Search input — sourced from buildQuery (shared with header search) */}
        <div className="relative shrink-0 px-2 pb-2">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                // stopPropagation halts the native bubble so the window-level Esc
                // handler in useWorkspaceShortcuts never fires while mid-search
                // (it would otherwise also clear the canvas selection).
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Search nodes…"
            aria-label="Search nodes"
            className="h-8 w-full rounded-control border border-border-subtle bg-surface-panel pl-8 pr-8 text-[12px] text-text-primary placeholder:text-text-muted focus:border-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-control p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Live result count (sr-only, aria-live polite) */}
        <div aria-live="polite" className="sr-only">
          {matchCount === 0 ? 'No results' : `${matchCount} ${matchCount === 1 ? 'result' : 'results'}`}
        </div>

        {query && matchCount === 0 ? (
          <EmptySearchState query={query} onClear={() => setQuery('')} />
        ) : (
          CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => {
            const isCollapsed = !!collapseMap[cat];
            // During an active search, force-expand every category that has
            // matches. collapseMap itself is NOT mutated by searching.
            const effectivelyCollapsed = !query && isCollapsed;
            return (
              <section key={cat}>
                <button
                  type="button"
                  aria-expanded={!effectivelyCollapsed}
                  aria-controls={`cat-${cat}`}
                  onClick={() => setCollapseMap((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                  className="flex w-full items-center gap-1 px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:bg-surface-hover"
                >
                  {effectivelyCollapsed ? (
                    <ChevronRight size={12} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={12} aria-hidden="true" />
                  )}
                  {cat}
                  <span className="ml-auto text-text-muted">{grouped[cat].length}</span>
                </button>
                <ul
                  id={`cat-${cat}`}
                  role="list"
                  inert={effectivelyCollapsed || undefined}
                  className={cn('flex flex-col gap-1 px-2 py-1', effectivelyCollapsed && 'hidden')}
                >
                  {grouped[cat].map((def) => (
                    <NodeLibraryItem
                      key={def.type}
                      def={def}
                      onKeyDown={(e) => onItemKeyDown(e, def, cat)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {/* Left-edge resize splitter (panel is on the right) */}
      <div
        {...splitterAria({ orientation: 'vertical', value: width, min: 280, max: 360, controlsId: LIBRARY_ID })}
        onPointerDown={splitter.onPointerDown}
        onPointerMove={splitter.onPointerMove}
        onPointerUp={splitter.onPointerUp}
        onKeyDown={splitter.onKeyDown}
        className="absolute left-0 top-0 z-[var(--z-panel)] h-full w-1 cursor-ew-resize bg-transparent hover:bg-border-focus"
        style={{ marginLeft: -2 }}
      />
    </aside>
  );
}

function EmptySearchState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div role="status" aria-live="polite" className="px-3 py-4 text-center">
      <p className="text-[12px] text-text-muted">No nodes match &ldquo;{query}&rdquo;</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 rounded-control border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
      >
        Clear search
      </button>
    </div>
  );
}