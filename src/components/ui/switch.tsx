"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * On/off toggle for a setting that applies immediately. Checked fills with
 * the accent; unchecked sits on `bg-app-border-mid`.
 *
 * Renders a `role="switch"` button, so it needs a label — wrap it in a
 * `<label>`, point a `<label htmlFor>` at its `id`, or pass `aria-label`.
 *
 * @param props.size - `"default"` (18×32) or `"sm"` (14×24).
 * @param props.checked - Controlled state; pair with `onCheckedChange`.
 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg",
        "data-[size=default]:h-[18px] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        "data-[state=checked]:bg-app-accent data-[state=unchecked]:bg-app-border-mid",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-app-on-solid transition-transform duration-200",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
