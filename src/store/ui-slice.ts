import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SaveState = "saved" | "saving" | "error";

export type UiState = {
  sidebarOpen: boolean;
  quickOpen: boolean;
  /** Text the quick-open box starts with: "" files, ">" commands, "#" search. */
  quickOpenPrefix: string;
  /** Folder an import dialog targets; `undefined` = closed, `null` = root. */
  importParentId: string | null | undefined;
  /** Rows waiting on the delete confirmation; empty = dialog closed. */
  deleteTargetIds: string[];
  saveState: Record<string, SaveState>;
  /** A freshly created file whose editor should take focus once. */
  focusRequestId: string | null;
  /** The unified PDF export dialog. */
  unifiedExportOpen: boolean;
  /** Dismissible message in the explorer footer (skipped imports, failed
   *  conversions); null = none. */
  explorerNotice: string | null;
};

export const initialUiState: UiState = {
  sidebarOpen: true,
  quickOpen: false,
  quickOpenPrefix: "",
  importParentId: undefined,
  deleteTargetIds: [],
  saveState: {},
  focusRequestId: null,
  unifiedExportOpen: false,
  explorerNotice: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState: initialUiState,
  reducers: {
    sidebarToggled(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    sidebarSet(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    quickOpenSet(state, action: PayloadAction<boolean>) {
      state.quickOpen = action.payload;
      if (action.payload) state.quickOpenPrefix = "";
    },
    /** Opens quick open already in a mode, e.g. ">" for commands. */
    quickOpenStarted(state, action: PayloadAction<string>) {
      state.quickOpen = true;
      state.quickOpenPrefix = action.payload;
    },
    importOpened(state, action: PayloadAction<string | null>) {
      state.importParentId = action.payload;
    },
    importClosed(state) {
      state.importParentId = undefined;
    },
    /** One id, several (a multi-selection), or null to close the dialog. */
    deleteRequested(state, action: PayloadAction<string | string[] | null>) {
      const p = action.payload;
      state.deleteTargetIds = p === null ? [] : typeof p === "string" ? [p] : p;
    },
    unifiedExportSet(state, action: PayloadAction<boolean>) {
      state.unifiedExportOpen = action.payload;
    },
    explorerNoticeSet(state, action: PayloadAction<string | null>) {
      state.explorerNotice = action.payload;
    },
    focusRequested(state, action: PayloadAction<string | null>) {
      state.focusRequestId = action.payload;
    },
    saveStateSet(
      state,
      action: PayloadAction<{ id: string; state: SaveState }>,
    ) {
      state.saveState[action.payload.id] = action.payload.state;
    },
  },
});

export const uiActions = uiSlice.actions;
export default uiSlice.reducer;
