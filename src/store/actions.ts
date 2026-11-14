import {
  BINARY_KINDS,
  CREATABLE_EXTENSIONS,
  extensionOf,
  isImportable,
  kindOf,
} from "@/lib/file-types";
import { blankContent } from "@/lib/blank-documents";
import { type FileContent, storage, toArrayBuffer } from "@/lib/storage";
import { type FsNode, fsActions, type NodeType } from "@/store/fs-slice";
import type { AppThunk } from "@/store";
import {
  getAncestorIds,
  getDescendantIds,
  isNameTaken,
  uniqueName,
} from "@/store/selectors";
import { tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";

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
  if (/[\\/:*?"<>|]/.test(name)) return 'Names cannot contain \\ / : * ? " < > |';
  if (name === "." || name === "..") return "That name is reserved.";
  if (isNameTaken(nodes, parentId, name, exceptId)) {
    return `"${name}" already exists here.`;
  }
  if (type === "file" && !exceptId) {
    const ext = extensionOf(name);
    if (!CREATABLE_EXTENSIONS.includes(ext)) {
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
function folderIdsUnder(nodes: Record<string, FsNode>, folderId: string | null) {
  const ids = folderId
    ? getDescendantIds(nodes, folderId)
    : Object.keys(nodes);
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
    const name = normalizeName(rawName, draft.nodeType);
    const node = makeNode(name, draft.nodeType, draft.parentId);
    dispatch(fsActions.draftCancelled());
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
      } else if (kind === "mermaid") {
        // Starts from a sample diagram, opened in the split editor.
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
    return true;
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
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    if (!nodes[id]) return;
    const ids = getDescendantIds(nodes, id);
    dispatch(fsActions.nodesRemoved(ids));
    dispatch(uiActions.deleteRequested(null));
    for (const removed of ids) void storage.removeContent(removed);
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

/** Moves a node into `parentId`. Refuses to move a folder into itself. */
export function moveNode(id: string, parentId: string | null): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { nodes } = getState().fs;
    const node = nodes[id];
    if (!node || node.parentId === parentId) return false;
    if (parentId && getDescendantIds(nodes, id).includes(parentId)) return false;
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
      const node = makeNode(uniqueName(taken, parentId, file.name), "file", parentId);
      const content: FileContent = BINARY_KINDS.has(kindOf(file.name))
        ? await file.arrayBuffer()
        : await file.text();
      await storage.setContent(node.id, content);
      created.push(node);
    }
    if (created.length) {
      dispatch(fsActions.nodesAdded(created));
      if (parentId) dispatch(fsActions.expandedSet({ id: parentId, open: true }));
      dispatch(openFile(created[0].id));
    }
    return skipped;
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

export const WELCOME_MARKDOWN = `# Welcome to Note Editor

Everything you write here is saved in this browser (IndexedDB), automatically.

## Getting around

- **Explorer** (left): click a file to open it, double-click or press **F2** to rename, **Delete** to remove. Drag files onto folders to move them.
- **Right-click** any row for more actions — new file, duplicate, download.
- **Tabs** (top): scroll them with the mouse wheel, middle-click to close, drag to reorder.
- **⌘/Ctrl + P** quick-opens any file. **⌘/Ctrl + S** saves editors that need it. In code editors, **Control + S** (macOS) or **Ctrl + Space** shows autocomplete.

## File types

| Type | Opens in |
| --- | --- |
| \`.md\` | Markdown editor |
| \`.csv\` | Table viewer + raw editor |
| \`.pdf\` | PDF editor / viewer |
| \`.docx\` | Word editor / viewer |
| \`.xlsx\` | Excel editor / viewer |
| \`.schema\` | JSON Schema builder + raw editor |
| \`.mermaid\` | Mermaid diagram preview + live editor |

Create any of these from the explorer — type a name and pick the type — or use **Import** to bring in files you already have.
`;

export const SAMPLE_CSV = `name,role,started
Ada,Engineer,2021-03-01
Grace,Admiral,1943-07-01
Linus,Maintainer,1991-08-25
`;

/** First run: a welcome note and a sample folder. */
export function seedWorkspace(): AppThunk<Promise<void>> {
  return async (dispatch) => {
    const welcome = makeNode("Welcome.md", "file", null);
    const folder = makeNode("Notes", "folder", null);
    const csv = makeNode("people.csv", "file", folder.id);
    await storage.setContent(welcome.id, WELCOME_MARKDOWN);
    await storage.setContent(csv.id, SAMPLE_CSV);
    dispatch(fsActions.nodesAdded([welcome, folder, csv]));
    dispatch(fsActions.expandedSet({ id: folder.id, open: true }));
    dispatch(openFile(welcome.id));
  };
}
