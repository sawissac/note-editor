import {
  baseNameLength,
  BINARY_KINDS,
  CREATABLE_EXTENSIONS,
  downloadTarget,
  extensionOf,
  type FileKind,
  isAppFileName,
  isEnvName,
  isImportable,
  KIND_LABEL,
  kindOf,
} from "@/lib/file-types";
import { imageFormatOf } from "@/lib/image-formats";
import {
  downloadFile,
  type FileContent,
  storage,
  toArrayBuffer,
} from "@/lib/storage";
import { type FsNode, fsActions, type NodeType } from "@/store/fs-slice";
import type { AppThunk } from "@/store";
import {
  collator,
  getAncestorIds,
  getDescendantIds,
  getPath,
  getSortedChildren,
  isNameTaken,
  uniqueName,
} from "@/store/selectors";
import { tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";

// Lazy: the blank templates pull in the diff / calendar / kanban / qr doc
// modules, which only matter once someone creates such a file.
const blankContent = (kind: FileKind) =>
  import("@/lib/blank-documents").then((m) => m.blankContent(kind));

function newId() {
  return crypto.randomUUID();
}

function makeNode(
  name: string,
  type: NodeType,
  parentId: string | null,
): FsNode {
  const now = Date.now();
  return { id: newId(), name, type, parentId, createdAt: now, updatedAt: now };
}

/**
 * Validates a name typed into the tree. Returns a message, or null when the
 * name is usable. `type` decides whether an extension is enforced.
 */
export function validateName(
  nodes: Record<string, FsNode>,
  parentId: string | null,
  rawName: string,
  type: NodeType,
  exceptId?: string,
): string | null {
  const name = normalizeName(rawName, type);
  if (!name) return "A name is required.";
  if (/[\\/:*?"<>|]/.test(name))
    return 'Names cannot contain \\ / : * ? " < > |';
  if (name === "." || name === "..") return "That name is reserved.";
  if (isNameTaken(nodes, parentId, name, exceptId)) {
    return `"${name}" already exists here.`;
  }
  const renamed = exceptId ? nodes[exceptId] : undefined;
  if (type === "file" && renamed) {
    const from = kindOf(renamed.name);
    const to = kindOf(name);
    if (from !== to && BINARY_KINDS.has(from)) {
      return `Keep the .${extensionOf(renamed.name)} extension — ${KIND_LABEL[from]} files can't change type.`;
    }
    if (from !== to && BINARY_KINDS.has(to)) {
      return `A ${KIND_LABEL[from]} file can't become ${KIND_LABEL[to]} — its content isn't converted.`;
    }
  }
  if (type === "file" && !exceptId) {
    const ext = extensionOf(name);
    if (
      !CREATABLE_EXTENSIONS.includes(ext) &&
      !isEnvName(name) &&
      !isAppFileName(name)
    ) {
      return `New files can be .${CREATABLE_EXTENSIONS.join(", .")}.`;
    }
  }
  return null;
}

/** Trims, and gives an extension-less new file the default `.md`. */
export function normalizeName(rawName: string, type: NodeType) {
  const name = rawName.trim();
  if (type === "file" && name && !extensionOf(name)) return `${name}.md`;
  return name;
}

/** Folder ids inside `folderId` (itself included), or every folder for null. */
function folderIdsUnder(
  nodes: Record<string, FsNode>,
  folderId: string | null,
) {
  const ids = folderId ? getDescendantIds(nodes, folderId) : Object.keys(nodes);
  return ids.filter((id) => nodes[id]?.type === "folder");
}

/** Expands every folder in the workspace, or every folder under one. */
export function expandAll(folderId: string | null = null): AppThunk {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    dispatch(fsActions.expandedMany(folderIdsUnder(nodes, folderId)));
  };
}

/** Collapses one folder and everything inside it. */
export function collapseAll(folderId: string | null = null): AppThunk {
  return (dispatch, getState) => {
    if (!folderId) {
      dispatch(fsActions.collapsedAll());
      return;
    }
    const { nodes } = getState().fs;
    dispatch(fsActions.collapsedMany(folderIdsUnder(nodes, folderId)));
  };
}

/** Selects, reveals and opens a file in a tab. */
export function openFile(id: string): AppThunk {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const node = nodes[id];
    if (!node || node.type !== "file") return;
    for (const ancestor of getAncestorIds(nodes, id)) {
      dispatch(fsActions.expandedSet({ id: ancestor, open: true }));
    }
    dispatch(fsActions.selected(id));
    dispatch(tabsActions.opened(id));
  };
}

export function commitCreate(rawName: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { draft, nodes } = getState().fs;
    if (!draft || draft.mode !== "create") return false;
    if (validateName(nodes, draft.parentId, rawName, draft.nodeType)) {
      return false;
    }
    dispatch(fsActions.draftCancelled());
    const node = dispatch(
      addEntry(
        normalizeName(rawName, draft.nodeType),
        draft.nodeType,
        draft.parentId,
      ),
    );
    // Land where the input was: right below the sibling it was opened
    // under, via the same manual order drag-to-reorder sets.
    const { afterId } = draft;
    if (afterId && getState().fs.nodes[afterId]?.parentId === draft.parentId) {
      const order = getSortedChildren(getState().fs.nodes, draft.parentId)
        .map((n) => n.id)
        .filter((id) => id !== node.id);
      order.splice(order.indexOf(afterId) + 1, 0, node.id);
      dispatch(fsActions.childrenOrdered(order));
    }
    return true;
  };
}

