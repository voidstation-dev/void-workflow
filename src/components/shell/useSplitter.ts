import { useCallback, useRef, type KeyboardEvent } from 'react';

/**
 * useSplitter — shared horizontal/vertical resize + keyboard behavior for the
 * zone splitters (Node Library right-edge, Inspector left-edge, Dock top-edge).
 * spec §3 line 128: Arrow keys adjust 8px, Shift+Arrow maximize/restore,
 * Enter toggles collapse. Drag uses pointer events with a live value callback.
 *
 * @param orientation 'vertical' (width, ArrowLeft/Right) | 'horizontal' (height, ArrowUp/Down)
 * @param min/max      clamped range
 * @param getValue     reads the current size from the store
 * @param setValue     writes the new size to the store
 * @param toggleCollapse toggles the zone's collapsed flag
 * @param maximizeValue the value to use on Shift+Arrow "maximize" (max width)
 */
export function useSplitter(opts: {
  orientation: 'vertical' | 'horizontal';
  min: number;
  max: number;
  getValue: () => number;
  setValue: (v: number) => void;
  toggleCollapse: () => void;
  maximizeValue?: number;
}) {
  const { orientation, min, max, getValue, setValue, toggleCollapse, maximizeValue } = opts;
  const draggingRef = useRef(false);
  const lastAxisRef = useRef(0);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      lastAxisRef.current = orientation === 'vertical' ? e.clientX : e.clientY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [orientation],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const axis = orientation === 'vertical' ? e.clientX : e.clientY;
      const delta = axis - lastAxisRef.current;
      lastAxisRef.current = axis;
      // For a right-edge splitter (Library), dragging left shrinks width →
      // callers pass a getValue/setValue already oriented so +delta grows.
      // For a left-edge splitter (Inspector), dragging right grows width, so
      // we flip the sign here via orientation? No — keep it generic: callers
      // decide direction by passing a setValue that already accounts for edge.
      // To stay generic, we just apply +delta and let the caller's clamp bound it.
      setValue(clamp(getValue() + delta));
    },
    [orientation, getValue, setValue],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isVertical = orientation === 'vertical';
      const growKey = isVertical ? 'ArrowRight' : 'ArrowDown';
      const shrinkKey = isVertical ? 'ArrowLeft' : 'ArrowUp';
      if (e.key === growKey) {
        e.preventDefault();
        if (e.shiftKey && maximizeValue !== undefined) {
          setValue(maximizeValue);
        } else {
          setValue(clamp(getValue() + 8));
        }
      } else if (e.key === shrinkKey) {
        e.preventDefault();
        if (e.shiftKey) {
          setValue(min);
        } else {
          setValue(clamp(getValue() - 8));
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCollapse();
      }
    },
    [orientation, min, max, maximizeValue, getValue, setValue, toggleCollapse],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onKeyDown };
}

/** Builds the ARIA separator attributes for a splitter. */
export function splitterAria(opts: {
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  controlsId: string;
}) {
  return {
    role: 'separator' as const,
    'aria-orientation': opts.orientation,
    'aria-valuenow': Math.round(opts.value),
    'aria-valuemin': opts.min,
    'aria-valuemax': opts.max,
    'aria-controls': opts.controlsId,
    tabIndex: 0 as const,
  };
}