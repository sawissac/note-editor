import {
  type Action,
  combineReducers,
  configureStore,
  type ThunkAction,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector, useStore } from "react-redux";

import { storage } from "@/lib/storage";
import fs, { type FsState, initialFsState } from "@/store/fs-slice";
import tabs, { initialTabsState, type TabsState } from "@/store/tabs-slice";
import ui, { initialUiState } from "@/store/ui-slice";

const rootReducer = combineReducers({ fs, tabs, ui });

export type RootState = ReturnType<typeof rootReducer>;

type PersistedWorkspace = {
  version: 1;
  fs: Pick<FsState, "nodes" | "expanded" | "selectedId">;
  tabs: TabsState;
  sidebarOpen: boolean;
};

const WORKSPACE_KEY = "workspace";

/** Reads the saved workspace and builds the store around it. */
export async function createAppStore() {
  const saved = await storage.getMeta<PersistedWorkspace>(WORKSPACE_KEY);
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: saved
      ? {
          fs: {
            ...initialFsState,
            ...saved.fs,
            selectedIds: saved.fs.selectedId ? [saved.fs.selectedId] : [],
            anchorId: saved.fs.selectedId,
          },
          tabs: { ...initialTabsState, ...saved.tabs },
          ui: { ...initialUiState, sidebarOpen: saved.sidebarOpen },
        }
      : undefined,
  });
  persist(store);
  return { store, isFirstRun: !saved };
}

/** Writes the workspace back to IndexedDB, debounced, whenever it changes. */
function persist(store: { getState(): RootState; subscribe(cb: () => void): () => void }) {
  let last: unknown[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    const s = store.getState();
    const next = [s.fs.nodes, s.fs.expanded, s.fs.selectedId, s.tabs, s.ui.sidebarOpen];
    if (next.every((v, i) => v === last[i])) return;
    last = next;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const payload: PersistedWorkspace = {
        version: 1,
        fs: {
          nodes: s.fs.nodes,
          expanded: s.fs.expanded,
          selectedId: s.fs.selectedId,
        },
        tabs: s.tabs,
        sidebarOpen: s.ui.sidebarOpen,
      };
      void storage.setMeta(WORKSPACE_KEY, payload);
    }, 250);
  });
}

export type AppStore = Awaited<ReturnType<typeof createAppStore>>["store"];
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, Action>;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
