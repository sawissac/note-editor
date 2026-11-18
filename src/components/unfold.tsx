import { m, type HTMLMotionProps } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * A `motion` div for things that grow or shrink in (rows, tabs, bars): it
 * clips its content only while an animation is running, so text never spills
 * out of a half-open box, yet the settled element can overflow normally
 * (focus rings, drop lines, sliding indicators).
 *
 * Takes every `m.div` prop; callers own `initial` / `animate` / `exit`.
 * Leave `overflow` out of those targets — this component handles it.
 *
 * Styles: BEM block `unfold` (`src/styles/unfold.css`).
 *
 * @example
 * ```tsx
 * <Unfold initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}>
 *   <Row />
 * </Unfold>
 * ```
 */
export function Unfold({
  className,
  onAnimationStart,
  onAnimationComplete,
  ...props
}: HTMLMotionProps<"div">) {
  const [clipped, setClipped] = React.useState(false);
  return (
    <m.div
      {...props}
      className={cn("unfold", clipped && "unfold--clipped", className)}
      onAnimationStart={(definition) => {
        setClipped(true);
        onAnimationStart?.(definition);
      }}
      onAnimationComplete={(definition) => {
        setClipped(false);
        onAnimationComplete?.(definition);
      }}
    />
  );
}
