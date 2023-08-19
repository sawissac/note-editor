import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { generateMock } from "../../util/generateMock";

type State = {
  currentId: string | null;
  data: string[];
  fileData: {
    id: string;
    text: string;
  }[];
};

type Action = {
  createTab: (id: string) => void;
  setCurrentId: (id: string) => void;
  deleteTab: (id: string) => void;
  writeFile: (id: string, value: string) => void;
};

export const useFileViewStore = create(
  immer<State & Action>((set) => ({
    currentId: "",
    data: generateMock(0, () => "File Name"),
    fileData: [],
    createTab(id) {
      set((store) => {
        if (!store.data.includes(id)) {
          store.data.push(id);
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
    writeFile(id, value) {
      set((store) => {
        const isExist = store.fileData.find((item) => item.id === id);
        if (!isExist) store.fileData.push({ id, text: "" });
        store.fileData = store.fileData.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              text: value,
            };
          }
          return item;
        });
        console.log(store.fileData);
      });
    },
  })),
);
