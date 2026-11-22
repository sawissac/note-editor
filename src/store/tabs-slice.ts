import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { fsActions } from "@/store/fs-slice";

/** Extend-backed files (PDF / DOCX / XLSX / CSV) can open as editor or viewer. */
export type TabMode = "edit" | "view";

/** One half of a split editor. */
export type SplitSide = "start" | "end";

/** `row`: side by side (start = left). `column`: stacked (start = top). */
export type SplitOrientation = "row" | "column";

/**
 * Two files shown at once. The tab strip stays shared; the focused pane is
 * the one tab clicks and quick open load into, and its file is `activeId`.
 * A file is never shown in both panes (each pane owns its edit buffer).
 */
export type SplitState = {
  start: string;
  end: string;
  focus: SplitSide;
  orientation: SplitOrientation;
};

export type TabsState = {
  openIds: string[];
  /** File in the focused pane (the only pane when not split). */
  activeId: string | null;
  modes: Record<string, TabMode>;
  split: SplitState | null;
};

export const initialTabsState: TabsState = {
  openIds: [],
  activeId: null,
  modes: {},
  split: null,
};

const other = (side: SplitSide): SplitSide =>
  side === "start" ? "end" : "start";

/**
 * Shows `id` in the focused pane. If the other pane already shows it,
 * focus moves there instead of duplicating the file.
 */
function showInFocused(state: TabsState, id: string) {
  const split = state.split;
  if (split) {
    if (split[other(split.focus)] === id) split.focus = other(split.focus);
    else split[split.focus] = id;
  }
  state.activeId = id;
}

function closeIds(state: TabsState, ids: Set<string>) {
  if (!ids.size) return;
  // Closing a file shown in a split folds it back to the surviving pane.
  const split = state.split;
  let survivor: string | null = null;
  if (split && (ids.has(split.start) || ids.has(split.end))) {
    survivor = [split.start, split.end].find((id) => !ids.has(id)) ?? null;
    state.split = null;
  }
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
  if (survivor) state.activeId = survivor;
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
      showInFocused(state, id);
    },
    activated(state, action: PayloadAction<string>) {
      if (state.openIds.includes(action.payload)) {
        showInFocused(state, action.payload);
      }
    },
    /**
     * Opens `id` in the `side` pane of a split, splitting the editor first
     * if needed (the current file moves to the other side). Dropping the
     * only open file onto its own edge does nothing — there is no second
     * file to show.
     */
    splitOpened(
      state,
      action: PayloadAction<{
        id: string;
        side: SplitSide;
        orientation: SplitOrientation;
      }>,
    ) {
      const { id, side, orientation } = action.payload;
      if (!state.openIds.includes(id)) {
        const at = state.activeId ? state.openIds.indexOf(state.activeId) : -1;
        state.openIds.splice(at + 1, 0, id);
      }
      const split = state.split;
      if (split) {
        // Already showing it on the other side: swap the two panes.
        if (split[other(side)] === id) split[other(side)] = split[side];
        split[side] = id;
        split.focus = side;
        split.orientation = orientation;
      } else {
        const current = state.activeId;
        if (!current || current === id) {
          state.activeId = id;
          return;
        }
        state.split = {
          [side]: id,
          [other(side)]: current,
          focus: side,
          orientation,
        } as SplitState;
      }
      state.activeId = id;
    },
    /** Drops `id` into one pane of an existing split, replacing its file. */
    paneOpened(state, action: PayloadAction<{ id: string; side: SplitSide }>) {
      const split = state.split;
      if (!split) return;
      if (!state.openIds.includes(action.payload.id)) {
        const at = state.activeId ? state.openIds.indexOf(state.activeId) : -1;
        state.openIds.splice(at + 1, 0, action.payload.id);
      }
      const { id, side } = action.payload;
      // Dragged over from the other pane: the two panes trade files.
      if (split[other(side)] === id) split[other(side)] = split[side];
      split[side] = id;
      split.focus = side;
      state.activeId = id;
    },
    paneFocused(state, action: PayloadAction<SplitSide>) {
      const split = state.split;
      if (!split || split.focus === action.payload) return;
      split.focus = action.payload;
      state.activeId = split[action.payload];
    },
    /** Back to one pane; `keep` (default: the focused one) stays. */
    splitClosed(state, action: PayloadAction<SplitSide | undefined>) {
      const split = state.split;
      if (!split) return;
      state.activeId = split[action.payload ?? split.focus];
      state.split = null;
    },
    splitOrientationToggled(state) {
      const split = state.split;
      if (split) split.orientation = split.orientation === "row" ? "column" : "row";
    },
    closed(state, action: PayloadAction<string>) {
      closeIds(state, new Set([action.payload]));
    },
    closedOthers(state, action: PayloadAction<string>) {
      closeIds(state, new Set(state.openIds.filter((id) => id !== action.payload)));
      state.split = null;
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
