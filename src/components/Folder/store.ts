import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { FolderSystemConstant } from "../../util/types";
import { FolderSystem } from "../../util/FolderSystem";
// import { generateMock } from "../../util/generateMock";

type State = {
  currentIndex: number;
  data: FolderSystemConstant[];
};


type Action = {
  createFolder: (name: string) => void;
  createFile: (name: string) => void;
  setCurrentIndex: (index: number) => void;
  rename: (rename: string) => void;
};

export const useFolderStore = create<State & Action>()(
  immer((set) => ({
    currentIndex: -1,
    // data: generateMock<FolderSystemConstant>(100, () =>
    //   FolderSystem.create.file("Folder"),
    // ),
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
    rename(rename) {
      set((store) => {
        const currentData = store.data[store.currentIndex];
        store.data[store.currentIndex] = FolderSystem.rename(
          currentData,
          rename,
        );
      });
    },
    setCurrentIndex(index) {
      set((store) => {
        store.currentIndex = index;
      });
    },
  })),
);
