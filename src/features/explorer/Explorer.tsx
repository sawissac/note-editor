import {
  IconAlertTriangle,
  IconDragDrop,
  IconFiles,
  IconX,
  IconFilePlus,
  IconFolderPlus,
  IconFoldUp,
  IconFoldDown,
  IconLayoutSidebarLeftCollapse,
  IconNotebook,
  IconUpload,
  IconFileExport,
  IconDatabaseExport,
  IconArrowsSort,
} from "@tabler/icons-react";
import { AnimatePresence, m, type Variants } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarTitle,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { enter, exit } from "@/lib/motion";
import { Unfold } from "@/components/unfold";
import * as ui from "@/lib/ui-styles";
import {
  collapseAll,
  commitCreate,
  type DropPosition,
  expandAll,
  exportWorkspace,
  importFiles,
  moveNodes,
  openFile,
  shiftNode,
  SORT_OPTIONS,
  sortChildren,
  validateName,
} from "@/store/actions";
import { fsActions, type NodeType } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store";
import { getTargetFolderId } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";
import {
  getNodePayload,
  hasFilePayload,
  hasNodePayload,
} from "@/features/explorer/dnd";
import { NameInput } from "@/features/explorer/NameInput";
import {
  IndentGuides,
  ROW_HEIGHT,
  rowPadding,
  TreeRow,
} from "@/features/explorer/TreeRow";
import { useVisibleRows } from "@/features/explorer/use-visible-rows";
import { FileIcon, FolderIcon } from "@/lib/file-icons";
import { suggestFileNames } from "@/lib/file-types";

const NO_MOTION = { duration: 0 };

/**
 * Row fold/unfold. `custom` = "instant": the change came with a tab switch
 * (opening a file auto-expands its ancestors and scrolls the row into view),
 * so the rows must be at full height at once or the scroll lands short and
 * the tree visibly jumps. Only direct folder toggles animate.
 */
const ROW_VARIANTS: Variants = {
  folded: (instant: boolean) => ({
    height: 0,
    opacity: 0,
    pointerEvents: "none",
    transition: instant ? NO_MOTION : exit,
  }),
  unfolded: (instant: boolean) =>
    instant
      ? {
          height: "auto",
          opacity: 1,
          pointerEvents: "auto",
          transition: NO_MOTION,
        }
      : {
          height: "auto",
          opacity: 1,
          pointerEvents: "auto",
          transition: enter,
        },
};

/**
 * The left pane: a file tree with VS Code–style inline create / rename,
 * keyboard navigation, drag-to-move, OS file drop-to-import, and a
 * confirmation step before anything is deleted.
 */
