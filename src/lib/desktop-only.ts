import { useMediaQuery } from "@/lib/use-media-query";

/**
 * Bento is desktop-only. A device is NOT a desktop when its primary pointer
 * is a finger or can't hover (phones, tablets — iPadOS too, despite its Mac
 * user agent), or when the viewport is narrower than Tailwind's `lg`
 * breakpoint (tablet-sized windows, DevTools responsive mode).
 */
export const NOT_DESKTOP_QUERY =
  "(pointer: coarse), (pointer: none), (hover: none), (max-width: 1023.98px)";

/** One-off check for boot code. */
export function isDesktopDevice(): boolean {
  return !window.matchMedia(NOT_DESKTOP_QUERY).matches;
}

/** Live check; re-renders when the window is resized or the device emulation changes. */
export function useIsDesktop(): boolean {
  return !useMediaQuery(NOT_DESKTOP_QUERY);
}
