import { create } from "zustand";

type State = {
  scrollDisable: boolean;
};

type Action = {
  setScrollDisable: (flag: boolean) => void;
};

export const useScrollModeStore = create<State & Action>()((set) => ({
  scrollDisable: false,
  setScrollDisable(flag) {
    set((store) => ({ ...store, scrollDisable: flag }));
  },
}));
