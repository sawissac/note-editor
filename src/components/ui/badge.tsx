import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 font-title text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-app-accent/30 focus-visible:outline-none [&>svg]:pointer-events-none [&>svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "text-app-accent tint-current",
        secondary: "border-app-border bg-app-sidebar text-app-text",
        destructive: "text-app-error tint-current",
        outline: "border-app-border-mid text-app-dim",
        ghost: "text-app-dim hover:bg-app-hover hover:text-app-bright",
        link: "text-app-accent underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * Small inline tag for a status, count or category.
 *
 * Flat by design: `default` and `destructive` are `tint-current` washes of
 * the accent / error hue, never a solid block, so a list of rows with tags
 * still reads as content rather than a wall of buttons.
 *
 * @param props.variant - `"default"` accent tint, `"secondary"` sidebar
 *   surface, `"destructive"` error tint, `"outline"` hairline only,
 *   `"ghost"` and `"link"` for tags that act as controls.
 * @param props.asChild - Render the child element (e.g. an `<a>`) instead of
 *   a `<span>`.
 * @param props.className - Extra classes merged last.
 *
 * @example
 * ```tsx
 * <Badge variant="outline">Draft</Badge>
 * ```
 */
function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
