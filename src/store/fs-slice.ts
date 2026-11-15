import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type NodeType = "file" | "folder";

export type FsNode = {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Manual position among its siblings, set by drag-to-reorder. Rows without
   * one sort by name after the ordered ones. Folders still come first.
   */
  order?: number;
};

/** The one inline-name input the tree can show at a time. */
export type Draft =
  | { mode: "create"; nodeType: NodeType; parentId: string | null }
  | { mode: "rename"; id: string };

export type FsState = {
  nodes: Record<string, FsNode>;
  expanded: Record<string, true>;
  /** The focused row — keyboard cursor, rename / "new file here" target. */
  selectedId: string | null;
  /**
   * Every selected row, `selectedId` included. One entry for a plain click;
   * more after ⌘/Ctrl-click or Shift-click. Not persisted.
   */
  selectedIds: string[];
  /** Where a Shift-click / Shift+Arrow range starts. */
  anchorId: string | null;
  draft: Draft | null;
};

export const initialFsState: FsState = {
  nodes: {},
  expanded: {},
  selectedId: null,
  selectedIds: [],
  anchorId: null,
  draft: null,
};

const fsSlice = createSlice({
  name: "fs",
  initialState: initialFsState,
  reducers: {
    nodesAdded(state, action: PayloadAction<FsNode[]>) {
      for (const node of action.payload) state.nodes[node.id] = node;
    },
    nodeRenamed(state, action: PayloadAction<{ id: string; name: string }>) {
      const node = state.nodes[action.payload.id];
      if (!node) return;
      node.name = action.payload.name;
      node.updatedAt = Date.now();
    },
    nodeMoved(
      state,
      action: PayloadAction<{ id: string; parentId: string | null; name: string }>,
    ) {
      const node = state.nodes[action.payload.id];
      if (!node) return;
      if (node.parentId !== action.payload.parentId) delete node.order;
      node.parentId = action.payload.parentId;
      node.name = action.payload.name;
      node.updatedAt = Date.now();
    },
    /** Sets the manual order of siblings: `ids[0]` first. */
    childrenOrdered(state, action: PayloadAction<string[]>) {
      action.payload.forEach((id, i) => {
        const node = state.nodes[id];
        if (node) node.order = i;
      });
    },
    /** Drops the manual order inside `parentId` (null = root): back to A–Z. */
    orderCleared(state, action: PayloadAction<string | null>) {
      for (const node of Object.values(state.nodes)) {
        if (node.parentId === action.payload) delete node.order;
      }
    },
    nodeTouched(state, action: PayloadAction<string>) {
      const node = state.nodes[action.payload];
      if (node) node.updatedAt = Date.now();
    },
    nodesRemoved(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) {
        delete state.nodes[id];
        delete state.expanded[id];
        if (state.selectedId === id) state.selectedId = null;
        if (state.anchorId === id) state.anchorId = null;
      }
      const gone = new Set(action.payload);
      state.selectedIds = state.selectedIds.filter((id) => !gone.has(id));
      const d = state.draft;
      if (
        d &&
        ((d.mode === "rename" && !state.nodes[d.id]) ||
          (d.mode === "create" && d.parentId && !state.nodes[d.parentId]))
      ) {
        state.draft = null;
      }
    },
    expandedSet(state, action: PayloadAction<{ id: string; open: boolean }>) {
      if (action.payload.open) state.expanded[action.payload.id] = true;
      else delete state.expanded[action.payload.id];
    },
    expandedToggled(state, action: PayloadAction<string>) {
      if (state.expanded[action.payload]) delete state.expanded[action.payload];
      else state.expanded[action.payload] = true;
    },
    collapsedAll(state) {
      state.expanded = {};
    },
    expandedMany(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) state.expanded[id] = true;
    },
    collapsedMany(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) delete state.expanded[id];
    },
    /** Plain click / arrow key: exactly one row (or none). */
    selected(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
      state.selectedIds = action.payload ? [action.payload] : [];
      state.anchorId = action.payload;
    },
    /** ⌘/Ctrl-click: add or drop one row, keeping the rest. */
    selectionToggled(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.selectedIds.includes(id)) {
        state.selectedIds = state.selectedIds.filter((x) => x !== id);
        state.selectedId = state.selectedIds.at(-1) ?? null;
      } else {
        state.selectedIds.push(id);
        state.selectedId = id;
      }
      state.anchorId = state.selectedId;
    },
    /**
     * Shift-click / Shift+Arrow / ⌘A: replace the selection with `ids`
     * (in tree order) and focus `focusId`. The anchor stays put.
     */
    selectionSet(state, action: PayloadAction<{ ids: string[]; focusId: string }>) {
      state.selectedIds = action.payload.ids;
      state.selectedId = action.payload.focusId;
      state.anchorId ??= action.payload.focusId;
    },
    draftStarted(state, action: PayloadAction<Draft>) {
      state.draft = action.payload;
      if (action.payload.mode === "create" && action.payload.parentId) {
        state.expanded[action.payload.parentId] = true;
      }
      if (action.payload.mode === "rename") {
        state.selectedId = action.payload.id;
        state.selectedIds = [action.payload.id];
        state.anchorId = action.payload.id;
      }
    },
    draftCancelled(state) {
      state.draft = null;
    },
  },
});

export const fsActions = fsSlice.actions;
export default fsSlice.reducer;
