import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { FolderSystemConstant } from "../../util/types";
import { FolderSystem } from "../../util/FolderSystem";

type State = {
  currentId: null | string;
  copy: null | string;
  currentDir: null | string
  data: FolderSystemConstant[];
};

type Action = {
  createFolder: (name: string) => void;
  createFile: (name: string) => void;
  setCurrentId: (id: string) => void;
  copyFile: () => void;
  resetCopy: () => void;
  rename: (rename: string) => void;
  setCurrentDir: (id: null | string) => void;
};

export const useFolderStore = create<State & Action>()(
  immer((set) => ({
    currentId: null,
    copy: null,
    currentDir: null,
    data: [],
    createFolder(name) {
      set((store) => {
        store.data.push(FolderSystem.create.folder(name));
      });
    },
    createFile(name) {
      set((store) => {
        store.data.push(FolderSystem.create.file(name));
      });
    },
    copyFile() {
      set((store) => {
        store.copy = store.currentId;
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
    resetCopy(){
      set((store) => {
        store.copy = null;
      }); 
    },
    setCurrentId(id) {
      set((store) => {
        store.currentId = id;
      });
    },
    setCurrentDir(id){
      set((store) => {
        store.currentDir = id;
      });
    }
  })),
);
