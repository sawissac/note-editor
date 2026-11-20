import * as React from "react";

import { type FsNode } from "@/store/fs-slice";
import { useAppSelector } from "@/store";
import { selectChildrenMap } from "@/store/selectors";

export type TreeRow =
  | { kind: "node"; node: FsNode; depth: number }
  | { kind: "draft"; parentId: string | null; depth: number };

/**
 * Flattens the tree into the rows currently on screen, honouring which
 * folders are expanded, and splices in the inline "new item" row when a
 * create draft is active. Keyboard navigation walks this same list.
 */
export function useVisibleRows() {
  const childrenMap = useAppSelector(selectChildrenMap);
  const expanded = useAppSelector((s) => s.fs.expanded);
  const draft = useAppSelector((s) => s.fs.draft);

  return React.useMemo(() => {
    const rows: TreeRow[] = [];
    const createIn =
      draft?.mode === "create" ? (draft.parentId ?? "") : undefined;
    const afterId = draft?.mode === "create" ? draft.afterId : undefined;

    const walk = (parentKey: string, depth: number) => {
      const children = childrenMap.get(parentKey) ?? [];
      const draftHere = createIn === parentKey;
      // Below the selected sibling (and its open subtree), else on top.
      const below =
        draftHere && afterId && children.some((n) => n.id === afterId)
          ? afterId
          : undefined;
      const draftRow = {
        kind: "draft",
        parentId: parentKey || null,
        depth,
      } as const;
      if (draftHere && !below) rows.push(draftRow);
      for (const node of children) {
        rows.push({ kind: "node", node, depth });
        if (node.type === "folder" && expanded[node.id]) {
          walk(node.id, depth + 1);
        }
        if (node.id === below) rows.push(draftRow);
      }
    };
    walk("", 0);
    return rows;
  }, [childrenMap, expanded, draft]);
}
