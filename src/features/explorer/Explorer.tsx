import {
  IconDragDrop,
  IconFilePlus,
  IconFolderPlus,
  IconFoldUp,
  IconFoldDown,
  IconLayoutSidebarLeftCollapse,
  IconNotebook,
  IconUpload,
  IconFileExport,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Sidebar,
  SidebarContent,
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
import * as ui from "@/lib/ui-styles";
import {
  collapseAll,
  commitCreate,
  expandAll,
  importFiles,
  moveNode,
  openFile,
  validateName,
} from "@/store/actions";
import { fsActions, type NodeType } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store";
import { getTargetFolderId } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";
import { hasFilePayload, hasNodePayload, NODE_MIME } from "@/features/explorer/dnd";
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
  const treeRef = React.useRef<HTMLDivElement>(null);
  // undefined = no drop in progress, null = root, string = folder id.
  const [dropTarget, setDropTarget] = React.useState<string | null | undefined>();
  const [notice, setNotice] = React.useState<string | null>(null);
  const fileCount = Object.values(nodes).filter((n) => n.type === "file").length;
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
    if (hadDraft.current && !draft && document.activeElement === document.body) {
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (draft) return;
    const nodeRows = rows.filter((r) => r.kind === "node");
    const index = nodeRows.findIndex((r) => r.node.id === selectedId);
    const current = index >= 0 ? nodeRows[index].node : undefined;
    const select = (i: number) => {
      const row = nodeRows[Math.max(0, Math.min(nodeRows.length - 1, i))];
      if (row) dispatch(fsActions.selected(row.node.id));
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        select(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        select(index < 0 ? nodeRows.length - 1 : index - 1);
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
        if (current.type === "folder" && store.getState().fs.expanded[current.id]) {
          dispatch(fsActions.expandedSet({ id: current.id, open: false }));
        } else if (current.parentId) {
          dispatch(fsActions.selected(current.parentId));
        }
        break;
      case "Enter":
      case " ":
        if (!current) break;
        e.preventDefault();
        if (current.type === "folder") dispatch(fsActions.expandedToggled(current.id));
        else dispatch(openFile(current.id));
        break;
      case "F2":
        if (!current) break;
        e.preventDefault();
        dispatch(fsActions.draftStarted({ mode: "rename", id: current.id }));
        break;
      case "Delete":
      case "Backspace":
        if (!current || (e.key === "Backspace" && !(e.metaKey || e.ctrlKey))) break;
        e.preventDefault();
        dispatch(uiActions.deleteRequested(current.id));
        break;
      case "*":
        e.preventDefault();
        dispatch(
          expandAll(
            current?.type === "folder" ? current.id : (current?.parentId ?? null),
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
        <SidebarTitle className={ui.label}>Explorer</SidebarTitle>
        <ButtonGroup aria-label="Create">
          <HeaderAction label="New file" onClick={() => startCreate("file")}>
            <IconFilePlus />
          </HeaderAction>
          <HeaderAction label="New folder" onClick={() => startCreate("folder")}>
            <IconFolderPlus />
          </HeaderAction>
          <HeaderAction
            label="Import files"
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
            label="Unified export (PDF)"
            onClick={() => dispatch(uiActions.unifiedExportSet(true))}
          >
            <IconFileExport />
          </HeaderAction>
        </ButtonGroup>
        <ButtonGroup aria-label="Folders">
          <HeaderAction label="Expand all folders" onClick={() => dispatch(expandAll())}>
            <IconFoldDown />
          </HeaderAction>
          <HeaderAction
            label="Collapse all folders"
            onClick={() => dispatch(collapseAll())}
          >
            <IconFoldUp />
          </HeaderAction>
        </ButtonGroup>
        <HeaderAction
          label="Hide sidebar"
          onClick={() => dispatch(uiActions.sidebarSet(false))}
        >
          <IconLayoutSidebarLeftCollapse />
        </HeaderAction>
      </SidebarHeader>

      <SidebarContent
        ref={treeRef}
        role="tree"
        aria-label="Files"
        tabIndex={0}
        aria-activedescendant={selectedId ? `tree-row-${selectedId}` : undefined}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target === e.currentTarget) dispatch(fsActions.selected(null));
        }}
        onDragOver={(e) => {
          if (!hasNodePayload(e) && !hasFilePayload(e)) return;
          e.preventDefault();
          setDropTarget(null);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(undefined);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(undefined);
          const id = e.dataTransfer.getData(NODE_MIME);
          if (id) dispatch(moveNode(id, null));
          else if (e.dataTransfer.files.length) {
            void handleExternalDrop(Array.from(e.dataTransfer.files), null);
          }
        }}
        className={cn(
          "py-1 outline-none focus-visible:ring-1 focus-visible:ring-app-border-accent focus-visible:ring-inset",
          dropTarget === null && "bg-app-accent-faint",
        )}
      >
        {rows.map((row) =>
          row.kind === "node" ? (
            <TreeRow
              key={row.node.id}
              node={row.node}
              depth={row.depth}
              dropTargetId={dropTarget}
              onDropTarget={setDropTarget}
              onExternalDrop={(files, parentId) =>
                void handleExternalDrop(files, parentId)
              }
            />
          ) : (
            <DraftRow key="draft" parentId={row.parentId} depth={row.depth} />
          ),
        )}
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
      </SidebarContent>

      <SidebarFooter className="justify-between">
        <span className={ui.meta}>
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </span>
        {notice ? (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="truncate font-description text-[11px] text-app-warn"
            title={notice}
          >
            {notice}
          </button>
        ) : (
          <span className={ui.meta}>Saved locally</span>
        )}
      </SidebarFooter>

    </Sidebar>
  );
}

function DraftRow({ parentId, depth }: { parentId: string | null; depth: number }) {
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
      className="relative flex items-center gap-1.5 bg-app-selected pr-1"
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
          className="size-6 bg-transparent text-app-dim hover:text-app-accent [&_svg:not([class*='size-'])]:size-3.5"
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
          className="mb-1 flex size-10 items-center justify-center rounded-lg border tint-current text-app-accent"
        >
          <IconNotebook className="size-5" />
        </span>
        <p className="font-title text-[12px] font-semibold text-app-bright">
          Your workspace is empty
        </p>
        <p className={ui.help}>
          Start writing, organise with folders, or bring in files you already
          have.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-app-border overflow-hidden rounded-md border border-app-border">
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

      <div className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-app-border-mid px-3 py-3 font-description text-[11px] text-app-dim">
        <IconDragDrop aria-hidden className="size-4 shrink-0" />
        Or drop files anywhere in this panel
      </div>
    </div>
  );
}
