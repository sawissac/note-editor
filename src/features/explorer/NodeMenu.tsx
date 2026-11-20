import {
  IconCopy,
  IconExternalLink,
  IconDownload,
  IconFilePlus,
  IconFoldDown,
  IconFoldUp,
  IconFolderPlus,
  IconPencil,
  IconArrowsSort,
  IconSelect,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { ConvertMenu } from "@/features/explorer/ConvertMenu";
import { convertTargetsOf } from "@/lib/convert-targets";
import { mimeOf } from "@/lib/file-types";
import { downloadFile, storage } from "@/lib/storage";
import {
  collapseAll,
  duplicateNode,
  expandAll,
  openFile,
  SORT_OPTIONS,
  sortChildren,
} from "@/store/actions";
import { type FsNode, fsActions } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions } from "@/store/ui-slice";

/** Actions for one explorer row, shown on right-click or the row's ⋯ button. */
export function NodeMenu({ node }: { node: FsNode }) {
  const dispatch = useAppDispatch();
  const folderId = node.type === "folder" ? node.id : node.parentId;
  const selectedIds = useAppSelector((s) => s.fs.selectedIds);
  const convertTargets =
    node.type === "file" ? convertTargetsOf(node.name) : [];

  // Right-click inside a multi-selection acts on the whole selection.
  if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
    const count = selectedIds.length;
    return (
      <ContextMenuContent
        data-testid={`node-menu-${node.id}`}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ContextMenuItem
          data-testid="node-menu-clear-selection-item"
          onSelect={() => dispatch(fsActions.selected(node.id))}
        >
          <IconSelect />
          Select only “{node.name}”
          <ContextMenuShortcut>Esc</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          data-testid="node-menu-delete-selection-item"
          onSelect={() => dispatch(uiActions.deleteRequested(selectedIds))}
        >
          <IconTrash />
          Delete {count} items
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    );
  }

  return (
    <ContextMenuContent
      data-testid={`node-menu-${node.id}`}
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      {node.type === "file" ? (
        <ContextMenuItem onSelect={() => dispatch(openFile(node.id))}>
          <IconExternalLink />
          Open
          <ContextMenuShortcut>Space</ContextMenuShortcut>
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        onSelect={() =>
          dispatch(
            fsActions.draftStarted({
              mode: "create",
              nodeType: "file",
              parentId: folderId,
              afterId: node.type === "file" ? node.id : undefined,
            }),
          )
        }
      >
        <IconFilePlus />
        New file{node.type === "file" ? " here" : ""}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          dispatch(
            fsActions.draftStarted({
              mode: "create",
              nodeType: "folder",
              parentId: folderId,
              afterId: node.type === "file" ? node.id : undefined,
            }),
          )
        }
      >
        <IconFolderPlus />
        New folder{node.type === "file" ? " here" : ""}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => dispatch(uiActions.importOpened(folderId))}>
        <IconUpload />
        Import files…
      </ContextMenuItem>
      {node.type === "folder" ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              dispatch(expandAll(node.id));
              dispatch(fsActions.selected(node.id));
            }}
          >
            <IconFoldDown />
            Expand all inside
            <ContextMenuShortcut>*</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => dispatch(collapseAll(node.id))}>
            <IconFoldUp />
            Collapse all inside
          </ContextMenuItem>
        </>
      ) : null}
      <ContextMenuSub>
        <ContextMenuSubTrigger data-testid="node-menu-sort-trigger">
          <IconArrowsSort />
          {node.type === "folder" ? "Sort contents by" : "Sort folder by"}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {SORT_OPTIONS.map((option) => (
            <ContextMenuItem
              key={option.key}
              data-testid={`node-menu-sort-${option.key}-item`}
              onSelect={() => dispatch(sortChildren(folderId, option.key))}
            >
              {option.label}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() =>
          dispatch(fsActions.draftStarted({ mode: "rename", id: node.id }))
        }
      >
        <IconPencil />
        Rename
        <ContextMenuShortcut>Enter</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void dispatch(duplicateNode(node.id))}>
        <IconCopy />
        Duplicate
      </ContextMenuItem>
      {node.type === "file" ? (
        <ContextMenuItem
          onSelect={async () => {
            const content = await storage.getContent(node.id);
            downloadFile(node.name, content ?? "", mimeOf(node.name));
          }}
        >
          <IconDownload />
          Download
        </ContextMenuItem>
      ) : null}
      {convertTargets.length ? (
        <ConvertMenu node={node} targets={convertTargets} />
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() => dispatch(uiActions.deleteRequested(node.id))}
      >
        <IconTrash />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
