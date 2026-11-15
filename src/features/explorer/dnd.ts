import type { DropPosition } from "@/store/actions";

/** MIME type carried by tree rows while they are dragged (ids, one per line). */
export const NODE_MIME = "application/x-note-editor-node";

export function hasNodePayload(e: React.DragEvent) {
  return e.dataTransfer.types.includes(NODE_MIME);
}

export function hasFilePayload(e: React.DragEvent) {
  return e.dataTransfer.types.includes("Files");
}

/** Puts the dragged row ids on the drag. */
export function setNodePayload(e: React.DragEvent, ids: string[]) {
  e.dataTransfer.setData(NODE_MIME, ids.join("\n"));
  e.dataTransfer.effectAllowed = "move";
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
 */
export function dropZone(
  e: React.DragEvent<HTMLElement>,
  isFolder: boolean,
  expanded: boolean,
): DropZone {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  if (!isFolder) return y < 0.5 ? "before" : "after";
  if (y < 0.25) return "before";
  if (y > 0.75 && !expanded) return "after";
  return "into";
}
