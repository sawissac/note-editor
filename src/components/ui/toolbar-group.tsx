"use client";

import * as React from "react";

import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/cn";

/**
 * A cluster of toolbar controls drawn as one joined strip — compacto's
 * ButtonGroup look (one hairline frame, merged seams, outer corners rounded)
 * applied to whatever controls sit inside, including ghost buttons wrapped in
 * tooltip triggers, select triggers and small inputs. The segment styling
 * lives in `index.css` under `[data-slot="toolbar-group"]`, so third-party
 * toolbars (the Extend editors) can adopt it by wrapping, without rewriting
 * every button's variant.
 *
 * @example
 * ```tsx
 * <ToolbarGroup aria-label="Zoom">
 *   <Button variant="ghost" size="icon-sm" aria-label="Zoom out">…</Button>
 *   <SelectTrigger size="sm">…</SelectTrigger>
 *   <Button variant="ghost" size="icon-sm" aria-label="Zoom in">…</Button>
 * </ToolbarGroup>
 * ```
 */
function ToolbarGroup({
  className,
  ...props
}: React.ComponentProps<typeof ButtonGroup>) {
  return (
    <ButtonGroup
      data-slot="toolbar-group"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

type SeparatorMatcher = React.ElementType;

/** Children with fragments unpacked, so `{cond ? <>…</> : null}` splits too. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (React.isValidElement(child) && child.type === React.Fragment) {
      out.push(
        ...flatten((child.props as { children?: React.ReactNode }).children),
      );
    } else {
      out.push(child);
    }
  });
  return out;
}

/**
 * Turns a toolbar row written as "controls · separator · controls" into
 * joined {@link ToolbarGroup}s: each run between separators becomes one
 * group and the separators themselves are dropped (the row's gap spaces the
 * groups). `separators` lists the component types that count as a break;
 * a plain `Separator` only counts when `orientation="vertical"`.
 *
 * @example
 * ```tsx
 * <div className="flex items-center gap-1.5">
 *   <ToolbarGroups separators={[ToolbarSeparator]}>
 *     <Button …/><Button …/>
 *     <ToolbarSeparator />
 *     <Select …/>
 *   </ToolbarGroups>
 * </div>
 * ```
 */
function ToolbarGroups({
  separators,
  children,
}: {
  separators: SeparatorMatcher[];
  children: React.ReactNode;
}) {
  const runs: React.ReactNode[][] = [[]];
  for (const child of flatten(children)) {
    const isBreak =
      React.isValidElement(child) &&
      separators.includes(child.type as SeparatorMatcher) &&
      (child.props as { orientation?: string }).orientation !== "horizontal";
    if (isBreak) runs.push([]);
    else runs[runs.length - 1].push(child);
  }
  return (
    <>
      {runs
        .filter((run) => run.length > 0)
        .map((run, i) => (
          <ToolbarGroup key={i}>{run}</ToolbarGroup>
        ))}
    </>
  );
}

export { ToolbarGroup, ToolbarGroups };