/**
 * Adds a file or folder whose name is already validated and normalized, then
 * gets it ready: a file gets its blank template and opens in a tab, a folder
 * expands.
 */
function addEntry(
  name: string,
  type: NodeType,
  parentId: string | null,
): AppThunk<FsNode> {
  return (dispatch) => {
    const node = makeNode(name, type, parentId);
    dispatch(fsActions.nodesAdded([node]));
    dispatch(fsActions.selected(node.id));
    if (node.type === "file") {
      const kind = kindOf(name);
      if (BINARY_KINDS.has(kind)) {
        // Word / Excel / PDF start from a blank template; open once it is
        // stored so the editor never sees an empty file.
        void blankContent(kind)
          .then((content) => storage.setContent(node.id, content))
          .then(() => {
            // The Word editor puts the caret in the empty document.
            dispatch(uiActions.focusRequested(node.id));
            dispatch(openFile(node.id));
          });
      } else if (
        kind === "calendar" ||
        kind === "kanban" ||
        kind === "json" ||
        kind === "sql" ||
        kind === "regex" ||
        kind === "diff" ||
        kind === "qr" ||
        kind === "timer" ||
        kind === "bookmark" ||
        kind === "pptx" ||
        kind === "chat"
      ) {
        void blankContent(kind)
          .then((content) => storage.setContent(node.id, content))
          .then(() => dispatch(openFile(node.id)));
      } else if (kind === "mermaid" || kind === "random") {
        // Starts from a sample, opened in the split editor.
        dispatch(tabsActions.modeSet({ id: node.id, mode: "edit" }));
        void blankContent(kind)
          .then((content) => storage.setContent(node.id, content))
          .then(() => {
            dispatch(uiActions.focusRequested(node.id));
            dispatch(openFile(node.id));
          });
      } else {
        void storage.setContent(node.id, "");
        // An empty CSV has no table to show yet — open it in the raw editor.
        if (kind === "csv") {
          dispatch(tabsActions.modeSet({ id: node.id, mode: "edit" }));
        }
        dispatch(uiActions.focusRequested(node.id));
        dispatch(openFile(node.id));
      }
    } else {
      dispatch(fsActions.expandedSet({ id: node.id, open: true }));
    }
    return node;
  };
}

/** What creating `rawPath` from the quick-open box would do. */
export type CreatePlan = {
  type: NodeType;
  /** Deepest folder that already exists on the path (null = root). */
  parentId: string | null;
  /** Folder names still to create under `parentId`, outermost first. */
  folders: string[];
  /** Final name, with `.md` added to an extension-less file. */
  name: string;
  /** Where the new entry lands, e.g. `docs / notes`; empty for the root. */
  location: string;
  /** Why it cannot be created, or null. */
  error: string | null;
  /** A node already at that exact path — open it instead. */
  existingId: string | null;
};

function findChild(
  nodes: Record<string, FsNode>,
  parentId: string | null,
  name: string,
) {
  const lower = name.toLowerCase();
  return Object.values(nodes).find(
    (n) => n.parentId === parentId && n.name.toLowerCase() === lower,
  );
}

/**
 * Resolves a typed path such as `notes/2026/todo` against `baseId` (a
 * leading `/` starts at the root). Missing folders on the way are created
 * along with the entry.
 */
