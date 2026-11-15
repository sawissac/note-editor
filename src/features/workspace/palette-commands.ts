import {
  IconBinaryTree,
  IconCopy,
  IconCopyPlus,
  IconDatabaseExport,
  IconDownload,
  IconFileExport,
  IconFilePlus,
  IconFoldDown,
  IconFoldUp,
  IconFocus2,
  IconFolderPlus,
  IconInfoHexagon,
  IconLayoutSidebar,
  IconLink,
  IconPencil,
  IconSquareX,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type * as React from "react";

import {
  collapseAll,
  downloadNode,
  duplicateNode,
  expandAll,
  exportWorkspace,
  openAppFile,
  revealInExplorer,
  startRename,
} from "@/store/actions";
import { APP_FILES } from "@/lib/file-types";
import type { AppDispatch, RootState } from "@/store";
import { fsActions, type NodeType } from "@/store/fs-slice";
import {
  getPath,
  getTargetFolderId,
  selectSidebarVisible,
} from "@/store/selectors";
import { tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";

export type PaletteCommand = {
  id: string;
  label: string;
  group: "File" | "Workspace" | "Tabs";
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Extra words the filter matches, e.g. synonyms. */
  keywords?: string;
  run: () => void;
};

/**
 * Everything the `>` mode of quick open can run, given the current state.
 * Commands about "this file" only appear while a tab is active.
 */
export function buildCommands(
  state: RootState,
  dispatch: AppDispatch,
): PaletteCommand[] {
  const { nodes, selectedId } = state.fs;
  const { activeId, openIds } = state.tabs;
  const active = activeId ? nodes[activeId] : undefined;
  const target = getTargetFolderId(nodes, selectedId);

  const startCreate = (nodeType: NodeType) => {
    dispatch(uiActions.sidebarSet(true));
    dispatch(
      fsActions.draftStarted({ mode: "create", nodeType, parentId: target }),
    );
  };

  const list: PaletteCommand[] = [
    {
      id: "new-file",
      label: "New file…",
      group: "Workspace",
      icon: IconFilePlus,
      keywords: "create add document",
      run: () => startCreate("file"),
    },
    {
      id: "new-folder",
      label: "New folder…",
      group: "Workspace",
      icon: IconFolderPlus,
      keywords: "create add directory",
      run: () => startCreate("folder"),
    },
    {
      id: "import",
      label: "Import files from your computer…",
      group: "Workspace",
      icon: IconUpload,
      keywords: "upload open add",
      run: () => dispatch(uiActions.importOpened(target)),
    },
    {
      id: "export",
      label: "Export files as one PDF…",
      group: "Workspace",
      icon: IconFileExport,
      keywords: "print merge unified",
      run: () => dispatch(uiActions.unifiedExportSet(true)),
    },
    {
      id: "export-workspace",
      label: "Export workspace (all files and state) as one backup…",
      group: "Workspace",
      icon: IconDatabaseExport,
      keywords: "backup save download everything json data state",
      run: () => void dispatch(exportWorkspace()),
    },
    {
      id: "toggle-sidebar",
      label: selectSidebarVisible(state) ? "Hide sidebar" : "Show sidebar",
      group: "Workspace",
      icon: IconLayoutSidebar,
      keywords: "explorer toggle panel",
      run: () => dispatch(uiActions.sidebarToggled()),
    },
    {
      id: "expand-all",
      label: "Expand all folders",
      group: "Workspace",
      icon: IconFoldDown,
      keywords: "explorer open tree",
      run: () => {
        dispatch(uiActions.sidebarSet(true));
        dispatch(expandAll());
      },
    },
    {
      id: "app-info",
      label: "Open app info (supported extensions)",
      group: "Workspace",
      icon: IconInfoHexagon,
      keywords: "app.info about extensions file types formats",
      run: () => dispatch(openAppFile(APP_FILES.info)),
    },
    {
      id: "app-state",
      label: "Open app state (live store graph)",
      group: "Workspace",
      icon: IconBinaryTree,
      keywords: "app.state redux store debug tree d3",
      run: () => dispatch(openAppFile(APP_FILES.state)),
    },
    {
      id: "collapse-all",
      label: "Collapse all folders",
      group: "Workspace",
      icon: IconFoldUp,
      keywords: "explorer close tree",
      run: () => dispatch(collapseAll()),
    },
  ];

  if (active) {
    const path = getPath(nodes, active.id).join("/");
    list.unshift(
      {
        id: "reveal",
        label: `Reveal ${active.name} in explorer`,
        group: "File",
        icon: IconFocus2,
        keywords: "locate show find sidebar",
        run: () => dispatch(revealInExplorer(active.id)),
      },
      {
        id: "rename",
        label: `Rename ${active.name}…`,
        group: "File",
        icon: IconPencil,
        keywords: "move name",
        run: () => dispatch(startRename(active.id)),
      },
      {
        id: "duplicate",
        label: `Duplicate ${active.name}`,
        group: "File",
        icon: IconCopyPlus,
        keywords: "copy clone",
        run: () => void dispatch(duplicateNode(active.id)),
      },
      {
        id: "download",
        label: `Download ${active.name}`,
        group: "File",
        icon: IconDownload,
        keywords: "save export",
        run: () => void dispatch(downloadNode(active.id)),
      },
      {
        id: "copy-path",
        label: "Copy path of active file",
        group: "File",
        icon: IconLink,
        keywords: "clipboard location",
        run: () => void navigator.clipboard.writeText(path),
      },
      {
        id: "copy-name",
        label: "Copy name of active file",
        group: "File",
        icon: IconCopy,
        keywords: "clipboard filename",
        run: () => void navigator.clipboard.writeText(active.name),
      },
      {
        id: "delete",
        label: `Delete ${active.name}…`,
        group: "File",
        icon: IconTrash,
        keywords: "remove trash",
        run: () => dispatch(uiActions.deleteRequested(active.id)),
      },
      {
        id: "close-tab",
        label: "Close tab",
        group: "Tabs",
        icon: IconX,
        keywords: "editor",
        run: () => dispatch(tabsActions.closed(active.id)),
      },
    );
    if (openIds.length > 1) {
      list.push({
        id: "close-others",
        label: "Close other tabs",
        group: "Tabs",
        icon: IconSquareX,
        keywords: "editor",
        run: () => dispatch(tabsActions.closedOthers(active.id)),
      });
    }
  }
  if (openIds.length) {
    list.push({
      id: "close-all",
      label: "Close all tabs",
      group: "Tabs",
      icon: IconSquareX,
      keywords: "editor",
      run: () => dispatch(tabsActions.closedAll()),
    });
  }
  return list;
}
