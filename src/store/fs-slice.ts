import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type NodeType = "file" | "folder";

export type FsNode = {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
};

/** The one inline-name input the tree can show at a time. */
export type Draft =
  | { mode: "create"; nodeType: NodeType; parentId: string | null }
  | { mode: "rename"; id: string };

export type FsState = {
  nodes: Record<string, FsNode>;
  expanded: Record<string, true>;
  selectedId: string | null;
  draft: Draft | null;
};

export const initialFsState: FsState = {
  nodes: {},
  expanded: {},
  selectedId: null,
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
      node.parentId = action.payload.parentId;
      node.name = action.payload.name;
      node.updatedAt = Date.now();
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
      }
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
    selected(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    draftStarted(state, action: PayloadAction<Draft>) {
      state.draft = action.payload;
      if (action.payload.mode === "create" && action.payload.parentId) {
        state.expanded[action.payload.parentId] = true;
      }
      if (action.payload.mode === "rename") {
        state.selectedId = action.payload.id;
      }
    },
    draftCancelled(state) {
      state.draft = null;
    },
  },
});

export const fsActions = fsSlice.actions;
export default fsSlice.reducer;
