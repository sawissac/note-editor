import type * as React from "react";

import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { BREAKPOINT, useMediaQuery } from "@/lib/use-media-query";

/**
 * A pane's work area plus a settings/navigation column, with a draggable
 * divider between them.
 *
 * At or above `breakpoint` the two sit side by side and the side column keeps
 * its pixel width while the window resizes; below it they stack (side
 * underneath, or on top when `side="start"`) and split the height. Flipping
 * layout only changes the group's orientation — the panes stay mounted, so
 * canvases and editors keep their state; the split carries over by share.
 *
 * Both children are placed in panels that size them; give each child
 * `h-full` (and its own scrolling) so it fills its panel.
 *
 * @param props.children - Exactly two nodes in visual order (left → right,
 *   top → bottom): the main area and the side column.
 * @param props.side - Which of the two is the side column. Default `"end"`.
 * @param props.sideSize - Side column's starting width when side by side.
 * @param props.sideMinSize - Narrowest the side column can be dragged.
 * @param props.sideMaxSize - Widest the side column can be dragged.
 * @param props.mainMinSize - Narrowest the main area can be dragged.
 * @param props.stackedSideSize - Side column's starting share of the height
 *   when stacked.
 * @param props.breakpoint - Media query at which the layout goes side by side.
 *
 * @example
 * ```tsx
 * <PaneSplit sideSize="20rem">
 *   <div className="qr-pane__stage-area">…</div>
 *   <aside className="qr-pane__side">…</aside>
 * </PaneSplit>
 * ```
 */
export function PaneSplit({
  children: [first, second],
  side = "end",
  sideSize = "20rem",
  sideMinSize = 220,
  sideMaxSize = "60%",
  mainMinSize = 240,
  stackedSideSize = "40%",
  breakpoint = BREAKPOINT.md,
}: {
  children: [React.ReactNode, React.ReactNode];
  side?: "start" | "end";
  sideSize?: number | string;
  sideMinSize?: number | string;
  sideMaxSize?: number | string;
  mainMinSize?: number | string;
  stackedSideSize?: number | string;
  breakpoint?: string;
}) {
  const wide = useMediaQuery(breakpoint);
  const [mainNode, sideNode] =
    side === "start" ? [second, first] : [first, second];

  const main = (
    <ResizablePanel minSize={wide ? mainMinSize : 120}>
      {mainNode}
    </ResizablePanel>
  );
  const sidePanel = (
    <ResizablePanel
      defaultSize={wide ? sideSize : stackedSideSize}
      minSize={wide ? sideMinSize : 96}
      maxSize={wide ? sideMaxSize : "80%"}
      groupResizeBehavior={wide ? "preserve-pixel-size" : undefined}
    >
      {sideNode}
    </ResizablePanel>
  );

  return (
    <ResizableGroup orientation={wide ? "horizontal" : "vertical"}>
      {side === "start" ? sidePanel : main}
      <ResizableHandle />
      {side === "start" ? main : sidePanel}
    </ResizableGroup>
  );
}
