"use client";

import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Scroll container with a thin themed scrollbar that overlays the content.
 *
 * The scrolling element is the inner viewport, marked
 * `data-slot="scroll-area-viewport"` — query that when you need its
 * `scrollTop` or want to attach an observer. A vertical {@link ScrollBar} is
 * always mounted; add `<ScrollBar orientation="horizontal" />` as a child for
 * sideways scrolling.
 *
 * @param props.className - Extra classes on the root; give it a bounded
 *   height or it grows with its content and never scrolls.
 */
function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-app-accent/30"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  );
}

/**
 * One scrollbar track. Mounted automatically for the vertical axis by
 * {@link ScrollArea}.
 *
 * @param props.orientation - `"vertical"` (default) or `"horizontal"`.
 */
function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors duration-200 select-none",
        "data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:flex-col",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-app-border-mid hover:bg-app-dim"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
