import * as React from "react";

/** Tailwind's default breakpoints, plus the input-type queries, as media queries. */
export const BREAKPOINT = {
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  /** Primary input is a finger (phones, tablets — iPad even with a trackpad). */
  coarse: "(pointer: coarse)",
  /**
   * Too narrow for a docked sidebar beside the editor (tablet portrait,
   * split-view). The shell turns the explorer into a drawer here.
   */
  compact: "(max-width: 1023.98px)",
} as const;

/** Live `matchMedia` result; re-renders when the query starts/stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when the primary pointer is a finger. */
export function useCoarsePointer(): boolean {
  return useMediaQuery(BREAKPOINT.coarse);
}

/** Non-hook check for event handlers and one-off setup. */
export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(BREAKPOINT.coarse).matches
  );
}
