import {
  IconChevronRight,
  IconDotsVertical,
  IconFilePlus,
  IconFolderPlus,
} from "@tabler/icons-react";
import { m } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { FileIcon, FolderIcon } from "@/lib/file-icons";
import { glide } from "@/lib/motion";
import { kindOf, suggestRenameNames } from "@/lib/file-types";
import {
  commitRename,
  type DropPosition,
  moveNodes,
  openFile,
  reorderNodes,
  validateName,
} from "@/store/actions";
import { type FsNode, fsActions } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  clearDraggingIds,
  dropZone,
  getDraggingIds,
  getNodePayload,
  hasFilePayload,
  hasNodePayload,
  setMultiDragImage,
  setNodePayload,
} from "@/features/explorer/dnd";
import { NameInput } from "@/features/explorer/NameInput";
import { NodeMenu } from "@/features/explorer/NodeMenu";

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
 *
 * - Click opens a file / toggles a folder. ⌘/Ctrl-click and Shift-click
 *   (handled by `onSelectClick`) build a multi-selection instead.
 * - Dragging a selected row drags the whole selection.
 * - Dropping rows on the top / bottom edge of a row reorders them before /
 *   after it (insertion line: BEM block `tree-drop-line`,
 *   `src/styles/explorer.css`); a folder's middle still means "move inside".
 */