export function planCreate(
  nodes: Record<string, FsNode>,
  baseId: string | null,
  rawPath: string,
  type: NodeType,
): CreatePlan {
  const trimmed = rawPath.trim();
  const parts = trimmed
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const rawName = parts.pop() ?? "";
  let parentId = trimmed.startsWith("/") ? null : baseId;
  const folders: string[] = [];
  let error: string | null = null;
  for (const part of parts) {
    if (folders.length) {
      folders.push(part);
      continue;
    }
    const child = findChild(nodes, parentId, part);
    if (child?.type === "folder") parentId = child.id;
    else if (child) {
      error = `"${child.name}" is a file, not a folder.`;
      break;
    } else folders.push(part);
  }
  for (const folder of folders)
    error ??= validateName({}, null, folder, "folder");

  const name = normalizeName(rawName, type);
  const existing = folders.length
    ? undefined
    : findChild(nodes, parentId, name);
  if (existing && existing.type !== type) {
    error ??= `"${existing.name}" already exists here.`;
  } else if (!existing) {
    error ??= folders.length
      ? validateName({}, null, rawName, type)
      : validateName(nodes, parentId, rawName, type);
  }
  return {
    type,
    parentId,
    folders,
    name,
    location: [...getPath(nodes, parentId), ...folders].join(" / "),
    error,
    existingId: existing && existing.type === type ? existing.id : null,
  };
}

/**
 * Creates a file or folder at a typed path, making any missing folders on
 * the way. Returns the new node, or null when the path is not creatable.
 */
export function createAtPath(
  baseId: string | null,
  rawPath: string,
  type: NodeType,
): AppThunk<FsNode | null> {
  return (dispatch, getState) => {
    const plan = planCreate(getState().fs.nodes, baseId, rawPath, type);
    if (plan.error || plan.existingId) return null;
    let parentId = plan.parentId;
    const folders: FsNode[] = [];
    for (const name of plan.folders) {
      const folder = makeNode(name, "folder", parentId);
      folders.push(folder);
      parentId = folder.id;
    }
    if (folders.length) dispatch(fsActions.nodesAdded(folders));
    const { nodes } = getState().fs;
    const reveal = plan.parentId
      ? [...getAncestorIds(nodes, plan.parentId), plan.parentId]
      : [];
    for (const id of [...reveal, ...folders.map((f) => f.id)]) {
      dispatch(fsActions.expandedSet({ id, open: true }));
    }
    return dispatch(addEntry(plan.name, plan.type, parentId));
  };
}

/**
 * Opens `app.info` / `app.state`: the first one in the workspace, or a new
 * one at the root when there is none yet.
 */
export function openAppFile(name: string): AppThunk {
  return (dispatch, getState) => {
    const kind = kindOf(name);
    const existing = Object.values(getState().fs.nodes).find(
      (n) => n.type === "file" && kindOf(n.name) === kind,
    );
    if (existing) dispatch(openFile(existing.id));
    else dispatch(createAtPath(null, name, "file"));
  };
}

/** Shows the sidebar and selects `id` there, expanding its folders. */
export function revealInExplorer(id: string): AppThunk {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const node = nodes[id];
    if (!node) return;
    dispatch(uiActions.sidebarSet(true));
    for (const ancestor of getAncestorIds(nodes, id)) {
      dispatch(fsActions.expandedSet({ id: ancestor, open: true }));
    }
    if (node.type === "folder") {
      dispatch(fsActions.expandedSet({ id, open: true }));
    }
    dispatch(fsActions.selected(id));
  };
}

/** Starts the explorer's inline rename on `id`. */
export function startRename(id: string): AppThunk {
  return (dispatch) => {
    dispatch(revealInExplorer(id));
    dispatch(fsActions.draftStarted({ mode: "rename", id }));
  };
}

/** Saves a file from the workspace to the computer. */
export function downloadNode(id: string): AppThunk<Promise<void>> {
  return async (_dispatch, getState) => {
    const node = getState().fs.nodes[id];
    if (!node || node.type !== "file") return;
    const content = await storage.getContent(node.id);
    const target = downloadTarget(node.name, content);
    downloadFile(target.name, content ?? "", target.mime);
  };
}

