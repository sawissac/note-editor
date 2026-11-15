"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md border border-transparent font-title text-[11px] font-semibold whitespace-nowrap text-app-dim transition-colors duration-200 outline-none hover:bg-app-hover hover:text-app-bright focus-visible:border-app-accent focus-visible:ring-2 focus-visible:ring-app-accent/30 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-app-selected data-[state=on]:text-app-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border-app-border-mid bg-app-bg data-[state=on]:border-app-border-accent",
      },
      size: {
        default: "h-8 min-w-8 px-2",
        sm: "h-7 min-w-7 px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * Two-state button (bold, italic, a view mode). Pressed reads as the
 * `selected` wash with accent text — selection by colour, never by size.
 *
 * @param props.variant - `"default"` ghost or `"outline"` field-like.
 * @param props.size - `"sm"` 28px, `"default"` 32px, `"lg"` 36px.
 * @param props.pressed - Controlled state; pair with `onPressedChange`.
 */
function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      data-variant={variant}
      data-size={size}
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
