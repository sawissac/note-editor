/** MIME type carried by a tree row while it is dragged. */
export const NODE_MIME = "application/x-note-editor-node";

export function hasNodePayload(e: React.DragEvent) {
  return e.dataTransfer.types.includes(NODE_MIME);
}

export function hasFilePayload(e: React.DragEvent) {
  return e.dataTransfer.types.includes("Files");
}