export function commitRename(rawName: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { draft, nodes } = getState().fs;
    if (!draft || draft.mode !== "rename") return false;
    const node = nodes[draft.id];
    if (!node) return false;
    const name = rawName.trim();
    if (name === node.name) {
      dispatch(fsActions.draftCancelled());
      return true;
    }
    if (validateName(nodes, node.parentId, name, node.type, node.id)) {
      return false;
    }
    dispatch(fsActions.nodeRenamed({ id: node.id, name }));
    dispatch(fsActions.draftCancelled());
    return true;
  };
}

export function deleteNode(id: string): AppThunk {
  return deleteNodes([id]);
}

/**
 * Drops ids whose ancestor is also in the list — moving or deleting a folder
 * already takes its contents along.
 */
export function topLevelIds(nodes: Record<string, FsNode>, ids: string[]) {
  const set = new Set(ids);
  return ids.filter(
    (id) => nodes[id] && !getAncestorIds(nodes, id).some((a) => set.has(a)),
  );
}

/** Deletes several rows (and everything inside the folders among them). */
export function deleteNodes(targetIds: string[]): AppThunk {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const ids = [
      ...new Set(
        topLevelIds(nodes, targetIds).flatMap((id) =>
          getDescendantIds(nodes, id),
        ),
      ),
    ];
    dispatch(uiActions.deleteRequested(null));
    if (!ids.length) return;
    dispatch(fsActions.nodesRemoved(ids));
    for (const removed of ids) void storage.removeContent(removed);
  };
}

/**
 * Adds a file whose content is already made (e.g. an image converted to
 * another format) into `parentId`, under a free name, and opens it (unless
 * `open` is `false`).
 */
export function addFileWithContent(
  name: string,
  parentId: string | null,
  content: FileContent,
  { open = true }: { open?: boolean } = {},
): AppThunk<Promise<FsNode>> {
  return async (dispatch, getState) => {
    const node = makeNode(
      uniqueName(getState().fs.nodes, parentId, name),
      "file",
      parentId,
    );
    await storage.setContent(node.id, content);
    dispatch(fsActions.nodesAdded([node]));
    if (open) dispatch(openFile(node.id));
    return node;
  };
}

/** Copies a file or a whole folder next to the original. */
export function duplicateNode(id: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { nodes } = getState().fs;
    const source = nodes[id];
    if (!source) return;
    const created: FsNode[] = [];
    const copies: Array<[string, string]> = [];
    const copy = (node: FsNode, parentId: string | null, name: string) => {
      const next = makeNode(name, node.type, parentId);
      created.push(next);
      if (node.type === "file") copies.push([node.id, next.id]);
      for (const child of Object.values(nodes)) {
        if (child.parentId === node.id) copy(child, next.id, child.name);
      }
      return next;
    };
    const root = copy(
      source,
      source.parentId,
      uniqueName(nodes, source.parentId, source.name),
    );
    await Promise.all(
      copies.map(async ([from, to]) => {
        const value = await storage.getContent(from);
        await storage.setContent(to, value ?? "");
      }),
    );
    dispatch(fsActions.nodesAdded(created));
    dispatch(fsActions.selected(root.id));
  };
}

/**
 * Stores `content` as a new file next to `sourceId` (name made unique), then
 * selects and opens it. Used by "Convert to" — the source is left untouched.
 */
export function createSiblingFile(
  sourceId: string,
  name: string,
  content: FileContent,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { nodes } = getState().fs;
    const source = nodes[sourceId];
    if (!source) return;
    const node = makeNode(
      uniqueName(nodes, source.parentId, name),
      "file",
      source.parentId,
    );
    await storage.setContent(node.id, content);
    dispatch(fsActions.nodesAdded([node]));
    // Place the copy right below its source (e.g. a conversion sits under
    // the file it came from), using the same manual sibling order that
    // drag-to-reorder sets. "Sort folder by name" goes back to A–Z.
    const order = getSortedChildren(getState().fs.nodes, source.parentId)
      .map((n) => n.id)
      .filter((id) => id !== node.id);
    order.splice(order.indexOf(sourceId) + 1, 0, node.id);
    dispatch(fsActions.childrenOrdered(order));
    dispatch(openFile(node.id));
  };
}

/** Moves a node into `parentId`. Refuses to move a folder into itself. */
/**
 * Moves every movable row in `ids` into `parentId` (null = root) and keeps
 * them selected. Rows already there, or a folder dropped into itself, are
 * skipped. Returns how many moved.
 */
