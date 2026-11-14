import {
  IconChevronRight,
  IconDotsVertical,
  IconFilePlus,
  IconFolderPlus,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/cn";
import { FileIcon, FolderIcon } from "@/lib/file-icons";
import { commitRename, moveNode, openFile, validateName } from "@/store/actions";
import { type FsNode, fsActions } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector } from "@/store";
import { hasFilePayload, hasNodePayload, NODE_MIME } from "@/features/explorer/dnd";
import { NameInput } from "@/features/explorer/NameInput";
import { NodeMenu } from "@/features/explorer/NodeMenu";

export const ROW_HEIGHT = 26;
const INDENT = 12;

/** Opens the row's context menu from its ⋯ button, at the button. */
function openMenuAt(button: HTMLElement) {
  const row = button.closest<HTMLElement>("[data-slot=tree-row]");
  if (!row) return;
  const rect = button.getBoundingClientRect();
  row.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.bottom,
    }),
  );
}

export function IndentGuides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-app-border"
          style={{ left: 15 + i * INDENT }}
        />
      ))}
    </>
  );
}

export function rowPadding(depth: number) {
  return 8 + depth * INDENT;
}

/**
 * One explorer row: chevron, icon, name (or the rename field), and hover
 * actions. Folders accept dropped rows and OS files; files forward a drop to
 * their parent folder.
 */
export function TreeRow({
  node,
  depth,
  dropTargetId,
  onDropTarget,
  onExternalDrop,
}: {
  node: FsNode;
  depth: number;
  dropTargetId: string | null | undefined;
  onDropTarget: (id: string | null | undefined) => void;
  onExternalDrop: (files: File[], parentId: string | null) => void;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const selected = useAppSelector((s) => s.fs.selectedId === node.id);
  const active = useAppSelector((s) => s.tabs.activeId === node.id);
  const open = useAppSelector((s) => Boolean(s.fs.expanded[node.id]));
  const renaming = useAppSelector(
    (s) => s.fs.draft?.mode === "rename" && s.fs.draft.id === node.id,
  );
  const isFolder = node.type === "folder";
  const dropFolderId = isFolder ? node.id : node.parentId;
  const isDropTarget = isFolder && dropTargetId === node.id;
  const [menuOpen, setMenuOpen] = React.useState(false);

  const activate = () => {
    if (isFolder) {
      dispatch(fsActions.selected(node.id));
      dispatch(fsActions.expandedToggled(node.id));
    } else {
      dispatch(openFile(node.id));
    }
  };

  return (
    <ContextMenu onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild disabled={renaming}>
        <div
          id={`tree-row-${node.id}`}
          data-slot="tree-row"
          data-testid={`tree-row-${node.id}`}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selected}
          aria-expanded={isFolder ? open : undefined}
          data-selected={selected || undefined}
          draggable={!renaming}
          onClick={activate}
          onDoubleClick={(e) => {
            // Folders toggle on click, so a double-click would only flicker
            // them; renaming a folder is F2 or the menu.
            if (isFolder) return;
            e.preventDefault();
            dispatch(fsActions.draftStarted({ mode: "rename", id: node.id }));
          }}
          onContextMenu={() => dispatch(fsActions.selected(node.id))}
          onDragStart={(e) => {
            e.dataTransfer.setData(NODE_MIME, node.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => onDropTarget(undefined)}
          onDragOver={(e) => {
            if (!hasNodePayload(e) && !hasFilePayload(e)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = hasNodePayload(e) ? "move" : "copy";
            onDropTarget(dropFolderId);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropTarget(undefined);
            const id = e.dataTransfer.getData(NODE_MIME);
            if (id) dispatch(moveNode(id, dropFolderId));
            else if (e.dataTransfer.files.length) {
              onExternalDrop(Array.from(e.dataTransfer.files), dropFolderId);
            }
          }}
          style={{ paddingLeft: rowPadding(depth), height: ROW_HEIGHT }}
          className={cn(
            "group relative flex cursor-pointer items-center gap-1.5 pr-1 text-[12px] text-app-text outline-none select-none",
            "transition-colors duration-(--motion-duration-fast) hover:bg-app-hover",
            active && "text-app-bright",
            selected && "bg-app-selected text-app-bright",
            (isDropTarget || menuOpen) &&
              "bg-app-accent-faint ring-1 ring-app-border-accent ring-inset",
          )}
        >
          <IndentGuides depth={depth} />
          <span className="flex size-4 shrink-0 items-center justify-center">
            {isFolder ? (
              <IconChevronRight
                aria-hidden
                className={cn(
                  "size-3.5 text-app-dim transition-transform duration-(--motion-duration-fast)",
                  open && "rotate-90",
                )}
              />
            ) : null}
          </span>
          {isFolder ? <FolderIcon open={open} /> : <FileIcon name={node.name} />}
          {renaming ? (
            <NameInput
              data-testid={`tree-rename-input-${node.id}`}
              initialValue={node.name}
              validate={(v) =>
                validateName(nodes, node.parentId, v, node.type, node.id)
              }
              onCommit={(v) => dispatch(commitRename(v))}
              onCancel={() => dispatch(fsActions.draftCancelled())}
            />
          ) : (
            <>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  active && "font-semibold",
                )}
                title={node.name}
              >
                {node.name}
              </span>
              <ButtonGroup
                aria-label={`${node.name} actions`}
                className="opacity-0 group-hover:opacity-100 group-data-selected:opacity-100"
              >
                {isFolder ? (
                  <>
                    <RowAction
                      label="New file"
                      onClick={() =>
                        dispatch(
                          fsActions.draftStarted({
                            mode: "create",
                            nodeType: "file",
                            parentId: node.id,
                          }),
                        )
                      }
                    >
                      <IconFilePlus />
                    </RowAction>
                    <RowAction
                      label="New folder"
                      onClick={() =>
                        dispatch(
                          fsActions.draftStarted({
                            mode: "create",
                            nodeType: "folder",
                            parentId: node.id,
                          }),
                        )
                      }
                    >
                      <IconFolderPlus />
                    </RowAction>
                  </>
                ) : null}
                <RowAction
                  label="More actions"
                  onClick={(e) => openMenuAt(e.currentTarget)}
                >
                  <IconDotsVertical />
                </RowAction>
              </ButtonGroup>
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <NodeMenu node={node} />
    </ContextMenu>
  );
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon-xs"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="size-5 rounded-sm bg-app-bg text-app-dim hover:text-app-accent [&_svg:not([class*='size-'])]:size-3"
    >
      {children}
    </Button>
  );
}