export function Explorer() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const rows = useVisibleRows();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const selectedId = useAppSelector((s) => s.fs.selectedId);
  const draft = useAppSelector((s) => s.fs.draft);
  const selectionCount = useAppSelector((s) => s.fs.selectedIds.length);
  // Rows that change in the same render as the active tab snap instead of
  // animating (see ROW_VARIANTS).
  const activeId = useAppSelector((s) => s.tabs.activeId);
  const lastActiveId = React.useRef(activeId);
  const instantRows = lastActiveId.current !== activeId;
  React.useEffect(() => {
    lastActiveId.current = activeId;
  }, [activeId]);
  const treeRef = React.useRef<HTMLDivElement>(null);
  // undefined = no drop in progress, null = root, string = folder id.
  const [dropTarget, setDropTarget] = React.useState<
    string | null | undefined
  >();
  // Row + edge where a reorder drop would land (insertion line).
  const [dropLine, setDropLineState] = React.useState<
    { id: string; position: DropPosition } | undefined
  >();
  const setDropLine = React.useCallback(
    (next: { id: string; position: DropPosition } | undefined) =>
      setDropLineState((prev) =>
        prev?.id === next?.id && prev?.position === next?.position
          ? prev
          : next,
      ),
    [],
  );
  const notice = useAppSelector((s) => s.ui.explorerNotice);
  const setNotice = (text: string | null) =>
    dispatch(uiActions.explorerNoticeSet(text));
  const isEmpty = rows.length === 0;

  // Keep the selected row in view as the selection moves.
  React.useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(`tree-row-${selectedId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // Return focus to the tree when an inline input closes.
  const hadDraft = React.useRef(false);
  React.useEffect(() => {
    // Only when focus fell to <body> — a new file's editor may have claimed it.
    if (
      hadDraft.current &&
      !draft &&
      document.activeElement === document.body
    ) {
      treeRef.current?.focus({ preventScroll: true });
    }
    hadDraft.current = Boolean(draft);
  }, [draft]);

  const startCreate = (nodeType: NodeType) => {
    const { nodes: all, selectedId: sel } = store.getState().fs;
    dispatch(
      fsActions.draftStarted({
        mode: "create",
        nodeType,
        parentId: getTargetFolderId(all, sel),
      }),
    );
  };

  const handleExternalDrop = async (files: File[], parentId: string | null) => {
    const skipped = await dispatch(importFiles(files, parentId));
    setNotice(
      skipped.length ? `Skipped unsupported: ${skipped.join(", ")}` : null,
    );
  };

  const visibleIds = React.useMemo(
    () => rows.flatMap((r) => (r.kind === "node" ? [r.node.id] : [])),
    [rows],
  );

  /** Selects every visible row from the anchor to `id` (Shift). */
  const selectRangeTo = (id: string) => {
    const { anchorId } = store.getState().fs;
    const a = anchorId ? visibleIds.indexOf(anchorId) : -1;
    const b = visibleIds.indexOf(id);
    if (a < 0 || b < 0) {
      dispatch(fsActions.selected(id));
      return;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    dispatch(
      fsActions.selectionSet({
        ids: visibleIds.slice(lo, hi + 1),
        focusId: id,
      }),
    );
  };

  const onSelectClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey) {
      selectRangeTo(id);
      return true;
    }
    if (e.metaKey || e.ctrlKey) {
      dispatch(fsActions.selectionToggled(id));
      return true;
    }
    return false;
  };

  /** A drag from a selected row carries the whole selection, in tree order. */
  const getDragIds = (id: string) => {
    const { selectedIds } = store.getState().fs;
    if (!selectedIds.includes(id)) return [id];
    const picked = new Set(selectedIds);
    return visibleIds.filter((v) => picked.has(v));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (draft) return;
    const nodeRows = rows.filter((r) => r.kind === "node");
    const index = nodeRows.findIndex((r) => r.node.id === selectedId);
    const current = index >= 0 ? nodeRows[index].node : undefined;
    const { selectedIds } = store.getState().fs;
    const select = (i: number, extend = false) => {
      const row = nodeRows[Math.max(0, Math.min(nodeRows.length - 1, i))];
      if (!row) return;
      if (extend) selectRangeTo(row.node.id);
      else dispatch(fsActions.selected(row.node.id));
    };

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (visibleIds.length) {
        dispatch(
          fsActions.selectionSet({
            ids: visibleIds,
            focusId: selectedId ?? visibleIds[0],
          }),
        );
      }
      return;
    }

    // Alt+↑ / Alt+↓ moves the focused row among its siblings.
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (current) dispatch(shiftNode(current.id, e.key === "ArrowUp" ? -1 : 1));
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        select(index + 1, e.shiftKey);
        break;
      case "ArrowUp":
        e.preventDefault();
        select(index < 0 ? nodeRows.length - 1 : index - 1, e.shiftKey);
        break;
      case "Home":
        e.preventDefault();
        select(0);
        break;
      case "End":
        e.preventDefault();
        select(nodeRows.length - 1);
        break;
      case "ArrowRight":
        if (current?.type !== "folder") break;
        e.preventDefault();
        if (!store.getState().fs.expanded[current.id]) {
          dispatch(fsActions.expandedSet({ id: current.id, open: true }));
        } else {
          select(index + 1);
        }
        break;
      case "ArrowLeft":
        if (!current) break;
        e.preventDefault();
        if (
          current.type === "folder" &&
          store.getState().fs.expanded[current.id]
        ) {
          dispatch(fsActions.expandedSet({ id: current.id, open: false }));
        } else if (current.parentId) {
          dispatch(fsActions.selected(current.parentId));
        }
        break;
      case " ":
        if (!current) break;
        e.preventDefault();
        if (current.type === "folder")
          dispatch(fsActions.expandedToggled(current.id));
        else dispatch(openFile(current.id));
        break;
      // Enter renames the one selected item (Finder-style); F2 too.
      case "Enter":
      case "F2":
        if (!current || selectedIds.length > 1) break;
        e.preventDefault();
        dispatch(fsActions.draftStarted({ mode: "rename", id: current.id }));
        break;
      case "Delete":
      case "Backspace":
        if (!current || (e.key === "Backspace" && !(e.metaKey || e.ctrlKey)))
          break;
        e.preventDefault();
        dispatch(
          uiActions.deleteRequested(
            selectedIds.length > 1 ? getDragIds(current.id) : current.id,
          ),
        );
        break;
      case "*":
        e.preventDefault();
        dispatch(
          expandAll(
            current?.type === "folder"
              ? current.id
              : (current?.parentId ?? null),
          ),
        );
        break;
      case "Escape":
        dispatch(fsActions.selected(null));
        break;
    }
  };

  return (
    <Sidebar data-testid="explorer" texture="none" className="h-full">
      <SidebarHeader className="h-9 gap-1 pr-1.5 pl-3">
        <SidebarTitle className={ui.label}>Bento</SidebarTitle>
        <ButtonGroup aria-label="Create">
          <HeaderAction label="New file" onClick={() => startCreate("file")}>
            <IconFilePlus />
          </HeaderAction>
          <HeaderAction
            label="New folder"
            onClick={() => startCreate("folder")}
          >
            <IconFolderPlus />
          </HeaderAction>
          <HeaderAction
            label="Import files from your computer"
            onClick={() =>
              dispatch(
                uiActions.importOpened(
                  getTargetFolderId(store.getState().fs.nodes, selectedId),
                ),
              )
            }
          >
            <IconUpload />
          </HeaderAction>
          <HeaderAction
            label="Export files as one PDF"
            onClick={() => dispatch(uiActions.unifiedExportSet(true))}
          >
            <IconFileExport />
          </HeaderAction>
          <HeaderAction
            label="Export workspace backup (all files and state)"
            onClick={() => void dispatch(exportWorkspace())}
          >
            <IconDatabaseExport />
          </HeaderAction>
        </ButtonGroup>
        <ButtonGroup aria-label="Folders">
          <HeaderAction
            label="Expand all folders"
            onClick={() => dispatch(expandAll())}
          >
            <IconFoldDown />
          </HeaderAction>
          <HeaderAction
            label="Collapse all folders"
            onClick={() => dispatch(collapseAll())}
          >
            <IconFoldUp />
          </HeaderAction>
          <SortAction />
        </ButtonGroup>
        <HeaderAction
          label="Hide sidebar"
          onClick={() => dispatch(uiActions.sidebarSet(false))}
        >
          <IconLayoutSidebarLeftCollapse />
        </HeaderAction>
      </SidebarHeader>

      {/* The tree's own scroller (SidebarContent's classes), as a motion
          element: `layoutScroll` keeps the sliding selection fill on target
          while keyboard navigation scrolls the selected row into view. */}
      <m.div
        ref={treeRef}
        layoutScroll
        data-slot="sidebar-content"
        role="tree"
        aria-multiselectable
        aria-label="Files"
        tabIndex={0}
        aria-activedescendant={
          selectedId ? `tree-row-${selectedId}` : undefined
        }
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target === e.currentTarget) dispatch(fsActions.selected(null));
        }}
        onDragOver={(e) => {
          if (!hasNodePayload(e) && !hasFilePayload(e)) return;
          e.preventDefault();
          setDropTarget(null);
          setDropLine(undefined);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTarget(undefined);
            setDropLine(undefined);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(undefined);
          setDropLine(undefined);
          const ids = getNodePayload(e);
          if (ids.length) dispatch(moveNodes(ids, null));
          else if (e.dataTransfer.files.length) {
            void handleExternalDrop(Array.from(e.dataTransfer.files), null);
          }
        }}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          "focus-visible:ring-app-border-accent py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset",
          dropTarget === null && "bg-app-accent-faint",
        )}
      >
        {/* Rows unfold when a folder expands and fold away when it collapses
            (or a node is deleted). `initial={false}`: the first render — and
            re-showing the sidebar — paints the tree without animating it. */}
        <AnimatePresence initial={false} custom={instantRows}>
          {rows.map((row) => (
            <Unfold
              key={row.kind === "node" ? row.node.id : "draft"}
              custom={instantRows}
              variants={ROW_VARIANTS}
              initial="folded"
              animate="unfolded"
              exit="folded"
            >
              {row.kind === "node" ? (
                <TreeRow
                  node={row.node}
                  depth={row.depth}
                  dropTargetId={dropTarget}
                  onDropTarget={setDropTarget}
                  dropLine={
                    dropLine?.id === row.node.id ? dropLine.position : undefined
                  }
                  onDropLine={setDropLine}
                  onExternalDrop={(files, parentId) =>
                    void handleExternalDrop(files, parentId)
                  }
                  onSelectClick={onSelectClick}
                  getDragIds={getDragIds}
                />
              ) : (
                <DraftRow parentId={row.parentId} depth={row.depth} />
              )}
            </Unfold>
          ))}
        </AnimatePresence>
        {isEmpty ? (
          <EmptyState
            onNewFile={() => startCreate("file")}
            onNewFolder={() => startCreate("folder")}
            onImport={() => dispatch(uiActions.importOpened(null))}
          />
        ) : (
          // Spare room below the last row: a click clears the selection and a
          // drop lands in the root.
          <div
            className="h-16"
            onClick={() => dispatch(fsActions.selected(null))}
          />
        )}
      </m.div>

      {/* Shown only while there is something to say: a multi-selection or
          an import notice. */}
      {selectionCount > 1 || notice ? (
        <SidebarFooter className="justify-between">
          {selectionCount > 1 ? (
            <span
              className="explorer-footer__item"
              data-testid="explorer-selection-count"
              title="⌘/Ctrl-click to add or remove · Shift-click for a range · Esc to clear"
            >
              <IconFiles aria-hidden className="explorer-footer__icon" />
              {selectionCount} selected
            </span>
          ) : (
            <span />
          )}
          {notice ? (
            <button
              type="button"
              data-testid="explorer-notice-dismiss-button"
              onClick={() => setNotice(null)}
              className="explorer-footer__notice"
              title={`${notice} — click to dismiss`}
              aria-label={`${notice}. Dismiss`}
            >
              <IconAlertTriangle
                aria-hidden
                className="explorer-footer__icon"
              />
              <span className="explorer-footer__notice-text">{notice}</span>
              <IconX aria-hidden className="explorer-footer__icon" />
            </button>
          ) : null}
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}

function DraftRow({
  parentId,
  depth,
}: {
  parentId: string | null;
  depth: number;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const draft = useAppSelector((s) => s.fs.draft);
  const nodeType = draft?.mode === "create" ? draft.nodeType : "file";
  const validate = React.useCallback(
    (v: string) => validateName(nodes, parentId, v, nodeType),
    [nodes, parentId, nodeType],
  );
  if (draft?.mode !== "create") return null;
  const isFolder = draft.nodeType === "folder";

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected
      data-testid="tree-draft-row"
      className="bg-app-selected relative flex items-center gap-1.5 pr-1"
      style={{ paddingLeft: rowPadding(depth), height: ROW_HEIGHT }}
    >
      <IndentGuides depth={depth} />
      <span className="size-4 shrink-0" />
      {isFolder ? <FolderIcon open={false} /> : <FileIcon name="new.md" />}
      <NameInput
        data-testid="tree-create-input"
        placeholder={isFolder ? "Folder name" : "File name (.md by default)"}
        validate={validate}
        suggest={isFolder ? undefined : suggestFileNames}
        onCommit={(v) => dispatch(commitCreate(v))}
        onCancel={() => dispatch(fsActions.draftCancelled())}
      />
    </div>
  );
}

/** Header "Sort" button: sorts every folder in the workspace at once. */
function SortAction() {
  const dispatch = useAppDispatch();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Sort all folders"
              data-testid="explorer-sort-button"
              className="text-app-dim hover:text-app-accent size-6 bg-transparent [&_svg:not([class*='size-'])]:size-3.5"
            >
              <IconArrowsSort />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Sort all folders</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Sort all folders by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.key}
            data-testid={`explorer-sort-${option.key}-item`}
            onSelect={() => dispatch(sortChildren(null, option.key, true))}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeaderAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="text-app-dim hover:text-app-accent size-6 bg-transparent [&_svg:not([class*='size-'])]:size-3.5"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({
  onNewFile,
  onNewFolder,
  onImport,
}: {
  onNewFile: () => void;
  onNewFolder: () => void;
  onImport: () => void;
}) {
  const actions = [
    {
      label: "New note",
      sub: "Markdown — the main editor",
      tone: "var(--app-accent)",
      Icon: IconFilePlus,
      onClick: onNewFile,
    },
    {
      label: "New folder",
      sub: "Group notes and documents",
      tone: "var(--app-warn)",
      Icon: IconFolderPlus,
      onClick: onNewFolder,
    },
    {
      label: "Import files",
      sub: "PDF, Word, Excel, CSV, Schema, Markdown",
      tone: "var(--app-success)",
      Icon: IconUpload,
      onClick: onImport,
    },
  ];

  return (
    <div data-testid="explorer-empty" className="flex flex-col gap-4 px-3 py-6">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span
          aria-hidden
          className="tint-current text-app-accent mb-1 flex size-10 items-center justify-center rounded-lg border"
        >
          <IconNotebook className="size-5" />
        </span>
        <p className="font-title text-app-bright text-[12px] font-semibold">
          Your workspace is empty
        </p>
        <p className={ui.help}>
          Start writing, organise with folders, or bring in files you already
          have.
        </p>
      </div>

      <div className="divide-app-border border-app-border flex flex-col divide-y overflow-hidden rounded-md border">
        {actions.map(({ label, sub, tone, Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className={ui.actionCard}
            style={{ color: tone }}
          >
            <span className={ui.actionCardIcon}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 text-left">
              <span className={ui.actionCardTitle}>{label}</span>
              <span className={ui.actionCardSub}>{sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="border-app-border-mid font-description text-app-dim flex items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-3 text-[11px]">
        <IconDragDrop aria-hidden className="size-4 shrink-0" />
        Or drop files anywhere in this panel
      </div>
    </div>
  );
}
