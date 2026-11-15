import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Keyboard key cap for shortcut hints, in the mono metadata style on a
 * hairline-bordered sidebar tone.
 *
 * @example
 * ```tsx
 * <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
 * ```
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-app-border bg-app-sidebar px-1 font-mono text-[10px] font-medium text-app-dim select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

/** Inline row of {@link Kbd}s for a chord. */
function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
