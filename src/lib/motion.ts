import type { Transition } from "motion/react";

/**
 * Motion presets for `motion/react`, mirroring the CSS motion tokens in
 * `src/styles/compacto/tokens.css` (`--motion-duration-*`, `--motion-ease-*`)
 * so JS-driven and CSS-driven animations share one timing language.
 *
 * Enter = standard ease; exit = accelerate ease and ~30% shorter.
 */
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;
export const EASE_ACCELERATE = [0.4, 0, 1, 1] as const;

export const DURATION = {
  instant: 0.08,
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

/** Things appearing: rows, tabs, panes. */
export const enter: Transition = {
  duration: DURATION.base,
  ease: EASE_STANDARD,
};

/** Things leaving: shorter and accelerating, so removal never feels laggy. */
export const exit: Transition = {
  duration: DURATION.fast,
  ease: EASE_ACCELERATE,
};

/** Small state swaps (labels, icons). */
export const quick: Transition = {
  duration: DURATION.fast,
  ease: EASE_STANDARD,
};

/** Shared-element moves (sliding indicators, reflowing lists). */
export const glide: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.8,
};