export function moveNodes(
  ids: string[],
  parentId: string | null,
): AppThunk<number> {
  return (dispatch, getState) => {
    const moved: string[] = [];
    for (const id of topLevelIds(getState().fs.nodes, ids)) {
      const { nodes } = getState().fs;
      const node = nodes[id];
      if (!node || node.parentId === parentId) continue;
      if (parentId && getDescendantIds(nodes, id).includes(parentId)) continue;
      const name = uniqueName(nodes, parentId, node.name, node.id);
      dispatch(fsActions.nodeMoved({ id, parentId, name }));
      moved.push(id);
    }
    if (!moved.length) return 0;
    if (parentId) dispatch(fsActions.expandedSet({ id: parentId, open: true }));
    if (moved.length === 1) dispatch(fsActions.selected(moved[0]));
    else {
      dispatch(fsActions.selected(moved[0]));
      dispatch(fsActions.selectionSet({ ids: moved, focusId: moved.at(-1)! }));
    }
    return moved.length;
  };
}

/** Where a reordering drop lands relative to the row under the pointer. */
export type DropPosition = "before" | "after";

/**
 * Drag-to-reorder: puts `ids` just before / after `targetId`, moving them
 * into the target's folder first when they come from elsewhere. Files and
 * folders can be placed in any order. Returns false when nothing could be
 * placed (e.g. a folder dropped next to its own child).
 */
export function reorderNodes(
  ids: string[],
  targetId: string,
  position: DropPosition,
): AppThunk<boolean> {
  return (dispatch, getState) => {
    const start = getState().fs.nodes;
    const target = start[targetId];
    if (!target) return false;
    const parentId = target.parentId;
    const dragged = topLevelIds(start, ids).filter(
      (id) => !getDescendantIds(start, id).includes(targetId),
    );
    if (!dragged.length) return false;
    dispatch(moveNodes(dragged, parentId));

    const { nodes } = getState().fs;
    const placed = dragged.filter((id) => nodes[id]?.parentId === parentId);
    if (!placed.length) return false;
    const picked = new Set(placed);
    const order = getSortedChildren(nodes, parentId)
      .map((n) => n.id)
      .filter((id) => !picked.has(id));
    const at = order.indexOf(targetId) + (position === "after" ? 1 : 0);
    order.splice(at, 0, ...placed);
    dispatch(fsActions.childrenOrdered(order));

    dispatch(fsActions.selected(placed[0]));
    if (placed.length > 1) {
      dispatch(
        fsActions.selectionSet({ ids: placed, focusId: placed.at(-1)! }),
      );
    }
    return true;
  };
}

/** How "Sort by" orders a folder's contents. Folders go on top. */
export type SortKey = "name" | "name-desc" | "modified" | "created" | "type";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name (A–Z)" },
  { key: "name-desc", label: "Name (Z–A)" },
  { key: "modified", label: "Last modified" },
  { key: "created", label: "Date created" },
  { key: "type", label: "Type" },
];

const SORT_COMPARE: Record<
  Exclude<SortKey, "name">,
  (a: FsNode, b: FsNode) => number
> = {
  "name-desc": (a, b) => collator.compare(b.name, a.name),
  modified: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  type: (a, b) =>
    collator.compare(extensionOf(a.name), extensionOf(b.name)) ||
    collator.compare(a.name, b.name),
};

/**
 * Sorts the contents of `parentId` (null = root) once, writing the result as
 * the manual order — later drags still adjust it. "name" clears the manual
 * order instead, so new rows keep landing in A–Z place. `deep` also sorts
 * every folder underneath.
 */
export function sortChildren(
  parentId: string | null,
  key: SortKey,
  deep = false,
): AppThunk {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const folderIds: (string | null)[] = [parentId];
    if (deep) {
      const below = parentId
        ? getDescendantIds(nodes, parentId).slice(1)
        : Object.keys(nodes);
      for (const id of below) {
        if (nodes[id]?.type === "folder") folderIds.push(id);
      }
    }
    for (const folderId of folderIds) {
      if (key === "name") {
        dispatch(fsActions.orderCleared(folderId));
        continue;
      }
      const compare = SORT_COMPARE[key];
      const sorted = Object.values(nodes)
        .filter((n) => n.parentId === folderId)
        .sort(
          (a, b) =>
            (a.type === b.type ? 0 : a.type === "folder" ? -1 : 1) ||
            compare(a, b) ||
            collator.compare(a.name, b.name),
        );
      if (sorted.length) {
        dispatch(fsActions.childrenOrdered(sorted.map((n) => n.id)));
      }
    }
  };
}