export function TreeRow({
  node,
  depth,
  dropTargetId,
  onDropTarget,
  dropLine,
  onDropLine,
  onExternalDrop,
  onSelectClick,
  getDragIds,
}: {
  node: FsNode;
  depth: number;
  dropTargetId: string | null | undefined;
  onDropTarget: (id: string | null | undefined) => void;
  /** Insertion line drawn on this row while a reorder drop hovers it. */
  dropLine: DropPosition | undefined;
  onDropLine: (hint: { id: string; position: DropPosition } | undefined) => void;
  onExternalDrop: (files: File[], parentId: string | null) => void;
  /** Applies ⌘/Ctrl / Shift selection; true when the click was consumed. */
  onSelectClick: (e: React.MouseEvent, id: string) => boolean;
  /** Ids a drag starting on `id` carries (the selection, in tree order). */
  getDragIds: (id: string) => string[];
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const selected = useAppSelector((s) => s.fs.selectedIds.includes(node.id));
  const focused = useAppSelector((s) => s.fs.selectedId === node.id);
  const multi = useAppSelector((s) => s.fs.selectedIds.length > 1);
  const active = useAppSelector((s) => s.tabs.activeId === node.id);
  const open = useAppSelector((s) => Boolean(s.fs.expanded[node.id]));
  const renaming = useAppSelector(
    (s) => s.fs.draft?.mode === "rename" && s.fs.draft.id === node.id,
  );
  const isFolder = node.type === "folder";
  const dropFolderId = isFolder ? node.id : node.parentId;
  const isDropTarget = isFolder && dropTargetId === node.id;
  const [menuOpen, setMenuOpen] = React.useState(false);

  /** Rows from this folder's own level are dragged over it. */
  const isSiblingDrag = () => {
    if (!isFolder) return false;
    const dragged = getDraggingIds().map((id) => nodes[id]);
    return (
      dragged.length > 0 &&
      dragged.every((n) => n !== undefined && n.parentId === node.parentId)
    );
  };

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
          onClick={(e) => {
            if (!onSelectClick(e, node.id)) activate();
          }}
          onDoubleClick={(e) => {
            // Folders toggle on click, so a double-click would only flicker
            // them; renaming a folder is F2 or the menu.
            if (isFolder) return;
            e.preventDefault();
            dispatch(fsActions.draftStarted({ mode: "rename", id: node.id }));
          }}
          onContextMenu={() => {
            // Right-clicking inside a multi-selection keeps it for the menu.
            if (!selected) dispatch(fsActions.selected(node.id));
          }}
          onDragStart={(e) => {
            const ids = getDragIds(node.id);
            setNodePayload(e, ids);
            if (ids.length > 1) setMultiDragImage(e, `${ids.length} items`);
          }}
          onDragEnd={() => {
            clearDraggingIds();
            onDropTarget(undefined);
            onDropLine(undefined);
          }}
          onDragOver={(e) => {
            const isNode = hasNodePayload(e);
            if (!isNode && !hasFilePayload(e)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = isNode ? "move" : "copy";
            // OS files always import into the folder; only rows reorder.
            const zone = isNode
              ? dropZone(e, isFolder, open, isSiblingDrag())
              : "into";
            if (zone === "into") {
              onDropLine(undefined);
              onDropTarget(dropFolderId);
            } else {
              onDropTarget(undefined);
              onDropLine({ id: node.id, position: zone });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropTarget(undefined);
            onDropLine(undefined);
            const ids = getNodePayload(e);
            if (ids.length) {
              const zone = dropZone(e, isFolder, open, isSiblingDrag());
              clearDraggingIds();
              if (zone === "into") dispatch(moveNodes(ids, dropFolderId));
              else dispatch(reorderNodes(ids, node.id, zone));
            } else if (e.dataTransfer.files.length) {
              onExternalDrop(Array.from(e.dataTransfer.files), dropFolderId);
            }
          }}
          style={{ paddingLeft: rowPadding(depth) }}
          className={cn(
            "tree-row group",
            (active || selected) && "tree-row--selected",
            // A multi-selection fills every row in place; a single selection
            // uses the sliding fill below.
            selected && multi && "tree-row--multi-selected",
            focused && multi && "tree-row--focused",
            (isDropTarget || menuOpen) && "tree-row--drop-target",
          )}
        >
          {/* Single selection: one shared fill that slides from the previously
              selected row (like the bookmark sidebar). */}
          {selected && !multi ? (
            <m.span
              aria-hidden
              layoutId="explorer-selection"
              transition={glide}
              className="tree-selection"
            />
          ) : null}
          <IndentGuides depth={depth} />
          {dropLine ? (
            <span
              aria-hidden
              data-testid={`tree-drop-line-${node.id}`}
              className={`tree-drop-line tree-drop-line--${dropLine}`}
              style={{ left: rowPadding(depth) }}
            />
          ) : null}
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
            <RenameInput node={node} nodes={nodes} />
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
                className="tree-row__actions"
              >
                {isFolder ? (
                  <>
                    <RowAction
                      create
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
                      create
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

/**
 * Inline rename with the same name completion as "new file": clearing the
 * extension of `notes.md` and typing `report` offers `report.md` first, then
 * the other types this file may switch to.
 */
function RenameInput({
  node,
  nodes,
}: {
  node: FsNode;
  nodes: Record<string, FsNode>;
}) {
  const dispatch = useAppDispatch();
  const isFolder = node.type === "folder";
  const validate = React.useCallback(
    (v: string) => validateName(nodes, node.parentId, v, node.type, node.id),
    [nodes, node.parentId, node.type, node.id],
  );
  const suggest = React.useMemo(
    () => (isFolder ? undefined : suggestRenameNames(node.name)),
    [isFolder, node.name],
  );

  return (
    <NameInput
      data-testid={`tree-rename-input-${node.id}`}
      action="rename"
      initialValue={node.name}
      placeholder={isFolder ? "New folder name" : "New file name"}
      currentKind={isFolder ? undefined : kindOf(node.name)}
      validate={validate}
      suggest={suggest}
      onCommit={(v) => dispatch(commitRename(v))}
      onCancel={() => dispatch(fsActions.draftCancelled())}
    />
  );
}

/**
 * Small icon button in a row's hover toolbar. `create` marks the folder's
 * "New file / New folder" shortcuts, which touch layouts drop (they stay in
 * the context menu) so the row keeps room for its name.
 */
function RowAction({
  label,
  onClick,
  children,
  create = false,
}: {
  create?: boolean;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-xs"
          tabIndex={-1}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            onClick(e);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn(
            "tree-row__action",
            create && "tree-row__action--create",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
