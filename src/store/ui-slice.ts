import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SaveState = "saved" | "saving" | "error";

/**
 * Text selected in an editor and handed to a chat ("Ask AI"): it waits on
 * that chat's composer as a reference and goes with the next message.
 */
export type ChatReference = {
  /** The `.chat` file it goes to. */
  chatId: string;
  /** Where it came from, e.g. `notes/plan.md (lines 3–8)`. */
  path: string;
  content: string;
};

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
  /** Selections waiting to be sent with a chat message. */
  chatReferences: ChatReference[];
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
  chatReferences: [],
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
    chatReferenceAdded(state, action: PayloadAction<ChatReference>) {
      state.chatReferences.push(action.payload);
    },
    /** Drops one waiting reference (by index among the chat's own). */
    chatReferenceRemoved(
      state,
      action: PayloadAction<{ chatId: string; index: number }>,
    ) {
      const { chatId, index } = action.payload;
      let seen = -1;
      state.chatReferences = state.chatReferences.filter(
        (r) => r.chatId !== chatId || ++seen !== index,
      );
    },
    /** A chat sent its message: its waiting references are used up. */
    chatReferencesCleared(state, action: PayloadAction<string>) {
      state.chatReferences = state.chatReferences.filter(
        (r) => r.chatId !== action.payload,
      );
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
