import * as React from "react";

/** Tailwind's default breakpoints, as media queries. */
export const BREAKPOINT = {
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
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
