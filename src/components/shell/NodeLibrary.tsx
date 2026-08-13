import { useMemo, useState, type KeyboardEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { NODE_DEFINITIONS, type NodeCategory, type NodeDefinition } from '@/nodes/registry';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSplitter, splitterAria } from './useSplitter';
import { NodeLibraryItem } from './NodeLibraryItem';
import { cn } from '@/lib/utils';

/**
 * NodeLibrary — Zone B (spec §6). Reads from the single source of truth registry
 * and renders a searchable, single-level category-grouped list.
 *
 * Phase 4 delivers the full §6 spec:
 *   - Search input (32px, surface.panel, border.subtle). LOCAL component state
 *     (NOT uiSlice). Matches name/category/description/keywords. Clear button
 *     (aria-label="Clear search") + live aria-live count. Clears on Esc.
 *   - Six flat categories (INPUT/TEXT/AI/MEDIA/UTILITY/OUTPUT). Collapse state is
 *     LOCAL, persisted to localStorage SEPARATELY (NOT uiSlice). Default expanded
 *     INPUT/AI/OUTPUT, collapsed UTILITY. Collapsed groups get `inert`.
 *   - §11.10 NodeLibraryItem primitive (28px row, grip-dots on hover, visually-
 *     hidden "drag or press Enter to add" hint, focus ring offset 1px).
 *   - Empty-search state ('No nodes match "<query>"' + Clear search button).
 *   - Keyboard-add END-TO-END (closes the Phase 3 stub): Enter/Space on an item
 *     → setAddModeNodeType + announce + focus canvas → WorkflowCanvas places on
 *     pane click / Enter-at-center via the shared addNode path → Escape cancels
 *     (global handler in useWorkspaceShortcuts) + returns focus to the item.
 *
 * Drag contract (§27) preserved: dataTransfer keys application/reactflow +
 * application/reactflow-label; aria-grabbed false→true during drag. Handled
 * inside NodeLibraryItem.
 */

const LIBRARY_ID = 'node-library-body';
// If real NODE_DEFINITIONS exceeds ~40, install @tanstack/react-virtual and wrap
// each per-category <ul> in a virtualizer (overscan 4). The 28px row anatomy is
// already stable for it. Until then the flat render is cheaper than the
// virtualizer overhead. Phase 4+ detail.

const CATEGORY_ORDER: NodeCategory[] = ['INPUT', 'TEXT', 'AI', 'MEDIA', 'UTILITY', 'OUTPUT'];
const DEFAULT_COLLAPSE: Record<NodeCategory, boolean> = {
  INPUT: false, // expanded by default (spec §6)
  TEXT: false,
  AI: false, // expanded by default (spec §6)
  MEDIA: false,
  UTILITY: true, // collapsed by default (spec §6)
  OUTPUT: false, // expanded by default (spec §6)
};
const CAT_STORAGE_KEY = 'void-workflow:library-category-collapse';
const ZERO_CURSOR: Record<NodeCategory, number> = {
  INPUT: 0, TEXT: 0, AI: 0, MEDIA: 0, UTILITY: 0, OUTPUT: 0,
};

