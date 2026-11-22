import * as React from "react";

import {
  getDraggedFileId,
  NODE_MIME,
  TAB_MIME,
} from "@/features/explorer/dnd";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppStore } from "@/store";
import { openFile } from "@/store/actions";
import { type SplitSide, tabsActions } from "@/store/tabs-slice";

/** Where a drop lands: the whole area, or one edge (opens a split). */
type Zone = "full" | "left" | "right" | "top" | "bottom";

/** Share of the width / height from an edge that splits toward that edge. */
const EDGE = 1 / 3;

/**
 * True while a tab or a tree row is being dragged anywhere in the app.
 * Drags from outside (OS files) are left alone: the explorer imports them.
 */
function useInAppDrag() {
  const [dragging, setDragging] = React.useState(false);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onStart = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      if (!types.includes(TAB_MIME) && !types.includes(NODE_MIME)) return;
      // Next task: changing the DOM inside `dragstart` can cancel the drag.
      timer = setTimeout(() => setDragging(true), 0);
    };
    const onEnd = () => {
      clearTimeout(timer);
      setDragging(false);
    };
    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onEnd);
    window.addEventListener("drop", onEnd);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("drop", onEnd);
    };
  }, []);
  return dragging;
}

/** The nearest edge within {@link EDGE} of the pointer, else the middle. */
function zoneAt(e: React.DragEvent<HTMLElement>): Zone {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const edges: [Zone, number][] = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ];
  const [edge, distance] = edges.reduce((a, b) => (b[1] < a[1] ? b : a));
  return distance < EDGE ? edge : "full";
}

/**
 * Drop target laid over the editor while a file is dragged from the tab
 * strip or the explorer. Covers the editor (iframes and canvases inside it
 * would otherwise swallow the drag) and previews where the file will go.
 *
 * - Single editor (`side` omitted): drop on an edge to split the editor
 *   with the file on that side; drop in the middle to just open it.
 * - One pane of a split (`side` set): drop anywhere to show the file in
 *   that pane.
 *
 * `currentId` is the file already shown there; dropping it onto itself is
 * refused (a file is never shown twice).
 *
 * Uses BEM block `split-drop` (`src/styles/editor-split.css`).
 */
export function SplitDropOverlay({
  side,
  currentId,
}: {
  side?: SplitSide;
  currentId: string | null;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const dragging = useInAppDrag();
  const [zone, setZone] = React.useState<Zone | null>(null);

  React.useEffect(() => {
    if (!dragging) setZone(null);
  }, [dragging]);

  if (!dragging) return null;

  const draggedId = () =>
    getDraggedFileId(
      (id) => store.getState().fs.nodes[id]?.type === "file",
    );

  /** Where `id` may land under the pointer, or null to refuse the drop. */
  const targetZone = (e: React.DragEvent<HTMLElement>, id: string | null) => {
    if (!id) return null;
    if (side) return id === currentId ? null : "full";
    const at = zoneAt(e);
    // Nothing open yet: there is nothing to split against.
    if (!currentId) return "full";
    if (id === currentId) return null;
    return at;
  };

  return (
    <div
      className="split-drop"
      data-testid={side ? `split-drop-${side}` : "split-drop"}
      onDragOver={(e) => {
        const next = targetZone(e, draggedId());
        if (next !== zone) setZone(next);
        if (!next) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setZone(null);
        }
      }}
      onDrop={(e) => {
        const id = draggedId();
        const at = targetZone(e, id);
        setZone(null);
        if (!id || !at) return;
        e.preventDefault();
        e.stopPropagation();
        if (side) {
          dispatch(tabsActions.paneOpened({ id, side }));
        } else if (at === "full") {
          dispatch(openFile(id));
        } else {
          dispatch(
            tabsActions.splitOpened({
              id,
              side: at === "left" || at === "top" ? "start" : "end",
              orientation: at === "left" || at === "right" ? "row" : "column",
            }),
          );
        }
      }}
    >
      <div
        aria-hidden
        className={cn(
          "split-drop__preview",
          zone && `split-drop__preview--${zone}`,
        )}
      />
    </div>
  );
}
