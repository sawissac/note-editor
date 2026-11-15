"use client";

import { type VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";

type ToggleGroupStyle = VariantProps<typeof toggleVariants> & {
  spacing?: number;
};

const ToggleGroupContext = React.createContext<ToggleGroupStyle>({
  size: "default",
  variant: "default",
  spacing: 1,
});

/**
 * A row of {@link ToggleGroupItem}s — `type="single"` for a segmented choice
 * (alignment, view mode), `type="multiple"` for independent flags
 * (bold/italic/underline). Items inherit `variant` and `size` from the group.
 *
 * @param props.spacing - Gap between items in Tailwind spacing units.
 *   `0` joins them into one segmented control with shared seams.
 * @param props.variant - Passed to every item; see `Toggle`.
 * @param props.size - Passed to every item; see `Toggle`.
 *
 * @example
 * ```tsx
 * <ToggleGroup type="single" value={align} onValueChange={setAlign} spacing={0} variant="outline">
 *   <ToggleGroupItem value="left" aria-label="Left"><AlignLeft /></ToggleGroupItem>
 *   <ToggleGroupItem value="center" aria-label="Center"><AlignCenter /></ToggleGroupItem>
 * </ToggleGroup>
 * ```
 */
function ToggleGroup({
  className,
  variant,
  size,
  spacing = 1,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & ToggleGroupStyle) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

/** One option of a {@link ToggleGroup}. Needs a `value` and, when icon-only, an `aria-label`. */
function ToggleGroupItem({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  const resolvedVariant = context.variant || variant;
  const resolvedSize = context.size || size;
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
        "shrink-0 focus-visible:z-10",
        "group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:first:rounded-l-md group-data-[spacing=0]/toggle-group:last:rounded-r-md",
        "group-data-[spacing=0]/toggle-group:data-[variant=outline]:not-first:border-l-0",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
