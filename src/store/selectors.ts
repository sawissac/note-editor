import { createSelector } from "@reduxjs/toolkit";

import type { FsNode } from "@/store/fs-slice";
import type { RootState } from "@/store";

export const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Manual `order` (set by drag-to-reorder or "Sort by") wins, so files and
 * folders can be mixed freely; rows that were never ordered come after the
 * ordered ones. Without any order: folders first, then name.
 */
export function compareNodes(a: FsNode, b: FsNode) {
  if (a.order !== undefined || b.order !== undefined) {
    if (a.order === undefined) return 1;
    if (b.order === undefined) return -1;
    if (a.order !== b.order) return a.order - b.order;
  }
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/** Children of `parentId` (null = root) in tree order. */
export function getSortedChildren(
  nodes: Record<string, FsNode>,
  parentId: string | null,
) {
  return Object.values(nodes)
    .filter((n) => n.parentId === parentId)
    .sort(compareNodes);
}

export const selectNodes = (state: RootState) => state.fs.nodes;

/** parentId ("" for root) → sorted children. */
export const selectChildrenMap = createSelector([selectNodes], (nodes) => {
  const map = new Map<string, FsNode[]>();
  for (const node of Object.values(nodes)) {
    const key = node.parentId ?? "";
    const list = map.get(key);
    if (list) list.push(node);
    else map.set(key, [node]);
  }
  for (const list of map.values()) list.sort(compareNodes);
  return map;
});

export function getDescendantIds(nodes: Record<string, FsNode>, id: string) {
  const out: string[] = [id];
  for (let i = 0; i < out.length; i++) {
    for (const node of Object.values(nodes)) {
      if (node.parentId === out[i]) out.push(node.id);
    }
  }
  return out;
}

export function getPath(nodes: Record<string, FsNode>, id: string | null) {
  const parts: string[] = [];
  let cur = id ? nodes[id] : undefined;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return parts;
}

/** Ancestors of `id`, root first. */
export function getAncestorIds(nodes: Record<string, FsNode>, id: string) {
  const out: string[] = [];
  let cur = nodes[id]?.parentId ? nodes[nodes[id].parentId!] : undefined;
  while (cur) {
    out.unshift(cur.id);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return out;
}

export function isNameTaken(
  nodes: Record<string, FsNode>,
  parentId: string | null,
  name: string,
  exceptId?: string,
) {
  const lower = name.toLowerCase();
  return Object.values(nodes).some(
    (n) =>
      n.parentId === parentId &&
      n.id !== exceptId &&
      n.name.toLowerCase() === lower,
  );
}

/** "notes.md" → "notes (1).md" → "notes (2).md" until free. */
export function uniqueName(
  nodes: Record<string, FsNode>,
  parentId: string | null,
  name: string,
  exceptId?: string,
) {
  if (!isNameTaken(nodes, parentId, name, exceptId)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) {
    const next = `${base} (${i})${ext}`;
    if (!isNameTaken(nodes, parentId, next, exceptId)) return next;
  }
}

/** Folder a "new file" action should target given the current selection. */
export function getTargetFolderId(
  nodes: Record<string, FsNode>,
  selectedId: string | null,
) {
  const node = selectedId ? nodes[selectedId] : undefined;
  if (!node) return null;
  return node.type === "folder" ? node.id : node.parentId;
}

/**
 * The explorer sidebar shows only when the user has it open AND the
 * workspace holds something — an empty workspace hides it so the editor
 * area's empty state (New note / New folder / Import) is the whole screen.
 * It also shows while a new-item draft is pending: New note / New folder
 * name the item in an explorer row. Derived, not stored: the saved
 * `sidebarOpen` preference is untouched, so the sidebar comes back as it
 * was once the first file or folder exists.
 */
export const selectSidebarVisible = (s: RootState) =>
  s.ui.sidebarOpen && (s.fs.draft !== null || Object.keys(s.fs.nodes).length > 0);

/** Whether the workspace has any file or folder at all. */
export const selectHasNodes = (s: RootState) => Object.keys(s.fs.nodes).length > 0;
