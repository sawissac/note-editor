import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { generateMock } from "../../util/generateMock";

type State = {
  currentId: string | null;
  data: string[];
};

type Action = {
  createTab: (id: string) => void;
  setCurrentId: (id: string) => void;
  deleteTab: (id: string) => void;
};

export const useFileViewStore = create(
  immer<State & Action>((set) => ({
    currentId: "",
    data: generateMock(0, () => "hello000000"),
    createTab(id) {
      set((store) => {
        if (!store.data.includes(id)) {
          store.data.push(id)
          store.currentId = id;
        }
      });
    },
    setCurrentId(id) {
      set((store) => {
        store.currentId = id;
      });
    },
    deleteTab(id) {
      set((store) => {
        store.data = store.data.filter((dataId) => dataId !== id);
      });
    },
  })),
);
