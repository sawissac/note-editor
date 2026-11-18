import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () =>
  import("@/lib/motion-features").then((mod) => mod.default);

/**
 * App-wide motion setup.
 *
 * - `LazyMotion` + `m.*` keeps the entry bundle small: only the thin `m`
 *   renderer ships up front, the animation/layout features load lazily.
 *   `strict` makes a stray full-size `motion.*` import throw in dev.
 * - `reducedMotion="user"` honours the OS "reduce motion" setting: transform
 *   and layout animations are skipped, opacity fades remain — the same
 *   policy as the CSS rule in `src/styles/compacto/tokens.css`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
