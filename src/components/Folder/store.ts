import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { FolderSystemConstant } from "../../util/types";
import { FolderSystem, FolderSystemType } from "../../util/FolderSystem";
import { generateMock } from "../../util/generateMock";

type State = {
  currentId: null | string;
  currentDir: null | string;
  data: FolderSystemConstant[];
  dirHistory: string[];
};

type Action = {
  createFolder: (name: string) => void;
  createFile: (name: string) => void;
  setCurrentId: (id: string) => void;
  copyFile: () => void;
  rename: (rename: string) => void;
  setCurrentDir: (id: null | string, isHome: boolean) => void;
  deleteFile: () => void;
  dirBack: () => void;
};

export const useFolderStore = create(
  immer<State & Action>((set) => ({
    currentId: null,
    currentDir: null,
    dirHistory: [],
    data: generateMock(0, () => FolderSystem.create.file("New File", null)),
    createFolder(name) {
      set((store) => {
        store.data.push(FolderSystem.create.folder(name, store.currentDir));
      });
    },
    createFile(name) {
      set((store) => {
        store.data.push(FolderSystem.create.file(name, store.currentDir));
      });
    },
    copyFile() {
      set((store) => {
        const file = store.data.find((data) => data.id === store.currentId);
        if (file?.type === FolderSystemType.File) {
          store.data.push(
            FolderSystem.create.file(`${file.name}-copy`, store.currentDir),
          );
        }
      });
    },
    rename(rename) {
      set((store) => {
        const selectedData = store.data.find(
          (data) => data.id === store.currentId,
        );
        store.data = store.data.map((data) => {
          if (data.id === store.currentId && selectedData) {
            return FolderSystem.rename(selectedData, rename);
          } else {
            return data;
          }
        });
      });
    },
    deleteFile() {
      set((store) => {
        store.data = FolderSystem.deleteF(store.data, store.currentId);
        store.currentId = null;
      });
    },
    setCurrentId(id) {
      set((store) => {
        store.currentId = id;
      });
    },
    setCurrentDir(id, isHome) {
      set((store) => {
        store.currentDir = id;
        if (!isHome) {
          store.dirHistory.push(id as string);
        } else {
          store.dirHistory = [];
        }
      });
    },
    dirBack() {
      set((store) => {
        store.dirHistory.pop();
        store.currentDir =
          store.dirHistory.length === 0
            ? null
            : store.dirHistory[store.dirHistory.length - 1];
      });
    },
  })),
);
