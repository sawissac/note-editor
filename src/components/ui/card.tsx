import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Flat panel surface: `bg-app-panel`, a hairline `border-app-border`, no
 * shadow. Compose with {@link CardHeader}, {@link CardTitle},
 * {@link CardDescription}, {@link CardAction}, {@link CardContent} and
 * {@link CardFooter}; every part reads the shared `--card-spacing`.
 *
 * @param props.size - `"default"` (16px rhythm) or `"sm"` (12px).
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
 *   <CardContent>…</CardContent>
 * </Card>
 * ```
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg border border-app-border bg-app-panel py-(--card-spacing) text-[12px] text-app-text [--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-title text-[13px] leading-snug font-semibold text-app-bright group-data-[size=sm]/card:text-[12px]",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "font-description text-[11px] leading-snug text-app-dim",
        className,
      )}
      {...props}
    />
  );
}

/** Trailing control in the header's top-right corner. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-app-border px-(--card-spacing) pt-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
