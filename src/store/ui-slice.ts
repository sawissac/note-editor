import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SaveState = "saved" | "saving" | "error";

export type UiState = {
  sidebarOpen: boolean;
  quickOpen: boolean;
  /** Folder an import dialog targets; `undefined` = closed, `null` = root. */
  importParentId: string | null | undefined;
  deleteTargetId: string | null;
  saveState: Record<string, SaveState>;
  /** A freshly created file whose editor should take focus once. */
  focusRequestId: string | null;
  /** The unified PDF export dialog. */
  unifiedExportOpen: boolean;
};

export const initialUiState: UiState = {
  sidebarOpen: true,
  quickOpen: false,
  importParentId: undefined,
  deleteTargetId: null,
  saveState: {},
  focusRequestId: null,
  unifiedExportOpen: false,
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
    },
    importOpened(state, action: PayloadAction<string | null>) {
      state.importParentId = action.payload;
    },
    importClosed(state) {
      state.importParentId = undefined;
    },
    deleteRequested(state, action: PayloadAction<string | null>) {
      state.deleteTargetId = action.payload;
    },
    unifiedExportSet(state, action: PayloadAction<boolean>) {
      state.unifiedExportOpen = action.payload;
    },
    focusRequested(state, action: PayloadAction<string | null>) {
      state.focusRequestId = action.payload;
    },
    saveStateSet(state, action: PayloadAction<{ id: string; state: SaveState }>) {
      state.saveState[action.payload.id] = action.payload.state;
    },
  },
});

export const uiActions = uiSlice.actions;
export default uiSlice.reducer;