/** Alt+↑ / Alt+↓: swaps a row with its neighbour (file or folder). */
export function shiftNode(id: string, delta: -1 | 1): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const node = nodes[id];
    if (!node) return false;
    const siblings = getSortedChildren(nodes, node.parentId);
    const i = siblings.findIndex((n) => n.id === id);
    const other = siblings[i + delta];
    if (!other) return false;
    siblings[i] = other;
    siblings[i + delta] = node;
    dispatch(fsActions.childrenOrdered(siblings.map((n) => n.id)));
    return true;
  };
}

export function moveNode(
  id: string,
  parentId: string | null,
): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const node = nodes[id];
    if (!node || node.parentId === parentId) return false;
    if (parentId && getDescendantIds(nodes, id).includes(parentId))
      return false;
    const name = uniqueName(nodes, parentId, node.name, node.id);
    dispatch(fsActions.nodeMoved({ id, parentId, name }));
    if (parentId) dispatch(fsActions.expandedSet({ id: parentId, open: true }));
    dispatch(fsActions.selected(id));
    return true;
  };
}

/** Reads dropped / picked files into the workspace. Returns skipped names. */
export function importFiles(
  files: File[],
  parentId: string | null,
): AppThunk<Promise<string[]>> {
  return async (dispatch, getState) => {
    const skipped: string[] = [];
    const created: FsNode[] = [];
    for (const file of files) {
      if (!isImportable(file.name)) {
        skipped.push(file.name);
        continue;
      }
      const taken = { ...getState().fs.nodes };
      for (const n of created) taken[n.id] = n;
      // Image files (photo.png, scan.tiff, …) arrive as `.img` files.
      const name = imageFormatOf(file.name)
        ? `${file.name.slice(0, baseNameLength(file.name))}.img`
        : file.name;
      const node = makeNode(
        uniqueName(taken, parentId, name),
        "file",
        parentId,
      );
      const content: FileContent = BINARY_KINDS.has(kindOf(name))
        ? await file.arrayBuffer()
        : await file.text();
      await storage.setContent(node.id, content);
      created.push(node);
    }
    if (created.length) {
      dispatch(fsActions.nodesAdded(created));
      if (parentId)
        dispatch(fsActions.expandedSet({ id: parentId, open: true }));
      dispatch(openFile(created[0].id));
    }
    return skipped;
  };
}

/**
 * Downloads the whole workspace — tree, tabs, every file's content and the
 * app's localStorage — as one JSON backup. Resolves to the file count.
 */
export function exportWorkspace(): AppThunk<Promise<number>> {
  return async (dispatch, getState) => {
    const { fs, tabs, ui } = getState();
    try {
      // Lazy: date-fns and the backup builder stay out of the boot bundle.
      const { backupFileName, buildWorkspaceBackup } =
        await import("@/lib/workspace-backup");
      const backup = await buildWorkspaceBackup({
        workspace: {
          fs: {
            nodes: fs.nodes,
            expanded: fs.expanded,
            selectedId: fs.selectedId,
          },
          tabs,
          sidebarOpen: ui.sidebarOpen,
        },
        pathOf: (id) => getPath(fs.nodes, id).join("/"),
        readContent: (id) => storage.getContent(id),
      });
      downloadFile(
        backupFileName(),
        JSON.stringify(backup, null, 2),
        "application/json",
      );
      return Object.keys(backup.files).length;
    } catch (error) {
      console.error(error);
      dispatch(
        uiActions.explorerNoticeSet(
          "Workspace export failed — see the console for details.",
        ),
      );
      return 0;
    }
  };
}

export function saveContent(
  id: string,
  value: string | ArrayBuffer | Uint8Array,
): AppThunk<Promise<void>> {
  return async (dispatch) => {
    dispatch(uiActions.saveStateSet({ id, state: "saving" }));
    try {
      await storage.setContent(
        id,
        typeof value === "string" ? value : toArrayBuffer(value),
      );
      dispatch(fsActions.nodeTouched(id));
      dispatch(uiActions.saveStateSet({ id, state: "saved" }));
    } catch (error) {
      console.error(error);
      dispatch(uiActions.saveStateSet({ id, state: "error" }));
    }
  };
}

