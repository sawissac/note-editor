import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { fsActions } from "@/store/fs-slice";

/** Extend-backed files (PDF / DOCX / XLSX / CSV) can open as editor or viewer. */
export type TabMode = "edit" | "view";

export type TabsState = {
  openIds: string[];
  activeId: string | null;
  modes: Record<string, TabMode>;
};

export const initialTabsState: TabsState = {
  openIds: [],
  activeId: null,
  modes: {},
};

function closeIds(state: TabsState, ids: Set<string>) {
  if (!ids.size) return;
  const before = state.openIds;
  state.openIds = before.filter((id) => !ids.has(id));
  for (const id of ids) delete state.modes[id];
  if (state.activeId && ids.has(state.activeId)) {
    // Activate the nearest surviving tab, preferring the one to the right.
    const index = before.indexOf(state.activeId);
    const right = before.slice(index + 1).find((id) => !ids.has(id));
    const left = before
      .slice(0, index)
      .reverse()
      .find((id) => !ids.has(id));
    state.activeId = right ?? left ?? null;
  }
}

const tabsSlice = createSlice({
  name: "tabs",
  initialState: initialTabsState,
  reducers: {
    opened(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (!state.openIds.includes(id)) {
        const at = state.activeId ? state.openIds.indexOf(state.activeId) : -1;
        state.openIds.splice(at + 1, 0, id);
      }
      state.activeId = id;
    },
    activated(state, action: PayloadAction<string>) {
      if (state.openIds.includes(action.payload)) {
        state.activeId = action.payload;
      }
    },
    closed(state, action: PayloadAction<string>) {
      closeIds(state, new Set([action.payload]));
    },
    closedOthers(state, action: PayloadAction<string>) {
      closeIds(state, new Set(state.openIds.filter((id) => id !== action.payload)));
      state.activeId = action.payload;
    },
    closedToRight(state, action: PayloadAction<string>) {
      const index = state.openIds.indexOf(action.payload);
      closeIds(state, new Set(state.openIds.slice(index + 1)));
    },
    closedAll(state) {
      closeIds(state, new Set(state.openIds));
    },
    moved(state, action: PayloadAction<{ id: string; toIndex: number }>) {
      const from = state.openIds.indexOf(action.payload.id);
      if (from < 0) return;
      state.openIds.splice(from, 1);
      state.openIds.splice(action.payload.toIndex, 0, action.payload.id);
    },
    modeSet(state, action: PayloadAction<{ id: string; mode: TabMode }>) {
      state.modes[action.payload.id] = action.payload.mode;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fsActions.nodesRemoved, (state, action) => {
      closeIds(state, new Set(action.payload));
    });
  },
});

export const tabsActions = tabsSlice.actions;
export default tabsSlice.reducer;
