import { useEffect, useRef, useState } from 'react';

/**
 * useInlineConfirm — spec §8.2 / §10 inline-confirm. A 3s arming window for
 * destructive actions (Delete Node / Delete connection / bulk Delete / Clear
 * Console). NOT a modal, NOT `confirm()` (forbidden). The caller renders a
 * visually-hidden `<span aria-live="assertive">{liveText}</span>` so AT
 * announces "Press again to confirm deletion" when armed — that live region MUST
 * be present in the DOM before arming (render it always; liveText is '' when
 * idle).
 *
 * Returns `{ armed, arm, liveText }`. Caller flow:
 *   onClick: armed ? performDelete() : arm();
 *   label:   armed ? 'Confirm delete' : 'Delete <name>';
 *
 * `arm(customLiveText?)` lets a non-deletion action (e.g. Clear Console)
 * announce a contextually correct message ("Press again to confirm clearing.")
 * instead of the default "deletion" wording. The button label swap is the
 * caller's responsibility (it already reads `armed`).
 *
 * The 3s timeout is cleared on unmount (and reset on each arm) so a stale
 * "Confirm delete" label cannot persist across a mode switch or node deletion.
 */
export function useInlineConfirm() {
  const [armed, setArmed] = useState(false);
  const [liveText, setLiveText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = (customLiveText?: string) => {
    setArmed(true);
    setLiveText(customLiveText ?? 'Press again to confirm deletion.');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setArmed(false);
      setLiveText('');
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { armed, arm, liveText };
}