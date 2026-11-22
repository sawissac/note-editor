import type { DropPosition } from "@/store/actions";

/** MIME type carried by tree rows while they are dragged (ids, one per line). */
export const NODE_MIME = "application/x-note-editor-node";

/** MIME type carried by a dragged tab (its file id). */
export const TAB_MIME = "application/x-note-editor-tab";

/** File id of the tab being dragged right now (unreadable during `dragover`). */
let draggingTabId: string | null = null;

export function setTabPayload(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(TAB_MIME, id);
  e.dataTransfer.effectAllowed = "move";
  draggingTabId = id;
}

export function clearDraggingTab() {
  draggingTabId = null;
}

/**
 * The one file being dragged from a tab or the tree, which the editor can
 * open in a split; null for folders, several rows, or outside drags.
 */
export function getDraggedFileId(
  isFile: (id: string) => boolean,
): string | null {
  if (draggingTabId) return draggingTabId;
  return draggingIds.length === 1 && isFile(draggingIds[0])
    ? draggingIds[0]
    : null;
}

export function hasNodePayload(e: React.DragEvent) {
  return e.dataTransfer.types.includes(NODE_MIME);
}

export function hasFilePayload(e: React.DragEvent) {
  return e.dataTransfer.types.includes("Files");
}

/**
 * Ids of the rows being dragged right now. `dataTransfer.getData` is empty
 * during `dragover`, so rows read this to pick their drop zones.
 */
let draggingIds: string[] = [];

export function getDraggingIds() {
  return draggingIds;
}

export function clearDraggingIds() {
  draggingIds = [];
}

/** Puts the dragged row ids on the drag. */
export function setNodePayload(e: React.DragEvent, ids: string[]) {
  e.dataTransfer.setData(NODE_MIME, ids.join("\n"));
  e.dataTransfer.effectAllowed = "move";
  draggingIds = ids;
}

/** The dragged row ids, or [] when the drop is not from the tree. */
export function getNodePayload(e: React.DragEvent) {
  return e.dataTransfer.getData(NODE_MIME).split("\n").filter(Boolean);
}

/**
 * Replaces the browser's drag preview with a small "3 items" chip when more
 * than one row is dragged. Uses BEM block `tree-drag-ghost`
 * (`src/styles/explorer.css`).
 */
export function setMultiDragImage(e: React.DragEvent, label: string) {
  const ghost = document.createElement("div");
  ghost.className = "tree-drag-ghost";
  ghost.textContent = label;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 12, 12);
  // The browser snapshots the element synchronously; it can go next frame.
  requestAnimationFrame(() => ghost.remove());
}

export type DropZone = DropPosition | "into";

/**
 * Which part of a row the pointer is over. Files split in half (before /
 * after). Folders keep their middle for "drop inside"; an expanded folder's
 * bottom edge is "inside" too, since its children are drawn right below.
 *
 * `sibling`: the dragged rows already live next to this folder, so
 * reordering is as likely as moving inside — the row splits in thirds
 * (before / inside / after), the bottom third even when expanded.
 */
export function dropZone(
  e: React.DragEvent<HTMLElement>,
  isFolder: boolean,
  expanded: boolean,
  sibling = false,
): DropZone {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  if (!isFolder) return y < 0.5 ? "before" : "after";
  if (sibling) {
    if (y < 1 / 3) return "before";
    if (y > 2 / 3) return "after";
    return "into";
  }
  if (y < 0.25) return "before";
  if (y > 0.75 && !expanded) return "after";
  return "into";
}