export function NodeLibrary() {
  const collapsed = useWorkflowStore((s) => s.libraryCollapsed);
  const width = useWorkflowStore((s) => s.libraryWidth);
  const setWidth = useWorkflowStore((s) => s.setLibraryWidth);
  const toggle = useWorkflowStore((s) => s.toggleLibrary);
  const announce = useWorkflowStore((s) => s.setAnnouncement);
  const setAddModeNodeType = useWorkflowStore((s) => s.setAddModeNodeType);

  const [query, setQuery] = useState('');
  const [collapseMap, setCollapseMap] = useLocalStorage<Record<NodeCategory, boolean>>(
    CAT_STORAGE_KEY,
    DEFAULT_COLLAPSE,
  );
  const [cursor, setCursor] = useState<Record<NodeCategory, number>>({ ...ZERO_CURSOR });

  const splitter = useSplitter({
    orientation: 'vertical',
    min: 200,
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
      INPUT: [], TEXT: [], AI: [], MEDIA: [], UTILITY: [], OUTPUT: [],
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

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((prev) => {
        const next = Math.min(prev[cat] + 1, list.length - 1);
        document.getElementById(`library-item-${list[next].type}`)?.focus();
        return { ...prev, [cat]: next };
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((prev) => {
        const next = Math.max(prev[cat] - 1, 0);
        document.getElementById(`library-item-${list[next].type}`)?.focus();
        return { ...prev, [cat]: next };
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor((prev) => {
        document.getElementById(`library-item-${list[0].type}`)?.focus();
        return { ...prev, [cat]: 0 };
      });
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor((prev) => {
        document.getElementById(`library-item-${list[list.length - 1].type}`)?.focus();
        return { ...prev, [cat]: list.length - 1 };
      });
    }
  };

  return (
    <aside
      aria-label="Node library"
      className="relative flex h-full min-h-0 flex-col bg-surface-sidebar border-r border-border-subtle"
      style={{ width }}
    >
      <div className="flex h-8 shrink-0 items-center justify-between px-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">Nodes</h2>
        <button
          type="button"
          aria-label="Collapse node library"
          title="Collapse (Ctrl/Cmd+B)"
          onClick={toggle}
          className="rounded-control p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>

      <div id={LIBRARY_ID} className="min-h-0 flex-1 overflow-y-auto pb-2">
        {/* Search input (32px, surface.panel, border.subtle, 4px radius) */}
        <div className="relative shrink-0 px-1 pb-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor({ ...ZERO_CURSOR });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                // stopPropagation halts the native bubble so the window-level Esc
                // handler in useWorkspaceShortcuts never fires while mid-search
                // (it would otherwise also clear the canvas selection).
                e.stopPropagation();
                setQuery('');
                setCursor({ ...ZERO_CURSOR });
              }
            }}
            placeholder="Search nodes…"
            aria-label="Search nodes"
            className="h-8 w-full rounded-[4px] border border-border-subtle bg-surface-panel pl-7 pr-7 text-[12px] text-text-primary placeholder:text-[11px] placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setCursor({ ...ZERO_CURSOR });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-control p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
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
          <EmptySearchState
            query={query}
            onClear={() => {
              setQuery('');
              setCursor({ ...ZERO_CURSOR });
            }}
          />
        ) : (
          CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => {
            const isCollapsed = !!collapseMap[cat];
            // During an active search, force-expand every category that has
            // matches — the user is looking for results, not managing collapse.
            // collapseMap itself is NOT mutated by searching.
            const effectivelyCollapsed = !query && isCollapsed;
            return (
              <section key={cat}>
                <button
                  type="button"
                  aria-expanded={!effectivelyCollapsed}
                  aria-controls={`cat-${cat}`}
                  onClick={() => setCollapseMap((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                  className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted hover:bg-surface-hover"
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
                  className={cn('flex flex-col gap-0.5 py-1', effectivelyCollapsed && 'hidden')}
                >
                  {grouped[cat].map((def, i) => (
                    <NodeLibraryItem
                      key={def.type}
                      def={def}
                      tabIndex={cursor[cat] === i ? 0 : -1}
                      onActivate={() => setCursor((prev) => ({ ...prev, [cat]: i }))}
                      onKeyDown={(e) => onItemKeyDown(e, def, cat)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {/* Right-edge resize splitter */}
      <div
        {...splitterAria({ orientation: 'vertical', value: width, min: 200, max: 360, controlsId: LIBRARY_ID })}
        onPointerDown={splitter.onPointerDown}
        onPointerMove={splitter.onPointerMove}
        onPointerUp={splitter.onPointerUp}
        onKeyDown={splitter.onKeyDown}
        className="absolute right-0 top-12 z-[var(--z-panel)] h-[calc(100%-3rem)] w-1 cursor-ew-resize bg-transparent hover:bg-border-focus"
        style={{ marginRight: -2 }}
      />
    </aside>
  );
}

function EmptySearchState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div role="status" aria-live="polite" className="px-2 py-4 text-center">
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