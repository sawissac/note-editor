import {
  IconCopy,
  IconDownload,
  IconFilePlus,
  IconFoldDown,
  IconFoldUp,
  IconFolderPlus,
  IconPencil,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { mimeOf } from "@/lib/file-types";
import { downloadFile, storage } from "@/lib/storage";
import {
  collapseAll,
  duplicateNode,
  expandAll,
  openFile,
} from "@/store/actions";
import { type FsNode, fsActions } from "@/store/fs-slice";
import { useAppDispatch } from "@/store";
import { uiActions } from "@/store/ui-slice";

/** Actions for one explorer row, shown on right-click or the row's ⋯ button. */
export function NodeMenu({ node }: { node: FsNode }) {
  const dispatch = useAppDispatch();
  const folderId = node.type === "folder" ? node.id : node.parentId;

  return (
    <ContextMenuContent
      data-testid={`node-menu-${node.id}`}
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      {node.type === "file" ? (
        <ContextMenuItem onSelect={() => dispatch(openFile(node.id))}>
          Open
          <ContextMenuShortcut>Enter</ContextMenuShortcut>
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        onSelect={() =>
          dispatch(
            fsActions.draftStarted({
              mode: "create",
              nodeType: "file",
              parentId: folderId,
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
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() =>
          dispatch(fsActions.draftStarted({ mode: "rename", id: node.id }))
        }
      >
        <IconPencil />
        Rename
        <ContextMenuShortcut>F2</ContextMenuShortcut>
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
