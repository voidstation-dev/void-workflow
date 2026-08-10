import { useCallback, useEffect, useState } from 'react';

/**
 * useLocalStorage — minimal generic persistence to localStorage.
 *
 * Phase 4 use: the Node Library's per-category collapse state (spec §6) is
 * "LOCAL, persisted to localStorage separately — NOT in uiSlice". This hook
 * keeps it out of the zustand `persist` partialize set (which is LAYOUT ONLY).
 *
 * Tauri desktop app — no SSR guard needed. Object `initial` values are merged
 * with the parsed value on load so future additions to a saved shape (e.g. a
 * new NodeCategory) don't break older saves. Read/write failures fall back to
 * `initial` / silently ignore, so quota or corruption never crashes the UI.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as Partial<T>;
      // Merge object initial values so new keys default in gracefully.
      if (
        typeof initial === 'object' &&
        initial !== null &&
        !Array.isArray(initial) &&
        typeof parsed === 'object' &&
        parsed !== null
      ) {
        return { ...(initial as object), ...(parsed as object) } as T;
      }
      return (parsed as T) ?? initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // quota exceeded / private mode / corruption — ignore; in-memory state wins
    }
  }, [key, state]);

  const set = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) =>
      typeof value === 'function' ? (value as (p: T) => T)(prev) : value,
    );
  }, []);

  return [state, set];
}