export const WELCOME_MARKDOWN = `# Welcome to Bento

Everything you write here is saved in this browser (IndexedDB), automatically.

## Getting around

- **Explorer** (left): click a file to open it, double-click or press **F2** to rename, **Delete** to remove. Drag files onto folders to move them.
- **Right-click** any row for more actions — new file, duplicate, download.
- **Tabs** (top): scroll them with the mouse wheel, middle-click to close, drag to reorder.
- **⌘/Ctrl + P** quick-opens any file — or type a name / path (\`notes/todo\`) to create it. Start with **>** for commands (**⌘/Ctrl + Shift + P**) or **#** to search inside files (**⌘/Ctrl + Shift + F**). Every file saves automatically as you type. In code editors, **Control + S** (macOS) or **Ctrl + Space** shows autocomplete.

## File types

| Type | Opens in |
| --- | --- |
| \`.md\` | Markdown editor |
| \`.csv\` | Table viewer + raw editor |
| \`.pdf\` | PDF editor / viewer |
| \`.docx\` | Word editor |
| \`.xlsx\` | Excel editor / viewer |
| \`.schema\` | JSON Schema builder + raw editor |
| \`.mermaid\` | Mermaid diagram preview + live editor |
| \`.calendar\` | Calendar — day, week, month and year views |
| \`.kanban\` | Board — drag cards between columns |
| \`.json\` \`.yaml\` \`.toml\` | Editor with error checking + Format |
| \`.sql\` | SQL editor — runs in an in-browser SQLite |
| \`.env\` | Environment variables editor with error checking |
| \`.regex\` | Regex tester — live matches, explanation, autocomplete |
| \`.diff\` | Compare two files of the same type side by side |
| \`.qr\` | QR code designer — download as PNG, SVG, JPEG or WebP |
| \`.img\` | Image editor — import any image, crop, resize, adjust, convert |
| \`.timer\` | Multiple timers — run them together or as a queue |
| \`.random\` | Random picker — list values (CSV), draw any number of them |
| \`.bookmark\` | Bookmark manager — links with tags, folders, descriptions and website previews |
| \`.pptx\` | Slide editor — text, shapes, pictures and colours; present, or export to .pptx / PDF |
| \`.chat\` | Chat with Gemini or OpenRouter, using a key from a \`.gemini\` / \`.openrouter\` file |

Create any of these from the explorer — type a name and pick the type — or use **Import** to bring in files you already have.
`;

/** First run: only the welcome note, opened. */
export function seedWorkspace(): AppThunk<Promise<void>> {
  return async (dispatch) => {
    const welcome = makeNode("Welcome.md", "file", null);
    await storage.setContent(welcome.id, WELCOME_MARKDOWN);
    dispatch(fsActions.nodesAdded([welcome]));
    dispatch(openFile(welcome.id));
  };
}

/**
 * "Ask AI" on selected text: hands the selection to a chat as a reference
 * and opens that chat. Uses the right-most open `.chat` tab, else the most
 * recently edited `.chat` file, else creates `Ask AI.chat` at the root.
 * `where` refines the label, e.g. "lines 3–8".
 */
export function askAiAboutSelection(
  sourceId: string,
  text: string,
  where?: string,
): AppThunk {
  return (dispatch, getState) => {
    const { fs, tabs } = getState();
    const source = fs.nodes[sourceId];
    if (!source || !text.trim()) return;
    const isChat = (id: string) => {
      const n = fs.nodes[id];
      return n?.type === "file" && kindOf(n.name) === "chat";
    };
    let chatId: string | undefined =
      [...tabs.openIds].reverse().find(isChat) ??
      Object.values(fs.nodes)
        .filter((n) => isChat(n.id))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
    const created = chatId
      ? null
      : dispatch(createAtPath(null, "Ask AI.chat", "file"));
    chatId ??= created?.id;
    if (!chatId) return;
    const path = getPath(fs.nodes, sourceId).join("/");
    dispatch(
      uiActions.chatReferenceAdded({
        chatId,
        path: `${path} (${where ?? "selection"})`,
        content: text,
      }),
    );
    // A new chat opens itself once its blank content is stored.
    if (!created) dispatch(openFile(chatId));
  };
}
